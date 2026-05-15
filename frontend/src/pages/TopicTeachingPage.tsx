// Owner: Parivesh (Smartboard core) — composes KBot list (Mukesh) + canvas (Parivesh)
import { useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { kbotContentService } from '@/services/kbotContentService';
import { kbotQuestionService } from '@/services/kbotQuestionService';
import { smartboardSessionService } from '@/services/smartboardSessionService';
import type { ContentCardSummary, RenderedCard, QuestionSummary } from '@/types';

export default function TopicTeachingPage() {
    const { topicId } = useParams<{ topicId: string }>();
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const tid = Number(topicId);

    const sessionTitle = searchParams.get('title') ?? `Topic ${tid}`;
    const subjectId = Number(searchParams.get('subjectId') ?? 0);
    const classId = Number(searchParams.get('classId') ?? 0);

    const [cards, setCards] = useState<ContentCardSummary[]>([]);
    const [questions, setQuestions] = useState<QuestionSummary[]>([]);
    const [activeTab, setActiveTab] = useState<'cards' | 'questions'>('cards');
    const [loading, setLoading] = useState(true);
    const [starting, setStarting] = useState(false);
    const [previewCard, setPreviewCard] = useState<RenderedCard | null>(null);
    const [previewLoading, setPreviewLoading] = useState(false);

    useEffect(() => {
        setLoading(true);
        Promise.all([
            kbotContentService.list(tid).catch(() => [] as ContentCardSummary[]),
            kbotQuestionService.list(tid).catch(() => [] as QuestionSummary[]),
        ]).then(([c, q]) => { setCards(c); setQuestions(q); setLoading(false); });
    }, [tid]);

    async function previewContent(cardId: number, versionId: number) {
        setPreviewLoading(true);
        try {
            const rendered = await kbotContentService.render(cardId, versionId);
            setPreviewCard(rendered);
        } finally {
            setPreviewLoading(false);
        }
    }

    async function startSession(withCardId?: number, withVersionId?: number, withHtml?: string) {
        setStarting(true);
        try {
            const res = await smartboardSessionService.start({
                classId,
                subjectId,
                topicId: tid,
                sessionTitle,
            }) as { sessionId: number };
            const sid = res.sessionId;

            // If a card was selected, pre-save the first page with it
            if (withCardId != null && withVersionId != null && withHtml != null) {
                const firstPage = {
                    pageNo: 1,
                    pageType: 'ContentCard',
                    sourceType: 'KBotContentCard',
                    sourceId: withCardId,
                    sourceVersionId: withVersionId,
                    pageJson: JSON.stringify({
                        sourceType: 'KBotContentCard',
                        sourceId: withCardId,
                        sourceVersionId: withVersionId,
                        background: { kind: 'html', url: withHtml },
                        viewport: { width: previewCard?.viewportWidth ?? 1280, height: previewCard?.viewportHeight ?? 720 },
                        annotations: [],
                        createdAt: new Date().toISOString(),
                        modifiedAt: new Date().toISOString(),
                    }),
                    revision: 1,
                };
                await smartboardSessionService.save(sid, firstPage);
            }

            navigate(`/session/${sid}`);
        } finally {
            setStarting(false);
        }
    }

    const diffColor = (d: string) =>
        d === 'Easy' ? 'text-green-600 bg-green-50' : d === 'Hard' ? 'text-rose-600 bg-rose-50' : 'text-amber-600 bg-amber-50';

    return (
        <div className="flex h-screen bg-slate-50 overflow-hidden">
            {/* Left panel — content browser */}
            <div className="w-80 flex-shrink-0 bg-white border-r border-slate-200 flex flex-col">
                <div className="px-4 py-3 border-b border-slate-200">
                    <h2 className="font-semibold text-slate-800 truncate">{sessionTitle}</h2>
                    <p className="text-xs text-slate-500 mt-0.5">Select content to add to board</p>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-slate-200">
                    {(['cards', 'questions'] as const).map(tab => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`flex-1 py-2 text-sm font-medium transition-colors ${activeTab === tab ? 'border-b-2 border-blue-600 text-blue-700' : 'text-slate-500 hover:text-slate-700'
                                }`}
                        >
                            {tab === 'cards' ? `Cards (${cards.length})` : `Questions (${questions.length})`}
                        </button>
                    ))}
                </div>

                {/* List */}
                <div className="flex-1 overflow-y-auto">
                    {loading && <p className="p-4 text-sm text-slate-400">Loading…</p>}

                    {!loading && activeTab === 'cards' && cards.map(c => (
                        <div key={c.cardId} className="border-b border-slate-100 last:border-0">
                            <button
                                onClick={() => previewContent(c.cardId, c.versionCount > 0 ? c.versionCount : 1)}
                                className="w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors"
                            >
                                <p className="text-sm font-medium text-slate-800 truncate">{c.title}</p>
                                <p className="text-xs text-slate-400 mt-0.5">{c.versionCount} version{c.versionCount !== 1 ? 's' : ''}</p>
                            </button>
                        </div>
                    ))}

                    {!loading && activeTab === 'questions' && questions.map(q => (
                        <div key={q.questionId} className="border-b border-slate-100 last:border-0">
                            <div className="px-4 py-3">
                                <div className="flex items-start gap-2">
                                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded mt-0.5 flex-shrink-0 ${diffColor(q.difficulty)}`}>
                                        {q.difficulty}
                                    </span>
                                    <p className="text-sm text-slate-700 line-clamp-2">{q.preview}</p>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Start session — blank board */}
                <div className="p-3 border-t border-slate-200">
                    <button
                        onClick={() => startSession()}
                        disabled={starting}
                        className="w-full rounded-lg bg-blue-600 hover:bg-blue-700 text-white py-2 text-sm font-semibold disabled:opacity-50 transition-colors"
                    >
                        {starting ? 'Starting…' : 'Start Blank Session'}
                    </button>
                </div>
            </div>

            {/* Right panel — preview */}
            <div className="flex-1 flex flex-col">
                {previewCard ? (
                    <>
                        <div className="flex items-center gap-3 px-4 py-3 bg-white border-b border-slate-200">
                            <p className="flex-1 text-sm font-medium text-slate-700">Preview — Card #{previewCard.cardId} v{previewCard.versionId}</p>
                            <button
                                onClick={() => startSession(previewCard.cardId, previewCard.versionId, previewCard.html)}
                                disabled={starting}
                                className="rounded-lg bg-green-600 hover:bg-green-700 text-white px-4 py-1.5 text-sm font-semibold disabled:opacity-50 transition-colors"
                            >
                                {starting ? 'Starting…' : 'Teach This Card →'}
                            </button>
                        </div>
                        <div className="flex-1 overflow-auto bg-slate-100 p-4">
                            <div
                                className="mx-auto bg-white shadow rounded"
                                style={{ width: previewCard.viewportWidth, maxWidth: '100%' }}
                                dangerouslySetInnerHTML={{ __html: previewCard.html }}
                            />
                        </div>
                    </>
                ) : (
                    <div className="flex-1 flex items-center justify-center text-slate-400">
                        {previewLoading
                            ? 'Loading preview…'
                            : 'Select a content card on the left to preview it here, or click "Start Blank Session".'}
                    </div>
                )}
            </div>
        </div>
    );
}
