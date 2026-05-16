using Microsoft.Extensions.Options;
using Smartboard.Api.Infrastructure;

namespace Smartboard.Api.HttpClients;

public interface IKBotClient
{
    // TODO: Mukesh — confirmed with KBot API spec (see docs/kbot-smartboard-integration.md).
    Task<HttpResponseMessage> GetAsync(string path, CancellationToken ct = default);
    Task<HttpResponseMessage> PostAsync(string path, HttpContent content, CancellationToken ct = default);
}

public sealed class KBotClient : IKBotClient
{
    private readonly HttpClient _http;
    private readonly IHttpContextAccessor _httpCtx;

    public KBotClient(HttpClient http, IOptions<KBotOptions> opts, IHttpContextAccessor httpCtx)
    {
        _http = http;
        _http.BaseAddress = new Uri(opts.Value.BaseUrl);
        _httpCtx = httpCtx;
    }

    /// <summary>Forwards the incoming Savischools JWT to KBot on every outbound request.</summary>
    private void AttachBearerToken(HttpRequestMessage req)
    {
        var auth = _httpCtx.HttpContext?.Request.Headers.Authorization.FirstOrDefault();
        if (auth is not null)
            req.Headers.TryAddWithoutValidation("Authorization", auth);
    }

    public async Task<HttpResponseMessage> GetAsync(string path, CancellationToken ct = default)
    {
        var req = new HttpRequestMessage(HttpMethod.Get, path);
        AttachBearerToken(req);
        return await _http.SendAsync(req, ct);
    }

    public async Task<HttpResponseMessage> PostAsync(string path, HttpContent content, CancellationToken ct = default)
    {
        var req = new HttpRequestMessage(HttpMethod.Post, path) { Content = content };
        AttachBearerToken(req);
        return await _http.SendAsync(req, ct);
    }
}
