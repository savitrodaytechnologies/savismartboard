using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Smartboard.Api.Models.Dto;
using Smartboard.Api.Services;

namespace Smartboard.Api.Controllers;

[ApiController]
[AllowAnonymous]
[Route("api/smartboard/sessions")]
public sealed class SmartboardSessionController : ControllerBase
{
    private readonly ISmartboardSessionService _svc;
    public SmartboardSessionController(ISmartboardSessionService svc) => _svc = svc;

    [HttpPost("start")]
    public async Task<IActionResult> Start([FromBody] StartSessionRequest req, CancellationToken ct)
        => Ok(new { sessionId = await _svc.StartAsync(req, ct) });

    [HttpGet("{sessionId:long}")]
    public async Task<IActionResult> Get(long sessionId, CancellationToken ct)
        => (await _svc.GetAsync(sessionId, ct)) is { } s ? Ok(s) : NotFound();

    [HttpGet("recent")]
    public async Task<IActionResult> Recent(CancellationToken ct) => Ok(await _svc.GetRecentAsync(ct));

    [HttpPut("{sessionId:long}/save")]
    public async Task<IActionResult> Save(long sessionId, [FromBody] SavePageRequest req, CancellationToken ct)
    {
        await _svc.SavePageAsync(sessionId, req, ct);
        return NoContent();
    }

    [HttpPost("{sessionId:long}/end")]
    public async Task<IActionResult> End(long sessionId, CancellationToken ct)
    {
        await _svc.EndAsync(sessionId, ct);
        return NoContent();
    }

    [HttpPatch("{sessionId:long}/rename")]
    public async Task<IActionResult> Rename(long sessionId, [FromBody] RenameSessionRequest req, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(req.Title))
            return BadRequest(new { error = "Title cannot be empty." });
        await _svc.RenameAsync(sessionId, req.Title, ct);
        return NoContent();
    }

    [HttpDelete("{sessionId:long}")]
    public async Task<IActionResult> Delete(long sessionId, CancellationToken ct)
    {
        await _svc.DeleteAsync(sessionId, ct);
        return NoContent();
    }

    [HttpPost("{sessionId:long}/export")]
    public async Task<IActionResult> Export(long sessionId, [FromBody] ExportRequest req, CancellationToken ct)
        => Ok(new { url = await _svc.ExportAsync(sessionId, req, ct) });

    [HttpPost("{sessionId:long}/share")]
    public async Task<IActionResult> Share(long sessionId, [FromBody] ShareRequest req, CancellationToken ct)
        => Ok(new { url = await _svc.ShareAsync(sessionId, req, ct) });
}
