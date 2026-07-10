using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Smartboard.Api.HttpClients;

namespace Smartboard.Api.Controllers;

/// <summary>
/// GET  /api/v1/profile          — returns profile (name, email, school, schoolId)
/// PUT  /api/v1/profile/password — change password
/// Both require a valid JWT in the Authorization header (forwarded to Savischools).
/// </summary>
[ApiController]
[Route("api/v1/profile")]
[Authorize]
public sealed class ProfileController : ControllerBase
{
    private static readonly JsonSerializerOptions _json = new() { PropertyNameCaseInsensitive = true };
    private readonly ISavischoolsClient _savischools;

    public ProfileController(ISavischoolsClient savischools) => _savischools = savischools;

    // ── GET /api/v1/profile ───────────────────────────────────────────────────

    [HttpGet]
    [ProducesResponseType(200)]
    public async Task<IActionResult> GetProfile(CancellationToken ct)
    {
        var resp = await _savischools.GetAsync("api/teachers/profile", ct);
        var body = await resp.Content.ReadAsStringAsync(ct);
        return StatusCode((int)resp.StatusCode, body.Length > 0
            ? JsonSerializer.Deserialize<object>(body, _json)
            : null);
    }

    // ── PUT /api/v1/profile/password ──────────────────────────────────────────

    public sealed record ChangePasswordRequest(string CurrentPassword, string NewPassword);

    [HttpPut("password")]
    [ProducesResponseType(200)]
    [ProducesResponseType(400)]
    public async Task<IActionResult> ChangePassword([FromBody] ChangePasswordRequest req, CancellationToken ct)
    {
        var resp = await _savischools.PutAsync("api/teachers/password", req, ct);
        var body = await resp.Content.ReadAsStringAsync(ct);
        return StatusCode((int)resp.StatusCode, body.Length > 0
            ? JsonSerializer.Deserialize<object>(body, _json)
            : null);
    }
}
