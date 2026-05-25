// Owner: Parivesh
import { api } from './apiClient';
import { db } from '@/db/localDb';
import type { TopicCardsDto, ContentCardVersion, RenderedCard, KBotTopicSearchResult } from '@/types';

export const kbotContentService = {
    topicCards: (slug: string, language = 'en', country = 'in', state?: string) =>
        api.get<TopicCardsDto>(`/smartboard/kbot/topics/${encodeURIComponent(slug)}/cards`, {
            params: { language, country, ...(state ? { state } : {}) },
        }).then(r => r.data),
    searchTopics: (q: string) =>
        api.get<KBotTopicSearchResult[]>(`/smartboard/kbot/topics/search`, { params: { q } }).then(r => r.data),
    versions: (cardId: number) =>
        api.get<ContentCardVersion[]>(`/smartboard/kbot/content-cards/${cardId}/versions`).then(r => r.data),
    cardByLevel: async (slug: string, level: string, language = 'en', country = 'in', state?: string): Promise<RenderedCard> => {
        const cacheKey = `${slug}:${level}:${language}:${country}${state ? `:${state}` : ''}`;

        const cached = await db.cardCache.get(cacheKey);
        if (cached && cached.html && (!navigator.onLine || Date.now() - new Date(cached.cachedAt).getTime() < 7 * 24 * 60 * 60 * 1000)) {
            return { cardId: 0, versionId: 0, html: cached.html, viewportWidth: cached.viewportWidth, viewportHeight: cached.viewportHeight, eTag: '' };
        }

        const params: Record<string, string> = { language, country };
        if (state) params.state = state;
        const data = await api.get<RenderedCard>(
            `/smartboard/kbot/topics/${encodeURIComponent(slug)}/card/${encodeURIComponent(level)}`,
            { params }
        ).then(r => r.data);

        if (data.html) {
            await db.cardCache.put({ key: cacheKey, html: data.html, viewportWidth: data.viewportWidth, viewportHeight: data.viewportHeight, cachedAt: new Date().toISOString() });
        }
        return data;
    },
    render: async (cardId: number, versionId?: number): Promise<RenderedCard> => {
        const cacheKey = `${cardId}:${versionId ?? 'latest'}`;

        const cached = await db.cardCache.get(cacheKey);
        if (cached && (!navigator.onLine || Date.now() - new Date(cached.cachedAt).getTime() < 7 * 24 * 60 * 60 * 1000)) {
            return { cardId, versionId: versionId ?? 0, html: cached.html, viewportWidth: cached.viewportWidth, viewportHeight: cached.viewportHeight, eTag: '' };
        }

        const data = await api.get<RenderedCard>(
            `/smartboard/kbot/content-cards/${cardId}/render`,
            versionId ? { params: { versionId } } : undefined
        ).then(r => r.data);

        await db.cardCache.put({ key: cacheKey, html: data.html, viewportWidth: data.viewportWidth, viewportHeight: data.viewportHeight, cachedAt: new Date().toISOString() });
        return data;
    },
};
