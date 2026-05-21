// Owner: Parivesh (Smartboard core)
import { useCallback, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { Annotation } from '@/types';
import { useSmartboardSession } from '@/hooks/useSmartboardSession';
import WhiteboardCanvas from '@/components/canvas/WhiteboardCanvas';
import AiAssistPanel from '@/components/canvas/AiAssistPanel';
import CanvasToolbar, { type ToolState } from '@/components/canvas/CanvasToolbar';
import PageStrip from '@/components/canvas/PageStrip';

export default function SmartboardSessionPage() {
    const { sessionId } = useParams<{ sessionId: string }>();
    const navigate = useNavigate();
    const id = sessionId ?? '';

    const {
        pages,
        currentPage,
        currentPageIndex,
        setCurrentPageIndex,
        status,
        setAnnotations,
        addPage,
        deletePage,
        endSession,
        flushDirty,
    } = useSmartboardSession(id);

    const [toolState, setToolState] = useState<ToolState>({ tool: 'pen', color: '#1e293b', strokeWidth: 3 });
    const [showEndConfirm, setShowEndConfirm] = useState(false);
    const [ending, setEnding] = useState(false);
    const [showClearConfirm, setShowClearConfirm] = useState(false);

    // Right panel — collapsible + resizable
    const DEFAULT_PANEL_WIDTH = 320;
    const MIN_PANEL_WIDTH = 200;
    const MAX_PANEL_WIDTH = 720;
    const [panelOpen, setPanelOpen] = useState(true);
    const [panelWidth, setPanelWidth] = useState(DEFAULT_PANEL_WIDTH);
    const panelWidthRef = useRef(DEFAULT_PANEL_WIDTH);

    const handleResizeMouseDown = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        const startX = e.clientX;
        const startWidth = panelWidthRef.current;
        const onMove = (ev: MouseEvent) => {
            const newW = Math.max(MIN_PANEL_WIDTH, Math.min(MAX_PANEL_WIDTH, startWidth + (startX - ev.clientX)));
            panelWidthRef.current = newW;
            setPanelWidth(newW);
        };
        const onUp = () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
    }, []);

    const resetPanelWidth = useCallback(() => {
        panelWidthRef.current = DEFAULT_PANEL_WIDTH;
        setPanelWidth(DEFAULT_PANEL_WIDTH);
    }, []);

    // Per-page viewport (pan + zoom) — stored in a ref so panning never causes parent re-renders
    const viewportStore = useRef<Record<number, { scale: number; pos: { x: number; y: number } }>>({});
    const saveViewport = useCallback((v: { scale: number; pos: { x: number; y: number } }) => {
        viewportStore.current[currentPageIndex] = v;
    }, [currentPageIndex]);

    // AI Assist Panel — query set when teacher uses the lasso tool and taps "Ask AI ✨"
    const [aiQuery, setAiQuery] = useState<{ dataUrl: string; timestamp: number } | null>(null);
    const handleAiCapture = useCallback((dataUrl: string) => {
        setAiQuery({ dataUrl, timestamp: Date.now() });
    }, []);

    // Per-page undo/redo stacks (keyed by pageIndex)
    const [undoStacks, setUndoStacks] = useState<Record<number, Annotation[][]>>({});
    const [redoStacks, setRedoStacks] = useState<Record<number, Annotation[][]>>({});

    const pushUndo = useCallback((snapshot: Annotation[]) => {
        setUndoStacks(prev => ({ ...prev, [currentPageIndex]: [...(prev[currentPageIndex] ?? []), snapshot] }));
    }, [currentPageIndex]);

    const clearRedo = useCallback(() => {
        setRedoStacks(prev => ({ ...prev, [currentPageIndex]: [] }));
    }, [currentPageIndex]);

    const handleUndo = useCallback(() => {
        const stack = undoStacks[currentPageIndex] ?? [];
        if (!stack.length) return;
        const prev = stack[stack.length - 1];
        // Save current to redo
        setRedoStacks(s => ({ ...s, [currentPageIndex]: [...(s[currentPageIndex] ?? []), currentPage?.annotations ?? []] }));
        setUndoStacks(s => ({ ...s, [currentPageIndex]: stack.slice(0, -1) }));
        setAnnotations(currentPageIndex, () => prev);
    }, [undoStacks, redoStacks, currentPageIndex, currentPage, setAnnotations]);

    const handleRedo = useCallback(() => {
        const stack = redoStacks[currentPageIndex] ?? [];
        if (!stack.length) return;
        const next = stack[stack.length - 1];
        setUndoStacks(s => ({ ...s, [currentPageIndex]: [...(s[currentPageIndex] ?? []), currentPage?.annotations ?? []] }));
        setRedoStacks(s => ({ ...s, [currentPageIndex]: stack.slice(0, -1) }));
        setAnnotations(currentPageIndex, () => next);
    }, [undoStacks, redoStacks, currentPageIndex, currentPage, setAnnotations]);

    const handleClear = useCallback(() => {
        if (!currentPage?.annotations.length) return;
        setShowClearConfirm(true);
    }, [currentPage]);

    const handleClearConfirmed = useCallback(() => {
        if (!currentPage?.annotations.length) return;
        pushUndo(currentPage.annotations);
        clearRedo();
        setAnnotations(currentPageIndex, () => []);
        setShowClearConfirm(false);
    }, [currentPage, currentPageIndex, setAnnotations, pushUndo, clearRedo]);

    const handleEndSession = useCallback(() => {
        setShowEndConfirm(true);
    }, []);

    const handleEndConfirmed = useCallback(async () => {
        setEnding(true);
        try {
            await flushDirty();   // save all pending strokes first
            await endSession();
            navigate('/dashboard');
        } finally {
            setEnding(false);
            setShowEndConfirm(false);
        }
    }, [flushDirty, endSession, navigate]);

    if (status === 'loading') return <div className="flex h-screen items-center justify-center text-slate-400">Loading session…</div>;
    if (status === 'error') return <div className="flex h-screen items-center justify-center text-rose-500">Failed to load session.</div>;

    const readOnly = status === 'ended';
    // In view-only mode force pan tool so nothing can be drawn
    const effectiveTool: ToolState = readOnly ? { ...toolState, tool: 'select' } : toolState;

    return (
        <div className="flex h-screen bg-slate-950 overflow-hidden">

            {/* ── Left: canvas area (fills remaining space) ─────────────────── */}
            <div className="flex flex-col flex-1 min-w-0">
            {currentPage && (
                <WhiteboardCanvas
                    page={currentPage}
                    toolState={effectiveTool}
                    undoStack={undoStacks[currentPageIndex] ?? []}
                    redoStack={redoStacks[currentPageIndex] ?? []}
                    onCommit={fn => setAnnotations(currentPageIndex, fn)}
                    onUndoPush={pushUndo}
                    onRedoClear={clearRedo}
                    savedViewport={viewportStore.current[currentPageIndex]}
                    onViewportChange={saveViewport}
                    onAiCapture={readOnly ? undefined : handleAiCapture}
                    onToolChange={patch => !readOnly && setToolState(prev => ({ ...prev, ...patch }))}
                />
            )}

            <PageStrip
                pages={pages}
                currentIndex={currentPageIndex}
                onSelect={setCurrentPageIndex}
                onAdd={() => addPage()}
                onDelete={deletePage}
            />

            <CanvasToolbar
                toolState={effectiveTool}
                onChange={patch => !readOnly && setToolState(prev => ({ ...prev, ...patch }))}
                onUndo={handleUndo}
                onRedo={handleRedo}
                onClear={handleClear}
                onEndSession={handleEndSession}
                onBack={() => navigate('/dashboard')}
                canUndo={(undoStacks[currentPageIndex]?.length ?? 0) > 0}
                canRedo={(redoStacks[currentPageIndex]?.length ?? 0) > 0}
                sessionTitle={`Session #${id}`}
                readOnly={readOnly}
            />
            </div>

            {/* ── Resize handle (drag to resize, double-click to reset) ────── */}
            {panelOpen && (
                <div
                    onMouseDown={handleResizeMouseDown}
                    onDoubleClick={resetPanelWidth}
                    title="Drag to resize · Double-click to reset width"
                    className="relative flex-shrink-0 flex items-center justify-center cursor-col-resize bg-slate-800 hover:bg-blue-600 transition-colors group"
                    style={{ width: 8 }}
                >
                    {/* Collapse chevron button — centred on the handle */}
                    <button
                        onMouseDown={e => e.stopPropagation()}
                        onClick={e => { e.stopPropagation(); setPanelOpen(false); }}
                        title="Collapse AI panel"
                        className="absolute top-6 left-1/2 -translate-x-1/2 z-10 flex items-center justify-center w-5 h-9 rounded bg-slate-700 group-hover:bg-blue-700 text-slate-300 text-xs shadow"
                    >
                        ▶
                    </button>
                    {/* Reset-width dot — double-click hint */}
                    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-slate-600 group-hover:bg-blue-400" />
                </div>
            )}

            {/* ── Right: AI Assist Panel ───────────────────────────────────── */}
            {panelOpen ? (
                <div className="flex-shrink-0 overflow-hidden" style={{ width: panelWidth }}>
                    <AiAssistPanel query={aiQuery} sessionId={Number(id) || undefined} />
                </div>
            ) : (
                /* Collapsed: thin expand tab on the right edge */
                <button
                    onClick={() => setPanelOpen(true)}
                    title="Expand AI panel"
                    className="flex-shrink-0 flex flex-col items-center justify-center gap-2 bg-slate-800 hover:bg-blue-600 text-slate-300 hover:text-white transition-colors border-l border-slate-700"
                    style={{ width: 28 }}
                >
                    <span className="text-sm">◀</span>
                    <span style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', fontSize: 10, letterSpacing: 1 }}>AI PANEL</span>
                </button>
            )}

            {/* ── Clear page confirmation modal ─────────────────── */}
            {showClearConfirm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm mx-4">
                        <h3 className="text-base font-semibold text-slate-800 mb-1">Clear this page?</h3>
                        <p className="text-sm text-slate-500 mb-5">
                            All annotations on this page will be erased. This cannot be undone after you leave the page.
                        </p>
                        <div className="flex gap-3 justify-end">
                            <button
                                onClick={() => setShowClearConfirm(false)}
                                className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleClearConfirmed}
                                className="rounded-lg px-4 py-2 text-sm font-semibold bg-amber-500 hover:bg-amber-600 text-white transition-colors"
                            >
                                Clear Page
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── End Session confirmation modal ───────────────────── */}
            {showEndConfirm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm mx-4">
                        <h3 className="text-base font-semibold text-slate-800 mb-1">End Session?</h3>
                        <p className="text-sm text-slate-500 mb-5">
                            All annotations will be saved before closing.
                            You can re-open this session from the dashboard.
                        </p>
                        <div className="flex gap-3 justify-end">
                            <button
                                onClick={() => setShowEndConfirm(false)}
                                disabled={ending}
                                className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleEndConfirmed}
                                disabled={ending}
                                className="rounded-lg px-4 py-2 text-sm font-semibold bg-rose-600 hover:bg-rose-700 text-white transition-colors disabled:opacity-60"
                            >
                                {ending ? 'Saving…' : 'End Session'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
