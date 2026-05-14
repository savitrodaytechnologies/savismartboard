using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Smartboard.Api.Services;

namespace Smartboard.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/smartboard/kbot")]
public sealed class SmartboardQuestionController : ControllerBase
{
    private readonly IKBotQuestionService _svc;
    public SmartboardQuestionController(IKBotQuestionService svc) => _svc = svc;

    [HttpGet("topics/{topicId:long}/questions")]
    public async Task<IActionResult> GetQuestions(long topicId, [FromQuery] string? difficulty, CancellationToken ct)
        => Ok(await _svc.GetQuestionsAsync(topicId, difficulty, ct));

    [HttpGet("questions/{questionId:long}")]
    public async Task<IActionResult> GetQuestion(long questionId, CancellationToken ct)
        => (await _svc.GetQuestionAsync(questionId, ct)) is { } q ? Ok(q) : NotFound();

    [HttpGet("questions/{questionId:long}/basic-explanation")]
    public async Task<IActionResult> GetExplanation(long questionId, CancellationToken ct)
        => (await _svc.GetBasicExplanationAsync(questionId, ct)) is { } q ? Ok(q) : NotFound();

    [HttpGet("questions/{questionId:long}/solved-card")]
    public async Task<IActionResult> GetSolved(long questionId, CancellationToken ct)
        => (await _svc.GetSolvedCardAsync(questionId, ct)) is { } q ? Ok(q) : NotFound();
}
