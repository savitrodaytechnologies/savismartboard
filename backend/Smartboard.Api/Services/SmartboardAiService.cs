using Smartboard.Api.Auth;
using Smartboard.Api.HttpClients;
using Smartboard.Api.Models.Dto;
using Smartboard.Api.Prompts;
using Smartboard.Api.Repositories;

namespace Smartboard.Api.Services;

public interface ISmartboardAiService
{
    Task<AiPromptResponse> ExplainDifferentlyAsync(AiPromptRequest req, CancellationToken ct = default);
    Task<AiPromptResponse> SimplifyAsync(AiPromptRequest req, CancellationToken ct = default);
    Task<AiPromptResponse> LocalExampleAsync(AiPromptRequest req, CancellationToken ct = default);
    Task<AiPromptResponse> QuickQuizAsync(AiPromptRequest req, CancellationToken ct = default);
    Task<AiPromptResponse> SummaryAsync(AiPromptRequest req, CancellationToken ct = default);
    Task<AiPromptResponse> HomeworkAsync(AiPromptRequest req, CancellationToken ct = default);
    Task<AiPromptResponse> AskSelectionAsync(AiSelectionRequest req, CancellationToken ct = default);

    /// <summary>Vision call: returns a 2–5-word topic name extracted from a board image.</summary>
    Task<AiPromptResponse> IdentifyTopicAsync(AiSelectionRequest req, CancellationToken ct = default);
}

public sealed class SmartboardAiService : ISmartboardAiService
{
    private readonly IAiClient _client;
    private readonly ISmartboardUsageLogRepository _log;
    private readonly ITeacherContextAccessor _teacher;

    // Prompts are loaded from plain-text files under Prompts/ (embedded resources).
    // To change what the AI says, edit the .txt files directly — no C# changes needed.

    public SmartboardAiService(IAiClient client, ISmartboardUsageLogRepository log, ITeacherContextAccessor teacher)
    {
        _client  = client;
        _log     = log;
        _teacher = teacher;
    }

    // ── Lasso / selection ────────────────────────────────────────────────────

    public async Task<AiPromptResponse> AskSelectionAsync(AiSelectionRequest req, CancellationToken ct = default)
    {
        var task = AiPromptTemplates.SelectionTabPrompt(req.Instruction);

        var message = string.IsNullOrEmpty(req.ImageBase64)
            ? new AiMessage(task)
            : new AiMessage(task, req.ImageBase64, req.ImageMediaType ?? "image/jpeg");

        var result = await _client.ChatAsync(AiPromptTemplates.AiPromptGlobal, message, ct);
        return new AiPromptResponse(result, 0, 0m);
    }

    public async Task<AiPromptResponse> IdentifyTopicAsync(AiSelectionRequest req, CancellationToken ct = default)
    {
        if (string.IsNullOrEmpty(req.ImageBase64))
            return new AiPromptResponse(string.Empty, 0, 0m);

        var message = new AiMessage(
            AiPromptTemplates.IdentifyTopicPrompt,
            req.ImageBase64,
            req.ImageMediaType ?? "image/jpeg");
        var result = await _client.ChatAsync(AiPromptTemplates.AiPromptGlobal, message, ct);
        return new AiPromptResponse(result.Trim(), 0, 0m);
    }

    // ── Text-based prompts ───────────────────────────────────────────────────

    public async Task<AiPromptResponse> ExplainDifferentlyAsync(AiPromptRequest req, CancellationToken ct = default)
    {
        var result = await _client.ChatAsync(AiPromptTemplates.AiPromptGlobal,
            new AiMessage($"Explain the following concept using a different approach, analogy, or example:\n\n{req.Instruction}"), ct);
        return new AiPromptResponse(result, 0, 0m);
    }

    public async Task<AiPromptResponse> SimplifyAsync(AiPromptRequest req, CancellationToken ct = default)
    {
        var result = await _client.ChatAsync(AiPromptTemplates.AiPromptGlobal,
            new AiMessage($"Simplify the following concept or explanation so a struggling student can understand it easily:\n\n{req.Instruction}"), ct);
        return new AiPromptResponse(result, 0, 0m);
    }

    public async Task<AiPromptResponse> LocalExampleAsync(AiPromptRequest req, CancellationToken ct = default)
    {
        var result = await _client.ChatAsync(AiPromptTemplates.AiPromptGlobal,
            new AiMessage($"Give a relatable real-life example from an Indian context (e.g. local food, festivals, daily life) " +
                          $"to illustrate the following concept:\n\n{req.Instruction}"), ct);
        return new AiPromptResponse(result, 0, 0m);
    }

    public async Task<AiPromptResponse> QuickQuizAsync(AiPromptRequest req, CancellationToken ct = default)
    {
        var result = await _client.ChatAsync(AiPromptTemplates.AiPromptGlobal,
            new AiMessage($"Write 3 short quiz questions (with answers) to test understanding of:\n\n{req.Instruction}"), ct);
        return new AiPromptResponse(result, 0, 0m);
    }

    public async Task<AiPromptResponse> SummaryAsync(AiPromptRequest req, CancellationToken ct = default)
    {
        var result = await _client.ChatAsync(AiPromptTemplates.AiPromptGlobal,
            new AiMessage($"Write a concise 3-5 sentence summary of the following topic suitable for a student's revision notes:\n\n{req.Instruction}"), ct);
        return new AiPromptResponse(result, 0, 0m);
    }

    public async Task<AiPromptResponse> HomeworkAsync(AiPromptRequest req, CancellationToken ct = default)
    {
        var result = await _client.ChatAsync(AiPromptTemplates.AiPromptGlobal,
            new AiMessage($"Suggest 3 appropriate homework problems or activities for students who have just learned:\n\n{req.Instruction}"), ct);
        return new AiPromptResponse(result, 0, 0m);
    }
}
