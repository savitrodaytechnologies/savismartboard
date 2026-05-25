// Owner: Parivesh
// Right panel (30%) of SmartboardSessionPage — shows AI responses for a teacher's lasso selection.
// Teacher circles something on the canvas → clicks "Ask AI ✨" → this panel loads 4 tabs.
import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { aiService } from '@/services/aiService';

type Tab = 'solution' | 'explain' | 'mistakes' | 'quiz';

const TABS: { id: Tab; label: string; icon: string; instruction: string }[] = [
    { id: 'solution', label: 'Solution',  icon: '✅', instruction: 'solution'  },
    { id: 'explain',  label: 'Explain',   icon: '💡', instruction: 'explain'   },
    { id: 'mistakes', label: 'Mistakes',  icon: '⚠️', instruction: 'mistakes'  },
    { id: 'quiz',     label: 'Quiz',      icon: '❓', instruction: 'quiz'      },
];

interface TabState {
    status: 'idle' | 'loading' | 'done' | 'error';
    content: string;
}

interface Props {
    query: { dataUrl: string; timestamp: number } | null;
    sessionId?: number;
}

export default function AiAssistPanel({ query, sessionId }: Props) {
    const [activeTab, setActiveTab] = useState<Tab>('solution');
    const [tabs, setTabs] = useState<Record<Tab, TabState>>({
        solution: { status: 'idle', content: '' },
        explain:  { status: 'idle', content: '' },
        mistakes: { status: 'idle', content: '' },
        quiz:     { status: 'idle', content: '' },
    });

    // Track which query each tab has already loaded for (avoid re-loading on tab switch)
    const loadedForRef = useRef<Record<Tab, number | null>>({
        solution: null, explain: null, mistakes: null, quiz: null,
    });

    // When query changes: reset all tabs
    useEffect(() => {
        if (!query) return;
        setTabs({
            solution: { status: 'idle', content: '' },
            explain:  { status: 'idle', content: '' },
            mistakes: { status: 'idle', content: '' },
            quiz:     { status: 'idle', content: '' },
        });
        loadedForRef.current = { solution: null, explain: null, mistakes: null, quiz: null };
        setActiveTab('solution');
    }, [query?.timestamp]);

    // Load the active tab when it changes (or when query first arrives)
    useEffect(() => {
        if (!query) return;
        if (loadedForRef.current[activeTab] === query.timestamp) return; // already loaded

        const tabDef = TABS.find(t => t.id === activeTab)!;
        loadedForRef.current[activeTab] = query.timestamp;

        setTabs(prev => ({ ...prev, [activeTab]: { status: 'loading', content: '' } }));

        // Extract media type and strip data URL prefix before sending.
        // It's critical to send the actual media type — Konva can return PNG even when
        // JPEG is requested, and Claude rejects a JPEG-labelled payload that is actually PNG.
        const mediaTypeMatch = query.dataUrl.match(/^data:([^;]+);base64,/);
        const mediaType = mediaTypeMatch ? mediaTypeMatch[1] : 'image/jpeg';
        const base64 = query.dataUrl.slice(query.dataUrl.indexOf(',') + 1);

        aiService.askSelection(tabDef.instruction, base64, sessionId, mediaType)
            .then((res: { result: string }) => {
                setTabs(prev => ({ ...prev, [activeTab]: { status: 'done', content: res.result } }));
            })
            .catch(() => {
                setTabs(prev => ({ ...prev, [activeTab]: { status: 'error', content: 'Could not get a response. Please try again.' } }));
                loadedForRef.current[activeTab] = null; // allow retry
            });
    }, [activeTab, query?.timestamp, sessionId]);

    // ── Empty state ───────────────────────────────────────────────────────────
    if (!query) {
        return (
            <div className="flex flex-col h-full bg-slate-900 border-l border-slate-700 select-none">
                <div className="px-4 py-3 border-b border-slate-700">
                    <h2 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                        <span>✨</span> AI Assist
                    </h2>
                </div>
                <div className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center text-2xl">⭕</div>
                    <p className="text-sm text-slate-400 leading-relaxed">
                        Select the <strong className="text-slate-300">Lasso</strong> tool, circle something on the board, then tap <strong className="text-indigo-400">Ask AI ✨</strong>
                    </p>
                </div>
            </div>
        );
    }

    // ── Active state ──────────────────────────────────────────────────────────
    const current = tabs[activeTab];

    return (
        <div className="flex flex-col h-full bg-slate-900 border-l border-slate-700 select-none">

            {/* Header */}
            <div className="px-4 py-3 border-b border-slate-700 flex items-center justify-between gap-2 flex-shrink-0">
                <h2 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                    <span>✨</span> AI Assist
                </h2>
                {/* Thumbnail of the selection */}
                <img
                    src={query.dataUrl}
                    alt="Selection"
                    className="h-8 w-auto max-w-[80px] rounded border border-slate-600 object-contain bg-white"
                />
            </div>

            {/* Tab bar */}
            <div className="flex border-b border-slate-700 flex-shrink-0">
                {TABS.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex-1 py-2 text-xs font-medium transition-colors ${
                            activeTab === tab.id
                                ? 'text-indigo-400 border-b-2 border-indigo-500 bg-slate-800/60'
                                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/30'
                        }`}
                        title={tab.label}
                    >
                        <span className="block">{tab.icon}</span>
                        <span className="block">{tab.label}</span>
                    </button>
                ))}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 text-sm text-slate-300 leading-relaxed">
                {current.status === 'idle' && (
                    <p className="text-slate-500 italic">Loading…</p>
                )}
                {current.status === 'loading' && (
                    <div className="flex items-center gap-2 text-slate-400">
                        <span className="animate-spin text-indigo-400">⟳</span>
                        Thinking…
                    </div>
                )}
                {current.status === 'error' && (
                    <p className="text-rose-400">{current.content}</p>
                )}
                {current.status === 'done' && (
                    <div className="prose prose-invert prose-sm max-w-none
                        prose-p:my-1.5 prose-li:my-0.5 prose-ol:my-1 prose-ul:my-1
                        prose-strong:text-slate-100 prose-headings:text-slate-200">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {current.content}
                        </ReactMarkdown>
                    </div>
                )}
            </div>
        </div>
    );
}
