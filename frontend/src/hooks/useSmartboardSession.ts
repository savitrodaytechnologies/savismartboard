import { useCallback, useEffect, useRef, useState } from 'react';
import { smartboardSessionService } from '@/services/smartboardSessionService';
import type { Annotation, PagePayload, SourceType } from '@/types';

// ─── types local to this hook ────────────────────────────────────────────────

export interface LivePage {
    pageNo: number;
    pageType: 'Whiteboard' | 'ContentCard' | 'Question';
    sourceType: SourceType | null;
    sourceId: number | null;
    sourceVersionId: number | null;
    background: { kind: 'html' | 'blank'; html?: string };
    viewport: { width: number; height: number };
    annotations: Annotation[];
    revision: number;
    dirty: boolean;
}

// ─── factory ─────────────────────────────────────────────────────────────────

export function blankPage(pageNo: number): LivePage {
    return {
        pageNo,
        pageType: 'Whiteboard',
        sourceType: null,
        sourceId: null,
        sourceVersionId: null,
        background: { kind: 'blank' },
        viewport: { width: 1280, height: 720 },
        annotations: [],
        revision: 1,
        dirty: false,
    };
}

export function cardPage(
    pageNo: number,
    cardId: number,
    versionId: number,
    html: string,
    viewport: { width: number; height: number },
): LivePage {
    return {
        pageNo,
        pageType: 'ContentCard',
        sourceType: 'KBotContentCard',
        sourceId: cardId,
        sourceVersionId: versionId,
        background: { kind: 'html', html },
        viewport,
        annotations: [],
        revision: 1,
        dirty: false,
    };
}

// ─── serialisation ────────────────────────────────────────────────────────────

function serialise(p: LivePage): string {
    const payload: Omit<PagePayload, 'pageId'> = {
        sourceType: (p.sourceType ?? 'BlankBoard') as SourceType,
        sourceId: p.sourceId ?? undefined,
        sourceVersionId: p.sourceVersionId ?? undefined,
        background: { kind: p.background.kind, url: p.background.html },
        viewport: p.viewport,
        annotations: p.annotations,
        createdAt: new Date().toISOString(),
        modifiedAt: new Date().toISOString(),
    };
    return JSON.stringify(payload);
}

// ─── hook ─────────────────────────────────────────────────────────────────────

export function useSmartboardSession(sessionId: number) {
    const [pages, setPages] = useState<LivePage[]>([blankPage(1)]);
    const [currentPageIndex, setCurrentPageIndex] = useState(0);
    const [status, setStatus] = useState<'loading' | 'ready' | 'ended' | 'error'>('loading');
    const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Load existing session
    useEffect(() => {
        let cancelled = false;
        smartboardSessionService.get(sessionId).then((session: { status: string; pages: { pageNo: number; pageType: string; sourceType: string | null; sourceId: number | null; sourceVersionId: number | null; pageJson: string; revision: number }[] }) => {
            if (cancelled) return;
            if (session.status === 'Ended') { setStatus('ended'); return; }
            if (session.pages && session.pages.length > 0) {
                const loaded: LivePage[] = session.pages.map((p) => {
                    let parsed: Partial<PagePayload> = {};
                    try { parsed = JSON.parse(p.pageJson); } catch { /* blank */ }
                    const bg = parsed.background ?? { kind: 'blank' };
                    return {
                        pageNo: p.pageNo,
                        pageType: p.pageType as LivePage['pageType'],
                        sourceType: p.sourceType as SourceType | null,
                        sourceId: p.sourceId,
                        sourceVersionId: p.sourceVersionId,
                        background: { kind: bg.kind as 'html' | 'blank', html: bg.url },
                        viewport: parsed.viewport ?? { width: 1280, height: 720 },
                        annotations: parsed.annotations ?? [],
                        revision: p.revision,
                        dirty: false,
                    } satisfies LivePage;
                });
                setPages(loaded);
            }
            setStatus('ready');
        }).catch(() => { if (!cancelled) setStatus('error'); });
        return () => { cancelled = true; };
    }, [sessionId]);

    // Debounced auto-save
    const scheduleSave = useCallback((updatedPages: LivePage[], idx: number) => {
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(async () => {
            const page = updatedPages[idx];
            if (!page?.dirty) return;
            try {
                await smartboardSessionService.save(sessionId, {
                    pageNo: page.pageNo,
                    pageType: page.pageType,
                    sourceType: page.sourceType,
                    sourceId: page.sourceId,
                    sourceVersionId: page.sourceVersionId,
                    pageJson: serialise(page),
                    revision: page.revision,
                });
                setPages(prev => prev.map((p, i) => i === idx ? { ...p, dirty: false } : p));
            } catch { /* will retry on next change */ }
        }, 2000);
    }, [sessionId]);

    // Mutation helpers
    const setAnnotations = useCallback((idx: number, fn: (prev: Annotation[]) => Annotation[]) => {
        setPages(prev => {
            const next = prev.map((p, i) => i === idx
                ? { ...p, annotations: fn(p.annotations), revision: p.revision + 1, dirty: true }
                : p);
            scheduleSave(next, idx);
            return next;
        });
    }, [scheduleSave]);

    const addPage = useCallback((page?: LivePage) => {
        setPages(prev => {
            const newPage = page ?? blankPage(prev.length + 1);
            const updated = [...prev, { ...newPage, pageNo: prev.length + 1 }];
            const newIdx = updated.length - 1;
            setCurrentPageIndex(newIdx);
            return updated;
        });
    }, []);

    const deletePage = useCallback((idx: number) => {
        setPages(prev => {
            if (prev.length === 1) return prev; // keep at least one
            const updated = prev.filter((_, i) => i !== idx).map((p, i) => ({ ...p, pageNo: i + 1 }));
            setCurrentPageIndex(Math.min(idx, updated.length - 1));
            return updated;
        });
    }, []);

    const endSession = useCallback(async () => {
        await smartboardSessionService.end(sessionId);
        setStatus('ended');
    }, [sessionId]);

    const currentPage = pages[currentPageIndex];

    return {
        pages,
        currentPage,
        currentPageIndex,
        setCurrentPageIndex,
        status,
        setAnnotations,
        addPage,
        deletePage,
        endSession,
    };
}
