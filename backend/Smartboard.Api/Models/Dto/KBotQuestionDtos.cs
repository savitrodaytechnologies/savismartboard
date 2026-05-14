namespace Smartboard.Api.Models.Dto;

public sealed record QuestionSummaryDto(long QuestionId, string Difficulty, string Preview);
public sealed record QuestionDto(long QuestionId, string Body, string Difficulty);
public sealed record BasicExplanationDto(long QuestionId, string Explanation);
public sealed record SolvedCardDto(long QuestionId, string StepByStepHtml, int VersionId);
