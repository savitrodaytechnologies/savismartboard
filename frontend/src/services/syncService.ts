/**
 * Sync service — flushes the IndexedDB SyncQueue to the server.
 *
 * Write path (offline-first):
 *   1. Write to IndexedDB immediately (useSmartboardSession does this)
 *   2. Enqueue a SyncQueueItem
 *   3. Call processQueue() — if online, it drains the queue; if offline, items wait
 *
 * This module is called:
 *   - On every successful write (try immediate flush)
 *   - When the 'online' event fires (drain the full backlog)
 */

import { db, type SyncQueueItem, type SyncOperation } from '@/db/localDb';
import { smartboardSessionService } from '@/services/smartboardSessionService';

// Prevents concurrent queue processing
let processing = false;

// ─── Enqueue ─────────────────────────────────────────────────────────────────

export async function enqueue(operation: SyncOperation): Promise<void> {
    await db.syncQueue.add({ operation, createdAt: new Date().toISOString(), attempts: 0 });
}

// ─── Process queue ────────────────────────────────────────────────────────────

export async function processQueue(): Promise<void> {
    if (processing || !navigator.onLine) return;
    processing = true;
    try {
        const items = await db.syncQueue.orderBy('createdAt').toArray();
        for (const item of items) {
            await processItem(item);
        }
    } finally {
        processing = false;
    }
}

// ─── Process one item ─────────────────────────────────────────────────────────

async function processItem(item: SyncQueueItem): Promise<void> {
    try {
        await execute(item.operation);
        await db.syncQueue.delete(item.id!);
    } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        await db.syncQueue.update(item.id!, {
            attempts: item.attempts + 1,
            lastError: error,
        });
        // Give up after 10 failed attempts (data integrity issue)
        if (item.attempts + 1 >= 10) {
            await db.syncQueue.delete(item.id!);
            console.warn('[sync] Dropping queue item after 10 failures:', item);
        }
    }
}

// ─── Execute an operation ─────────────────────────────────────────────────────

async function execute(op: SyncOperation): Promise<void> {
    switch (op.op) {

        case 'createSession': {
            const { localId, ...body } = op.payload;
            const result = await smartboardSessionService.start(body) as { sessionId: number };
            const serverSessionId = result.sessionId;

            // Update local record: assign real server ID, mark synced
            const local = await db.sessions.get(localId);
            if (local) {
                await db.sessions.delete(localId);
                await db.sessions.put({ ...local, sessionId: serverSessionId, serverSessionId, syncStatus: 'synced' });
            }

            // Re-key all pages that used the offline ID
            const pages = await db.pages.where('sessionId').equals(localId).toArray();
            for (const page of pages) {
                await db.pages.delete(page.key);
                const newKey = `${serverSessionId}:${page.pageNo}`;
                await db.pages.put({ ...page, key: newKey, sessionId: serverSessionId, syncStatus: 'synced' });
            }

            // Update any subsequent queue items that referenced the offline ID
            const pending = await db.syncQueue.toArray();
            for (const q of pending) {
                if (
                    (q.operation.op === 'savePage' || q.operation.op === 'endSession') &&
                    q.operation.payload.sessionId === localId
                ) {
                    await db.syncQueue.update(q.id!, {
                        operation: { ...q.operation, payload: { ...q.operation.payload, sessionId: serverSessionId } },
                    });
                }
            }
            break;
        }

        case 'savePage': {
            const { sessionId, ...pageBody } = op.payload;
            if (typeof sessionId === 'string') {
                // Still an offline ID — a createSession op must come first; skip for now
                throw new Error(`Session ${sessionId} not yet synced`);
            }
            await smartboardSessionService.save(sessionId, pageBody);
            // Mark local page as synced
            const key = `${sessionId}:${pageBody.pageNo}`;
            await db.pages.update(key, { syncStatus: 'synced' });
            break;
        }

        case 'endSession': {
            const { sessionId } = op.payload;
            if (typeof sessionId === 'string') throw new Error(`Session ${sessionId} not yet synced`);
            await smartboardSessionService.end(sessionId);
            await db.sessions.update(sessionId, { status: 'Ended', syncStatus: 'synced' });
            break;
        }
    }
}

// ─── Pending count (for UI badge) ─────────────────────────────────────────────

export async function pendingCount(): Promise<number> {
    return db.syncQueue.count();
}
