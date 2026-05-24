using Smartboard.Api.Models.Dto;

namespace Smartboard.Api.Services.Dev;

/// <summary>
/// Development-only KBot content service. Returns realistic HTML cards
/// so Parivesh can build the canvas layer without KBot running.
/// Replaced by KBotContentService (Mukesh) in Production.
/// </summary>
public sealed class DevKBotContentService : IKBotContentService
{
    public Task<IReadOnlyList<KBotTopicSearchResultDto>> SearchTopicsAsync(string query, CancellationToken ct = default)
    {
        // Dev stub — returns two fake results so the search UI can be tested without KBot running
        IReadOnlyList<KBotTopicSearchResultDto> results = new[]
        {
            new KBotTopicSearchResultDto("reflection_laws", $"Laws of Reflection ({query})", "cbse", 10, "physics", "Light – Reflection and Refraction", 3, 1.0, "Dev stub match"),
            new KBotTopicSearchResultDto("linear_equations", $"Linear Equations ({query})", "cbse",  8, "maths",   "Linear Equations in One Variable",      2, 0.7, "Dev stub match"),
        };
        return Task.FromResult(results);
    }
    private static string Card(string title, string body) =>
        $"""
        <div class="kbot-card" style="font-family:sans-serif;padding:24px;max-width:900px">
          <h2 style="color:#1e3a5f;margin-bottom:12px">{title}</h2>
          <div style="line-height:1.7;color:#222">{body}</div>
        </div>
        """;

    // Static card HTML keyed by card_id
    private static readonly Dictionary<long, (string Title, string Html)> _html = new()
    {
        [1001] = ("Introduction to Fractions",
            Card("Introduction to Fractions",
                "<p>A <strong>fraction</strong> represents a part of a whole. It consists of a numerator and a denominator.</p>" +
                "<p>Examples: ½, ¾, ⅔</p>" +
                "<p><strong>Adding fractions:</strong> ½ + ¼ = 2/4 + 1/4 = 3/4</p>")),
        [1002] = ("Linear Equations in One Variable",
            Card("Linear Equations",
                "<p>A <strong>linear equation</strong> is an equation of degree one. Example: 2x + 3 = 7</p>" +
                "<p>Solution: 2x = 4 → x = 2</p>")),
        [2011] = ("Newton's Laws of Motion",
            Card("Newton's Laws of Motion",
                "<ol><li><strong>First Law:</strong> An object at rest stays at rest unless acted upon by a net force.</li>" +
                "<li><strong>Second Law:</strong> F = ma</li>" +
                "<li><strong>Third Law:</strong> For every action there is an equal and opposite reaction.</li></ol>")),
        [2012] = ("Work, Energy and Power",
            Card("Work, Energy and Power",
                "<p><strong>Work</strong> = Force × Displacement × cos θ (SI unit: Joule)</p>" +
                "<p><strong>Kinetic Energy</strong> = ½mv²</p>" +
                "<p><strong>Power</strong> = Work / Time (SI unit: Watt)</p>")),
    };

    // L0–L3 card ids used for any topic in dev
    private static readonly (string Level, long CardId)[] _levels =
        [("L0", 1001), ("L1", 1002), ("L2", 2011), ("L3", 2012)];

    public Task<TopicCardsDto?> GetTopicCardsAsync(string slug, CancellationToken ct = default)
    {
        var cards = _levels.Select(l => new CardLevelStatusDto(
            Level: l.Level,
            Exists: true,
            CardId: l.CardId,
            CurrentVersionId: l.CardId,
            VersionCount: l.Level == "L2" ? 3 : 2,
            IsPublished: false,
            IsStale: false)).ToList();

        var dto = new TopicCardsDto(
            Slug: slug,
            Title: $"Dev topic: {slug}",
            Cards: cards);

        return Task.FromResult<TopicCardsDto?>(dto);
    }

    public Task<IReadOnlyList<ContentCardVersionDto>> GetVersionsAsync(long cardId, CancellationToken ct = default)
    {
        var versions = new List<ContentCardVersionDto>
        {
            new(cardId, cardId, 1, "v1 — Original", new DateTime(2025, 6, 1), IsCurrent: false, IsPublished: false),
            new(cardId, cardId + 10000, 2, "v2 — Revised", new DateTime(2025, 9, 15), IsCurrent: true, IsPublished: false),
        };
        return Task.FromResult<IReadOnlyList<ContentCardVersionDto>>(versions);
    }

    public Task<RenderedCardDto?> RenderAsync(long cardId, int? versionId, CancellationToken ct = default)
    {
        var html = _html.TryGetValue(cardId, out var c)
            ? c.Html
            : Card("Dev Placeholder Card", "<p>Development placeholder. Mukesh will implement the real KBot render.</p>");

        var dto = new RenderedCardDto(
            CardId: cardId,
            VersionId: versionId ?? cardId,
            Html: html,
            ViewportWidth: 1280,
            ViewportHeight: 720,
            ETag: $"\"dev-{cardId}-v{versionId ?? cardId}\"");

        return Task.FromResult<RenderedCardDto?>(dto);
    }
}
