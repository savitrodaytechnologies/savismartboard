using System.Text.Json;
using System.Text.Json.Serialization;
using Smartboard.Api.HttpClients;
using Smartboard.Api.Models.Dto;

namespace Smartboard.Api.Services;

public interface IKBotContentService
{
    /// <summary>GET /topics/search?q={query} — ranked topic search across the full KBot catalogue.</summary>
    Task<IReadOnlyList<KBotTopicSearchResultDto>> SearchTopicsAsync(string query, CancellationToken ct = default);

    /// <summary>GET /topic/{slug}/cards — card level availability (L0–L6) for a topic.</summary>
    Task<TopicCardsDto?> GetTopicCardsAsync(string slug, CancellationToken ct = default);

    /// <summary>GET /cards/{card_id}/versions — version history for a card family.</summary>
    Task<IReadOnlyList<ContentCardVersionDto>> GetVersionsAsync(long cardId, CancellationToken ct = default);

    /// <summary>GET /cards/{card_id}/render?version_id={vid} — rendered HTML for classroom display. HTML is pre-sanitized.</summary>
    Task<RenderedCardDto?> RenderAsync(long cardId, int? versionId, CancellationToken ct = default);
}

public sealed class KBotContentService : IKBotContentService
{
    private static readonly JsonSerializerOptions _json = new() { PropertyNameCaseInsensitive = true };

    // ── private KBot response shapes ──────────────────────────────────────────
    private sealed record KBotCardLevelR(
        [property: JsonPropertyName("exists")] bool Exists,
        [property: JsonPropertyName("id")] long? Id,
        [property: JsonPropertyName("current_version_id")] long? CurrentVersionId,
        [property: JsonPropertyName("version_count")] int? VersionCount,
        [property: JsonPropertyName("is_published")] bool IsPublished,
        [property: JsonPropertyName("is_stale")] bool IsStale);

    private sealed record KBotTopicCardsR(
        [property: JsonPropertyName("slug")] string Slug,
        [property: JsonPropertyName("title")] string Title,
        [property: JsonPropertyName("cards")] Dictionary<string, KBotCardLevelR> Cards);

    private sealed record KBotVersionR(
        [property: JsonPropertyName("card_id")] long CardId,
        [property: JsonPropertyName("version_id")] long VersionId,
        [property: JsonPropertyName("version")] int Version,
        [property: JsonPropertyName("label")] string Label,
        [property: JsonPropertyName("updated_at")] DateTime UpdatedAt,
        [property: JsonPropertyName("is_current")] bool IsCurrent,
        [property: JsonPropertyName("is_published")] bool IsPublished);

    private sealed record KBotRenderR(
        [property: JsonPropertyName("card_id")] long CardId,
        [property: JsonPropertyName("version_id")] long VersionId,
        [property: JsonPropertyName("html")] string Html,
        [property: JsonPropertyName("viewport_width")] int ViewportWidth,
        [property: JsonPropertyName("viewport_height")] int ViewportHeight,
        [property: JsonPropertyName("etag")] string ETag);

    // __ private KBot search response shape ______________________________________
    private sealed record KBotSearchResultR(
        [property: JsonPropertyName("slug")]          string Slug,
        [property: JsonPropertyName("title")]         string Title,
        [property: JsonPropertyName("board")]         string? Board,
        [property: JsonPropertyName("grade")]         int? Grade,
        [property: JsonPropertyName("subject")]       string? Subject,
        [property: JsonPropertyName("chapter_title")] string? ChapterTitle,
        [property: JsonPropertyName("floor_level")]   int? FloorLevel,
        [property: JsonPropertyName("relevance_score")] double RelevanceScore,
        [property: JsonPropertyName("match_reason")]  string? MatchReason);

    private readonly IKBotClient _client;
    public KBotContentService(IKBotClient client) => _client = client;

    public async Task<IReadOnlyList<KBotTopicSearchResultDto>> SearchTopicsAsync(string query, CancellationToken ct = default)
    {
        var resp = await _client.GetAsync($"topics/search?q={Uri.EscapeDataString(query)}", ct);
        if (!resp.IsSuccessStatusCode) return Array.Empty<KBotTopicSearchResultDto>();
        var raw = JsonSerializer.Deserialize<KBotSearchResultR[]>(await resp.Content.ReadAsStringAsync(ct), _json);
        return raw?.Select(r => new KBotTopicSearchResultDto(r.Slug, r.Title, r.Board, r.Grade, r.Subject, r.ChapterTitle, r.FloorLevel, r.RelevanceScore, r.MatchReason)).ToList()
               ?? (IReadOnlyList<KBotTopicSearchResultDto>)Array.Empty<KBotTopicSearchResultDto>();
    }(string slug, CancellationToken ct = default)
    {
        var resp = await _client.GetAsync($"topic/{Uri.EscapeDataString(slug)}/cards", ct);
        if (!resp.IsSuccessStatusCode) return null;
        var raw = JsonSerializer.Deserialize<KBotTopicCardsR>(await resp.Content.ReadAsStringAsync(ct), _json);
        if (raw is null) return null;

        // KBot returns a dictionary; normalise to a sorted list L0–L6
        var levels = new[] { "L0", "L1", "L2", "L3", "L4", "L5", "L6" };
        var cards = levels.Select(lvl =>
        {
            raw.Cards.TryGetValue(lvl, out var c);
            return c is not null
                ? new CardLevelStatusDto(lvl, c.Exists, c.Id, c.CurrentVersionId, c.VersionCount, c.IsPublished, c.IsStale)
                : new CardLevelStatusDto(lvl, false, null, null, null, false, false);
        }).ToList();

        return new TopicCardsDto(raw.Slug, raw.Title, cards);
    }

    public async Task<IReadOnlyList<ContentCardVersionDto>> GetVersionsAsync(long cardId, CancellationToken ct = default)
    {
        var resp = await _client.GetAsync($"cards/{cardId}/versions", ct);
        if (!resp.IsSuccessStatusCode) return Array.Empty<ContentCardVersionDto>();
        var raw = JsonSerializer.Deserialize<KBotVersionR[]>(await resp.Content.ReadAsStringAsync(ct), _json);
        return raw?.Select(r => new ContentCardVersionDto(r.CardId, r.VersionId, r.Version, r.Label, r.UpdatedAt, r.IsCurrent, r.IsPublished)).ToList()
               ?? (IReadOnlyList<ContentCardVersionDto>)Array.Empty<ContentCardVersionDto>();
    }

    public async Task<RenderedCardDto?> RenderAsync(long cardId, int? versionId, CancellationToken ct = default)
    {
        var path = versionId.HasValue
            ? $"cards/{cardId}/render?version_id={versionId}"
            : $"cards/{cardId}/render";
        var resp = await _client.GetAsync(path, ct);
        if (!resp.IsSuccessStatusCode) return null;
        var raw = JsonSerializer.Deserialize<KBotRenderR>(await resp.Content.ReadAsStringAsync(ct), _json);
        if (raw is null) return null;
        return new RenderedCardDto(raw.CardId, raw.VersionId, raw.Html, raw.ViewportWidth, raw.ViewportHeight, raw.ETag);
    }
}
