using System;

namespace Smartboard.Api.Models.Dto;

public sealed record LmsLessonPlanSaveRequestDto(
    long? LessonPlanId,
    int? SchoolId,
    int? TeacherId,
    string? ClassId,
    string? SubjectId,
    string? ChapterId,
    string? TopicId,
    string? ClassName,
    string? SubjectName,
    string? ChapterName,
    string? TopicName,
    string? PlanJson,
    string? PlanType,
    string? Duration,
    string? Level,
    string? Language,
    string? LearningStyle,
    string? SchoolName,
    string? SchoolAddress,
    string? SchoolPhone
);

public sealed record LmsLessonPlanListItemDto(
    long LessonPlanId,
    int? SchoolId,
    int? TeacherId,
    string? ClassId,
    string? SubjectId,
    string? ChapterId,
    string? TopicId,
    string? ClassName,
    string? SubjectName,
    string? ChapterName,
    string TopicName,
    string PlanJson,
    DateTime CreatedOn,
    DateTime UpdatedOn,
    string? PlanType,
    string? Duration,
    string? Level,
    string? Language,
    string? LearningStyle,
    string? SchoolName,
    string? SchoolAddress,
    string? SchoolPhone
);
