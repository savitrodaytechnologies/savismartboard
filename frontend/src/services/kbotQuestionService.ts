// Owner: Mukesh
import { api } from './apiClient';
import type { QuestionSummary, SolvedCard } from '@/types';

export const kbotQuestionService = {
    list: (topicId: number, difficulty?: string) =>
        api.get<QuestionSummary[]>(`/smartboard/kbot/topics/${topicId}/questions`, { params: { difficulty } }).then(r => r.data),
    question: (questionId: number) => api.get(`/smartboard/kbot/questions/${questionId}`).then(r => r.data),
    explanation: (questionId: number) => api.get(`/smartboard/kbot/questions/${questionId}/basic-explanation`).then(r => r.data),
    solved: (questionId: number) =>
        api.get<SolvedCard>(`/smartboard/kbot/questions/${questionId}/solved-card`).then(r => r.data)
};
