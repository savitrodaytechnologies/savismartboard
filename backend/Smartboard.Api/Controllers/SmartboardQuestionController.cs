using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Smartboard.Api.Models.Dto;
using Smartboard.Api.Services;

namespace Smartboard.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/smartboard/kbot")]
public sealed class SmartboardQuestionController : ControllerBase
{
    private readonly IKBotQuestionService _svc;
    public SmartboardQuestionController(IKBotQuestionService svc) => _svc = svc;

    [HttpGet("topics/{slug}/questions")]
    public async Task<IActionResult> GetQuestions(string slug, [FromQuery] int? difficulty, CancellationToken ct)
        => Ok(await _svc.GetQuestionsAsync(slug, difficulty, ct));

    [HttpGet("questions/{questionId:long}")]
    public async Task<IActionResult> GetQuestion(long questionId, CancellationToken ct)
        => (await _svc.GetQuestionAsync(questionId, ct)) is { } q ? Ok(q) : NotFound();

    [HttpGet("questions/{questionId:long}/explanation")]
    public async Task<IActionResult> GetExplanation(long questionId, CancellationToken ct)
        => (await _svc.GetExplanationAsync(questionId, ct)) is { } q ? Ok(q) : NotFound();

    [HttpGet("questions/{questionId:long}/solved-card")]
    public async Task<IActionResult> GetSolved(long questionId, CancellationToken ct)
        => (await _svc.GetSolvedCardAsync(questionId, ct)) is { } q ? Ok(q) : NotFound();

    [HttpPost("topics/{slug}/questions/submit")]
    public async Task<IActionResult> SubmitQuestions(string slug, [FromBody] QuestionSubmitRequestDto request, CancellationToken ct)
        => Ok(await _svc.SubmitQuestionsAsync(slug, request, ct));
}
