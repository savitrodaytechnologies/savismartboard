using System.Text.Json;
using System.Text.Json.Serialization;
using Smartboard.Api.HttpClients;
using Smartboard.Api.Models.Dto;

namespace Smartboard.Api.Services;

public interface ISmartboardContextService
{
    Task<TeacherContextDto> GetContextAsync(CancellationToken ct = default);
    Task<IReadOnlyList<ClassDto>> GetClassesAsync(CancellationToken ct = default);
    Task<IReadOnlyList<SectionDto>> GetSectionsAsync(Guid classId, CancellationToken ct = default);
    Task<IReadOnlyList<SubjectDto>> GetSubjectsAsync(Guid classId, CancellationToken ct = default);
    Task<IReadOnlyList<TopicDto>> GetTopicsAsync(Guid subjectId, Guid classId, CancellationToken ct = default);
    Task MarkTopicTaughtAsync(int topicId, CancellationToken ct = default);
}

// Savischools SSO pending (Manohar). Until then: grades from KBot = classes, subjects from KBot.
public sealed class SmartboardContextService : ISmartboardContextService
{
    private static readonly JsonSerializerOptions _json = new() { PropertyNameCaseInsensitive = true };

    private sealed record KBotGradeR([property: JsonPropertyName("grade")] int Grade, [property: JsonPropertyName("label")] string Label);
    private sealed record KBotSubjectR([property: JsonPropertyName("code")] string Code, [property: JsonPropertyName("name")] string Name);
    private sealed record KBotTopicR([property: JsonPropertyName("id")] int Id, [property: JsonPropertyName("slug")] string Slug, [property: JsonPropertyName("title")] string Title, [property: JsonPropertyName("chapter_id")] int ChapterId);
    private sealed record KBotChapterR([property: JsonPropertyName("id")] int Id, [property: JsonPropertyName("title")] string Title, [property: JsonPropertyName("chapter_number")] int ChapterNumber);
    private sealed record SavischoolsMeResponse(int SchoolId, string TeacherId, string SchoolName, string TeacherName, string? Curriculum);
    private sealed record SavischoolsClassR([property: JsonPropertyName("classId")] Guid ClassId, [property: JsonPropertyName("name")] string Name);

    private sealed record SavischoolsSubjectR([property: JsonPropertyName("subjectId")] Guid SubjectId, [property: JsonPropertyName("name")] string Name);

    private readonly IKBotClient _kbot;
    private readonly ISavischoolsClient _savischools;

    public SmartboardContextService(IKBotClient kbot, ISavischoolsClient savischools)
    {
        _kbot = kbot;
        _savischools = savischools;
    }

    public async Task<TeacherContextDto> GetContextAsync(CancellationToken ct = default)
    {
        var resp = await _savischools.GetMeAsync(ct);
        if (!resp.IsSuccessStatusCode)
            return new TeacherContextDto(0, "", "Savischools unavailable", "");
        var me = JsonSerializer.Deserialize<SavischoolsMeResponse>(
            await resp.Content.ReadAsStringAsync(ct), _json);
        if (me is null)
            return new TeacherContextDto(0, "", "Invalid response", "");
        return new TeacherContextDto(me.SchoolId, me.TeacherId, me.SchoolName, me.TeacherName);
    }

    // Classes = Savischools DB classes for teacher's school. Curriculum defaults to CBSE.
    // Returns empty list (not 500) when Savischools is unreachable.
    public async Task<IReadOnlyList<ClassDto>> GetClassesAsync(CancellationToken ct = default)
    {
        try
        {
            var resp = await _savischools.GetAsync("api/classes", ct);
            if (!resp.IsSuccessStatusCode) return Array.Empty<ClassDto>();
            var raw = JsonSerializer.Deserialize<SavischoolsClassR[]>(await resp.Content.ReadAsStringAsync(ct), _json);
            return raw?.Select(r => new ClassDto(r.ClassId, r.Name)).ToList()
                   ?? (IReadOnlyList<ClassDto>)Array.Empty<ClassDto>();
        }
        catch
        {
            return Array.Empty<ClassDto>();
        }
    }

    public Task<IReadOnlyList<SectionDto>> GetSectionsAsync(Guid classId, CancellationToken ct = default)
        => Task.FromResult<IReadOnlyList<SectionDto>>(Array.Empty<SectionDto>());

    // Subjects = Savischools ClassSubjects for the given class.
    // Returns empty list (not 500) when Savischools is unreachable.
    public async Task<IReadOnlyList<SubjectDto>> GetSubjectsAsync(Guid classId, CancellationToken ct = default)
    {
        try
        {
            var resp = await _savischools.GetAsync($"api/classes/{classId}/subjects", ct);
            if (!resp.IsSuccessStatusCode) return Array.Empty<SubjectDto>();
            var raw = JsonSerializer.Deserialize<SavischoolsSubjectR[]>(await resp.Content.ReadAsStringAsync(ct), _json);
            return raw?.Select(r => new SubjectDto(r.SubjectId, r.Name)).ToList()
                   ?? (IReadOnlyList<SubjectDto>)Array.Empty<SubjectDto>();
        }
        catch
        {
            return Array.Empty<SubjectDto>();
        }
    }

    // Topics: not yet available from Savischools — returns empty until topics SP is implemented.
    public Task<IReadOnlyList<TopicDto>> GetTopicsAsync(Guid subjectId, Guid classId, CancellationToken ct = default)
        => Task.FromResult<IReadOnlyList<TopicDto>>(Array.Empty<TopicDto>());

    public Task MarkTopicTaughtAsync(int topicId, CancellationToken ct = default) => Task.CompletedTask;
}
