using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Smartboard.Api.Services;

namespace Smartboard.Api.Controllers;

[ApiController]
[AllowAnonymous]
[Route("api/v1/smartboard")]
public sealed class SmartboardContextController : ControllerBase
{
    private readonly ISmartboardContextService _svc;
    public SmartboardContextController(ISmartboardContextService svc) => _svc = svc;

    [HttpGet("context")]
    public async Task<IActionResult> GetContext(CancellationToken ct) => Ok(await _svc.GetContextAsync(ct));

    [HttpGet("classes")]
    public async Task<IActionResult> GetClasses(CancellationToken ct) => Ok(await _svc.GetClassesAsync(ct));

    [HttpGet("sections")]
    public async Task<IActionResult> GetSections([FromQuery] int classId, CancellationToken ct)
        => Ok(await _svc.GetSectionsAsync(classId, ct));

    [HttpGet("subjects")]
    public async Task<IActionResult> GetSubjects([FromQuery] int classId, CancellationToken ct)
        => Ok(await _svc.GetSubjectsAsync(classId, ct));

    [HttpGet("topics")]
    public async Task<IActionResult> GetTopics([FromQuery] int subjectId, [FromQuery] int classId, CancellationToken ct)
        => Ok(await _svc.GetTopicsAsync(subjectId, classId, ct));

    [HttpPost("syllabus/topics/{topicId:int}/mark-taught")]
    public async Task<IActionResult> MarkTaught(int topicId, CancellationToken ct)
    {
        await _svc.MarkTopicTaughtAsync(topicId, ct);
        return NoContent();
    }
}
