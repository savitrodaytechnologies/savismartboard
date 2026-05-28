// Owner: Manohar
import { api } from './apiClient';
import type { TeacherContext } from '@/types';

export const savischoolsContextService = {
    getContext: () => api.get<TeacherContext>('/smartboard/context').then(r => r.data),
    getClasses: () => api.get('/smartboard/classes').then(r => r.data),
    getSubjects: (classId: string) => api.get('/smartboard/subjects', { params: { classId } }).then(r => r.data),
    getTopics: (subjectId: string, classId: string) =>
        api.get('/smartboard/topics', { params: { subjectId, classId } }).then(r => r.data),
    markTaught: (topicId: number) => api.post(`/smartboard/syllabus/topics/${topicId}/mark-taught`)
};
