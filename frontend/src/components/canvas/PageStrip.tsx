import type { LivePage } from '@/hooks/useSmartboardSession';

interface Props {
    pages: LivePage[];
    currentIndex: number;
    onSelect: (idx: number) => void;
    onAdd: () => void;
    onDelete: (idx: number) => void;
}

export default function PageStrip({ pages, currentIndex, onSelect, onAdd, onDelete }: Props) {
    return (
        <div className="flex items-center gap-2 bg-slate-800 px-3 py-2 overflow-x-auto flex-shrink-0">
            {pages.map((p, i) => (
                <div
                    key={i}
                    onClick={() => onSelect(i)}
                    className={`relative flex-shrink-0 w-24 h-14 rounded border-2 cursor-pointer transition-all ${i === currentIndex
                            ? 'border-blue-500 bg-slate-700'
                            : 'border-slate-600 bg-slate-900 hover:border-slate-400'
                        }`}
                >
                    {/* Thumbnail label */}
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5">
                        <span className="text-xs font-semibold text-white">{p.pageNo}</span>
                        <span className="text-[10px] text-slate-400">{p.pageType === 'ContentCard' ? '📄' : '⬜'}</span>
                        {p.dirty && <span className="text-[9px] text-amber-400">●</span>}
                    </div>

                    {/* Delete button (only when multiple pages) */}
                    {pages.length > 1 && (
                        <button
                            onClick={e => { e.stopPropagation(); onDelete(i); }}
                            className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-rose-600 text-white text-[10px] leading-none opacity-0 hover:opacity-100 group-hover:opacity-100 flex items-center justify-center"
                        >
                            ×
                        </button>
                    )}
                </div>
            ))}

            {/* Add page button */}
            <button
                onClick={onAdd}
                title="Add blank page"
                className="flex-shrink-0 w-10 h-14 rounded border-2 border-dashed border-slate-500 hover:border-blue-400 text-slate-400 hover:text-blue-400 flex items-center justify-center text-xl transition-colors"
            >
                +
            </button>
        </div>
    );
}
