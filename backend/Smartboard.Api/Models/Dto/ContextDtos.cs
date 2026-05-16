namespace Smartboard.Api.Models.Dto;

public sealed record TeacherContextDto(
    int SchoolId,
    int TeacherId,
    string SchoolName,
    string TeacherName);

public sealed record ClassDto(int ClassId, string Name);
public sealed record SectionDto(int SectionId, string Name);
public sealed record SubjectDto(int SubjectId, string Name);
public sealed record TopicDto(int TopicId, string Name, int SubjectId, string Slug = "");
