namespace Smartboard.Api.Models.Dto;

/// <summary>Curriculum board (CBSE, ICSE, BSEB, etc.). Returned by GET /boards.</summary>
public sealed record BoardDto(string Code, string Name, string Country);

/// <summary>Grade within a board/subject. Returned by GET /grades.</summary>
public sealed record GradeDto(int Grade, string Label);

/// <summary>Subject from KBot curriculum. Distinct from Savischools SubjectDto. Returned by GET /subjects.</summary>
public sealed record KBotSubjectDto(string Code, string Name, string ColorHex);

/// <summary>Chapter in a board/grade/subject. Returned by GET /chapters.</summary>
public sealed record ChapterDto(int Id, int ChapterNumber, string Title, int Grade, string Subject, string Board);

/// <summary>Topic with its stable slug identifier used by all KBot content APIs. Returned by GET /topics.</summary>
public sealed record KBotTopicDto(int Id, string Slug, string Title, int ChapterId, int FloorLevel);

/// <summary>RAG snippet for LLM grounding. Returned by GET /topic/{slug}/rag-snippets.</summary>
public sealed record RagSnippetDto(string Text, long SourceCardId, long SourceVersionId);
