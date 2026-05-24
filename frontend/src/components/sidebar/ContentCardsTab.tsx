// Owner: Parivesh — Phase 1 Teaching Sidebar
import { useEffect, useState } from 'react';
import { kbotContentService } from '@/services/kbotContentService';
import type { CardLevelStatus } from '@/types';

interface Props { slug: string; }

const LEVEL_STYLE: Record<string, string> = {
    easy:   'bg-green-900/40 text-green-300 border-green-700/60',
    medium: 'bg-amber-900/40 text-amber-300 border-amber-700/60',
    hard:   'bg-rose-900/40  text-rose-300  border-rose-700/60',
};

function CardRow({ card }: { card: CardLevelStatus }) {
    const style = LEVEL_STYLE[card.level.toLowerCase()] ?? 'bg-slate-700 text-slate-300 border-slate-600';
    return (
        <div className="rounded-lg bg-slate-800 border border-slate-700 p-3">
            <div className="flex items-center justify-between gap-2 mb-2">
                <span className={`text-xs font-medium px-2 py-0.5 rounded border capitalize ${style}`}>
                    {card.level}
                </span>
                {card.versionCount != null && (
                    <span className="text-xs text-slate-500">{card.versionCount} version{card.versionCount !== 1 ? 's' : ''}</span>
                )}
            </div>
            <button
                disabled
                title="Add to board — available in Phase 5"
                className="w-full text-xs py-1.5 rounded bg-blue-700/30 text-blue-300/60 border border-blue-700/30 cursor-not-allowed"
            >
                + Add to board
            </button>
        </div>
    );
}

export default function ContentCardsTab({ slug }: Props) {
    const [cards, setCards] = useState<CardLevelStatus[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(false);

    useEffect(() => {
        if (!slug) return;
        setLoading(true);
        setError(false);
        kbotContentService.topicCards(slug)
            .then(dto => setCards(dto.cards.filter(c => c.exists && c.isPublished)))
            .catch(() => setError(true))
            .finally(() => setLoading(false));
    }, [slug]);

    if (!slug) return (
        <div className="p-4 text-sm text-slate-400 leading-relaxed">
            No topic linked to this session.<br />
            Start a new session via <strong className="text-slate-300">Teach this topic</strong> to see content cards here.
        </div>
    );
    if (loading) return <div className="p-4 text-sm text-slate-400">Loading content cards…</div>;
    if (error)   return <div className="p-4 text-sm text-rose-400">Failed to load content cards.</div>;
    if (!cards.length) return <div className="p-4 text-sm text-slate-400">No published cards for this topic yet.</div>;

    return (
        <div className="h-full overflow-y-auto p-3 flex flex-col gap-2">
            {cards.map(card => (
                <CardRow key={card.cardId} card={card} />
            ))}
        </div>
    );
}
