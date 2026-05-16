import { useCallback, useEffect, useRef, useState } from 'react';
import { Stage, Layer, Line, Text, Rect, Circle, Arrow } from 'react-konva';
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
}

// ─── component ────────────────────────────────────────────────────────────────

export default function WhiteboardCanvas({ page, toolState, onCommit, onUndoPush, onRedoClear }: Props) {
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

    // In-progress stroke
    const [activePoints, setActivePoints] = useState<number[]>([]);
    const [shapeStart, setShapeStart] = useState<{ x: number; y: number } | null>(null);
    const [previewShape, setPreviewShape] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
    const isDrawing = useRef(false);

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

    // Window-level mouse handlers for scrollbar thumb drag
    useEffect(() => {
        const onMove = (e: MouseEvent) => {
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
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        return () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };
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
    const handleMouseDown = useCallback((e: KonvaEventObject<MouseEvent>) => {
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
    }, [toolState.tool, getWorldPos, page.annotations, onCommit, onUndoPush, onRedoClear, isPanTool]);

    const handleMouseMove = useCallback((e: KonvaEventObject<MouseEvent>) => {
        if (isPanning.current && lastPanClient.current) {
            const dx = e.evt.clientX - lastPanClient.current.x;
            const dy = e.evt.clientY - lastPanClient.current.y;
            lastPanClient.current = { x: e.evt.clientX, y: e.evt.clientY };
            setStagePos(prev => ({ x: prev.x + dx, y: prev.y + dy }));
            return;
        }
        if (!isDrawing.current) return;

        const stage = e.target.getStage()!;
        const { x, y } = getWorldPos(stage);

        if (toolState.tool === 'pen' || toolState.tool === 'highlighter' || toolState.tool === 'smart') {
            setActivePoints(prev => [...prev, x, y]);
        } else if (toolState.tool === 'eraser') {
            setActivePoints(prev => [...prev, x, y]);
        } else if (shapeStart && ['rect', 'circle', 'arrow'].includes(toolState.tool)) {
            setPreviewShape({
                x: Math.min(x, shapeStart.x),
                y: Math.min(y, shapeStart.y),
                w: Math.abs(x - shapeStart.x),
                h: Math.abs(y - shapeStart.y),
            });
        }
    }, [toolState.tool, getWorldPos, shapeStart]);

    const handleMouseUp = useCallback((e: KonvaEventObject<MouseEvent>) => {
        if (isPanning.current) {
            isPanning.current = false;
            lastPanClient.current = null;
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
        }
    }, [toolState, activePoints, shapeStart, onCommit, getWorldPos]);

    const handleDoubleClick = useCallback((e: KonvaEventObject<MouseEvent>) => {
        if (toolState.tool !== 'text') return;
        const stage = e.target.getStage()!;
        const { x, y } = getWorldPos(stage);
        const text = window.prompt('Enter text:');
        if (text) {
            onUndoPush([...page.annotations]);
            onRedoClear();
            onCommit(prev => [...prev, buildTextAnnotation(x, y, text, toolState)]);
        }
    }, [toolState, getWorldPos, page.annotations, onCommit, onUndoPush, onRedoClear]);

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
                return <Circle key={ann.id} id={ann.id} x={(x1 + x2) / 2} y={(y1 + y2) / 2} radiusX={rx} radiusY={ry} stroke={ann.tool.color} strokeWidth={ann.tool.width} fill="transparent" hitStrokeWidth={HIT_STROKE} />;
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
                style={{ cursor, position: 'absolute', inset: 0 }}
                x={stagePos.x}
                y={stagePos.y}
                scaleX={stageScale}
                scaleY={stageScale}
                onWheel={handleWheel}
                onMouseDown={handleMouseDown}
                onMouseMove={e => {
                    // track eraser circle position
                    if (toolState.tool === 'eraser') {
                        const stage = e.target.getStage()!;
                        const ptr = stage.getPointerPosition();
                        if (ptr) setEraserPos({ x: ptr.x, y: ptr.y });
                    }
                    handleMouseMove(e);
                }}
                onMouseLeave={() => setEraserPos(null)}
                onMouseUp={handleMouseUp}
                onDblClick={handleDoubleClick}
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
                        <Circle x={previewShape.x + previewShape.w / 2} y={previewShape.y + previewShape.h / 2} radiusX={previewShape.w / 2} radiusY={previewShape.h / 2} stroke={toolState.color} strokeWidth={toolState.strokeWidth} dash={[4, 3]} fill="transparent" />
                    )}
                    {previewShape && shapeStart && toolState.tool === 'arrow' && (
                        <Arrow points={[shapeStart.x, shapeStart.y, shapeStart.x + previewShape.w, shapeStart.y + previewShape.h]} stroke={toolState.color} strokeWidth={toolState.strokeWidth} fill={toolState.color} dash={[4, 3]} pointerLength={10} pointerWidth={8} />
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
        </div>
    );
}
