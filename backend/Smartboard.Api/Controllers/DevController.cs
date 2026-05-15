using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.AspNetCore.Mvc;
using Microsoft.IdentityModel.Tokens;

namespace Smartboard.Api.Controllers;

/// <summary>
/// Development-only helper endpoints.
/// Returns 404 in Production — never commit real secrets.
/// Open in Swagger: GET /api/dev/token  → copy token → click Authorize → paste as Bearer.
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

        var key    = _cfg["DevJwt:Key"] ?? throw new InvalidOperationException("DevJwt:Key not configured.");
        var secret = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(key));
        var creds  = new SigningCredentials(secret, SecurityAlgorithms.HmacSha256);

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
            issuer:             "smartboard-dev",
            audience:           "smartboard-api",
            claims:             claims,
            notBefore:          DateTime.UtcNow,
            expires:            DateTime.UtcNow.AddHours(8),
            signingCredentials: creds);

        var tokenString = new JwtSecurityTokenHandler().WriteToken(token);

        return Ok(new DevTokenResponse(
            Token:     tokenString,
            ExpiresIn: 8 * 3600,
            Note:      "Paste this in Swagger Authorize dialog as:  Bearer <token>"));
    }
}

public sealed record DevTokenResponse(string Token, int ExpiresIn, string Note);
