// Owner: Parivesh — Phase 1 Teaching Sidebar
import { useEffect, useRef, useState } from 'react';
import { kbotContentService } from '@/services/kbotContentService';
import type { CardLevelStatus, RenderedCard } from '@/types';

interface Props { slug: string; }

const LEVEL_LABEL: Record<string, string> = {
    l0: 'Intro', l1: 'Basic', l2: 'Intermediate',
    l3: 'Advanced', l4: 'Expert', l5: 'Master', l6: 'Challenge',
};

function CardList({ cards, onSelect }: { cards: CardLevelStatus[]; onSelect: (c: CardLevelStatus) => void }) {
    return (
        <div className="h-full overflow-y-auto p-3 flex flex-col gap-2">
            {cards.map(card => (
                <button
                    key={card.cardId}
                    onClick={() => onSelect(card)}
                    className="w-full text-left rounded-lg bg-slate-800 border border-slate-700 p-3 hover:border-blue-500/60 hover:bg-slate-700/60 transition-colors group"
                >
                    <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="text-xs font-semibold px-2 py-0.5 rounded bg-blue-900/40 text-blue-300 border border-blue-700/50">
                            {LEVEL_LABEL[card.level.toLowerCase()] ?? card.level}
                        </span>
                        {card.versionCount != null && (
                            <span className="text-xs text-slate-500">{card.versionCount} version{card.versionCount !== 1 ? 's' : ''}</span>
                        )}
                    </div>
                    <p className="text-xs text-blue-400 group-hover:text-blue-300 transition-colors">
                        View card →
                    </p>
                </button>
            ))}
        </div>
    );
}

function CardViewer({ card, onBack }: { card: CardLevelStatus; onBack: () => void }) {
    const [rendered, setRendered] = useState<RenderedCard | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const [scale, setScale] = useState(1);

    useEffect(() => {
        setLoading(true);
        setError(false);
        kbotContentService.render(card.cardId!, card.currentVersionId ?? undefined)
            .then(r => { setRendered(r); })
            .catch(() => setError(true))
            .finally(() => setLoading(false));
    }, [card.cardId, card.currentVersionId]);

    // Scale iframe to fit container width
    useEffect(() => {
        if (!rendered || !containerRef.current) return;
        const obs = new ResizeObserver(entries => {
            const w = entries[0].contentRect.width;
            if (rendered.viewportWidth > 0) setScale(w / rendered.viewportWidth);
        });
        obs.observe(containerRef.current);
        return () => obs.disconnect();
    }, [rendered]);

    return (
        <div className="flex flex-col h-full">
            {/* Back bar */}
            <div className="flex-shrink-0 flex items-center gap-2 px-3 py-2 border-b border-slate-700">
                <button
                    onClick={onBack}
                    className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors"
                >
                    ← Back to cards
                </button>
                <span className="text-xs text-slate-500 ml-auto">
                    {LEVEL_LABEL[card.level.toLowerCase()] ?? card.level}
                </span>
            </div>

            {/* Content */}
            <div ref={containerRef} className="flex-1 overflow-y-auto bg-white">
                {loading && (
                    <div className="flex items-center justify-center h-full text-slate-400 text-sm bg-slate-900">
                        Loading…
                    </div>
                )}
                {error && (
                    <div className="flex items-center justify-center h-full text-rose-400 text-sm bg-slate-900">
                        Failed to load card.
                    </div>
                )}
                {rendered && (
                    <div
                        style={{
                            width: rendered.viewportWidth,
                            height: rendered.viewportHeight,
                            transform: `scale(${scale})`,
                            transformOrigin: 'top left',
                        }}
                    >
                        <iframe
                            srcDoc={rendered.html}
                            sandbox="allow-scripts allow-same-origin"
                            style={{
                                width: rendered.viewportWidth,
                                height: rendered.viewportHeight,
                                border: 'none',
                                display: 'block',
                            }}
                            title={`Card ${card.level}`}
                        />
                    </div>
                )}
            </div>
        </div>
    );
}

export default function ContentCardsTab({ slug }: Props) {
    const [cards, setCards] = useState<CardLevelStatus[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(false);
    const [selected, setSelected] = useState<CardLevelStatus | null>(null);

    useEffect(() => {
        if (!slug) return;
        setLoading(true);
        setError(false);
        setSelected(null);
        kbotContentService.topicCards(slug)
            .then(dto => setCards(dto.cards.filter(c => c.exists && c.isPublished)))
            .catch(() => setError(true))
            .finally(() => setLoading(false));
    }, [slug]);

    if (!slug) return (
        <div className="p-4 text-sm text-slate-400 leading-relaxed">
            No topic selected. Use the <strong className="text-slate-300">search bar above</strong> to find a topic.
        </div>
    );
    if (loading) return <div className="p-4 text-sm text-slate-400">Loading content cards…</div>;
    if (error)   return <div className="p-4 text-sm text-rose-400">Failed to load content cards.</div>;
    if (!cards.length) return <div className="p-4 text-sm text-slate-400">No published cards for this topic yet.</div>;

    if (selected) return <CardViewer card={selected} onBack={() => setSelected(null)} />;

    return <CardList cards={cards} onSelect={setSelected} />;
}
