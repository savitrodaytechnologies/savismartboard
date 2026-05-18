using Smartboard.Api.Auth;
using Smartboard.Api.HttpClients;
using Smartboard.Api.Models.Dto;
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
}

public sealed class SmartboardAiService : ISmartboardAiService
{
    private readonly IAiClient _client;
    private readonly ISmartboardUsageLogRepository _log;
    private readonly ITeacherContextAccessor _teacher;

    // Shared system prompt for all calls
    private const string SystemPrompt =
        "You are an expert K-12 teaching assistant for Indian schools following the CBSE curriculum. " +
        "Be concise, accurate, and appropriate for the grade level. " +
        "Reply in plain text without markdown formatting or bullet symbols.";

    // Maps lasso-tab instruction names → user-facing task description
    private static readonly Dictionary<string, string> SelectionPrompts = new(StringComparer.OrdinalIgnoreCase)
    {
        ["solution"] = "Look at the problem or work shown in the image. Provide a clear, step-by-step solution.",
        ["explain"]  = "Look at the content shown in the image. Explain this concept clearly for a student who is confused.",
        ["mistakes"] = "Look at the student work shown in the image. Identify any mathematical or conceptual mistakes. If the work is correct, confirm it.",
        ["quiz"]     = "Based on the content shown in the image, write 3 short quiz questions with their correct answers.",
    };

    public SmartboardAiService(IAiClient client, ISmartboardUsageLogRepository log, ITeacherContextAccessor teacher)
    {
        _client  = client;
        _log     = log;
        _teacher = teacher;
    }

    // ── Lasso / selection ────────────────────────────────────────────────────

    public async Task<AiPromptResponse> AskSelectionAsync(AiSelectionRequest req, CancellationToken ct = default)
    {
        var task = SelectionPrompts.TryGetValue(req.Instruction, out var mapped)
            ? mapped
            : req.Instruction;

        var message = string.IsNullOrEmpty(req.ImageBase64)
            ? new AiMessage(task)
            : new AiMessage(task, req.ImageBase64, req.ImageMediaType ?? "image/jpeg");

        var result = await _client.ChatAsync(SystemPrompt, message, ct);
        return new AiPromptResponse(result, 0, 0m);
    }

    // ── Text-based prompts ───────────────────────────────────────────────────

    public async Task<AiPromptResponse> ExplainDifferentlyAsync(AiPromptRequest req, CancellationToken ct = default)
    {
        var result = await _client.ChatAsync(SystemPrompt,
            new AiMessage($"Explain the following concept using a different approach, analogy, or example:\n\n{req.Instruction}"), ct);
        return new AiPromptResponse(result, 0, 0m);
    }

    public async Task<AiPromptResponse> SimplifyAsync(AiPromptRequest req, CancellationToken ct = default)
    {
        var result = await _client.ChatAsync(SystemPrompt,
            new AiMessage($"Simplify the following concept or explanation so a struggling student can understand it easily:\n\n{req.Instruction}"), ct);
        return new AiPromptResponse(result, 0, 0m);
    }

    public async Task<AiPromptResponse> LocalExampleAsync(AiPromptRequest req, CancellationToken ct = default)
    {
        var result = await _client.ChatAsync(SystemPrompt,
            new AiMessage($"Give a relatable real-life example from an Indian context (e.g. local food, festivals, daily life) " +
                          $"to illustrate the following concept:\n\n{req.Instruction}"), ct);
        return new AiPromptResponse(result, 0, 0m);
    }

    public async Task<AiPromptResponse> QuickQuizAsync(AiPromptRequest req, CancellationToken ct = default)
    {
        var result = await _client.ChatAsync(SystemPrompt,
            new AiMessage($"Write 3 short quiz questions (with answers) to test understanding of:\n\n{req.Instruction}"), ct);
        return new AiPromptResponse(result, 0, 0m);
    }

    public async Task<AiPromptResponse> SummaryAsync(AiPromptRequest req, CancellationToken ct = default)
    {
        var result = await _client.ChatAsync(SystemPrompt,
            new AiMessage($"Write a concise 3-5 sentence summary of the following topic suitable for a student's revision notes:\n\n{req.Instruction}"), ct);
        return new AiPromptResponse(result, 0, 0m);
    }

    public async Task<AiPromptResponse> HomeworkAsync(AiPromptRequest req, CancellationToken ct = default)
    {
        var result = await _client.ChatAsync(SystemPrompt,
            new AiMessage($"Suggest 3 appropriate homework problems or activities for students who have just learned:\n\n{req.Instruction}"), ct);
        return new AiPromptResponse(result, 0, 0m);
    }
}
