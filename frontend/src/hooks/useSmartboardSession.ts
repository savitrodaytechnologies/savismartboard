import { useCallback, useEffect, useRef, useState } from 'react';
import { db, pageKey, type LocalPage } from '@/db/localDb';
import { smartboardSessionService } from '@/services/smartboardSessionService';
import { kbotContentService } from '@/services/kbotContentService';
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

// KBot source types have their HTML in kbotContentService cache — don't embed it in PageJson.
const REFETCHABLE_SOURCES: SourceType[] = ['KBotContentCard', 'KBotQuestion', 'KBotSolvedCard'];

function serialise(p: LivePage): string {
    const stripHtml = p.background.kind === 'html'
        && p.sourceType != null
        && REFETCHABLE_SOURCES.includes(p.sourceType);
    const payload: Omit<PagePayload, 'pageId'> = {
        sourceType: (p.sourceType ?? 'BlankBoard') as SourceType,
        sourceId: p.sourceId ?? undefined,
        sourceVersionId: p.sourceVersionId ?? undefined,
        background: { kind: p.background.kind, url: stripHtml ? undefined : p.background.html },
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

export function useSmartboardSession(sessionId: number | string) {
    const [pages, setPages] = useState<LivePage[]>([blankPage(1)]);
    const [currentPageIndex, setCurrentPageIndex] = useState(0);
    const [status, setStatus] = useState<'loading' | 'ready' | 'ended' | 'error'>('loading');
    const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    // Track pages whose background html is already being fetched (avoid duplicate fetches)
    const hydratingRef = useRef(new Set<string>());

    // ── Load: IndexedDB first, fall back to server ────────────────────────────
    useEffect(() => {
        let cancelled = false;

        async function load() {
            const numericId = typeof sessionId === 'string' ? Number(sessionId) : sessionId;
            const isOffline = typeof sessionId === 'string' && isNaN(numericId);
            const lookupId = isOffline ? sessionId as unknown as number : numericId;

            // 1. Try local DB first
            const localPages = await db.pages
                .where('sessionId').equals(lookupId)
                .sortBy('pageNo');

            const localSession = await db.sessions.get(lookupId);

            if (localPages.length > 0) {
                if (!cancelled) {
                    setPages(localPages.map(deserialise));
                    setStatus(localSession?.status === 'Ended' ? 'ended' : 'ready');
                }
                return;
            }

            // New session with no pages yet saved — just show blank board
            if (isOffline || !navigator.onLine) {
                if (!cancelled) setStatus('ready');
                return;
            }

            try {
                const numId = typeof sessionId === 'string' ? Number(sessionId) : sessionId;
                const session = await smartboardSessionService.get(numId) as {
                    status: string;
                    pages: { pageNo: number; pageType: string; sourceType: string | null; sourceId: number | null; sourceVersionId: number | null; pageJson: string; revision: number }[];
                };
                if (cancelled) return;

                // Cache session locally
                await db.sessions.put({
                    sessionId,
                    serverSessionId: numId,
                    status: session.status as 'InProgress' | 'Ended',
                    startedAt: new Date().toISOString(),
                    sessionTitle: '',
                    classId: '',
                    subjectId: '',
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

    // ── Re-hydrate KBot card backgrounds stripped from PageJson ──────────────
    // When a page is loaded from DB/server, background.html is absent for KBot
    // source types (we no longer embed the HTML in PageJson). Fetch it from the
    // card cache (IndexedDB-first, then KBot API) and patch it into state.
    useEffect(() => {
        const missing = pages.filter(p =>
            p.background.kind === 'html'
            && !p.background.html
            && p.sourceId != null
        );
        if (!missing.length) return;

        const toFetch = missing.filter(p => {
            const key = `${p.pageNo}:${p.sourceId}:${p.sourceVersionId}`;
            if (hydratingRef.current.has(key)) return false;
            hydratingRef.current.add(key);
            return true;
        });
        if (!toFetch.length) return;

        void Promise.all(toFetch.map(async p => {
            try {
                const card = await kbotContentService.render(
                    p.sourceId!,
                    p.sourceVersionId ?? undefined,
                );
                setPages(prev => prev.map(q =>
                    q.pageNo === p.pageNo
                        ? { ...q, background: { ...q.background, html: card.html } }
                        : q,
                ));
            } catch {
                // leave html undefined — canvas renders blank background gracefully
            }
        }));
    }, [pages]);

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

    // Flush any pages still waiting in the debounce timer
    const flushDirty = useCallback(async () => {
        if (saveTimerRef.current) {
            clearTimeout(saveTimerRef.current);
            saveTimerRef.current = null;
        }
        const dirty = pages.filter(p => p.dirty);
        await Promise.all(dirty.map(p => persistPage(p)));
        setPages(prev => prev.map(p => p.dirty ? { ...p, dirty: false } : p));
    }, [pages, persistPage]);

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
        flushDirty,
    };
}
