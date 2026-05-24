// Owner: Parivesh — Phase 1 Teaching Sidebar
import { useEffect, useRef, useState } from 'react';
import { kbotContentService } from '@/services/kbotContentService';
import type { CardLevelStatus, RenderedCard } from '@/types';

interface Props { slug: string; }

const LEVEL_LABEL: Record<string, string> = {
    l0: 'Intro', l1: 'Basic', l2: 'Intermediate',
    l3: 'Advanced', l4: 'Expert', l5: 'Master', l6: 'Challenge',
};

/** Wraps a KBot HTML fragment in a full document with .kbot-card styles. */
function buildSrcDoc(fragment: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { background: #fff; font-family: 'Segoe UI', system-ui, sans-serif; color: #1e293b; font-size: 16px; line-height: 1.6; }
  .kbot-card { padding: 32px 40px; max-width: 100%; }
  .kbot-card h1 { font-size: 1.8rem; font-weight: 700; color: #0f172a; margin-bottom: 16px; line-height: 1.3; }
  .kbot-card h2 { font-size: 1.35rem; font-weight: 600; color: #1e3a5f; margin: 24px 0 10px; }
  .kbot-card h3 { font-size: 1.1rem; font-weight: 600; color: #334155; margin: 18px 0 8px; }
  .kbot-card p  { margin-bottom: 12px; }
  .kbot-card ul, .kbot-card ol { padding-left: 24px; margin-bottom: 12px; }
  .kbot-card li { margin-bottom: 6px; }
  .kbot-card strong { font-weight: 700; }
  .kbot-card em { font-style: italic; }
  .kbot-card code { background: #f1f5f9; padding: 2px 6px; border-radius: 4px; font-family: monospace; font-size: 0.9em; }
  .kbot-card pre { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; overflow-x: auto; margin-bottom: 16px; }
  .kbot-card pre code { background: none; padding: 0; }
  .kbot-card table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
  .kbot-card th { background: #1e3a5f; color: #fff; padding: 10px 14px; text-align: left; font-weight: 600; }
  .kbot-card td { border: 1px solid #e2e8f0; padding: 9px 14px; vertical-align: top; }
  .kbot-card tr:nth-child(even) td { background: #f8fafc; }
  .kbot-card svg { max-width: 100%; height: auto; display: block; margin: 16px auto; }
  .kbot-card math { font-size: 1.05em; }
  .kbot-card .kbot-diagram { background: #f1f5f9; border: 2px dashed #cbd5e1; border-radius: 8px; padding: 20px; text-align: center; color: #64748b; font-size: 0.85rem; margin: 16px 0; }
  .kbot-card .kbot-diagram::before { content: '📊 Diagram: ' attr(data-key); display: block; }
  blockquote { border-left: 4px solid #3b82f6; padding: 10px 16px; background: #eff6ff; margin: 16px 0; color: #1e3a5f; border-radius: 0 6px 6px 0; }
  hr { border: none; border-top: 2px solid #e2e8f0; margin: 24px 0; }
  img { max-width: 100%; height: auto; border-radius: 6px; display: block; margin: 12px auto; }
</style>
</head>
<body>${fragment}</body>
</html>`;
}

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
            .then(r => setRendered(r))
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
                            srcDoc={buildSrcDoc(rendered.html)}
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
