// Owner: Parivesh
import type { AxiosResponse } from 'axios';
import { api } from './apiClient';

export interface RecentSession {
    sessionId: number;
    status: string;
    startedAt: string;
    sessionTitle?: string;
}

export const smartboardSessionService = {
    start: (body: unknown) => api.post('/smartboard/sessions/start', body).then((r: AxiosResponse) => r.data as unknown),
    recent: () => api.get('/smartboard/sessions/recent').then((r: AxiosResponse) => r.data as RecentSession[]),
    get: (sessionId: number) => api.get(`/smartboard/sessions/${sessionId}`).then((r: AxiosResponse) => r.data as unknown),
    save: (sessionId: number, body: unknown) => api.put(`/smartboard/sessions/${sessionId}/save`, body),
    end: (sessionId: number) => api.post(`/smartboard/sessions/${sessionId}/end`),
    rename: (sessionId: number, title: string) => api.patch(`/smartboard/sessions/${sessionId}/rename`, { title }),
    delete: (sessionId: number) => api.delete(`/smartboard/sessions/${sessionId}`),
    export: (sessionId: number, body: unknown) => api.post(`/smartboard/sessions/${sessionId}/export`, body).then((r: AxiosResponse) => r.data as unknown),
    share: (sessionId: number, body: unknown) => api.post(`/smartboard/sessions/${sessionId}/share`, body).then((r: AxiosResponse) => r.data as unknown)
};
