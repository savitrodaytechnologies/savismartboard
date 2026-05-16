using System.Text.Json;
using System.Text.Json.Serialization;
using Smartboard.Api.HttpClients;
using Smartboard.Api.Models.Dto;

namespace Smartboard.Api.Services;

public interface IKBotCurriculumService
{
    /// <summary>GET /boards</summary>
    Task<IReadOnlyList<BoardDto>> GetBoardsAsync(CancellationToken ct = default);

    /// <summary>GET /grades?board={code}&amp;subject={code}</summary>
    Task<IReadOnlyList<GradeDto>> GetGradesAsync(string? board, string? subject, CancellationToken ct = default);

    /// <summary>GET /subjects?board={code}&amp;grade={int}</summary>
    Task<IReadOnlyList<KBotSubjectDto>> GetSubjectsAsync(string? board, int? grade, CancellationToken ct = default);

    /// <summary>GET /chapters?board={code}&amp;grade={int}&amp;subject={code}</summary>
    Task<IReadOnlyList<ChapterDto>> GetChaptersAsync(string? board, int? grade, string? subject, CancellationToken ct = default);

    /// <summary>GET /topics?chapter_id={int}&amp;board={code}&amp;grade={int}&amp;subject={code}</summary>
    Task<IReadOnlyList<KBotTopicDto>> GetTopicsAsync(int? chapterId, string? board, int? grade, string? subject, CancellationToken ct = default);

    /// <summary>GET /topic/{slug}/rag-snippets?max={int} — plain-text excerpts for LLM grounding.</summary>
    Task<IReadOnlyList<RagSnippetDto>> GetRagSnippetsAsync(string slug, int max = 5, CancellationToken ct = default);
}

public sealed class KBotCurriculumService : IKBotCurriculumService
{
    private static readonly JsonSerializerOptions _json = new() { PropertyNameCaseInsensitive = true };

    // ── private KBot response shapes ──────────────────────────────────────────
    private sealed record KBotBoardR([property: JsonPropertyName("code")] string Code, [property: JsonPropertyName("name")] string Name, [property: JsonPropertyName("country")] string Country);
    private sealed record KBotGradeR([property: JsonPropertyName("grade")] int Grade, [property: JsonPropertyName("label")] string Label);
    private sealed record KBotSubjectR([property: JsonPropertyName("code")] string Code, [property: JsonPropertyName("name")] string Name, [property: JsonPropertyName("color_hex")] string ColorHex);
    private sealed record KBotChapterR([property: JsonPropertyName("id")] int Id, [property: JsonPropertyName("chapter_number")] int ChapterNumber, [property: JsonPropertyName("title")] string Title, [property: JsonPropertyName("grade")] int Grade, [property: JsonPropertyName("subject")] string Subject, [property: JsonPropertyName("board")] string Board);
    private sealed record KBotTopicR([property: JsonPropertyName("id")] int Id, [property: JsonPropertyName("slug")] string Slug, [property: JsonPropertyName("title")] string Title, [property: JsonPropertyName("chapter_id")] int ChapterId, [property: JsonPropertyName("floor_level")] int FloorLevel);
    private sealed record KBotRagR([property: JsonPropertyName("text")] string Text, [property: JsonPropertyName("source_card_id")] long SourceCardId, [property: JsonPropertyName("source_version_id")] long SourceVersionId);

    private readonly IKBotClient _client;
    public KBotCurriculumService(IKBotClient client) => _client = client;

    private async Task<IReadOnlyList<T>> GetListAsync<T>(string path, CancellationToken ct)
    {
        var resp = await _client.GetAsync(path, ct);
        if (!resp.IsSuccessStatusCode) return Array.Empty<T>();
        var json = await resp.Content.ReadAsStringAsync(ct);
        return JsonSerializer.Deserialize<T[]>(json, _json) ?? Array.Empty<T>();
    }

    public async Task<IReadOnlyList<BoardDto>> GetBoardsAsync(CancellationToken ct = default)
    {
        var raw = await GetListAsync<KBotBoardR>("boards", ct);
        return raw.Select(r => new BoardDto(r.Code, r.Name, r.Country)).ToList();
    }

    public async Task<IReadOnlyList<GradeDto>> GetGradesAsync(string? board, string? subject, CancellationToken ct = default)
    {
        var qs = BuildQs(("board", board), ("subject", subject));
        var raw = await GetListAsync<KBotGradeR>($"grades{qs}", ct);
        return raw.Select(r => new GradeDto(r.Grade, r.Label)).ToList();
    }

    public async Task<IReadOnlyList<KBotSubjectDto>> GetSubjectsAsync(string? board, int? grade, CancellationToken ct = default)
    {
        var qs = BuildQs(("board", board), ("grade", grade?.ToString()));
        var raw = await GetListAsync<KBotSubjectR>($"subjects{qs}", ct);
        return raw.Select(r => new KBotSubjectDto(r.Code, r.Name, r.ColorHex)).ToList();
    }

    public async Task<IReadOnlyList<ChapterDto>> GetChaptersAsync(string? board, int? grade, string? subject, CancellationToken ct = default)
    {
        var qs = BuildQs(("board", board), ("grade", grade?.ToString()), ("subject", subject));
        var raw = await GetListAsync<KBotChapterR>($"chapters{qs}", ct);
        return raw.Select(r => new ChapterDto(r.Id, r.ChapterNumber, r.Title, r.Grade, r.Subject, r.Board)).ToList();
    }

    public async Task<IReadOnlyList<KBotTopicDto>> GetTopicsAsync(int? chapterId, string? board, int? grade, string? subject, CancellationToken ct = default)
    {
        var qs = BuildQs(("chapter_id", chapterId?.ToString()), ("board", board), ("grade", grade?.ToString()), ("subject", subject));
        var raw = await GetListAsync<KBotTopicR>($"topics{qs}", ct);
        return raw.Select(r => new KBotTopicDto(r.Id, r.Slug, r.Title, r.ChapterId, r.FloorLevel)).ToList();
    }

    public async Task<IReadOnlyList<RagSnippetDto>> GetRagSnippetsAsync(string slug, int max = 5, CancellationToken ct = default)
    {
        var raw = await GetListAsync<KBotRagR>($"topic/{Uri.EscapeDataString(slug)}/rag-snippets?max={max}", ct);
        return raw.Select(r => new RagSnippetDto(r.Text, r.SourceCardId, r.SourceVersionId)).ToList();
    }

    private static string BuildQs(params (string Key, string? Value)[] pairs)
    {
        var parts = pairs.Where(p => p.Value is not null).Select(p => $"{p.Key}={Uri.EscapeDataString(p.Value!)}");
        var qs = string.Join("&", parts);
        return qs.Length > 0 ? "?" + qs : string.Empty;
    }
}
