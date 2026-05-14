// Owner: Parivesh
import { api } from './apiClient';

export const aiService = {
  explain:      (body: unknown) => api.post('/smartboard/ai/explain-differently', body).then(r => r.data),
  simplify:     (body: unknown) => api.post('/smartboard/ai/simplify', body).then(r => r.data),
  localExample: (body: unknown) => api.post('/smartboard/ai/local-example', body).then(r => r.data),
  quickQuiz:    (body: unknown) => api.post('/smartboard/ai/quick-quiz', body).then(r => r.data),
  summary:      (body: unknown) => api.post('/smartboard/ai/summary', body).then(r => r.data),
  homework:     (body: unknown) => api.post('/smartboard/ai/homework', body).then(r => r.data)
};
