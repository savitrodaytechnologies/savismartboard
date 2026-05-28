namespace Smartboard.Api.Models.Dto;

public sealed record TeacherContextDto(
    int SchoolId,
    string TeacherId,     // GUID string from Savischools staffId
    string SchoolName,
    string TeacherName);

public sealed record ClassDto(Guid ClassId, string Name);
public sealed record SectionDto(int SectionId, string Name);
public sealed record SubjectDto(Guid SubjectId, string Name);
public sealed record TopicDto(int TopicId, string Name, Guid SubjectId, string Slug = "");
