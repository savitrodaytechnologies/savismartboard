// Owner: Mukesh
import { api } from './apiClient';
import { db } from '@/db/localDb';
import type { ContentCardSummary, ContentCardVersion, RenderedCard } from '@/types';

export const kbotContentService = {
    list: (topicId: number) =>
        api.get<ContentCardSummary[]>(`/smartboard/kbot/topics/${topicId}/content-cards`).then(r => r.data),
    versions: (cardId: number) =>
        api.get<ContentCardVersion[]>(`/smartboard/kbot/content-cards/${cardId}/versions`).then(r => r.data),
    render: async (cardId: number, versionId: number): Promise<RenderedCard> => {
        const cacheKey = `${cardId}:${versionId}`;

        // Return cached version if offline or already cached
        const cached = await db.cardCache.get(cacheKey);
        if (cached && (!navigator.onLine || Date.now() - new Date(cached.cachedAt).getTime() < 7 * 24 * 60 * 60 * 1000)) {
            return { cardId, versionId, html: cached.html, viewportWidth: cached.viewportWidth, viewportHeight: cached.viewportHeight, etag: '' };
        }

        const data = await api.get<RenderedCard>(
            `/smartboard/kbot/content-cards/${cardId}/render`, { params: { versionId } }
        ).then(r => r.data);

        // Cache for offline use
        await db.cardCache.put({ key: cacheKey, html: data.html, viewportWidth: data.viewportWidth, viewportHeight: data.viewportHeight, cachedAt: new Date().toISOString() });
        return data;
    },
};
