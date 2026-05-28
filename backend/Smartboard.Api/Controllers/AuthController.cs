using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Smartboard.Api.HttpClients;

namespace Smartboard.Api.Controllers;

/// <summary>
/// POST /api/v1/auth/login — proxies to Savischools /connect/token and returns the JWT.
/// The frontend stores this JWT and uses it for all Smartboard API calls.
/// </summary>
[ApiController]
[Route("api/v1/auth")]
public sealed class AuthController : ControllerBase
{
    private static readonly JsonSerializerOptions _json = new() { PropertyNameCaseInsensitive = true };

    private readonly ISavischoolsClient _savischools;

    public AuthController(ISavischoolsClient savischools) => _savischools = savischools;

    public sealed record LoginRequest(long SchoolId, string UserId, string Password);
    private sealed record SavischoolsLoginRequest(long SchoolId, string LogonId, string Password);
    private sealed record LoginResponse(string Token, int ExpiresIn, string Name, string SchoolName, string Curriculum);

    public sealed class RegisterRequest
    {
        public string ContactPerson { get; init; } = "";
        public string Email         { get; init; } = "";
        public string Password      { get; init; } = "";
        public string Phone         { get; init; } = "";
        public string Country       { get; init; } = "IN";
        public string State         { get; init; } = "";
    }

    [HttpPost("login")]
    [AllowAnonymous]
    [ProducesResponseType(typeof(LoginResponse), 200)]
    [ProducesResponseType(401)]
    public async Task<IActionResult> Login([FromBody] LoginRequest req, CancellationToken ct)
    {
        var resp = await _savischools.PostAsync(
            "connect/token",
            new SavischoolsLoginRequest(req.SchoolId, req.UserId, req.Password),
            ct);

        var body = await resp.Content.ReadAsStringAsync(ct);

        if (!resp.IsSuccessStatusCode)
            return StatusCode((int)resp.StatusCode, body);

        var login = JsonSerializer.Deserialize<LoginResponse>(body, _json);
        return login is null ? StatusCode(500, "Invalid response from Savischools") : Ok(login);
    }

    [HttpPost("register")]
    [AllowAnonymous]
    [ProducesResponseType(201)]
    [ProducesResponseType(400)]
    [ProducesResponseType(409)]
    public async Task<IActionResult> Register([FromBody] RegisterRequest req, CancellationToken ct)
    {
        var resp = await _savischools.PostAsync("api/teachers/register", req, ct);
        var body = await resp.Content.ReadAsStringAsync(ct);
        return StatusCode((int)resp.StatusCode, body);
    }

    // ── OTP stubs — replace with real email service when ready ───────────────

    public sealed record SendOtpRequest(string Email);
    public sealed record VerifyOtpRequest(string Email, string Code);

    [HttpPost("send-otp")]
    [AllowAnonymous]
    [ProducesResponseType(200)]
    public IActionResult SendOtp([FromBody] SendOtpRequest req)
    {
        // Stub: log and return success. Wire a real SMTP/SendGrid service here later.
        Console.WriteLine($"[OTP stub] Would send OTP to {req.Email}");
        return Ok(new { message = "Verification code sent." });
    }

    [HttpPost("verify-otp")]
    [AllowAnonymous]
    [ProducesResponseType(200)]
    [ProducesResponseType(400)]
    public IActionResult VerifyOtp([FromBody] VerifyOtpRequest req)
    {
        // Stub: accept any 6-digit code. Replace with real store/validation later.
        if (string.IsNullOrEmpty(req.Code) || req.Code.Length != 6 || !req.Code.All(char.IsDigit))
            return BadRequest(new { error = "Invalid OTP. Please enter the 6-digit code." });

        return Ok(new { verified = true });
    }
}
