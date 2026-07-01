namespace Smartboard.Api.Models.Dto;

public sealed record LmsPaperSubmitSelectionDto(
    string BoardId,
    string GradeId,
    string SubjectId);


public sealed record LmsPaperSubmitPaperMetaDto(
    string Title,
    int Duration,
    int TotalMarks,
    string Difficulty,
    int QuestionCount,
    int PaperSets,
    string QuestionType,
    string Mode);

public sealed record LmsPaperSubmitSectionDto(
    string Id,
    string Title,
    int Marks);

public sealed record LmsPaperSubmitQuestionDto(
    string Id,
    string Text,
    string Type,
    string[]? Options,
    string Difficulty,
    int Marks,
    string Source,
    string Slug,
    int ChapterId,
    int TopicId,
    string SectionId);

public sealed record LmsPaperSubmitRequestDto(
    string SchoolId,
    string? SchoolName,
    string? SchoolAddress,
    string? SchoolPhone,
    LmsPaperSubmitSelectionDto Selection,
    LmsPaperSubmitPaperMetaDto Paper,
    IReadOnlyList<LmsPaperSubmitSectionDto> Sections,
    IReadOnlyList<LmsPaperSubmitQuestionDto> Questions);

public sealed record LmsPaperSubmitResponseDto(
    long QuestionPaperId,
    bool Success,
    string Message);

public sealed record LmsPaperListItemDto(
    long QuestionPaperId,
    string SchoolId,
    string? SchoolName,
    string? SchoolAddress,
    string? SchoolPhone,
    string Title,
    int Duration,
    int TotalMarks,
    string Difficulty,
    int QuestionCount,
    int PaperSets,
    string QuestionType,
    string Mode,
    string BoardId,
    string GradeId,
    string SubjectId,
    string Status,
    DateTime CreatedOn);


public sealed record LmsPaperDetailSectionDto(
    long QuestionPaperSectionId,
    long QuestionPaperId,
    string SectionName,
    string Title,
    int Marks,
    int SortOrder);

public sealed record LmsPaperDetailQuestionDto(
    long QuestionPaperDetailId,
    long QuestionPaperId,
    long QuestionPaperSectionId,
    string QuestionId,
    string QuestionText,
    string QuestionType,
    string? ChapterId,
    string? TopicId,
    string[]? Options,
    string Difficulty,
    int Marks,
    string Source,
    string? Slug,
    int SortOrder);

public sealed record LmsPaperDetailDto(
    LmsPaperListItemDto Paper,
    IReadOnlyList<LmsPaperDetailSectionDto> Sections,
    IReadOnlyList<LmsPaperDetailQuestionDto> Questions);

