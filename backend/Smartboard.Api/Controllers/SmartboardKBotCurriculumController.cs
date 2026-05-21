using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Smartboard.Api.Services;

namespace Smartboard.Api.Controllers;

[ApiController]
[AllowAnonymous]
[Route("api/v1/smartboard/kbot")]
public sealed class SmartboardKBotCurriculumController : ControllerBase
{
    private readonly IKBotCurriculumService _svc;
    public SmartboardKBotCurriculumController(IKBotCurriculumService svc) => _svc = svc;

    [HttpGet("boards")]
    public async Task<IActionResult> GetBoards(CancellationToken ct)
        => Ok(await _svc.GetBoardsAsync(ct));

    [HttpGet("grades")]
    public async Task<IActionResult> GetGrades([FromQuery] string? board, [FromQuery] string? subject, CancellationToken ct)
        => Ok(await _svc.GetGradesAsync(board, subject, ct));

    [HttpGet("subjects")]
    public async Task<IActionResult> GetSubjects([FromQuery] string? board, [FromQuery] int? grade, CancellationToken ct)
        => Ok(await _svc.GetSubjectsAsync(board, grade, ct));

    [HttpGet("chapters")]
    public async Task<IActionResult> GetChapters([FromQuery] string? board, [FromQuery] int? grade, [FromQuery] string? subject, CancellationToken ct)
        => Ok(await _svc.GetChaptersAsync(board, grade, subject, ct));

    [HttpGet("topics")]
    public async Task<IActionResult> GetTopics([FromQuery] int? chapterId, [FromQuery] string? board, [FromQuery] int? grade, [FromQuery] string? subject, CancellationToken ct)
        => Ok(await _svc.GetTopicsAsync(chapterId, board, grade, subject, ct));

    [HttpGet("topics/{slug}/rag-snippets")]
    public async Task<IActionResult> GetRagSnippets(string slug, [FromQuery] int max = 5, CancellationToken ct = default)
        => Ok(await _svc.GetRagSnippetsAsync(slug, max, ct));
}
