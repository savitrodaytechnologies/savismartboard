using System.Text.Json;
using System.Text.Json.Serialization;
using Smartboard.Api.HttpClients;
using Smartboard.Api.Models.Dto;

namespace Smartboard.Api.Services;

public interface ISmartboardContextService
{
    Task<TeacherContextDto> GetContextAsync(CancellationToken ct = default);
    Task<IReadOnlyList<ClassDto>> GetClassesAsync(CancellationToken ct = default);
    Task<IReadOnlyList<SectionDto>> GetSectionsAsync(int classId, CancellationToken ct = default);
    Task<IReadOnlyList<SubjectDto>> GetSubjectsAsync(int classId, CancellationToken ct = default);
    Task<IReadOnlyList<TopicDto>> GetTopicsAsync(int subjectId, int classId, CancellationToken ct = default);
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

    // Subject codes that KBot uses — stored as SubjectId by multiplying classId*100 + index
    private static readonly string[] DefaultBoards = ["cbse"];

    private readonly IKBotClient _kbot;
    public SmartboardContextService(IKBotClient kbot) => _kbot = kbot;

    public Task<TeacherContextDto> GetContextAsync(CancellationToken ct = default)
        => Task.FromResult(new TeacherContextDto(1, 1, "Demo School", "Demo Teacher"));

    // Classes = KBot grades for CBSE. ClassId = grade number (9-12).
    public async Task<IReadOnlyList<ClassDto>> GetClassesAsync(CancellationToken ct = default)
    {
        var resp = await _kbot.GetAsync("grades?board=cbse", ct);
        if (!resp.IsSuccessStatusCode) return Array.Empty<ClassDto>();
        var raw = JsonSerializer.Deserialize<KBotGradeR[]>(await resp.Content.ReadAsStringAsync(ct), _json);
        return raw?.Select(r => new ClassDto(r.Grade, r.Label)).ToList()
               ?? (IReadOnlyList<ClassDto>)Array.Empty<ClassDto>();
    }

    public Task<IReadOnlyList<SectionDto>> GetSectionsAsync(int classId, CancellationToken ct = default)
        => Task.FromResult<IReadOnlyList<SectionDto>>(Array.Empty<SectionDto>());

    // Subjects = KBot subjects for CBSE + grade. SubjectId = hashcode of code (stable).
    public async Task<IReadOnlyList<SubjectDto>> GetSubjectsAsync(int classId, CancellationToken ct = default)
    {
        var resp = await _kbot.GetAsync($"subjects?board=cbse&grade={classId}", ct);
        if (!resp.IsSuccessStatusCode) return Array.Empty<SubjectDto>();
        var raw = JsonSerializer.Deserialize<KBotSubjectR[]>(await resp.Content.ReadAsStringAsync(ct), _json);
        return raw?.Select((r, i) => new SubjectDto(classId * 100 + i + 1, r.Name)).ToList()
               ?? (IReadOnlyList<SubjectDto>)Array.Empty<SubjectDto>();
    }

    // Topics = KBot topics via chapters. subjectId encodes classId*100+index; we recover classId and subject code.
    public async Task<IReadOnlyList<TopicDto>> GetTopicsAsync(int subjectId, int classId, CancellationToken ct = default)
    {
        // Recover subject code from its index
        var subjResp = await _kbot.GetAsync($"subjects?board=cbse&grade={classId}", ct);
        if (!subjResp.IsSuccessStatusCode) return Array.Empty<TopicDto>();
        var subjects = JsonSerializer.Deserialize<KBotSubjectR[]>(await subjResp.Content.ReadAsStringAsync(ct), _json);
        if (subjects is null) return Array.Empty<TopicDto>();
        int idx = (subjectId - classId * 100) - 1;
        if (idx < 0 || idx >= subjects.Length) return Array.Empty<TopicDto>();
        var subjectCode = subjects[idx].Code;

        // Get chapters
        var chapResp = await _kbot.GetAsync($"chapters?board=cbse&grade={classId}&subject={Uri.EscapeDataString(subjectCode)}", ct);
        if (!chapResp.IsSuccessStatusCode) return Array.Empty<TopicDto>();
        var chapters = JsonSerializer.Deserialize<KBotChapterR[]>(await chapResp.Content.ReadAsStringAsync(ct), _json);
        if (chapters is null) return Array.Empty<TopicDto>();

        // Get topics for all chapters (in parallel, capped at 5 chapters to avoid flooding)
        var topics = new List<TopicDto>();
        foreach (var ch in chapters.Take(5))
        {
            var topicResp = await _kbot.GetAsync($"topics?chapter_id={ch.Id}", ct);
            if (!topicResp.IsSuccessStatusCode) continue;
            var raw = JsonSerializer.Deserialize<KBotTopicR[]>(await topicResp.Content.ReadAsStringAsync(ct), _json);
            if (raw is null) continue;
            topics.AddRange(raw.Select(t => new TopicDto(t.Id, $"Ch {ch.ChapterNumber}: {t.Title}", subjectId)));
        }
        return topics;
    }

    public Task MarkTopicTaughtAsync(int topicId, CancellationToken ct = default) => Task.CompletedTask;
}
