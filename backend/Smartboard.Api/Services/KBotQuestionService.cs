using Smartboard.Api.HttpClients;
using Smartboard.Api.Models.Dto;

namespace Smartboard.Api.Services;

public interface IKBotQuestionService
{
    Task<IReadOnlyList<QuestionSummaryDto>> GetQuestionsAsync(long topicId, string? difficulty, CancellationToken ct = default);
    Task<QuestionDto?> GetQuestionAsync(long questionId, CancellationToken ct = default);
    Task<BasicExplanationDto?> GetBasicExplanationAsync(long questionId, CancellationToken ct = default);
    Task<SolvedCardDto?> GetSolvedCardAsync(long questionId, CancellationToken ct = default);
}

// TODO: Mukesh — implement against the real KBot API.
public sealed class KBotQuestionService : IKBotQuestionService
{
    private readonly IKBotClient _client;
    public KBotQuestionService(IKBotClient client) => _client = client;

    public Task<IReadOnlyList<QuestionSummaryDto>> GetQuestionsAsync(long topicId, string? difficulty, CancellationToken ct = default)
        => Task.FromResult<IReadOnlyList<QuestionSummaryDto>>(Array.Empty<QuestionSummaryDto>());

    public Task<QuestionDto?> GetQuestionAsync(long questionId, CancellationToken ct = default)
        => Task.FromResult<QuestionDto?>(null);

    public Task<BasicExplanationDto?> GetBasicExplanationAsync(long questionId, CancellationToken ct = default)
        => Task.FromResult<BasicExplanationDto?>(null);

    public Task<SolvedCardDto?> GetSolvedCardAsync(long questionId, CancellationToken ct = default)
        => Task.FromResult<SolvedCardDto?>(null);
}
