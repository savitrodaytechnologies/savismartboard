namespace Smartboard.Api.Models.Dto;

/// <summary>Lightweight question row for list view (preview=true). Returned by GET /topic/{slug}/questions?preview=true.</summary>
public sealed record QuestionSummaryDto(
    long QuestionId,
    string QuestionType,
    int Difficulty,
    string Preview,
    string Source);

/// <summary>Full question detail. Returned by GET /questions/{id}.</summary>
public sealed record QuestionDto(
    long QuestionId,
    string QuestionText,
    string QuestionType,
    string[]? Options,
    string? AnswerText,
    int Difficulty,
    string Source,
    bool IsVerified);

/// <summary>Rendered explanation HTML. Returned by GET /questions/{id}/explanation.</summary>
public sealed record ExplanationDto(long QuestionId, string Html, long VersionId);

/// <summary>Step-by-step solved card HTML. Returned by GET /questions/{id}/solved-card.</summary>
public sealed record SolvedCardDto(long QuestionId, string Html, long VersionId);

/// <summary>Single question in a submit batch for POST /topic/{slug}/questions/submit.</summary>
public sealed record QuestionSubmitItemDto(
    string QuestionText,
    string? QuestionType,
    int? Difficulty,
    string[]? Options,
    string? AnswerText,
    string? SolutionText,
    string? HintText,
    string? GeneratedBy,
    string? SessionRef);

/// <summary>Request body for POST /topic/{slug}/questions/submit.</summary>
public sealed record QuestionSubmitRequestDto(string Source, IReadOnlyList<QuestionSubmitItemDto> Questions);

/// <summary>Response from question submit.</summary>
public sealed record QuestionSubmitResponseDto(int Submitted, IReadOnlyList<long> QuestionIds);
