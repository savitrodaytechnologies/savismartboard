// Owner: Parivesh — Phase 1 Teaching Sidebar
// Replaces the bare AiAssistPanel in SmartboardSessionPage as the full right panel.
// Auto-switches to AI tab when the teacher lassos and triggers "Ask AI ✨".
import { useEffect, useState } from 'react';
import AiAssistPanel from '@/components/canvas/AiAssistPanel';
import ContentCardsTab from './ContentCardsTab';
import QuestionsTab from './QuestionsTab';
import QuizTab from './QuizTab';
import type { QuestionSummary } from '@/types';

type SidebarTab = 'content' | 'questions' | 'quiz' | 'ai';

const TABS: { id: SidebarTab; icon: string; label: string }[] = [
    { id: 'content',   icon: '📚', label: 'Content'   },
    { id: 'questions', icon: '❓', label: 'Questions' },
    { id: 'quiz',      icon: '📝', label: 'Quiz'      },
    { id: 'ai',        icon: '🧠', label: 'AI Assist' },
];

interface Props {
    slug: string;
    aiQuery: { dataUrl: string; timestamp: number } | null;
    sessionId?: number;
}

export default function TeachingSidebar({ slug, aiQuery, sessionId }: Props) {
    const [activeTab, setActiveTab] = useState<SidebarTab>('content');

    // Questions checked for Quiz — managed here so both tabs share state
    const [checkedIds, setCheckedIds]         = useState<Set<number>>(new Set());
    const [checkedQuestions, setCheckedQuestions] = useState<QuestionSummary[]>([]);

    // When a new AI query arrives, switch to the AI tab automatically
    useEffect(() => {
        if (aiQuery) setActiveTab('ai');
    }, [aiQuery]);

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

    return (
        <div className="flex flex-col h-full bg-slate-900 text-slate-100">

            {/* ── Tab bar ──────────────────────────────────────────────── */}
            <div className="flex border-b border-slate-700 flex-shrink-0">
                {TABS.map(tab => {
                    const badge = tab.id === 'quiz' && checkedQuestions.length > 0
                        ? checkedQuestions.length
                        : null;
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
            <div className="flex-1 overflow-hidden">
                {activeTab === 'content'   && <ContentCardsTab slug={slug} />}
                {activeTab === 'questions' && (
                    <QuestionsTab
                        slug={slug}
                        checkedIds={checkedIds}
                        onToggleCheck={handleToggleCheck}
                    />
                )}
                {activeTab === 'quiz' && <QuizTab questions={checkedQuestions} />}
                {activeTab === 'ai'   && <AiAssistPanel query={aiQuery} sessionId={sessionId} />}
            </div>
        </div>
    );
}
