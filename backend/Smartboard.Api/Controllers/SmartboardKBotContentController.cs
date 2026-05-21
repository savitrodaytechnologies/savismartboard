using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Smartboard.Api.Services;

namespace Smartboard.Api.Controllers;

[ApiController]
[AllowAnonymous]
[Route("api/v1/smartboard/kbot")]
public sealed class SmartboardKBotContentController : ControllerBase
{
    private readonly IKBotContentService _svc;
    public SmartboardKBotContentController(IKBotContentService svc) => _svc = svc;

    [HttpGet("topics/{slug}/cards")]
    public async Task<IActionResult> GetCards(string slug, CancellationToken ct)
    {
        var result = await _svc.GetTopicCardsAsync(slug, ct);
        return result is not null ? Ok(result) : NotFound();
    }

    [HttpGet("content-cards/{cardId:long}/versions")]
    public async Task<IActionResult> GetVersions(long cardId, CancellationToken ct)
        => Ok(await _svc.GetVersionsAsync(cardId, ct));

    [HttpGet("content-cards/{cardId:long}/render")]
    public async Task<IActionResult> Render(long cardId, [FromQuery] int? versionId, CancellationToken ct)
    {
        var result = await _svc.RenderAsync(cardId, versionId, ct);
        if (result is null) return NotFound();
        Response.Headers.ETag = result.ETag;
        return Ok(result);
    }
}
