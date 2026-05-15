// Owner: Mukesh
import { api } from './apiClient';
import type { ContentCardSummary, ContentCardVersion, RenderedCard } from '@/types';

export const kbotContentService = {
    list: (topicId: number) =>
        api.get<ContentCardSummary[]>(`/smartboard/kbot/topics/${topicId}/content-cards`).then(r => r.data),
    versions: (cardId: number) =>
        api.get<ContentCardVersion[]>(`/smartboard/kbot/content-cards/${cardId}/versions`).then(r => r.data),
    render: (cardId: number, versionId: number) =>
        api.get<RenderedCard>(`/smartboard/kbot/content-cards/${cardId}/render`, { params: { versionId } }).then(r => r.data)
};
