// Owner: Parivesh
import { api } from './apiClient';
import type { QuestionSummary, SolvedCard } from '@/types';

export const kbotQuestionService = {
    list: (slug: string, difficulty?: number) =>
        api.get<QuestionSummary[]>(`/smartboard/kbot/topics/${encodeURIComponent(slug)}/questions`, { params: difficulty ? { difficulty } : undefined }).then(r => r.data),
    question: (questionId: number) => api.get(`/smartboard/kbot/questions/${questionId}`).then(r => r.data),
    explanation: (questionId: number) => api.get(`/smartboard/kbot/questions/${questionId}/explanation`).then(r => r.data),
    solved: (questionId: number) =>
        api.get<SolvedCard>(`/smartboard/kbot/questions/${questionId}/solved-card`).then(r => r.data)
};
