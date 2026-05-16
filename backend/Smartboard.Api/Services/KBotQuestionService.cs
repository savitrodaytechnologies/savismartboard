using System.Net;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
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

public sealed class KBotQuestionService : IKBotQuestionService
{
    private static readonly JsonSerializerOptions _json = new() { PropertyNameCaseInsensitive = true };

    // ── private KBot response shapes ──────────────────────────────────────────
    // List endpoint uses "id"; detail endpoint uses "question_id"
    private sealed record KBotQuestionListItemR(
        [property: JsonPropertyName("id")] long Id,
        [property: JsonPropertyName("question_text")] string QuestionText,
        [property: JsonPropertyName("question_type")] string QuestionType,
        [property: JsonPropertyName("difficulty")] int Difficulty,
        [property: JsonPropertyName("source")] string Source);

    private sealed record KBotQuestionDetailR(
        [property: JsonPropertyName("question_id")] long QuestionId,
        [property: JsonPropertyName("question_text")] string QuestionText,
        [property: JsonPropertyName("question_type")] string QuestionType,
        [property: JsonPropertyName("options")] string[]? Options,
        [property: JsonPropertyName("answer_text")] string? AnswerText,
        [property: JsonPropertyName("difficulty")] int Difficulty,
        [property: JsonPropertyName("source")] string Source,
        [property: JsonPropertyName("is_verified")] bool IsVerified);

    private sealed record KBotExplanationR(
        [property: JsonPropertyName("question_id")] long QuestionId,
        [property: JsonPropertyName("html")] string Html,
        [property: JsonPropertyName("version_id")] long VersionId);

    private sealed record KBotSolvedCardR(
        [property: JsonPropertyName("question_id")] long QuestionId,
        [property: JsonPropertyName("html")] string Html,
        [property: JsonPropertyName("version_id")] long VersionId);

    private sealed record KBotSubmitResponseR(
        [property: JsonPropertyName("submitted")] int Submitted,
        [property: JsonPropertyName("question_ids")] long[] QuestionIds);

    private readonly IKBotClient _client;
    public KBotQuestionService(IKBotClient client) => _client = client;

    public async Task<IReadOnlyList<QuestionSummaryDto>> GetQuestionsAsync(string slug, int? difficulty, CancellationToken ct = default)
    {
        var path = $"topic/{Uri.EscapeDataString(slug)}/questions";
        if (difficulty.HasValue) path += $"?difficulty={difficulty}";
        var resp = await _client.GetAsync(path, ct);
        if (!resp.IsSuccessStatusCode) return Array.Empty<QuestionSummaryDto>();
        var raw = JsonSerializer.Deserialize<KBotQuestionListItemR[]>(await resp.Content.ReadAsStringAsync(ct), _json);
        return raw?.Select(r => new QuestionSummaryDto(r.Id, r.QuestionType, r.Difficulty, Truncate(r.QuestionText, 120), r.Source)).ToList()
               ?? (IReadOnlyList<QuestionSummaryDto>)Array.Empty<QuestionSummaryDto>();
    }

    public async Task<QuestionDto?> GetQuestionAsync(long questionId, CancellationToken ct = default)
    {
        var resp = await _client.GetAsync($"questions/{questionId}", ct);
        if (!resp.IsSuccessStatusCode) return null;
        var raw = JsonSerializer.Deserialize<KBotQuestionDetailR>(await resp.Content.ReadAsStringAsync(ct), _json);
        if (raw is null) return null;
        return new QuestionDto(raw.QuestionId, raw.QuestionText, raw.QuestionType, raw.Options, raw.AnswerText, raw.Difficulty, raw.Source, raw.IsVerified);
    }

    public async Task<ExplanationDto?> GetExplanationAsync(long questionId, CancellationToken ct = default)
    {
        var resp = await _client.GetAsync($"questions/{questionId}/explanation", ct);
        if (resp.StatusCode == HttpStatusCode.NotFound) return null;
        if (!resp.IsSuccessStatusCode) return null;
        var raw = JsonSerializer.Deserialize<KBotExplanationR>(await resp.Content.ReadAsStringAsync(ct), _json);
        if (raw is null) return null;
        return new ExplanationDto(raw.QuestionId, raw.Html, raw.VersionId);
    }

    public async Task<SolvedCardDto?> GetSolvedCardAsync(long questionId, CancellationToken ct = default)
    {
        var resp = await _client.GetAsync($"questions/{questionId}/solved-card", ct);
        if (!resp.IsSuccessStatusCode) return null;
        var raw = JsonSerializer.Deserialize<KBotSolvedCardR>(await resp.Content.ReadAsStringAsync(ct), _json);
        if (raw is null) return null;
        return new SolvedCardDto(raw.QuestionId, raw.Html, raw.VersionId);
    }

    public async Task<QuestionSubmitResponseDto> SubmitQuestionsAsync(string slug, QuestionSubmitRequestDto request, CancellationToken ct = default)
    {
        var body = JsonSerializer.Serialize(request, new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower });
        var content = new StringContent(body, Encoding.UTF8, "application/json");
        var resp = await _client.PostAsync($"topic/{Uri.EscapeDataString(slug)}/questions/submit", content, ct);
        if (!resp.IsSuccessStatusCode) return new QuestionSubmitResponseDto(0, Array.Empty<long>());
        var raw = JsonSerializer.Deserialize<KBotSubmitResponseR>(await resp.Content.ReadAsStringAsync(ct), _json);
        return raw is null ? new QuestionSubmitResponseDto(0, Array.Empty<long>())
                           : new QuestionSubmitResponseDto(raw.Submitted, raw.QuestionIds);
    }

    private static string Truncate(string s, int maxLen) =>
        s.Length <= maxLen ? s : s[..maxLen].TrimEnd() + "…";
}
