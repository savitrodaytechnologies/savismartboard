using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Smartboard.Api.Models.Dto;
using Smartboard.Api.Services;

namespace Smartboard.Api.Controllers;

[ApiController]
[AllowAnonymous]
[Route("api/v1/smartboard/ai")]
public sealed class SmartboardAiController : ControllerBase
{
    private readonly ISmartboardAiService _svc;
    public SmartboardAiController(ISmartboardAiService svc) => _svc = svc;

    [HttpPost("explain-differently")]
    public Task<AiPromptResponse> Explain([FromBody] AiPromptRequest req, CancellationToken ct) => _svc.ExplainDifferentlyAsync(req, ct);

    [HttpPost("simplify")]
    public Task<AiPromptResponse> Simplify([FromBody] AiPromptRequest req, CancellationToken ct) => _svc.SimplifyAsync(req, ct);

    [HttpPost("local-example")]
    public Task<AiPromptResponse> LocalExample([FromBody] AiPromptRequest req, CancellationToken ct) => _svc.LocalExampleAsync(req, ct);

    [HttpPost("quick-quiz")]
    public Task<AiPromptResponse> QuickQuiz([FromBody] AiPromptRequest req, CancellationToken ct) => _svc.QuickQuizAsync(req, ct);

    [HttpPost("summary")]
    public Task<AiPromptResponse> Summary([FromBody] AiPromptRequest req, CancellationToken ct) => _svc.SummaryAsync(req, ct);

    [HttpPost("homework")]
    public Task<AiPromptResponse> Homework([FromBody] AiPromptRequest req, CancellationToken ct) => _svc.HomeworkAsync(req, ct);

    [HttpPost("ask-selection")]
    public Task<AiPromptResponse> AskSelection([FromBody] AiSelectionRequest req, CancellationToken ct) => _svc.AskSelectionAsync(req, ct);

    [HttpPost("identify-topic")]
    public Task<AiPromptResponse> IdentifyTopic([FromBody] AiSelectionRequest req, CancellationToken ct) => _svc.IdentifyTopicAsync(req, ct);
}
