// Owner: Parivesh — Phase 1 + 1.5 Teaching Sidebar
// Replaces the bare AiAssistPanel in SmartboardSessionPage as the full right panel.
// Auto-switches to AI tab when the teacher lassos and triggers "Ask AI ✨".
// Phase 1.5: topic search/override — teacher can switch topic mid-session without restarting.
import { useEffect, useRef, useState } from 'react';
import { kbotContentService } from '@/services/kbotContentService';
import { aiService } from '@/services/aiService';
import AiAssistPanel from '@/components/canvas/AiAssistPanel';
import ContentCardsTab from './ContentCardsTab';
import QuestionsTab from './QuestionsTab';
import QuizTab from './QuizTab';
import type { KBotTopicSearchResult, QuestionSummary } from '@/types';

type SidebarTab = 'content' | 'questions' | 'quiz' | 'ai';

const TABS: { id: SidebarTab; icon: string; label: string }[] = [
    { id: 'content',   icon: '📚', label: 'Content'   },
    { id: 'questions', icon: '❓', label: 'Questions' },
    { id: 'quiz',      icon: '📝', label: 'Quiz'      },
    { id: 'ai',        icon: '🧠', label: 'AI Assist' },
];

interface ActiveTopic { slug: string; title: string; }

interface Props {
    slug: string;
    aiQuery: { dataUrl: string; timestamp: number } | null;
    sessionId?: number;
}

