namespace Smartboard.Api.Models.Dto;

public sealed record StartSessionRequest(int ClassId, int? SectionId, int SubjectId, int? TopicId, string SessionTitle);
public sealed record RenameSessionRequest(string Title);
public sealed record SessionDto(long SessionId, string Status, DateTime StartedAt, DateTime? EndedAt, IReadOnlyList<SessionPageDto> Pages);
// PageJson is nullable: after a session ends the JSON blob is moved to S3 (see PageJsonUrl).
// The service layer re-hydrates it from S3 before returning to callers, so external
// consumers always receive a populated PageJson.
public sealed record SessionPageDto(long SessionPageId, int PageNo, string PageType, string? SourceType, long? SourceId, long? SourceVersionId, string? PageJson, int Revision, string? PageJsonUrl = null);
public sealed record SavePageRequest(int PageNo, string PageType, string? SourceType, long? SourceId, long? SourceVersionId, string PageJson, int Revision);
public sealed record ExportRequest(string ExportType);
public sealed record ShareRequest(IReadOnlyList<int> StudentIds, IReadOnlyList<int>? ParentIds, DateTime? ExpiresAt);
public sealed record AiPromptRequest(long? SessionId, string? SourceType, long? SourceId, string Instruction);
public sealed record AiPromptResponse(string Result, int TokenCount, decimal CostUsd);
public sealed record AiSelectionRequest(string ImageBase64, string Instruction, long? SessionId);
