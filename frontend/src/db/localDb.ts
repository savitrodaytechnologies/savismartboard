import Dexie, { type Table } from 'dexie';

// ─── Local session (mirrors server SmartboardSession) ─────────────────────────
export interface LocalSession {
    // Either a real server ID (positive number) or a temporary offline ID ('offline-<uuid>')
    sessionId: number | string;
    serverSessionId?: number;          // set after successful server sync
    status: 'InProgress' | 'Ended';
    startedAt: string;                 // ISO string
    sessionTitle: string;
    classId: string;
    subjectId: string;
    topicId?: number | null;
    syncStatus: 'synced' | 'pending';
    updatedAt: string;
}

// ─── Local page ───────────────────────────────────────────────────────────────
export interface LocalPage {
    // Composite key: `${sessionId}:${pageNo}`
    key: string;
    sessionId: number | string;
    pageNo: number;
    pageType: string;
    sourceType: string | null;
    sourceId: number | null;
    sourceVersionId: number | null;
    pageJson: string;
    revision: number;
    syncStatus: 'synced' | 'pending';
}

// ─── Sync queue ───────────────────────────────────────────────────────────────
export type SyncOperation =
    | { op: 'createSession'; payload: { localId: string; classId: string; subjectId: string; topicId?: number | null; sessionTitle: string } }
    | { op: 'savePage'; payload: { sessionId: number | string; pageNo: number; pageType: string; sourceType: string | null; sourceId: number | null; sourceVersionId: number | null; pageJson: string; revision: number } }
    | { op: 'endSession'; payload: { sessionId: number | string } };

export interface SyncQueueItem {
    id?: number;           // auto-increment PK
    operation: SyncOperation;
    createdAt: string;
    attempts: number;
    lastError?: string;
}

// ─── Cached KBot card HTML ─────────────────────────────────────────────────────
export interface CachedCard {
    key: string;           // `${cardId}:${versionId}`
    html: string;
    viewportWidth: number;
    viewportHeight: number;
    cachedAt: string;
}

// ─── Database ─────────────────────────────────────────────────────────────────

class SmartboardDb extends Dexie {
    sessions!: Table<LocalSession, string | number>;
    pages!: Table<LocalPage, string>;
    syncQueue!: Table<SyncQueueItem, number>;
    cardCache!: Table<CachedCard, string>;

    constructor() {
        super('SmartboardDb');
        this.version(1).stores({
            sessions: 'sessionId, serverSessionId, status, syncStatus, updatedAt',
            pages: 'key, sessionId, syncStatus',
            syncQueue: '++id, createdAt, attempts',
            cardCache: 'key, cachedAt',
        });
    }
}

export const db = new SmartboardDb();

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function offlineId(): string {
    return `offline-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function pageKey(sessionId: number | string, pageNo: number): string {
    return `${sessionId}:${pageNo}`;
}
