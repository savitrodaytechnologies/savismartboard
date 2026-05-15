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
} from './CanvasToolbar';

// ─── canvas dimensions (logical / design space) ──────────────────────────────
const DESIGN_W = 1280;
const DESIGN_H = 720;

// ─── helpers ─────────────────────────────────────────────────────────────────

interface UseScaleResult { scale: number; offsetX: number; offsetY: number }

function useContainerScale(containerRef: React.RefObject<HTMLDivElement | null>): UseScaleResult {
    const [size, setSize] = useState<UseScaleResult>({ scale: 1, offsetX: 0, offsetY: 0 });

    useEffect(() => {
        if (!containerRef.current) return;
        const obs = new ResizeObserver(entries => {
            const { width, height } = entries[0].contentRect;
            const scale = Math.min(width / DESIGN_W, height / DESIGN_H);
            setSize({ scale, offsetX: (width - DESIGN_W * scale) / 2, offsetY: (height - DESIGN_H * scale) / 2 });
        });
        obs.observe(containerRef.current);
        return () => obs.disconnect();
    }, [containerRef]);

    return size;
}

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
    const { scale, offsetX, offsetY } = useContainerScale(containerRef);

    // In-progress stroke
    const [activePoints, setActivePoints] = useState<number[]>([]);
    const [shapeStart, setShapeStart] = useState<{ x: number; y: number } | null>(null);
    const [previewShape, setPreviewShape] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
    const isDrawing = useRef(false);

    // Convert event to logical coordinates (unscaled)
    const toLogical = useCallback((e: KonvaEventObject<MouseEvent | TouchEvent>): { x: number; y: number } => {
        const stage = e.target.getStage()!;
        const ptr = stage.getPointerPosition()!;
        return { x: (ptr.x - offsetX) / scale, y: (ptr.y - offsetY) / scale };
    }, [scale, offsetX, offsetY]);

    const handleMouseDown = useCallback((e: KonvaEventObject<MouseEvent>) => {
        const { x, y } = toLogical(e);
        if (toolState.tool === 'pen' || toolState.tool === 'highlighter') {
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
        } else if (toolState.tool === 'eraser') {
            const target = e.target as Konva.Node;
            const id = target.id();
            if (id) {
                onUndoPush([...page.annotations]);
                onRedoClear();
                onCommit(prev => prev.filter(a => a.id !== id));
            }
        }
    }, [toolState.tool, toLogical, page.annotations, onCommit, onUndoPush, onRedoClear]);

    const handleMouseMove = useCallback((e: KonvaEventObject<MouseEvent>) => {
        if (!isDrawing.current) return;
        const { x, y } = toLogical(e);
        if (toolState.tool === 'pen' || toolState.tool === 'highlighter') {
            setActivePoints(prev => [...prev, x, y]);
        } else if (shapeStart && ['rect', 'circle', 'arrow'].includes(toolState.tool)) {
            setPreviewShape({ x: Math.min(x, shapeStart.x), y: Math.min(y, shapeStart.y), w: Math.abs(x - shapeStart.x), h: Math.abs(y - shapeStart.y) });
        }
    }, [toolState.tool, toLogical, shapeStart]);

    const handleMouseUp = useCallback((e: KonvaEventObject<MouseEvent>) => {
        if (!isDrawing.current) return;
        isDrawing.current = false;
        const { x, y } = toLogical(e);

        if ((toolState.tool === 'pen' || toolState.tool === 'highlighter') && activePoints.length >= 4) {
            const ann = buildPenAnnotation(activePoints, toolState, toolState.tool);
            onCommit(prev => [...prev, ann]);
            setActivePoints([]);
        } else if (shapeStart && ['rect', 'circle', 'arrow'].includes(toolState.tool)) {
            const shape = toolState.tool as 'rect' | 'circle' | 'arrow';
            const pts = [shapeStart.x, shapeStart.y, x, y];
            if (Math.abs(x - shapeStart.x) > 4 || Math.abs(y - shapeStart.y) > 4) {
                const ann = buildShapeAnnotation(shape, pts, toolState);
                onCommit(prev => [...prev, ann]);
            }
            setShapeStart(null);
            setPreviewShape(null);
        }
    }, [toolState, activePoints, shapeStart, onCommit, toLogical]);

    const handleDoubleClick = useCallback((e: KonvaEventObject<MouseEvent>) => {
        if (toolState.tool !== 'text') return;
        const { x, y } = toLogical(e);
        const text = window.prompt('Enter text:');
        if (text) {
            onUndoPush([...page.annotations]);
            onRedoClear();
            const ann = buildTextAnnotation(x, y, text, toolState);
            onCommit(prev => [...prev, ann]);
        }
    }, [toolState, toLogical, page.annotations, onCommit, onUndoPush, onRedoClear]);

    // Render a committed annotation
    const renderAnnotation = (ann: Annotation) => {
        if (ann.type === 'pen' || ann.type === 'highlighter') {
            return (
                <Line
                    key={ann.id}
                    id={ann.id}
                    points={ann.points}
                    stroke={ann.tool.color}
                    strokeWidth={ann.tool.width}
                    opacity={ann.tool.opacity}
                    tension={0.4}
                    lineCap="round"
                    lineJoin="round"
                    globalCompositeOperation="source-over"
                />
            );
        }
        if (ann.type === 'text') {
            return (
                <Text
                    key={ann.id}
                    id={ann.id}
                    x={ann.x}
                    y={ann.y}
                    text={ann.text}
                    fontSize={ann.tool.size}
                    fill={ann.tool.color}
                    fontFamily="sans-serif"
                />
            );
        }
        if (ann.type === 'shape') {
            const [x1, y1, x2, y2] = ann.points;
            if (ann.shape === 'rect') {
                return <Rect key={ann.id} id={ann.id} x={Math.min(x1, x2)} y={Math.min(y1, y2)} width={Math.abs(x2 - x1)} height={Math.abs(y2 - y1)} stroke={ann.tool.color} strokeWidth={ann.tool.width} fill="transparent" />;
            }
            if (ann.shape === 'circle') {
                const rx = Math.abs(x2 - x1) / 2, ry = Math.abs(y2 - y1) / 2;
                return <Circle key={ann.id} id={ann.id} x={(x1 + x2) / 2} y={(y1 + y2) / 2} radiusX={rx} radiusY={ry} stroke={ann.tool.color} strokeWidth={ann.tool.width} fill="transparent" />;
            }
            if (ann.shape === 'arrow') {
                return <Arrow key={ann.id} id={ann.id} points={[x1, y1, x2, y2]} stroke={ann.tool.color} strokeWidth={ann.tool.width} fill={ann.tool.color} pointerLength={10} pointerWidth={8} />;
            }
        }
        return null;
    };

    const cursor =
        toolState.tool === 'eraser' ? 'crosshair' :
            toolState.tool === 'text' ? 'text' :
                toolState.tool === 'select' ? 'default' : 'crosshair';

    return (
        <div ref={containerRef} className="relative flex-1 bg-slate-950 overflow-hidden">
            {/* HTML background (KBot card) */}
            {page.background.kind === 'html' && page.background.html && (
                <div
                    className="absolute pointer-events-none origin-top-left"
                    style={{
                        left: offsetX,
                        top: offsetY,
                        width: page.viewport.width,
                        height: page.viewport.height,
                        transform: `scale(${scale})`,
                    }}
                    dangerouslySetInnerHTML={{ __html: page.background.html }}
                />
            )}
            {/* Blank background */}
            {page.background.kind === 'blank' && (
                <div
                    className="absolute bg-white pointer-events-none"
                    style={{ left: offsetX, top: offsetY, width: page.viewport.width * scale, height: page.viewport.height * scale }}
                />
            )}

            {/* Konva overlay */}
            <Stage
                width={containerRef.current?.clientWidth ?? DESIGN_W}
                height={containerRef.current?.clientHeight ?? DESIGN_H}
                style={{ cursor, position: 'absolute', inset: 0 }}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onDblClick={handleDoubleClick}
                x={offsetX}
                y={offsetY}
                scaleX={scale}
                scaleY={scale}
            >
                <Layer>
                    {page.annotations.map(renderAnnotation)}
                    {/* In-progress pen stroke */}
                    {activePoints.length >= 4 && (
                        <Line
                            points={activePoints}
                            stroke={toolState.color}
                            strokeWidth={toolState.strokeWidth}
                            opacity={toolState.tool === 'highlighter' ? 0.4 : 1}
                            tension={0.4}
                            lineCap="round"
                            lineJoin="round"
                        />
                    )}
                    {/* Preview shape while dragging */}
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
        </div>
    );
}
