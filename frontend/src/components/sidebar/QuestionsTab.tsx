// Owner: Parivesh — Phase 1 Teaching Sidebar
import { useEffect, useState } from 'react';
import { kbotQuestionService } from '@/services/kbotQuestionService';
import type { QuestionSummary } from '@/types';

type DiffFilter = 'all' | 'easy' | 'medium' | 'hard';

interface Props {
    slug: string;
    checkedIds: Set<number>;
    onToggleCheck: (q: QuestionSummary) => void;
}

function diffLabel(d: number) { return d <= 2 ? 'Easy' : d >= 4 ? 'Hard' : 'Medium'; }
function diffColor(d: number) { return d <= 2 ? 'text-green-400' : d >= 4 ? 'text-rose-400' : 'text-amber-400'; }

const FILTERS: { id: DiffFilter; label: string }[] = [
    { id: 'all',    label: 'All'    },
    { id: 'easy',   label: 'Easy'   },
    { id: 'medium', label: 'Med'    },
    { id: 'hard',   label: 'Hard'   },
];

function matchesFilter(q: QuestionSummary, f: DiffFilter) {
    if (f === 'all')    return true;
    if (f === 'easy')   return q.difficulty <= 2;
    if (f === 'hard')   return q.difficulty >= 4;
    return q.difficulty === 3;
}

export default function QuestionsTab({ slug, checkedIds, onToggleCheck }: Props) {
    const [questions, setQuestions] = useState<QuestionSummary[]>([]);
    const [loading, setLoading]     = useState(false);
    const [error, setError]         = useState(false);
    const [filter, setFilter]       = useState<DiffFilter>('all');

    useEffect(() => {
        if (!slug) return;
        setLoading(true);
        setError(false);
        kbotQuestionService.list(slug)
            .then(setQuestions)
            .catch(() => setError(true))
            .finally(() => setLoading(false));
    }, [slug]);

    if (!slug) return <div className="p-4 text-sm text-slate-400">No topic linked to this session.</div>;
    if (loading) return <div className="p-4 text-sm text-slate-400">Loading questions…</div>;
    if (error)   return <div className="p-4 text-sm text-rose-400">Failed to load questions.</div>;

    const filtered = questions.filter(q => matchesFilter(q, filter));
    const checkedCount = checkedIds.size;

    return (
        <div className="flex flex-col h-full">
            {/* Filter + count row */}
            <div className="flex items-center gap-1.5 px-3 pt-3 pb-2 flex-shrink-0">
                {FILTERS.map(f => (
                    <button
                        key={f.id}
                        onClick={() => setFilter(f.id)}
                        className={`flex-1 text-xs py-1 rounded-full border transition-colors ${
                            filter === f.id
                                ? 'bg-blue-600 border-blue-500 text-white'
                                : 'border-slate-600 text-slate-400 hover:text-slate-200 hover:border-slate-500'
                        }`}
                    >
                        {f.label}
                    </button>
                ))}
            </div>

            {checkedCount > 0 && (
                <p className="px-3 pb-1 text-xs text-blue-400 flex-shrink-0">
                    {checkedCount} question{checkedCount !== 1 ? 's' : ''} queued for Quiz tab ✓
                </p>
            )}

            {!filtered.length && (
                <p className="px-3 py-4 text-sm text-slate-400">
                    {questions.length ? 'No questions at this difficulty.' : 'No questions for this topic.'}
                </p>
            )}

            <div className="flex-1 overflow-y-auto px-3 pb-3 flex flex-col gap-2">
                {filtered.map(q => (
                    <label
                        key={q.questionId}
                        className="flex items-start gap-2.5 rounded-lg bg-slate-800 border border-slate-700 p-3 cursor-pointer hover:border-slate-500 transition-colors"
                    >
                        <input
                            type="checkbox"
                            checked={checkedIds.has(q.questionId)}
                            onChange={() => onToggleCheck(q)}
                            className="mt-0.5 w-4 h-4 rounded border-slate-600 accent-blue-500 flex-shrink-0 cursor-pointer"
                        />
                        <div className="flex-1 min-w-0">
                            <p className="text-sm text-slate-200 leading-snug">{q.preview}</p>
                            <div className="flex items-center gap-2 mt-1.5">
                                <span className={`text-xs font-medium ${diffColor(q.difficulty)}`}>
                                    {diffLabel(q.difficulty)}
                                </span>
                                <span className="text-xs text-slate-500 capitalize">{q.questionType}</span>
                            </div>
                        </div>
                    </label>
                ))}
            </div>
        </div>
    );
}
