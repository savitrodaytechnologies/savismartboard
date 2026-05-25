// Owner: Parivesh — Phase 1 Teaching Sidebar
import { useEffect, useState } from 'react';
import { kbotContentService } from '@/services/kbotContentService';
import type { CardLevelStatus, RenderedCard } from '@/types';

/**
 * Scope all IDs in each SVG element to be unique within the document.
 * KBot generates multiple SVGs per card and reuses gradient/marker IDs
 * (e.g. "arrowGrad", "arrowhead") across them. In a single HTML document
 * the first definition wins, so later SVGs use the wrong gradient colours.
 * We prefix every id="…" definition and every url(#…) / href="#…" reference
 * inside each <svg>…</svg> block with a per-SVG counter.
 */
function scopeSvgIds(html: string): string {
    let counter = 0;
    return html.replace(/<svg\b[\s\S]*?<\/svg>/gi, svgHtml => {
        const prefix = `s${counter++}_`;
        const ids = new Set<string>();
        svgHtml.replace(/\bid="([^"]+)"/g, (_, id: string) => { ids.add(id); return _; });
        if (ids.size === 0) return svgHtml;
        let out = svgHtml;
        for (const id of ids) {
            const e = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            out = out
                .replace(new RegExp(`\\bid="${e}"`, 'g'), `id="${prefix}${id}"`)
                .replace(new RegExp(`url\\(#${e}\\)`, 'g'), `url(#${prefix}${id})`)
                .replace(new RegExp(`href="#${e}"`, 'g'), `href="#${prefix}${id}"`)
                .replace(new RegExp(`xlink:href="#${e}"`, 'g'), `xlink:href="#${prefix}${id}"`);
        }
        return out;
    });
}

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

function CardViewer({ slug, card, onBack }: { slug: string; card: CardLevelStatus; onBack: () => void }) {
    const [rendered, setRendered] = useState<RenderedCard | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);

    useEffect(() => {
        setLoading(true);
        setError(false);
        kbotContentService.cardByLevel(slug, card.level)
            .then(r => setRendered(r))
            .catch(() => setError(true))
            .finally(() => setLoading(false));
    }, [card.cardId, card.currentVersionId]);

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

            {/* Content — KBot HTML is self-contained, iframe fills full width */}
            <div className="flex-1 overflow-hidden bg-white">
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
                {rendered?.html && (
                    <iframe
                        srcDoc={`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0">${scopeSvgIds(rendered.html)}</body></html>`}
                        sandbox="allow-scripts allow-same-origin"
                        style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
                        title={`Card ${card.level}`}
                    />
                )}
                {rendered && !rendered.html && !loading && !error && (
                    <div className="flex items-center justify-center h-full text-slate-400 text-sm bg-slate-900">
                        No content available for this card.
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

    if (selected) return <CardViewer slug={slug} card={selected} onBack={() => setSelected(null)} />;

    return <CardList cards={cards} onSelect={setSelected} />;
}
