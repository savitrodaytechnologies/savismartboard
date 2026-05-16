using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.IdentityModel.Tokens;

namespace Smartboard.Api.Controllers;

/// <summary>
/// Auth + dev-helper endpoints.
/// POST /api/dev/login  — hardcoded credentials login (placeholder until Savischools SSO).
/// GET  /api/dev/token  — dev-only quick token (Development environment only).
/// </summary>
[ApiController]
[Route("api/dev")]
public sealed class DevController : ControllerBase
{
    private readonly IWebHostEnvironment _env;
    private readonly IConfiguration _cfg;

    public DevController(IWebHostEnvironment env, IConfiguration cfg)
    {
        _env = env;
        _cfg = cfg;
    }

    // ── Hardcoded user table (replace with Savischools SSO when M1 is done) ──
    private static readonly HardcodedUser[] _users =
    [
        new(SchoolId: 1, UserId: "prakashp", PasswordHash: "98!",
            TeacherId: 101, Name: "Prakash P", SchoolName: "Demo Public School", Curriculum: "CBSE"),
    ];

    /// <summary>
    /// Login with schoolId + userId + password.
    /// Returns a JWT identical in shape to a Savischools-issued token.
    /// Hardcoded users — placeholder until Savischools SSO (M1) is wired.
    /// </summary>
    [HttpPost("login")]
    [AllowAnonymous]
    [ProducesResponseType(typeof(LoginResponse), 200)]
    [ProducesResponseType(401)]
    public IActionResult Login([FromBody] LoginRequest req)
    {
        var user = Array.Find(_users, u =>
            u.SchoolId == req.SchoolId &&
            string.Equals(u.UserId, req.UserId, StringComparison.OrdinalIgnoreCase) &&
            u.PasswordHash == req.Password);

        if (user is null)
            return Unauthorized(new { error = "Invalid school ID, user ID, or password." });

        var tokenString = IssueToken(user);
        return Ok(new LoginResponse(tokenString, 8 * 3600, user.Name, user.SchoolName, user.Curriculum));
    }

    /// <summary>
    /// Returns a signed JWT for SchoolId=1 / TeacherId=101 (Parivesh dev identity).
    /// Only works when ASPNETCORE_ENVIRONMENT=Development.
    /// </summary>
    [HttpGet("token")]
    [ProducesResponseType(typeof(DevTokenResponse), 200)]
    public IActionResult Token()
    {
        if (!_env.IsDevelopment())
            return NotFound();

        var claims = new[]
        {
            new Claim("school_id",    "1"),
            new Claim("teacher_id",   "101"),
            new Claim("name",         "Parivesh (Dev)"),
            new Claim("school_name",  "Demo Public School"),
            new Claim(JwtRegisteredClaimNames.Sub,   "dev-teacher-101"),
            new Claim(JwtRegisteredClaimNames.Jti,   Guid.NewGuid().ToString()),
            new Claim(JwtRegisteredClaimNames.Iat,
                DateTimeOffset.UtcNow.ToUnixTimeSeconds().ToString(),
                ClaimValueTypes.Integer64),
        };

        var token = new JwtSecurityToken(
            issuer: "smartboard-dev",
            audience: "smartboard-api",
            claims: claims,
            notBefore: DateTime.UtcNow,
            expires: DateTime.UtcNow.AddHours(8),
            signingCredentials: BuildCreds());

        var tokenString = new JwtSecurityTokenHandler().WriteToken(token);

        return Ok(new DevTokenResponse(
            Token: tokenString,
            ExpiresIn: 8 * 3600,
            Note: "Paste this in Swagger Authorize dialog as:  Bearer <token>"));
    }

    // ── helpers ───────────────────────────────────────────────────────────────

    private string IssueToken(HardcodedUser user)
    {
        var claims = new[]
        {
            new Claim("school_id",   user.SchoolId.ToString()),
            new Claim("teacher_id",  user.TeacherId.ToString()),
            new Claim("user_id",     user.UserId),
            new Claim("name",        user.Name),
            new Claim("school_name", user.SchoolName),
            new Claim("curriculum",  user.Curriculum),
            new Claim(JwtRegisteredClaimNames.Sub, user.UserId),
            new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString()),
            new Claim(JwtRegisteredClaimNames.Iat,
                DateTimeOffset.UtcNow.ToUnixTimeSeconds().ToString(),
                ClaimValueTypes.Integer64),
        };

        var token = new JwtSecurityToken(
            issuer: "smartboard-dev",
            audience: "smartboard-api",
            claims: claims,
            notBefore: DateTime.UtcNow,
            expires: DateTime.UtcNow.AddHours(8),
            signingCredentials: BuildCreds());

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    private SigningCredentials BuildCreds()
    {
        var key = _cfg["DevJwt:Key"] ?? throw new InvalidOperationException("DevJwt:Key not configured.");
        var secret = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(key));
        return new SigningCredentials(secret, SecurityAlgorithms.HmacSha256);
    }
}

public sealed record LoginRequest(int SchoolId, string UserId, string Password);
public sealed record LoginResponse(string Token, int ExpiresIn, string Name, string SchoolName, string Curriculum);
public sealed record DevTokenResponse(string Token, int ExpiresIn, string Note);

file sealed record HardcodedUser(int SchoolId, string UserId, string PasswordHash,
    int TeacherId, string Name, string SchoolName, string Curriculum);