export default function TeachingSidebar({ slug, aiQuery, sessionId }: Props) {
    // Active topic — may differ from URL slug if teacher overrides mid-session
    const [activeTopic, setActiveTopic]   = useState<ActiveTopic>({ slug, title: '' });
    const [topicHistory, setTopicHistory] = useState<ActiveTopic[]>([]);
    const [searching, setSearching]       = useState(!slug);   // auto-open if no topic
    const [searchQuery, setSearchQuery]   = useState('');
    const [searchResults, setSearchResults] = useState<KBotTopicSearchResult[]>([]);
    const [searchLoading, setSearchLoading] = useState(false);
    const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);

    const [activeTab, setActiveTab]       = useState<SidebarTab>('content');
    const [checkedIds, setCheckedIds]     = useState<Set<number>>(new Set());
    const [checkedQuestions, setCheckedQuestions] = useState<QuestionSummary[]>([]);

    // Sync if URL slug changes (e.g. developer navigation)
    useEffect(() => {
        setActiveTopic({ slug, title: '' });
        setSearching(!slug);
    }, [slug]);

    // Focus search input when search mode opens
    useEffect(() => {
        if (searching) searchInputRef.current?.focus();
    }, [searching]);

    // ── Auto-identify topic from lasso image ─────────────────────────────────
    // When the teacher circles something and hits "Ask AI ✨", fire a lightweight
    // vision call to identify the topic, then auto-select the top KBot match.
    const activeTopicRef = useRef(activeTopic);
    useEffect(() => { activeTopicRef.current = activeTopic; }, [activeTopic]);

    useEffect(() => {
        if (!aiQuery) return;
        const mediaTypeMatch = aiQuery.dataUrl.match(/^data:([^;]+);base64,/);
        const mediaType = mediaTypeMatch ? mediaTypeMatch[1] : 'image/png';
        const base64 = aiQuery.dataUrl.slice(aiQuery.dataUrl.indexOf(',') + 1);

        (async () => {
            try {
                console.log('[TeachingSidebar] identifyTopic: calling AI…');
                const { result: topicName } = await aiService.identifyTopic(base64, mediaType);
                console.log('[TeachingSidebar] identifyTopic result:', topicName);
                if (!topicName?.trim()) return;
                console.log('[TeachingSidebar] searchTopics:', topicName.trim());
                const results = await kbotContentService.searchTopics(topicName.trim());
                console.log('[TeachingSidebar] searchTopics results:', results);
                if (results.length === 0) return;
                const top = results[0];
                const current = activeTopicRef.current;
                // Push old topic to history before switching (skip if same topic)
                if (current.slug && current.slug !== top.slug) {
                    setTopicHistory(h => [current, ...h].slice(0, 8));
                }
                setActiveTopic({ slug: top.slug, title: top.title });
            } catch (err) {
                console.error('[TeachingSidebar] auto-identify error:', err);
            }
        })();
    }, [aiQuery?.timestamp]);

    // Debounced search — fires 350 ms after last keystroke
    useEffect(() => {
        if (!searchQuery.trim()) { setSearchResults([]); return; }
        if (searchTimer.current) clearTimeout(searchTimer.current);
        searchTimer.current = setTimeout(async () => {
            setSearchLoading(true);
            try {
                console.log('[TeachingSidebar] manual searchTopics:', searchQuery.trim());
                const results = await kbotContentService.searchTopics(searchQuery.trim());
                console.log('[TeachingSidebar] manual searchTopics results:', results);
                setSearchResults(results);
            } catch (err) {
                console.error('[TeachingSidebar] manual search error:', err);
                setSearchResults([]);
            } finally {
                setSearchLoading(false);
            }
        }, 350);
        return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
    }, [searchQuery]);

    // Auto-switch to AI tab when a new lasso query arrives
    useEffect(() => {
        if (aiQuery) setActiveTab('ai');
    }, [aiQuery]);

    function selectTopic(result: KBotTopicSearchResult) {
        // Push current to history before switching
        if (activeTopic.slug && activeTopic.slug !== result.slug) {
            setTopicHistory(h => [activeTopic, ...h].slice(0, 8));
        }
        setActiveTopic({ slug: result.slug, title: result.title });
        setSearching(false);
        setSearchQuery('');
        setSearchResults([]);
        // Reset quiz queue when topic changes — questions are now for a different topic
        setCheckedIds(new Set());
        setCheckedQuestions([]);
        setActiveTab('content');
    }

    function goBack() {
        if (topicHistory.length === 0) return;
        const [prev, ...rest] = topicHistory;
        setTopicHistory(rest);
        setActiveTopic(prev);
        setCheckedIds(new Set());
        setCheckedQuestions([]);
    }

    function cancelSearch() {
        setSearching(false);
        setSearchQuery('');
        setSearchResults([]);
    }

    function handleToggleCheck(q: QuestionSummary) {
        setCheckedIds(prev => {
            const next = new Set(prev);
            if (next.has(q.questionId)) {
                next.delete(q.questionId);
                setCheckedQuestions(qs => qs.filter(x => x.questionId !== q.questionId));
            } else {
                next.add(q.questionId);
                setCheckedQuestions(qs => [...qs, q]);
            }
            return next;
        });
    }

    const displayTitle = activeTopic.title || activeTopic.slug.replace(/_/g, ' ');

    return (
        <div className="flex flex-col h-full bg-slate-900 text-slate-100">

            {/* ── Topic header ─────────────────────────────────────────── */}
            <div className="flex-shrink-0 border-b border-slate-700">
                {searching ? (
                    /* Search mode */
                    <div className="relative p-2">
                        <div className="flex items-center gap-1.5 bg-slate-800 rounded-lg px-2.5 py-1.5 border border-blue-500/60">
                            <span className="text-slate-400 text-sm">🔍</span>
                            <input
                                ref={searchInputRef}
                                type="text"
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                placeholder="Search topics…"
                                className="flex-1 bg-transparent text-sm text-slate-100 placeholder-slate-500 outline-none"
                            />
                            {searchLoading && (
                                <span className="text-xs text-slate-400 animate-pulse">…</span>
                            )}
                            {activeTopic.slug && (
                                <button
                                    onClick={cancelSearch}
                                    className="text-slate-500 hover:text-slate-300 text-xs transition-colors"
                                    title="Cancel"
                                >
                                    ✕
                                </button>
                            )}
                        </div>

                        {/* Results dropdown */}
                        {searchResults.length > 0 && (
                            <div className="absolute left-2 right-2 top-full mt-1 z-20 bg-slate-800 border border-slate-600 rounded-lg shadow-xl overflow-hidden">
                                {searchResults.map(r => (
                                    <button
                                        key={r.slug}
                                        onClick={() => selectTopic(r)}
                                        className="w-full text-left px-3 py-2.5 hover:bg-slate-700 transition-colors border-b border-slate-700/60 last:border-0"
                                    >
                                        <p className="text-sm text-slate-100 leading-snug">{r.title}</p>
                                        <p className="text-xs text-slate-400 mt-0.5">
                                            {[r.subject, r.grade ? `Grade ${r.grade}` : null, r.board?.toUpperCase()]
                                                .filter(Boolean).join(' · ')}
                                        </p>
                                    </button>
                                ))}
                            </div>
                        )}

                        {!searchLoading && searchQuery.trim() && searchResults.length === 0 && (
                            <div className="absolute left-2 right-2 top-full mt-1 z-20 bg-slate-800 border border-slate-600 rounded-lg shadow-xl px-3 py-2.5">
                                <p className="text-xs text-slate-400">No topics found for "{searchQuery}"</p>
                            </div>
                        )}
                    </div>
                ) : (
                    /* Topic display mode */
                    <div className="flex items-center gap-1.5 px-3 py-2">
                        {/* Back button — shown when there's history to navigate */}
                        {topicHistory.length > 0 && (
                            <button
                                onClick={goBack}
                                title={`Back to: ${topicHistory[0].title || topicHistory[0].slug}`}
                                className="flex-shrink-0 text-slate-500 hover:text-slate-200 text-sm transition-colors px-0.5"
                            >
                                ←
                            </button>
                        )}
                        {activeTopic.slug ? (
                            <>
                                <p className="flex-1 text-sm font-medium text-slate-200 truncate" title={displayTitle}>
                                    {displayTitle}
                                </p>
                                <button
                                    onClick={() => setSearching(true)}
                                    title="Change topic"
                                    className="flex-shrink-0 text-slate-400 hover:text-blue-400 transition-colors text-sm"
                                >
                                    ✎
                                </button>
                            </>
                        ) : (
                            <button
                                onClick={() => setSearching(true)}
                                className="flex-1 text-left text-sm text-slate-500 hover:text-slate-300 transition-colors"
                            >
                                🔍 Search for a topic…
                            </button>
                        )}
                    </div>
                )}
            </div>

            {/* ── Tab bar ──────────────────────────────────────────────── */}
            <div className="flex border-b border-slate-700 flex-shrink-0">
                {TABS.map(tab => {
                    const badge = tab.id === 'quiz' && checkedQuestions.length > 0
                        ? checkedQuestions.length : null;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            title={tab.label}
                            className={`relative flex-1 py-2 text-xs font-medium flex flex-col items-center gap-0.5 transition-colors ${
                                activeTab === tab.id
                                    ? 'text-blue-400 border-b-2 border-blue-400 bg-slate-800/60'
                                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                            }`}
                        >
                            <span className="text-base leading-none">{tab.icon}</span>
                            <span className="leading-none">{tab.label}</span>
                            {badge !== null && (
                                <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-blue-600 text-white text-[9px] flex items-center justify-center font-bold">
                                    {badge}
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>

            {/* ── Tab content ──────────────────────────────────────────── */}
            {/* All panels stay mounted so AiAssistPanel doesn't re-fetch on tab switch */}
            <div className="flex-1 overflow-hidden">
                <div className={`h-full ${activeTab !== 'content'   ? 'hidden' : ''}`}><ContentCardsTab slug={activeTopic.slug} /></div>
                <div className={`h-full ${activeTab !== 'questions' ? 'hidden' : ''}`}>
                    <QuestionsTab
                        slug={activeTopic.slug}
                        checkedIds={checkedIds}
                        onToggleCheck={handleToggleCheck}
                    />
                </div>
                <div className={`h-full ${activeTab !== 'quiz' ? 'hidden' : ''}`}><QuizTab questions={checkedQuestions} /></div>
                <div className={`h-full ${activeTab !== 'ai'   ? 'hidden' : ''}`}><AiAssistPanel query={aiQuery} sessionId={sessionId} /></div>
            </div>
        </div>
    );
}
