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
}

// TODO: Parivesh — implement grounded prompt templates and budget enforcement.
public sealed class SmartboardAiService : ISmartboardAiService
{
    private readonly IAiClient _client;
    private readonly ISmartboardUsageLogRepository _log;
    private readonly ITeacherContextAccessor _teacher;

    public SmartboardAiService(IAiClient client, ISmartboardUsageLogRepository log, ITeacherContextAccessor teacher)
    {
        _client = client;
        _log = log;
        _teacher = teacher;
    }

    private Task<AiPromptResponse> Stub(string kind, AiPromptRequest req)
        => Task.FromResult(new AiPromptResponse($"[{kind}] {req.Instruction}", 0, 0m));

    public Task<AiPromptResponse> ExplainDifferentlyAsync(AiPromptRequest req, CancellationToken ct = default) => Stub("explain", req);
    public Task<AiPromptResponse> SimplifyAsync(AiPromptRequest req, CancellationToken ct = default) => Stub("simplify", req);
    public Task<AiPromptResponse> LocalExampleAsync(AiPromptRequest req, CancellationToken ct = default) => Stub("local-example", req);
    public Task<AiPromptResponse> QuickQuizAsync(AiPromptRequest req, CancellationToken ct = default) => Stub("quick-quiz", req);
    public Task<AiPromptResponse> SummaryAsync(AiPromptRequest req, CancellationToken ct = default) => Stub("summary", req);
    public Task<AiPromptResponse> HomeworkAsync(AiPromptRequest req, CancellationToken ct = default) => Stub("homework", req);
}
