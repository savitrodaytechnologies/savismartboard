/**
 * Offline-first session starter.
 * - If online: creates on server + caches locally → returns real sessionId
 * - If offline: creates locally with an offline ID → returns that ID
 *   (the real server session will be created when back online via syncService)
 */
import { db, offlineId } from '@/db/localDb';
import { smartboardSessionService } from '@/services/smartboardSessionService';
import { enqueue, processQueue } from '@/services/syncService';

interface StartParams {
    classId: string;
    subjectId: string;
    topicId?: number | null;
    sessionTitle: string;
}

export async function startSessionOfflineFirst(params: StartParams): Promise<number | string> {
    if (navigator.onLine) {
        try {
            const res = await smartboardSessionService.start(params) as { sessionId: number };
            const sid = res.sessionId;
            await db.sessions.put({
                sessionId: sid,
                serverSessionId: sid,
                status: 'InProgress',
                startedAt: new Date().toISOString(),
                sessionTitle: params.sessionTitle,
                classId: params.classId,
                subjectId: params.subjectId,
                topicId: params.topicId,
                syncStatus: 'synced',
                updatedAt: new Date().toISOString(),
            });
            return sid;
        } catch {
            // Network failed even though navigator.onLine — fall through to offline path
        }
    }

    // Offline path
    const localId = offlineId();
    await db.sessions.put({
        sessionId: localId,
        status: 'InProgress',
        startedAt: new Date().toISOString(),
        sessionTitle: params.sessionTitle,
        classId: params.classId,
        subjectId: params.subjectId,
        topicId: params.topicId,
        syncStatus: 'pending',
        updatedAt: new Date().toISOString(),
    });
    await enqueue({
        op: 'createSession',
        payload: { localId, ...params },
    });
    void processQueue();
    return localId;
}
