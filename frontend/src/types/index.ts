// Shared types — co-owned. Mirror backend DTOs.

export interface TeacherContext {
    schoolId: number;
    teacherId: number;
    schoolName: string;
    teacherName: string;
}

export interface ClassDto { classId: number; name: string; }
export interface SectionDto { sectionId: number; name: string; }
export interface SubjectDto { subjectId: number; name: string; }
export interface TopicDto { topicId: number; name: string; subjectId: number; slug: string; }

export interface CardLevelStatus { level: string; exists: boolean; cardId: number | null; currentVersionId: number | null; versionCount: number | null; isPublished: boolean; isStale: boolean; }
export interface TopicCardsDto { slug: string; title: string; cards: CardLevelStatus[]; }
export interface ContentCardVersion { cardId: number; versionId: number; version: number; label: string; updatedAt: string; isCurrent: boolean; isPublished: boolean; }
export interface RenderedCard { cardId: number; versionId: number; html: string; viewportWidth: number; viewportHeight: number; eTag: string; }

export interface QuestionSummary { questionId: number; questionType: string; difficulty: number; preview: string; source: string; }
export interface SolvedCard { questionId: number; html: string; versionId: number; }

export type SourceType =
    | 'KBotContentCard'
    | 'KBotQuestion'
    | 'KBotSolvedCard'
    | 'BlankBoard'
    | 'AiGeneratedContent'
    | 'UploadedPdf'
    | 'UploadedImage';

export interface PagePayload {
    pageId: string;
    sourceType: SourceType;
    sourceId?: number;
    sourceVersionId?: number;
    background: { kind: 'html' | 'image' | 'pdf' | 'blank'; url?: string };
    viewport: { width: number; height: number };
    annotations: Annotation[];
    createdAt: string;
    modifiedAt: string;
}

export type Annotation =
    | { id: string; type: 'pen' | 'highlighter'; tool: { color: string; width: number; opacity: number }; points: number[] }
    | { id: string; type: 'eraser'; tool: { width: number }; points: number[] }
    | { id: string; type: 'text'; tool: { color: string; size: number }; x: number; y: number; text: string }
    | { id: string; type: 'shape'; tool: { color: string; width: number }; shape: 'rect' | 'circle' | 'arrow' | 'line' | 'polygon'; points: number[] };
