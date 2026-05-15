using Smartboard.Api.Models.Dto;

namespace Smartboard.Api.Services.Dev;

/// <summary>
/// Development-only KBot content service. Returns realistic HTML cards
/// so Parivesh can build the canvas layer without KBot running.
/// Replaced by KBotContentService (Mukesh) in Production.
/// </summary>
public sealed class DevKBotContentService : IKBotContentService
{
    private static string Card(string title, string body) =>
        $"""
        <div style="font-family:sans-serif;padding:24px;max-width:900px">
          <h2 style="color:#1e3a5f;margin-bottom:12px">{title}</h2>
          <div style="line-height:1.7;color:#222">{body}</div>
        </div>
        """;

    private static readonly Dictionary<long, (ContentCardSummaryDto Summary, ContentCardVersionDto[] Versions, string Html)> _cards = new()
    {
        [1001] = (
            new(1001, "Introduction to Fractions", 2),
            [new(1001, 1, "v1 — Original", new DateTime(2025, 6, 1)), new(1001, 2, "v2 — Revised", new DateTime(2025, 9, 15))],
            Card("Introduction to Fractions",
                "<p>A <strong>fraction</strong> represents a part of a whole. It consists of a numerator and a denominator.</p>" +
                "<p>Examples: ½, ¾, ⅔</p>" +
                "<p><strong>Adding fractions:</strong> ½ + ¼ = 2/4 + 1/4 = 3/4</p>")
        ),
        [1002] = (
            new(1002, "Linear Equations in One Variable", 1),
            [new(1002, 1, "v1 — Original", new DateTime(2025, 6, 5))],
            Card("Linear Equations",
                "<p>A <strong>linear equation</strong> is an equation of degree one. Example: 2x + 3 = 7</p>" +
                "<p>Solution: 2x = 4 → x = 2</p>")
        ),
        [2011] = (
            new(2011, "Newton's Laws of Motion", 3),
            [new(2011, 1, "v1", new DateTime(2025, 3, 1)), new(2011, 2, "v2 — Diagrams added", new DateTime(2025, 7, 10)), new(2011, 3, "v3 — Examples", new DateTime(2025, 11, 1))],
            Card("Newton's Laws of Motion",
                "<ol><li><strong>First Law:</strong> An object at rest stays at rest unless acted upon by a net force.</li>" +
                "<li><strong>Second Law:</strong> F = ma</li>" +
                "<li><strong>Third Law:</strong> For every action there is an equal and opposite reaction.</li></ol>")
        ),
        [2012] = (
            new(2012, "Work, Energy and Power", 2),
            [new(2012, 1, "v1", new DateTime(2025, 4, 1)), new(2012, 2, "v2", new DateTime(2025, 8, 20))],
            Card("Work, Energy and Power",
                "<p><strong>Work</strong> = Force × Displacement × cos θ (SI unit: Joule)</p>" +
                "<p><strong>Kinetic Energy</strong> = ½mv²</p>" +
                "<p><strong>Power</strong> = Work / Time (SI unit: Watt)</p>")
        ),
    };

    public Task<IReadOnlyList<ContentCardSummaryDto>> GetCardsForTopicAsync(long topicId, CancellationToken ct = default)
    {
        // Return cards whose ID starts with the topicId prefix (simplified mapping for dev)
        var result = _cards.Values
            .Where(c => c.Summary.CardId.ToString().StartsWith(topicId.ToString()[..Math.Min(3, topicId.ToString().Length)]))
            .Select(c => c.Summary)
            .ToList();

        // Fallback: return first 2 cards so UI always has something to show
        if (result.Count == 0)
            result = _cards.Values.Take(2).Select(c => c.Summary).ToList();

        return Task.FromResult<IReadOnlyList<ContentCardSummaryDto>>(result);
    }

    public Task<IReadOnlyList<ContentCardVersionDto>> GetVersionsAsync(long cardId, CancellationToken ct = default)
    {
        var versions = _cards.TryGetValue(cardId, out var c)
            ? c.Versions
            : [new ContentCardVersionDto(cardId, 1, "v1 — Default", DateTime.UtcNow)];
        return Task.FromResult<IReadOnlyList<ContentCardVersionDto>>(versions);
    }

    public Task<RenderedCardDto> RenderAsync(long cardId, int versionId, CancellationToken ct = default)
    {
        var html = _cards.TryGetValue(cardId, out var c)
            ? c.Html
            : Card("Dev Placeholder Card", "<p>This is a development placeholder. Mukesh will implement the real KBot render.</p>");

        return Task.FromResult(new RenderedCardDto(
            CardId: cardId,
            VersionId: versionId,
            Html: html,
            ViewportWidth: 1280,
            ViewportHeight: 720,
            ETag: $"dev-{cardId}-v{versionId}"));
    }
}
