// Owner: Parivesh
import { api } from './apiClient';

export const smartboardSessionService = {
    start: (body: unknown) => api.post('/smartboard/sessions/start', body).then(r => r.data),
    recent: () => api.get('/smartboard/sessions/recent').then(r => r.data),
    get: (sessionId: number) => api.get(`/smartboard/sessions/${sessionId}`).then(r => r.data),
    save: (sessionId: number, body: unknown) => api.put(`/smartboard/sessions/${sessionId}/save`, body),
    end: (sessionId: number) => api.post(`/smartboard/sessions/${sessionId}/end`),
    export: (sessionId: number, body: unknown) => api.post(`/smartboard/sessions/${sessionId}/export`, body).then(r => r.data),
    share: (sessionId: number, body: unknown) => api.post(`/smartboard/sessions/${sessionId}/share`, body).then(r => r.data)
};
