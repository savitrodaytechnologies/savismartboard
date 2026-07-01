using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Smartboard.Api.Models.Dto;
using Smartboard.Api.Services;

namespace Smartboard.Api.Controllers;

[ApiController]
[Authorize(AuthenticationSchemes = "LmsJwt")]
[Route("api/v1/smartboard/lms")]
public sealed class SaviLmsController : ControllerBase
{
    private readonly ISaviLmsService _svc;
    public SaviLmsController(ISaviLmsService svc) => _svc = svc;

    [HttpGet("topics/{slug}/questions")]
    public async Task<IActionResult> GetQuestions(string slug, [FromQuery] int? difficulty, CancellationToken ct)
        => Ok(await _svc.GetQuestionsAsync(slug, difficulty, ct));

    [HttpGet("questions")]
    public async Task<IActionResult> GetQuestions(
        [FromQuery] string? topicIds,
        [FromQuery] string? chapterIds,
        [FromQuery] bool randomSelection = true,
        [FromQuery] string? questionTypeCounts = null,
        [FromQuery] int defaultLimit = 100,
        CancellationToken ct = default)
    {
        var questions = await _svc.GetQuestionsAsync(topicIds, chapterIds, randomSelection, questionTypeCounts, defaultLimit, ct);
        return Ok(questions);
    }

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

    [HttpPost("papers")]
    public async Task<IActionResult> SubmitQuestionPaper([FromBody] LmsPaperSubmitRequestDto request, CancellationToken ct)
        => Ok(await _svc.SubmitQuestionPaperAsync(request, ct));

    [HttpGet("papers")]
    public async Task<IActionResult> GetQuestionPapers([FromQuery] string schoolId, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(schoolId))
            return BadRequest("SchoolId is required.");
        return Ok(await _svc.GetQuestionPapersBySchoolAsync(schoolId, ct));
    }

    [HttpGet("papers/{paperId:long}")]
    public async Task<IActionResult> GetQuestionPaper(long paperId, CancellationToken ct)
        => (await _svc.GetQuestionPaperByIdAsync(paperId, ct)) is { } paper ? Ok(paper) : NotFound();

    [AllowAnonymous]
    [HttpPost("auth/token")]
    public async Task<IActionResult> AuthenticateSchool([FromBody] LmsTokenRequestDto? request, CancellationToken ct)
    {
        var req = request ?? new LmsTokenRequestDto();
        var result = await _svc.AuthenticateSchoolAsync(req, ct);
        if (!result.Success) return Unauthorized(result);
        return Ok(result);
    }
}


