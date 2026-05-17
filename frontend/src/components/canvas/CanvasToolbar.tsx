import type { Annotation } from '@/types';

export type DrawingTool = 'pen' | 'highlighter' | 'text' | 'eraser' | 'rect' | 'circle' | 'arrow' | 'select' | 'smart';

export interface ToolState {
    tool: DrawingTool;
    color: string;
    strokeWidth: number;
}

interface Props {
    toolState: ToolState;
    onChange: (patch: Partial<ToolState>) => void;
    onUndo: () => void;
    onRedo: () => void;
    onClear: () => void;
    onEndSession: () => void;
    onBack: () => void;
    canUndo: boolean;
    canRedo: boolean;
    sessionTitle?: string;
    readOnly?: boolean;
}

const COLORS = ['#1e293b', '#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#a855f7', '#ec4899', '#ffffff'];

const TOOLS: { id: DrawingTool; label: string; icon: string }[] = [
    { id: 'pen', label: 'Pen', icon: '✏️' },
    { id: 'highlighter', label: 'Highlighter', icon: '🖊️' },
    { id: 'text', label: 'Text', icon: 'T' },
    { id: 'rect', label: 'Rectangle', icon: '▭' },
    { id: 'circle', label: 'Circle', icon: '○' },
    { id: 'arrow', label: 'Arrow', icon: '→' },
    { id: 'eraser', label: 'Eraser', icon: '⬜' },
    { id: 'smart', label: 'Smart Shape (auto-detect)', icon: '✦' },
    { id: 'select', label: 'Pan (Space+drag)', icon: '✋' },
];

export function makeAnnotationId() {
    return `ann-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function buildPenAnnotation(points: number[], tool: ToolState, kind: 'pen' | 'highlighter'): Annotation {
    return {
        id: makeAnnotationId(),
        type: kind,
        tool: { color: tool.color, width: tool.strokeWidth, opacity: kind === 'highlighter' ? 0.4 : 1 },
        points,
    };
}

export function buildEraserAnnotation(points: number[], width: number): Annotation {
    return {
        id: makeAnnotationId(),
        type: 'eraser',
        tool: { width },
        points,
    };
}

export function buildTextAnnotation(x: number, y: number, text: string, tool: ToolState): Annotation {
    return {
        id: makeAnnotationId(),
        type: 'text',
        tool: { color: tool.color, size: tool.strokeWidth * 6 + 12 },
        x, y, text,
    };
}

export function buildShapeAnnotation(
    shape: 'rect' | 'circle' | 'arrow' | 'line',
    points: number[],
    tool: ToolState,
): Annotation {
    return {
        id: makeAnnotationId(),
        type: 'shape',
        tool: { color: tool.color, width: tool.strokeWidth },
        shape,
        points,
    };
}

export default function CanvasToolbar({ toolState, onChange, onUndo, onRedo, onClear, onEndSession, onBack, canUndo, canRedo, sessionTitle, readOnly = false }: Props) {
    return (
        <div className="flex items-center gap-2 bg-slate-900 px-3 py-2 text-white select-none flex-shrink-0">
            {/* Back to dashboard */}
            <button
                onClick={onBack}
                title="Back to Dashboard"
                className="rounded px-2 py-1 text-sm hover:bg-slate-700 text-slate-300 hover:text-white transition-colors flex items-center gap-1 flex-shrink-0"
            >
                ← Dashboard
            </button>

            <div className="w-px h-6 bg-slate-600 mx-1" />

            {/* Session title */}
            <span className="hidden sm:block max-w-40 truncate text-sm font-medium text-slate-400">
                {sessionTitle ?? 'Untitled'}
            </span>

            {readOnly ? (
                <>
                    <div className="w-px h-6 bg-slate-600 mx-1" />
                    <span className="text-xs font-semibold px-2 py-0.5 rounded bg-amber-400/20 text-amber-300">
                        View Only
                    </span>
                </>
            ) : (
                <>
                    <div className="w-px h-6 bg-slate-600 mx-1" />

            {/* Tool buttons */}
            <div className="flex gap-1">
                {TOOLS.map(t => (
                    <button
                        key={t.id}
                        title={t.label}
                        onClick={() => onChange({ tool: t.id })}
                        className={`w-8 h-8 rounded text-sm font-bold transition-colors ${toolState.tool === t.id
                            ? 'bg-blue-600 text-white'
                            : 'bg-slate-700 hover:bg-slate-600 text-slate-200'
                            }`}
                    >
                        {t.icon}
                    </button>
                ))}
            </div>

            <div className="w-px h-6 bg-slate-600 mx-1" />

            {/* Colors */}
            <div className="flex gap-1">
                {COLORS.map(c => (
                    <button
                        key={c}
                        onClick={() => onChange({ color: c })}
                        style={{ background: c }}
                        className={`w-5 h-5 rounded-full border-2 transition-transform ${toolState.color === c ? 'border-white scale-110' : 'border-slate-500'
                            }`}
                    />
                ))}
            </div>

            <div className="w-px h-6 bg-slate-600 mx-1" />

            {/* Stroke width */}
            <input
                type="range" min={1} max={12} step={1}
                value={toolState.strokeWidth}
                onChange={e => onChange({ strokeWidth: Number(e.target.value) })}
                className="w-20 accent-blue-500"
                title="Stroke width"
            />

            <div className="w-px h-6 bg-slate-600 mx-1" />

            {/* History */}
            <button disabled={!canUndo} onClick={onUndo} title="Undo" className="w-8 h-8 rounded bg-slate-700 hover:bg-slate-600 disabled:opacity-30 text-sm">↩</button>
            <button disabled={!canRedo} onClick={onRedo} title="Redo" className="w-8 h-8 rounded bg-slate-700 hover:bg-slate-600 disabled:opacity-30 text-sm">↪</button>
            <button onClick={onClear} title="Clear page" className="w-8 h-8 rounded bg-slate-700 hover:bg-rose-600 text-sm">🗑</button>

            {/* Spacer */}
            <div className="flex-1" />

            {/* End session */}
            <button
                onClick={onEndSession}
                className="rounded bg-rose-700 hover:bg-rose-600 px-3 py-1 text-sm font-semibold"
            >
                End Session
            </button>
                </>
            )}
        </div>
    );
}
