import { useCallback, useEffect, useRef, useState } from 'react';
import { db, offlineId, pageKey, type LocalPage } from '@/db/localDb';
import { smartboardSessionService } from '@/services/smartboardSessionService';
import { enqueue, processQueue } from '@/services/syncService';
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

// ─── factories ────────────────────────────────────────────────────────────────

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

// ─── serialise / deserialise ──────────────────────────────────────────────────

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

function deserialise(localPage: LocalPage): LivePage {
    let parsed: Partial<PagePayload> = {};
    try { parsed = JSON.parse(localPage.pageJson); } catch { /* blank */ }
    const bg = parsed.background ?? { kind: 'blank' };
    return {
        pageNo: localPage.pageNo,
        pageType: localPage.pageType as LivePage['pageType'],
        sourceType: localPage.sourceType as SourceType | null,
        sourceId: localPage.sourceId,
        sourceVersionId: localPage.sourceVersionId,
        background: { kind: bg.kind as 'html' | 'blank', html: bg.url },
        viewport: parsed.viewport ?? { width: 1280, height: 720 },
        annotations: parsed.annotations ?? [],
        revision: localPage.revision,
        dirty: false,
    };
}

// ─── hook ─────────────────────────────────────────────────────────────────────

export function useSmartboardSession(sessionId: number) {
    const [pages, setPages] = useState<LivePage[]>([blankPage(1)]);
    const [currentPageIndex, setCurrentPageIndex] = useState(0);
    const [status, setStatus] = useState<'loading' | 'ready' | 'ended' | 'error'>('loading');
    const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // ── Load: IndexedDB first, fall back to server ────────────────────────────
    useEffect(() => {
        let cancelled = false;

        async function load() {
            // 1. Try local DB first
            const localPages = await db.pages
                .where('sessionId').equals(sessionId)
                .sortBy('pageNo');

            const localSession = await db.sessions.get(sessionId);

            if (localPages.length > 0) {
                if (!cancelled) {
                    setPages(localPages.map(deserialise));
                    setStatus(localSession?.status === 'Ended' ? 'ended' : 'ready');
                }
                return;
            }

            // 2. Not in local DB — fetch from server (requires network)
            if (!navigator.onLine) {
                if (!cancelled) setStatus('ready'); // new blank session
                return;
            }

            try {
                const session = await smartboardSessionService.get(sessionId) as {
                    status: string;
                    pages: { pageNo: number; pageType: string; sourceType: string | null; sourceId: number | null; sourceVersionId: number | null; pageJson: string; revision: number }[];
                };
                if (cancelled) return;

                // Cache session locally
                await db.sessions.put({
                    sessionId,
                    serverSessionId: sessionId,
                    status: session.status as 'InProgress' | 'Ended',
                    startedAt: new Date().toISOString(),
                    sessionTitle: '',
                    classId: 0,
                    subjectId: 0,
                    syncStatus: 'synced',
                    updatedAt: new Date().toISOString(),
                });

                if (session.status === 'Ended') { setStatus('ended'); return; }

                if (session.pages?.length > 0) {
                    const loaded: LocalPage[] = session.pages.map(p => ({
                        key: pageKey(sessionId, p.pageNo),
                        sessionId,
                        pageNo: p.pageNo,
                        pageType: p.pageType,
                        sourceType: p.sourceType,
                        sourceId: p.sourceId,
                        sourceVersionId: p.sourceVersionId,
                        pageJson: p.pageJson,
                        revision: p.revision,
                        syncStatus: 'synced' as const,
                    }));
                    await db.pages.bulkPut(loaded);
                    setPages(loaded.map(deserialise));
                }
                setStatus('ready');
            } catch {
                if (!cancelled) setStatus('error');
            }
        }

        load();
        return () => { cancelled = true; };
    }, [sessionId]);

    // ── Write: IndexedDB immediately, then enqueue server sync ────────────────
    const persistPage = useCallback(async (page: LivePage) => {
        const json = serialise(page);
        const local: LocalPage = {
            key: pageKey(sessionId, page.pageNo),
            sessionId,
            pageNo: page.pageNo,
            pageType: page.pageType,
            sourceType: page.sourceType,
            sourceId: page.sourceId,
            sourceVersionId: page.sourceVersionId,
            pageJson: json,
            revision: page.revision,
            syncStatus: 'pending',
        };
        await db.pages.put(local);
        await enqueue({
            op: 'savePage',
            payload: {
                sessionId,
                pageNo: page.pageNo,
                pageType: page.pageType,
                sourceType: page.sourceType,
                sourceId: page.sourceId,
                sourceVersionId: page.sourceVersionId,
                pageJson: json,
                revision: page.revision,
            },
        });
        void processQueue(); // fire-and-forget — fails silently if offline
    }, [sessionId]);

    // ── Debounced save ─────────────────────────────────────────────────────────
    const scheduleSave = useCallback((updatedPages: LivePage[], idx: number) => {
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(async () => {
            const page = updatedPages[idx];
            if (!page?.dirty) return;
            await persistPage(page);
            setPages(prev => prev.map((p, i) => i === idx ? { ...p, dirty: false } : p));
        }, 1500);
    }, [persistPage]);

    // ── Mutations ──────────────────────────────────────────────────────────────
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
            setCurrentPageIndex(updated.length - 1);
            // Persist immediately (blank page, small payload)
            void persistPage({ ...newPage, pageNo: updated.length, dirty: false });
            return updated;
        });
    }, [persistPage]);

    const deletePage = useCallback((idx: number) => {
        setPages(prev => {
            if (prev.length === 1) return prev;
            const deleted = prev[idx];
            void db.pages.delete(pageKey(sessionId, deleted.pageNo));
            const updated = prev.filter((_, i) => i !== idx).map((p, i) => ({ ...p, pageNo: i + 1 }));
            setCurrentPageIndex(Math.min(idx, updated.length - 1));
            return updated;
        });
    }, [sessionId]);

    const endSession = useCallback(async () => {
        await db.sessions.update(sessionId, { status: 'Ended', syncStatus: 'pending', updatedAt: new Date().toISOString() });
        await enqueue({ op: 'endSession', payload: { sessionId } });
        void processQueue();
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
