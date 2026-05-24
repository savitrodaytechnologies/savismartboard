// Owner: Parivesh — Phase 1 Teaching Sidebar
import { useState } from 'react';
import { kbotQuestionService } from '@/services/kbotQuestionService';
import type { QuestionSummary, SolvedCard } from '@/types';

interface Props {
    questions: QuestionSummary[];
}

function diffLabel(d: number) { return d <= 2 ? 'Easy' : d >= 4 ? 'Hard' : 'Medium'; }
function diffColor(d: number) { return d <= 2 ? 'text-green-400' : d >= 4 ? 'text-rose-400' : 'text-amber-400'; }

export default function QuizTab({ questions }: Props) {
    const [index, setIndex]               = useState(0);
    const [answer, setAnswer]             = useState<SolvedCard | null>(null);
    const [loadingAnswer, setLoadingAnswer] = useState(false);
    const [answerError, setAnswerError]   = useState(false);

    if (!questions.length) return (
        <div className="p-4 text-sm text-slate-400 leading-relaxed">
            No questions queued.<br />
            Tick the checkbox next to questions in the <strong className="text-slate-300">❓ Questions</strong> tab to add them here.
        </div>
    );

    const safeIndex = Math.min(index, questions.length - 1);
    const current   = questions[safeIndex];

    function goTo(idx: number) {
        setIndex(idx);
        setAnswer(null);
        setAnswerError(false);
    }

    async function handleShowAnswer() {
        setLoadingAnswer(true);
        setAnswerError(false);
        try {
            const card = await kbotQuestionService.solved(current.questionId);
            setAnswer(card);
        } catch {
            setAnswerError(true);
        } finally {
            setLoadingAnswer(false);
        }
    }

    return (
        <div className="flex flex-col h-full p-3 gap-3">
            {/* Nav header */}
            <div className="flex items-center gap-2 flex-shrink-0">
                <button
                    onClick={() => goTo(safeIndex - 1)}
                    disabled={safeIndex === 0}
                    className="w-8 h-8 rounded bg-slate-700 text-slate-300 text-xs disabled:opacity-40 hover:bg-slate-600 transition-colors flex items-center justify-center"
                >
                    ◀
                </button>
                <span className="flex-1 text-center text-xs text-slate-400">
                    Question {safeIndex + 1} of {questions.length}
                </span>
                <button
                    onClick={() => goTo(safeIndex + 1)}
                    disabled={safeIndex >= questions.length - 1}
                    className="w-8 h-8 rounded bg-slate-700 text-slate-300 text-xs disabled:opacity-40 hover:bg-slate-600 transition-colors flex items-center justify-center"
                >
                    ▶
                </button>
            </div>

            {/* Question card */}
            <div className="rounded-lg bg-slate-800 border border-slate-700 p-3 flex-shrink-0">
                <div className="flex items-center gap-2 mb-2">
                    <span className={`text-xs font-medium ${diffColor(current.difficulty)}`}>
                        {diffLabel(current.difficulty)}
                    </span>
                    <span className="text-xs text-slate-500 capitalize">{current.questionType}</span>
                </div>
                <p className="text-sm text-slate-200 leading-snug">{current.preview}</p>
            </div>

            {/* Show Answer button */}
            {!answer && (
                <button
                    onClick={handleShowAnswer}
                    disabled={loadingAnswer}
                    className="w-full py-2 rounded-lg bg-green-700/40 border border-green-700/60 text-green-300 text-sm font-medium hover:bg-green-700/60 transition-colors disabled:opacity-50 flex-shrink-0"
                >
                    {loadingAnswer ? 'Loading…' : 'Show Answer'}
                </button>
            )}

            {answerError && (
                <p className="text-xs text-rose-400 flex-shrink-0">Failed to load answer.</p>
            )}

            {/* Answer panel */}
            {answer && (
                <div className="flex-1 overflow-hidden flex flex-col min-h-0">
                    <div className="flex items-center justify-between mb-2 flex-shrink-0">
                        <span className="text-xs font-medium text-green-400">Answer</span>
                        <button
                            onClick={() => setAnswer(null)}
                            className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
                        >
                            Hide
                        </button>
                    </div>
                    <div className="flex-1 overflow-auto rounded border border-slate-700 bg-white min-h-0">
                        <iframe
                            srcDoc={answer.html}
                            sandbox="allow-scripts"
                            className="w-full h-full min-h-48 border-0"
                            title="answer"
                        />
                    </div>
                </div>
            )}
        </div>
    );
}
