using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Options;
using Smartboard.Api.Infrastructure;

namespace Smartboard.Api.HttpClients;

/// <summary>Provider-agnostic message. Pass ImageBase64 for vision requests.</summary>
public sealed record AiMessage(
    string Text,
    string? ImageBase64 = null,
    string  ImageMediaType = "image/jpeg");

public interface IAiClient
{
    Task<string> ChatAsync(string systemPrompt, AiMessage message, CancellationToken ct = default);
}

// ── OpenAI-compatible (DeepSeek + OpenAI share the same wire format) ──────────

public sealed class OpenAiCompatibleAiClient : IAiClient
{
    private readonly HttpClient _http;
    private readonly AiOptions  _opts;

    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        PropertyNamingPolicy       = JsonNamingPolicy.SnakeCaseLower,
        DefaultIgnoreCondition     = JsonIgnoreCondition.WhenWritingNull,
    };

    public OpenAiCompatibleAiClient(HttpClient http, IOptions<AiOptions> opts)
    {
        _opts = opts.Value;
        var cfg = _opts.Active;
        _http = http;
        _http.BaseAddress = new Uri(cfg.BaseUrl.TrimEnd('/') + '/');
        if (!string.IsNullOrWhiteSpace(cfg.ApiKey))
            _http.DefaultRequestHeaders.Authorization =
                new AuthenticationHeaderValue("Bearer", cfg.ApiKey);
    }

    public async Task<string> ChatAsync(string systemPrompt, AiMessage message, CancellationToken ct = default)
    {
        var cfg = _opts.Active;

        // Vision: array of content objects. Text-only: plain string.
        // Only send image if the configured model actually supports vision (cfg.Vision == true).
        object userContent = (string.IsNullOrEmpty(message.ImageBase64) || !cfg.Vision)
            ? (object)message.Text
            : new object[]
              {
                  new { type = "image_url", image_url = new { url = $"data:{message.ImageMediaType};base64,{message.ImageBase64}" } },
                  new { type = "text", text = message.Text },
              };

        var payload = JsonSerializer.Serialize(new
        {
            model    = cfg.Model,
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

// ── Anthropic Claude (Messages API — different wire format) ──────────────────

public sealed class AnthropicAiClient : IAiClient
{
    private readonly HttpClient _http;
    private readonly AiOptions  _opts;

    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        PropertyNamingPolicy   = JsonNamingPolicy.SnakeCaseLower,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    public AnthropicAiClient(HttpClient http, IOptions<AiOptions> opts)
    {
        _opts = opts.Value;
        var cfg = _opts.Active;
        _http = http;
        _http.BaseAddress = new Uri(
            string.IsNullOrWhiteSpace(cfg.BaseUrl)
                ? "https://api.anthropic.com/v1/"
                : cfg.BaseUrl.TrimEnd('/') + '/');
        if (!string.IsNullOrWhiteSpace(cfg.ApiKey))
            _http.DefaultRequestHeaders.Add("x-api-key", cfg.ApiKey);
        _http.DefaultRequestHeaders.Add("anthropic-version", "2023-06-01");
    }

    public async Task<string> ChatAsync(string systemPrompt, AiMessage message, CancellationToken ct = default)
    {
        var cfg = _opts.Active;

        // Claude content array: image first (if any, and only if Vision is enabled), then text
        var contentItems = new List<object>();
        if (!string.IsNullOrEmpty(message.ImageBase64) && cfg.Vision)
        {
            contentItems.Add(new
            {
                type   = "image",
                source = new { type = "base64", media_type = message.ImageMediaType, data = message.ImageBase64 },
            });
        }
        contentItems.Add(new { type = "text", text = message.Text });

        var payload = JsonSerializer.Serialize(new
        {
            model      = cfg.Model,
            max_tokens = 1024,
            system     = systemPrompt,
            messages   = new[] { new { role = "user", content = (object)contentItems } },
        }, JsonOpts);

        using var req = new HttpRequestMessage(HttpMethod.Post, new Uri(_http.BaseAddress!, "messages"))
        {
            Content = new StringContent(payload, Encoding.UTF8, "application/json"),
        };

        var resp = await _http.SendAsync(req, ct);
        resp.EnsureSuccessStatusCode();

        using var doc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync(ct));
        return doc.RootElement
            .GetProperty("content")[0]
            .GetProperty("text")
            .GetString() ?? string.Empty;
    }
}

