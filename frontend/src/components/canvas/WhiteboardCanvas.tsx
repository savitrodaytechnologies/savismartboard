import { useCallback, useEffect, useRef, useState } from 'react';
import { Stage, Layer, Line, Text, Rect, Ellipse, Arrow } from 'react-konva';
import type Konva from 'konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import type { Annotation } from '@/types';
import type { LivePage } from '@/hooks/useSmartboardSession';
import type { ToolState } from './CanvasToolbar';
import {
    buildPenAnnotation,
    buildTextAnnotation,
    buildShapeAnnotation,
    buildEraserAnnotation,
} from './CanvasToolbar';
import { tryConvertToShape } from './shapeDetector';

// ─── zoom limits ─────────────────────────────────────────────────────────────
const MIN_SCALE = 0.05;
const MAX_SCALE = 10;
const ZOOM_STEP = 1.15;

// ─── virtual world extent for scrollbars ─────────────────────────────────────
// The canvas is infinite but scrollbars represent a practical ±10 000 px window.
const VIRT_W = 20000;
const VIRT_H = 20000;
const VIRT_ORIGIN = -10000; // world coord that maps to thumb position 0

// ─── props ────────────────────────────────────────────────────────────────────

interface Props {
    page: LivePage;
    toolState: ToolState;
    undoStack: Annotation[][];
    redoStack: Annotation[][];
    onCommit: (fn: (prev: Annotation[]) => Annotation[]) => void;
    onUndoPush: (snapshot: Annotation[]) => void;
    onRedoClear: () => void;
    savedViewport?: { scale: number; pos: { x: number; y: number } };
    onViewportChange: (v: { scale: number; pos: { x: number; y: number } }) => void;
    onAiCapture?: (dataUrl: string) => void;
}

// ─── component ────────────────────────────────────────────────────────────────

