using Smartboard.Api.HttpClients;
using Smartboard.Api.Models.Dto;

namespace Smartboard.Api.Services;

public interface IKBotContentService
{
    /// <summary>GET /topic/{slug}/cards — card level availability (L0–L6) for a topic.</summary>
    Task<TopicCardsDto?> GetTopicCardsAsync(string slug, CancellationToken ct = default);

    /// <summary>GET /cards/{card_id}/versions — version history for a card family.</summary>
    Task<IReadOnlyList<ContentCardVersionDto>> GetVersionsAsync(long cardId, CancellationToken ct = default);

    /// <summary>GET /cards/{card_id}/render?version_id={vid} — rendered HTML for classroom display. HTML is pre-sanitized.</summary>
    Task<RenderedCardDto?> RenderAsync(long cardId, int? versionId, CancellationToken ct = default);
}

// TODO: Mukesh — implement against the real KBot API (see docs/kbot-smartboard-integration.md §3).
public sealed class KBotContentService : IKBotContentService
{
    private readonly IKBotClient _client;
    public KBotContentService(IKBotClient client) => _client = client;

    public Task<TopicCardsDto?> GetTopicCardsAsync(string slug, CancellationToken ct = default)
        => Task.FromResult<TopicCardsDto?>(null);

    public Task<IReadOnlyList<ContentCardVersionDto>> GetVersionsAsync(long cardId, CancellationToken ct = default)
        => Task.FromResult<IReadOnlyList<ContentCardVersionDto>>(Array.Empty<ContentCardVersionDto>());

    public Task<RenderedCardDto?> RenderAsync(long cardId, int? versionId, CancellationToken ct = default)
        => Task.FromResult<RenderedCardDto?>(null);
}
