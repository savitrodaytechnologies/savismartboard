using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Smartboard.Api.Services;

namespace Smartboard.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/smartboard/kbot")]
public sealed class SmartboardKBotContentController : ControllerBase
{
    private readonly IKBotContentService _svc;
    public SmartboardKBotContentController(IKBotContentService svc) => _svc = svc;

    [HttpGet("topics/{topicId:long}/content-cards")]
    public async Task<IActionResult> GetCards(long topicId, CancellationToken ct)
        => Ok(await _svc.GetCardsForTopicAsync(topicId, ct));

    [HttpGet("content-cards/{cardId:long}/versions")]
    public async Task<IActionResult> GetVersions(long cardId, CancellationToken ct)
        => Ok(await _svc.GetVersionsAsync(cardId, ct));

    [HttpGet("content-cards/{cardId:long}/render")]
    public async Task<IActionResult> Render(long cardId, [FromQuery] int versionId, CancellationToken ct)
        => Ok(await _svc.RenderAsync(cardId, versionId, ct));
}
