using Smartboard.Api.Models.Dto;

namespace Smartboard.Api.Services;

public interface ISaviLmsService
{
    /// <summary>Gets questions for the given topic slug from the LMS database.</summary>
    Task<IReadOnlyList<QuestionSummaryDto>> GetQuestionsAsync(string slug, int? difficulty, CancellationToken ct = default);

    /// <summary>Gets questions from the saviknowledgebotdb database using sp_GetQuestions stored procedure.</summary>
    Task<IReadOnlyList<LmsQuestionResponseDto>> GetQuestionsAsync(
        string? topicIds,
        string? chapterIds,
        bool randomSelection,
        string? questionTypeCounts,
        int defaultLimit,
        CancellationToken ct = default);

    /// <summary>Gets a specific question from the LMS database.</summary>
    Task<QuestionDto?> GetQuestionAsync(long questionId, CancellationToken ct = default);

    /// <summary>Gets the explanation for a specific question from the LMS database.</summary>
    Task<ExplanationDto?> GetExplanationAsync(long questionId, CancellationToken ct = default);

    /// <summary>Gets the solved card details for a specific question from the LMS database.</summary>
    Task<SolvedCardDto?> GetSolvedCardAsync(long questionId, CancellationToken ct = default);

    /// <summary>Submits AI-generated questions to save into the LMS database.</summary>
    Task<QuestionSubmitResponseDto> SubmitQuestionsAsync(string slug, QuestionSubmitRequestDto request, CancellationToken ct = default);

    /// <summary>Submits a full question paper to save into the LMS database.</summary>
    Task<LmsPaperSubmitResponseDto> SubmitQuestionPaperAsync(LmsPaperSubmitRequestDto request, CancellationToken ct = default);

    /// <summary>Gets question papers submitted for a specific school.</summary>
    Task<IReadOnlyList<LmsPaperListItemDto>> GetQuestionPapersBySchoolAsync(string schoolId, CancellationToken ct = default);

    /// <summary>Gets full details of a specific question paper by ID.</summary>
    Task<LmsPaperDetailDto?> GetQuestionPaperByIdAsync(long paperId, CancellationToken ct = default);

    /// <summary>Gets unique paper group IDs for a specific school.</summary>
    Task<IReadOnlyList<string>> GetPaperGroupsBySchoolAsync(string schoolId, CancellationToken ct = default);

    /// <summary>Authenticates a school using schoolId and apiKey.</summary>
    Task<LmsTokenResponseDto> AuthenticateSchoolAsync(LmsTokenRequestDto request, CancellationToken ct = default);

    /// <summary>Gets the content of skill files from the S3 bucket mapped to the given topic IDs.</summary>
    Task<string?> GetSkillFilesContentForTopicsAsync(List<int> topicIds);

    /// <summary>Saves a generated lesson plan to the MS SQL database.</summary>
    Task<long> SaveSmartboardLessonPlanAsync(LmsLessonPlanSaveRequestDto request, CancellationToken ct = default);

    /// <summary>Retrieves lesson plans saved for a specific school.</summary>
    Task<IReadOnlyList<LmsLessonPlanListItemDto>> GetSmartboardLessonPlansBySchoolAsync(int schoolId, CancellationToken ct = default);

    /// <summary>Retrieves lesson plans with optional filters: schoolId, classId, subjectId. All params are optional — omit any to return broader results.</summary>
    Task<IReadOnlyList<LmsLessonPlanListItemDto>> GetSmartboardLessonPlansByFilterAsync(
        int? schoolId,
        string? classId,
        string? subjectId,
        CancellationToken ct = default);

    /// <summary>Saves a generated syllabus plan to the MS SQL database.</summary>
    Task<long> SaveSyllabusPlanAsync(LmsSyllabusPlanSaveDto request, CancellationToken ct = default);

    /// <summary>Retrieves syllabus plans with optional filters: schoolId, classId, subjectId.</summary>
    Task<IReadOnlyList<LmsSyllabusPlanListItemDto>> GetSyllabusPlansByFilterAsync(
        int? schoolId,
        string? classId,
        string? subjectId,
        CancellationToken ct = default);
}


