using Smartboard.Api.HttpClients;
using Smartboard.Api.Models.Dto;

namespace Smartboard.Api.Services;

public interface IKBotContentService
{
    Task<IReadOnlyList<ContentCardSummaryDto>> GetCardsForTopicAsync(long topicId, CancellationToken ct = default);
    Task<IReadOnlyList<ContentCardVersionDto>> GetVersionsAsync(long cardId, CancellationToken ct = default);
    Task<RenderedCardDto> RenderAsync(long cardId, int versionId, CancellationToken ct = default);
}

// TODO: Mukesh — implement against the real KBot API.
public sealed class KBotContentService : IKBotContentService
{
    private readonly IKBotClient _client;
    public KBotContentService(IKBotClient client) => _client = client;

    public Task<IReadOnlyList<ContentCardSummaryDto>> GetCardsForTopicAsync(long topicId, CancellationToken ct = default)
        => Task.FromResult<IReadOnlyList<ContentCardSummaryDto>>(Array.Empty<ContentCardSummaryDto>());

    public Task<IReadOnlyList<ContentCardVersionDto>> GetVersionsAsync(long cardId, CancellationToken ct = default)
        => Task.FromResult<IReadOnlyList<ContentCardVersionDto>>(Array.Empty<ContentCardVersionDto>());

    public Task<RenderedCardDto> RenderAsync(long cardId, int versionId, CancellationToken ct = default)
        => Task.FromResult(new RenderedCardDto(cardId, versionId, "<div>TODO</div>", 1920, 1080, "etag"));
}