export default function WhiteboardCanvas({ page, toolState, onCommit, onUndoPush, onRedoClear, savedViewport, onViewportChange, onAiCapture }: Props) {
    const containerRef = useRef<HTMLDivElement>(null);
    const stageRef = useRef<Konva.Stage>(null);

    // Container pixel size (updated on resize)
    const [containerW, setContainerW] = useState(1280);
    const [containerH, setContainerH] = useState(720);
    useEffect(() => {
        if (!containerRef.current) return;
        const obs = new ResizeObserver(entries => {
            const { width, height } = entries[0].contentRect;
            setContainerW(width);
            setContainerH(height);
        });
        obs.observe(containerRef.current);
        return () => obs.disconnect();
    }, []);

    // Viewport transform: pan offset + zoom scale
    const [stageScale, setStageScale] = useState(1);
    const [stagePos, setStagePos] = useState({ x: 0, y: 0 });

    // Restore this page's saved viewport when switching pages
    useEffect(() => {
        setStageScale(savedViewport?.scale ?? 1);
        setStagePos(savedViewport?.pos ?? { x: 0, y: 0 });
    }, [page.pageNo]); // eslint-disable-line react-hooks/exhaustive-deps
    // (savedViewport is intentionally excluded — we only want to run on page switch,
    //  not every time the parent re-reports the same value)

    // Report viewport changes to parent so it can persist per-page
    const onViewportChangeRef = useRef(onViewportChange);
    onViewportChangeRef.current = onViewportChange;
    useEffect(() => {
        onViewportChangeRef.current({ scale: stageScale, pos: stagePos });
    }, [stageScale, stagePos]);

    // In-progress stroke
    const [activePoints, setActivePoints] = useState<number[]>([]);
    const [shapeStart, setShapeStart] = useState<{ x: number; y: number } | null>(null);
    const [previewShape, setPreviewShape] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
    const [previewEnd, setPreviewEnd] = useState<{ x: number; y: number } | null>(null);
    const isDrawing = useRef(false);

    // Inline text input overlay (replaces window.prompt which is blocked in some environments)
    const [textInput, setTextInput] = useState<{ screenX: number; screenY: number; worldX: number; worldY: number } | null>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    // Always-current ref so handleMouseDown (useCallback) can read latest textInput without being re-created
    const textInputRef = useRef(textInput);
    textInputRef.current = textInput;

    // Lasso selection
    const isLasso = useRef(false);
    const lassoPointsRef = useRef<number[]>([]);
    const [lassoPoints, setLassoPoints] = useState<number[]>([]);
    const [lassoBox, setLassoBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

    // Pan state
    const isPanning = useRef(false);
    const lastPanClient = useRef<{ x: number; y: number } | null>(null);
    const [spaceDown, setSpaceDown] = useState(false);
    const spaceRef = useRef(false);

    // Scrollbar drag state
    const scrollDragRef = useRef<{
        axis: 'h' | 'v';
        startClient: number;
        startStagePos: number; // stagePos.x or stagePos.y at drag start
        startStageScale: number;
        trackPx: number;       // track length in screen px
        thumbPx: number;       // thumb length in screen px at drag start
        worldView: number;     // containerW or containerH / scale at drag start
    } | null>(null);

    // Space bar → pan mode overlay
    useEffect(() => {
        const onDown = (e: KeyboardEvent) => {
            if (e.code === 'Space' && !e.repeat) {
                e.preventDefault();
                spaceRef.current = true;
                setSpaceDown(true);
            }
        };
        const onUp = (e: KeyboardEvent) => {
            if (e.code === 'Space') {
                spaceRef.current = false;
                setSpaceDown(false);
            }
        };
        window.addEventListener('keydown', onDown);
        window.addEventListener('keyup', onUp);
        return () => {
            window.removeEventListener('keydown', onDown);
            window.removeEventListener('keyup', onUp);
        };
    }, []);

    // Clear lasso selection when switching away from lasso tool
    useEffect(() => {
        if (toolState.tool !== 'lasso') {
            setLassoBox(null);
            setLassoPoints([]);
            lassoPointsRef.current = [];
            isLasso.current = false;
        }
    }, [toolState.tool]);

    // Window-level pointer handlers for scrollbar thumb drag (pointermove/up covers mouse + touch + stylus)
    useEffect(() => {
        const onMove = (e: PointerEvent) => {
            const d = scrollDragRef.current;
            if (!d) return;
            const delta = (d.axis === 'h' ? e.clientX : e.clientY) - d.startClient;
            const trackRange = d.trackPx - d.thumbPx;
            if (trackRange <= 0) return;
            const virtSize = d.axis === 'h' ? VIRT_W : VIRT_H;
            const worldRange = virtSize - d.worldView;
            const deltaWorld = (delta / trackRange) * worldRange;
            const newPos = d.startStagePos - deltaWorld * d.startStageScale;
            setStagePos(prev =>
                d.axis === 'h' ? { ...prev, x: newPos } : { ...prev, y: newPos }
            );
        };
        const onUp = () => { scrollDragRef.current = null; };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        return () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
        };
    }, []);

    // Pinch-to-zoom + two-finger pan (tablet / touch support)
    const lastPinchRef = useRef<{ dist: number; mid: { x: number; y: number } } | null>(null);

    const handleTouchStart = useCallback((e: KonvaEventObject<TouchEvent>) => {
        const touches = e.evt.touches;
        if (touches.length === 2) {
            e.evt.preventDefault();
            // Cancel any single-finger drawing that started before the second finger landed
            isDrawing.current = false;
            isPanning.current = false;
            setActivePoints([]);
            const dx = touches[1].clientX - touches[0].clientX;
            const dy = touches[1].clientY - touches[0].clientY;
            lastPinchRef.current = {
                dist: Math.sqrt(dx * dx + dy * dy),
                mid: { x: (touches[0].clientX + touches[1].clientX) / 2, y: (touches[0].clientY + touches[1].clientY) / 2 },
            };
        }
    }, []);

    const handleTouchMove = useCallback((e: KonvaEventObject<TouchEvent>) => {
        const touches = e.evt.touches;
        if (touches.length !== 2 || !lastPinchRef.current) return;
        e.evt.preventDefault();
        const dx = touches[1].clientX - touches[0].clientX;
        const dy = touches[1].clientY - touches[0].clientY;
        const newDist = Math.sqrt(dx * dx + dy * dy);
        const newMid = { x: (touches[0].clientX + touches[1].clientX) / 2, y: (touches[0].clientY + touches[1].clientY) / 2 };

        const stage = stageRef.current;
        if (!stage) return;
        const rect = (stage.container() as HTMLElement).getBoundingClientRect();
        const pinchX = newMid.x - rect.left;
        const pinchY = newMid.y - rect.top;

        // Zoom around pinch midpoint
        const ratio = newDist / lastPinchRef.current.dist;
        const oldScale = stageRef.current!.scaleX();
        const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, oldScale * ratio));
        const wx = (pinchX - stage.x()) / oldScale;
        const wy = (pinchY - stage.y()) / oldScale;

        // Two-finger pan delta
        const panDx = newMid.x - lastPinchRef.current.mid.x;
        const panDy = newMid.y - lastPinchRef.current.mid.y;

        setStageScale(newScale);
        setStagePos({ x: pinchX - wx * newScale + panDx, y: pinchY - wy * newScale + panDy });

        lastPinchRef.current = { dist: newDist, mid: newMid };
    }, []);

    const handleTouchEnd = useCallback(() => {
        lastPinchRef.current = null;
    }, []);

    const isPanTool = toolState.tool === 'select';

    // World coordinate from the stage's current pointer position
    const getWorldPos = useCallback((stage: Konva.Stage): { x: number; y: number } => {
        const ptr = stage.getPointerPosition()!;
        return {
            x: (ptr.x - stage.x()) / stage.scaleX(),
            y: (ptr.y - stage.y()) / stage.scaleY(),
        };
    }, []);

    // ── Zoom (mouse wheel, centered on pointer) ──────────────────────────────
    const handleWheel = useCallback((e: KonvaEventObject<WheelEvent>) => {
        e.evt.preventDefault();
        const stage = stageRef.current;
        if (!stage) return;

        const oldScale = stage.scaleX();
        const ptr = stage.getPointerPosition()!;
        const direction = e.evt.deltaY < 0 ? 1 : -1;
        const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, oldScale * (direction > 0 ? ZOOM_STEP : 1 / ZOOM_STEP)));

        // Keep the world point under the pointer fixed
        const wx = (ptr.x - stage.x()) / oldScale;
        const wy = (ptr.y - stage.y()) / oldScale;
        setStageScale(newScale);
        setStagePos({ x: ptr.x - wx * newScale, y: ptr.y - wy * newScale });
    }, []);

    // ── Mouse events ─────────────────────────────────────────────────────────
    const handlePointerDown = useCallback((e: KonvaEventObject<PointerEvent>) => {
        if (!e.evt.isPrimary) return; // ignore secondary touch points (pinch)
        const stage = e.target.getStage()!;
        // Middle mouse, space+left, or pan tool → begin panning
        if (e.evt.button === 1 || spaceRef.current || isPanTool) {
            isPanning.current = true;
            lastPanClient.current = { x: e.evt.clientX, y: e.evt.clientY };
            return;
        }
        if (e.evt.button !== 0) return;

        const { x, y } = getWorldPos(stage);

        if (toolState.tool === 'pen' || toolState.tool === 'highlighter' || toolState.tool === 'smart') {
            isDrawing.current = true;
            onUndoPush([...page.annotations]);
            onRedoClear();
            setActivePoints([x, y]);
        } else if (toolState.tool === 'eraser') {
            isDrawing.current = true;
            onUndoPush([...page.annotations]);
            onRedoClear();
            setActivePoints([x, y]);
        } else if (['rect', 'circle', 'arrow'].includes(toolState.tool)) {
            isDrawing.current = true;
            onUndoPush([...page.annotations]);
            onRedoClear();
            setShapeStart({ x, y });
            setPreviewShape({ x, y, w: 0, h: 0 });
            setPreviewEnd(null);
        } else if (toolState.tool === 'text') {
            // Commit any existing open text input before opening a new one
            if (textareaRef.current) commitText(textareaRef.current.value, textInputRef.current);
            const ptr = stage.getPointerPosition();
            if (ptr) setTextInput({ screenX: ptr.x, screenY: ptr.y, worldX: x, worldY: y });
        } else if (toolState.tool === 'lasso') {
            isLasso.current = true;
            lassoPointsRef.current = [x, y];
            setLassoPoints([x, y]);
            setLassoBox(null);
        }
    }, [toolState.tool, getWorldPos, page.annotations, onCommit, onUndoPush, onRedoClear, isPanTool]);

    const handlePointerMove = useCallback((e: KonvaEventObject<PointerEvent>) => {
        if (!e.evt.isPrimary) return; // ignore secondary touch points
        if (isPanning.current && lastPanClient.current) {
            const dx = e.evt.clientX - lastPanClient.current.x;
            const dy = e.evt.clientY - lastPanClient.current.y;
            lastPanClient.current = { x: e.evt.clientX, y: e.evt.clientY };
            setStagePos(prev => ({ x: prev.x + dx, y: prev.y + dy }));
            return;
        }
        if (!isDrawing.current && !isLasso.current) return;

        const stage = e.target.getStage()!;
        const { x, y } = getWorldPos(stage);

        if (toolState.tool === 'pen' || toolState.tool === 'highlighter' || toolState.tool === 'smart') {
            setActivePoints(prev => [...prev, x, y]);
        } else if (toolState.tool === 'eraser') {
            setActivePoints(prev => [...prev, x, y]);
        } else if (shapeStart && ['rect', 'circle', 'arrow'].includes(toolState.tool)) {
            setPreviewEnd({ x, y });
            setPreviewShape({
                x: Math.min(x, shapeStart.x),
                y: Math.min(y, shapeStart.y),
                w: Math.abs(x - shapeStart.x),
                h: Math.abs(y - shapeStart.y),
            });
        } else if (isLasso.current) {
            lassoPointsRef.current.push(x, y);
            // Throttle state updates to reduce re-renders during fast drawing
            if (lassoPointsRef.current.length % 8 === 0) {
                setLassoPoints([...lassoPointsRef.current]);
            }
        }
    }, [toolState.tool, getWorldPos, shapeStart]);

    const handlePointerUp = useCallback((e: KonvaEventObject<PointerEvent>) => {
        if (!e.evt.isPrimary) return; // ignore secondary touch points
        if (isPanning.current) {
            isPanning.current = false;
            lastPanClient.current = null;
            return;
        }
        // Lasso selection completion
        if (isLasso.current) {
            isLasso.current = false;
            const pts = lassoPointsRef.current;
            if (pts.length >= 4) {
                const xs = pts.filter((_, i) => i % 2 === 0);
                const ys = pts.filter((_, i) => i % 2 === 1);
                const minX = Math.min(...xs), maxX = Math.max(...xs);
                const minY = Math.min(...ys), maxY = Math.max(...ys);
                if (maxX - minX > 10 && maxY - minY > 10) {
                    setLassoBox({ x: minX, y: minY, w: maxX - minX, h: maxY - minY });
                }
            }
            setLassoPoints([]);
            lassoPointsRef.current = [];
            return;
        }
        if (!isDrawing.current) return;
        isDrawing.current = false;

        const stage = e.target.getStage()!;
        const { x, y } = getWorldPos(stage);

        if ((toolState.tool === 'pen' || toolState.tool === 'highlighter') && activePoints.length >= 4) {
            const ann = buildPenAnnotation(activePoints, toolState, toolState.tool);
            onCommit(prev => [...prev, ann]);
            setActivePoints([]);
        } else if (toolState.tool === 'eraser' && activePoints.length >= 4) {
            // Eraser width is strokeWidth * 4 so it feels like a real rubber
            const ann = buildEraserAnnotation(activePoints, toolState.strokeWidth * 4);
            onCommit(prev => [...prev, ann]);
            setActivePoints([]);
        } else if (toolState.tool === 'smart' && activePoints.length >= 4) {
            const converted = tryConvertToShape(activePoints, toolState.color, toolState.strokeWidth);
            if (converted) {
                onCommit(prev => [...prev, ...converted]);
            } else {
                // fallback: keep as plain pen stroke
                onCommit(prev => [...prev, buildPenAnnotation(activePoints, toolState, 'pen')]);
            }
            setActivePoints([]);
        } else if (shapeStart && ['rect', 'circle', 'arrow'].includes(toolState.tool)) {
            const shape = toolState.tool as 'rect' | 'circle' | 'arrow';
            if (Math.abs(x - shapeStart.x) > 4 || Math.abs(y - shapeStart.y) > 4) {
                onCommit(prev => [...prev, buildShapeAnnotation(shape, [shapeStart.x, shapeStart.y, x, y], toolState)]);
            }
            setShapeStart(null);
            setPreviewShape(null);
            setPreviewEnd(null);
        }
    }, [toolState, activePoints, shapeStart, onCommit, getWorldPos]);

    const commitText = useCallback((value: string, pos: { worldX: number; worldY: number } | null) => {
        setTextInput(null);
        const trimmed = value.trim();
        if (trimmed && pos) {
            onUndoPush([...page.annotations]);
            onRedoClear();
            onCommit(prev => [...prev, buildTextAnnotation(pos.worldX, pos.worldY, trimmed, toolState)]);
        }
    }, [toolState, page.annotations, onCommit, onUndoPush, onRedoClear]);

    // ── Zoom button helpers ──────────────────────────────────────────────────
    const zoomBy = useCallback((factor: number) => {
        const cx = containerW / 2;
        const cy = containerH / 2;
        setStageScale(prev => {
            const next = Math.max(MIN_SCALE, Math.min(MAX_SCALE, prev * factor));
            setStagePos(pos => ({
                x: cx - (cx - pos.x) / prev * next,
                y: cy - (cy - pos.y) / prev * next,
            }));
            return next;
        });
    }, [containerW, containerH]);

    const zoomReset = useCallback(() => {
        setStageScale(1);
        setStagePos({ x: 0, y: 0 });
    }, []);

    // ── Ask AI (lasso capture) ───────────────────────────────────────────────
    const handleAskAi = useCallback(() => {
        if (!lassoBox || !stageRef.current || !onAiCapture) return;
        const sx = lassoBox.x * stageScale + stagePos.x;
        const sy = lassoBox.y * stageScale + stagePos.y;
        const sw = lassoBox.w * stageScale;
        const sh = lassoBox.h * stageScale;
        const dataUrl = stageRef.current.toDataURL({
            x: sx, y: sy,
            width: Math.max(1, sw),
            height: Math.max(1, sh),
            pixelRatio: 1,
            mimeType: 'image/png',
        });
        onAiCapture(dataUrl);
        setLassoBox(null);
        setLassoPoints([]);
        lassoPointsRef.current = [];
    }, [lassoBox, stageScale, stagePos, onAiCapture]);

    // ── Render committed annotations ─────────────────────────────────────────
    // Hit stroke width for eraser — makes strokes much easier to target
    const HIT_STROKE = 20;

    const renderAnnotation = (ann: Annotation) => {
        if (ann.type === 'pen' || ann.type === 'highlighter') {
            return (
                <Line
                    key={ann.id} id={ann.id}
                    points={ann.points}
                    stroke={ann.tool.color} strokeWidth={ann.tool.width} opacity={ann.tool.opacity}
                    tension={0.4} lineCap="round" lineJoin="round"
                    globalCompositeOperation="source-over"
                    hitStrokeWidth={HIT_STROKE}
                />
            );
        }
        if (ann.type === 'eraser') {
            return (
                <Line
                    key={ann.id} id={ann.id}
                    points={ann.points}
                    stroke="rgba(0,0,0,1)" strokeWidth={ann.tool.width}
                    tension={0.4} lineCap="round" lineJoin="round"
                    globalCompositeOperation="destination-out"
                    listening={false}
                />
            );
        }
        if (ann.type === 'text') {
            return (
                <Text
                    key={ann.id} id={ann.id}
                    x={ann.x} y={ann.y}
                    text={ann.text} fontSize={ann.tool.size}
                    fill={ann.tool.color} fontFamily="sans-serif"
                />
            );
        }
        if (ann.type === 'shape') {
            const [x1, y1, x2, y2] = ann.points;
            if (ann.shape === 'rect')
                return <Rect key={ann.id} id={ann.id} x={Math.min(x1, x2)} y={Math.min(y1, y2)} width={Math.abs(x2 - x1)} height={Math.abs(y2 - y1)} stroke={ann.tool.color} strokeWidth={ann.tool.width} fill="transparent" hitStrokeWidth={HIT_STROKE} />;
            if (ann.shape === 'circle') {
                const rx = Math.abs(x2 - x1) / 2, ry = Math.abs(y2 - y1) / 2;
                return <Ellipse key={ann.id} id={ann.id} x={(x1 + x2) / 2} y={(y1 + y2) / 2} radiusX={rx} radiusY={ry} stroke={ann.tool.color} strokeWidth={ann.tool.width} fill="transparent" hitStrokeWidth={HIT_STROKE} />;
            }
            if (ann.shape === 'arrow')
                return <Arrow key={ann.id} id={ann.id} points={[x1, y1, x2, y2]} stroke={ann.tool.color} strokeWidth={ann.tool.width} fill={ann.tool.color} pointerLength={10} pointerWidth={8} hitStrokeWidth={HIT_STROKE} />;
            if (ann.shape === 'polygon')
                return <Line key={ann.id} id={ann.id} points={ann.points} stroke={ann.tool.color} strokeWidth={ann.tool.width} fill="transparent" closed={true} hitStrokeWidth={HIT_STROKE} />;
        }
        return null;
    };

    // ── Scrollbar geometry (derived, not state) ────────────────────────────────
    const SB = 6; // scrollbar track thickness in px
    const hTrackW = containerW - SB;
    const worldLeft = -stagePos.x / stageScale;
    const worldViewW = containerW / stageScale;
    const hThumbW = Math.max(24, Math.min(hTrackW, hTrackW * worldViewW / VIRT_W));
    const hThumbLeft = Math.max(0, Math.min(hTrackW - hThumbW,
        (worldLeft - VIRT_ORIGIN) / (VIRT_W - worldViewW) * (hTrackW - hThumbW)));

    const vTrackH = containerH - SB;
    const worldTop = -stagePos.y / stageScale;
    const worldViewH = containerH / stageScale;
    const vThumbH = Math.max(24, Math.min(vTrackH, vTrackH * worldViewH / VIRT_H));
    const vThumbTop = Math.max(0, Math.min(vTrackH - vThumbH,
        (worldTop - VIRT_ORIGIN) / (VIRT_H - worldViewH) * (vTrackH - vThumbH)));

    // Eraser circle cursor position (screen coords)
    const [eraserPos, setEraserPos] = useState<{ x: number; y: number } | null>(null);

    const cursor =
        isPanTool || spaceDown ? 'grab' :
            toolState.tool === 'eraser' ? 'none' :
                toolState.tool === 'text' ? 'text' : 'crosshair';

    return (
        <div ref={containerRef} className="relative flex-1 bg-neutral-50 overflow-hidden">
            {/* Inline text input — appears at click position when text tool is active */}
            {textInput && (
                <div className="absolute z-20" style={{ left: textInput.screenX, top: textInput.screenY }}>
                    <textarea
                        ref={textareaRef}
                        autoFocus
                        rows={1}
                        placeholder="Type here…"
                        className="bg-transparent border-0 outline outline-2 outline-dashed outline-blue-400 rounded p-0.5 resize-none leading-none m-0"
                        style={{
                            color: toolState.color,
                            fontSize: (toolState.strokeWidth * 6 + 12) * stageScale,
                            fontFamily: 'sans-serif',
                            minWidth: 80,
                            lineHeight: 1.2,
                        }}
                        onInput={e => {
                            // Auto-grow height
                            const el = e.currentTarget;
                            el.style.height = 'auto';
                            el.style.height = el.scrollHeight + 'px';
                        }}
                        onKeyDown={e => {
                            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitText(e.currentTarget.value, textInput); }
                            if (e.key === 'Escape') setTextInput(null);
                        }}
                    />
                </div>
            )}

            {/* HTML background (KBot card) — transformed with stage */}
            {page.background.kind === 'html' && page.background.html && (
                <div
                    className="absolute pointer-events-none origin-top-left"
                    style={{
                        left: stagePos.x,
                        top: stagePos.y,
                        width: page.viewport.width,
                        height: page.viewport.height,
                        transform: `scale(${stageScale})`,
                    }}
                    dangerouslySetInnerHTML={{ __html: page.background.html }}
                />
            )}

            {/* Konva stage — fills container, world-space via x/y/scale */}
            <Stage
                ref={stageRef}
                width={containerW}
                height={containerH}
                style={{ cursor, position: 'absolute', inset: 0, touchAction: 'none' }}
                x={stagePos.x}
                y={stagePos.y}
                scaleX={stageScale}
                scaleY={stageScale}
                onWheel={handleWheel}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                onPointerDown={handlePointerDown}
                onPointerMove={e => {
                    // track eraser circle position
                    if (e.evt.isPrimary && toolState.tool === 'eraser') {
                        const stage = e.target.getStage()!;
                        const ptr = stage.getPointerPosition();
                        if (ptr) setEraserPos({ x: ptr.x, y: ptr.y });
                    }
                    handlePointerMove(e);
                }}
                onPointerLeave={() => setEraserPos(null)}
                onPointerUp={handlePointerUp}
                onDblClick={() => {}}
            >
                <Layer>
                    {/* Paper background — destination-out eraser clears to this white rect, not to transparency */}
                    <Rect
                        x={VIRT_ORIGIN} y={VIRT_ORIGIN}
                        width={VIRT_W} height={VIRT_H}
                        fill="#f9fafb"
                        listening={false}
                    />

                    {page.annotations.map(renderAnnotation)}

                    {/* Live pen / highlighter / smart stroke */}
                    {activePoints.length >= 4 && (toolState.tool === 'pen' || toolState.tool === 'highlighter' || toolState.tool === 'smart') && (
                        <Line
                            points={activePoints}
                            stroke={toolState.color} strokeWidth={toolState.strokeWidth}
                            opacity={toolState.tool === 'highlighter' ? 0.4 : 1}
                            tension={0.4} lineCap="round" lineJoin="round"
                        />
                    )}

                    {/* Live eraser stroke preview */}
                    {activePoints.length >= 4 && toolState.tool === 'eraser' && (
                        <Line
                            points={activePoints}
                            stroke="rgba(0,0,0,1)" strokeWidth={toolState.strokeWidth * 4}
                            tension={0.4} lineCap="round" lineJoin="round"
                            globalCompositeOperation="destination-out"
                            listening={false}
                        />
                    )}

                    {/* Shape previews */}
                    {previewShape && toolState.tool === 'rect' && (
                        <Rect x={previewShape.x} y={previewShape.y} width={previewShape.w} height={previewShape.h} stroke={toolState.color} strokeWidth={toolState.strokeWidth} dash={[4, 3]} fill="transparent" />
                    )}
                    {previewShape && toolState.tool === 'circle' && (
                        <Ellipse x={previewShape.x + previewShape.w / 2} y={previewShape.y + previewShape.h / 2} radiusX={previewShape.w / 2} radiusY={previewShape.h / 2} stroke={toolState.color} strokeWidth={toolState.strokeWidth} dash={[4, 3]} fill="transparent" />
                    )}
                    {previewEnd && shapeStart && toolState.tool === 'arrow' && (
                        <Arrow points={[shapeStart.x, shapeStart.y, previewEnd.x, previewEnd.y]} stroke={toolState.color} strokeWidth={toolState.strokeWidth} fill={toolState.color} dash={[4, 3]} pointerLength={10} pointerWidth={8} />
                    )}

                    {/* Live lasso freehand preview */}
                    {lassoPoints.length >= 4 && toolState.tool === 'lasso' && (
                        <Line
                            points={lassoPoints}
                            stroke="#6366f1" strokeWidth={2}
                            opacity={0.8}
                            tension={0.4} lineCap="round" lineJoin="round"
                            dash={[4, 3]}
                        />
                    )}

                    {/* Lasso selection bounding box */}
                    {lassoBox && (
                        <Rect
                            x={lassoBox.x} y={lassoBox.y}
                            width={lassoBox.w} height={lassoBox.h}
                            stroke="#6366f1" strokeWidth={2}
                            dash={[6, 4]}
                            fill="rgba(99,102,241,0.08)"
                        />
                    )}
                </Layer>
            </Stage>

            {/* Eraser circle cursor overlay */}
            {toolState.tool === 'eraser' && eraserPos && (
                <div
                    className="absolute pointer-events-none z-30 rounded-full border-2 border-slate-500 bg-white/30"
                    style={{
                        width: toolState.strokeWidth * 4 * stageScale,
                        height: toolState.strokeWidth * 4 * stageScale,
                        left: eraserPos.x - (toolState.strokeWidth * 4 * stageScale) / 2,
                        top: eraserPos.y - (toolState.strokeWidth * 4 * stageScale) / 2,
                    }}
                />
            )}

            {/* Zoom controls — floating top-right */}
            <div className="absolute top-3 right-10 z-10 flex items-center gap-0.5 rounded-lg bg-slate-700/80 backdrop-blur-sm px-1.5 py-1 text-white shadow-lg select-none">
                <button
                    onClick={() => zoomBy(1 / ZOOM_STEP)}
                    className="w-7 h-7 rounded hover:bg-slate-600 flex items-center justify-center text-lg font-bold leading-none"
                    title="Zoom out (scroll ↓)"
                >−</button>
                <button
                    onClick={zoomReset}
                    className="min-w-[3.5rem] text-center text-xs font-mono hover:bg-slate-600 rounded px-1 py-0.5"
                    title="Reset zoom (100%)"
                >{Math.round(stageScale * 100)}%</button>
                <button
                    onClick={() => zoomBy(ZOOM_STEP)}
                    className="w-7 h-7 rounded hover:bg-slate-600 flex items-center justify-center text-lg font-bold leading-none"
                    title="Zoom in (scroll ↑)"
                >+</button>
            </div>

            {/* Horizontal scrollbar (bottom) */}
            <div
                className="absolute bottom-0 left-0 z-20 bg-slate-200/60"
                style={{ width: hTrackW, height: SB }}
            >
                <div
                    className="absolute top-0.5 rounded-full bg-slate-400/70 hover:bg-slate-500/80 cursor-default transition-colors"
                    style={{ left: hThumbLeft, width: hThumbW, height: SB - 2 }}
                    onMouseDown={e => {
                        e.preventDefault();
                        scrollDragRef.current = {
                            axis: 'h',
                            startClient: e.clientX,
                            startStagePos: stagePos.x,
                            startStageScale: stageScale,
                            trackPx: hTrackW,
                            thumbPx: hThumbW,
                            worldView: worldViewW,
                        };
                    }}
                />
            </div>

            {/* Vertical scrollbar (right) */}
            <div
                className="absolute right-0 top-0 z-20 bg-slate-200/60"
                style={{ width: SB, height: vTrackH }}
            >
                <div
                    className="absolute left-0.5 rounded-full bg-slate-400/70 hover:bg-slate-500/80 cursor-default transition-colors"
                    style={{ top: vThumbTop, height: vThumbH, width: SB - 2 }}
                    onMouseDown={e => {
                        e.preventDefault();
                        scrollDragRef.current = {
                            axis: 'v',
                            startClient: e.clientY,
                            startStagePos: stagePos.y,
                            startStageScale: stageScale,
                            trackPx: vTrackH,
                            thumbPx: vThumbH,
                            worldView: worldViewH,
                        };
                    }}
                />
            </div>

            {/* Corner square */}
            <div className="absolute right-0 bottom-0 z-20 bg-slate-200/60" style={{ width: SB, height: SB }} />

            {/* Ask AI floating button — appears below the lasso selection box */}
            {lassoBox && onAiCapture && (() => {
                const bx = lassoBox.x * stageScale + stagePos.x;
                const by = lassoBox.y * stageScale + stagePos.y;
                const bw = lassoBox.w * stageScale;
                const bh = lassoBox.h * stageScale;
                return (
                    <button
                        className="absolute z-40 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold shadow-lg shadow-indigo-900/50 transition-colors select-none"
                        style={{ left: bx + bw / 2, top: by + bh + 10, transform: 'translateX(-50%)' }}
                        onClick={handleAskAi}
                    >
                        ✨ Ask AI
                    </button>
                );
            })()}
        </div>
    );
}
