using System;

namespace Smartboard.Api.Models.Dto;

public sealed record LmsSyllabusPlanSaveDto(
    long? SyllabusPlanId,
    int? SchoolId,
    int? TeacherId,
    string? BoardId,
    string? ClassId,
    string? SubjectId,
    string? SessionYear,
    string? BoardName,
    string? ClassName,
    string? SubjectName,
    string? BookName,
    string? PlanJson,
    string? SchoolName,
    string? SchoolAddress,
    string? SchoolPhone
);

public sealed record LmsSyllabusPlanListItemDto(
    long SyllabusPlanId,
    int SchoolId,
    int? TeacherId,
    string? BoardId,
    string? ClassId,
    string? SubjectId,
    string? SessionYear,
    string? BoardName,
    string? ClassName,
    string? SubjectName,
    string? BookName,
    string? PlanJson,
    DateTime CreatedOn,
    DateTime UpdatedOn,
    string? SchoolName,
    string? SchoolAddress,
    string? SchoolPhone
);

public sealed record LmsResourceGenerateRequest(
    string Type,
    string? BoardId,
    string? ClassId,
    string? SubjectId,
    string? ChapterName,
    string? TopicName
);
