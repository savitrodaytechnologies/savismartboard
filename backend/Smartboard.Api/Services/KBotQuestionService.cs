using Smartboard.Api.HttpClients;
using Smartboard.Api.Models.Dto;

namespace Smartboard.Api.Services;

public interface IKBotQuestionService
{
    /// <summary>GET /topic/{slug}/questions?difficulty={1-5}&amp;preview=true</summary>
    Task<IReadOnlyList<QuestionSummaryDto>> GetQuestionsAsync(string slug, int? difficulty, CancellationToken ct = default);

    /// <summary>GET /questions/{question_id}</summary>
    Task<QuestionDto?> GetQuestionAsync(long questionId, CancellationToken ct = default);

    /// <summary>GET /questions/{question_id}/explanation</summary>
    Task<ExplanationDto?> GetExplanationAsync(long questionId, CancellationToken ct = default);

    /// <summary>GET /questions/{question_id}/solved-card</summary>
    Task<SolvedCardDto?> GetSolvedCardAsync(long questionId, CancellationToken ct = default);

    /// <summary>POST /topic/{slug}/questions/submit — persist AI-generated questions to KBot.</summary>
    Task<QuestionSubmitResponseDto> SubmitQuestionsAsync(string slug, QuestionSubmitRequestDto request, CancellationToken ct = default);
}

// TODO: Mukesh — implement against the real KBot API (see docs/kbot-smartboard-integration.md §4–5).
public sealed class KBotQuestionService : IKBotQuestionService
{
    private readonly IKBotClient _client;
    public KBotQuestionService(IKBotClient client) => _client = client;

    public Task<IReadOnlyList<QuestionSummaryDto>> GetQuestionsAsync(string slug, int? difficulty, CancellationToken ct = default)
        => Task.FromResult<IReadOnlyList<QuestionSummaryDto>>(Array.Empty<QuestionSummaryDto>());

    public Task<QuestionDto?> GetQuestionAsync(long questionId, CancellationToken ct = default)
        => Task.FromResult<QuestionDto?>(null);

    public Task<ExplanationDto?> GetExplanationAsync(long questionId, CancellationToken ct = default)
        => Task.FromResult<ExplanationDto?>(null);

    public Task<SolvedCardDto?> GetSolvedCardAsync(long questionId, CancellationToken ct = default)
        => Task.FromResult<SolvedCardDto?>(null);

    public Task<QuestionSubmitResponseDto> SubmitQuestionsAsync(string slug, QuestionSubmitRequestDto request, CancellationToken ct = default)
        => Task.FromResult(new QuestionSubmitResponseDto(0, Array.Empty<long>()));
}
