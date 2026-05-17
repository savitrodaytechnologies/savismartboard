using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Options;
using Smartboard.Api.Infrastructure;

namespace Smartboard.Api.HttpClients;

public interface IAiClient
{
    /// <summary>
    /// Calls the AI provider's chat completions endpoint.
    /// <paramref name="userContent"/> can be a plain <c>string</c> (text-only)
    /// or an array of content objects (vision messages).
    /// </summary>
    Task<string> ChatAsync(string systemPrompt, object userContent, CancellationToken ct = default);
}

public sealed class AiClient : IAiClient
{
    private readonly HttpClient _http;
    private readonly AiOptions _opts;

    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    public AiClient(HttpClient http, IOptions<AiOptions> opts)
    {
        _opts = opts.Value;
        _http = http;
        _http.BaseAddress = new Uri(_opts.BaseUrl.TrimEnd('/') + '/');
        if (!string.IsNullOrWhiteSpace(_opts.ApiKey))
            _http.DefaultRequestHeaders.Authorization =
                new AuthenticationHeaderValue("Bearer", _opts.ApiKey);
    }

    public async Task<string> ChatAsync(string systemPrompt, object userContent, CancellationToken ct = default)
    {
        var payload = JsonSerializer.Serialize(new
        {
            model    = _opts.Model,
            messages = new object[]
            {
                new { role = "system", content = systemPrompt },
                new { role = "user",   content = userContent  },
            },
            max_tokens = 1024,
        }, JsonOpts);

        using var req = new HttpRequestMessage(HttpMethod.Post, "chat/completions")
        {
            Content = new StringContent(payload, Encoding.UTF8, "application/json"),
        };

        var resp = await _http.SendAsync(req, ct);
        resp.EnsureSuccessStatusCode();

        using var doc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync(ct));
        return doc.RootElement
            .GetProperty("choices")[0]
            .GetProperty("message")
            .GetProperty("content")
            .GetString() ?? string.Empty;
    }
}
