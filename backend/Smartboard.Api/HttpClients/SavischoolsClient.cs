using System.Net.Http.Json;
using Microsoft.Extensions.Options;
using Smartboard.Api.Infrastructure;

namespace Smartboard.Api.HttpClients;

public interface ISavischoolsClient
{
    Task<HttpResponseMessage> GetAsync(string path, CancellationToken ct = default);
    Task<HttpResponseMessage> GetMeAsync(CancellationToken ct = default);
    Task<HttpResponseMessage> PostAsync<T>(string path, T body, CancellationToken ct = default);
}

public sealed class SavischoolsClient : ISavischoolsClient
{
    private readonly HttpClient _http;
    private readonly IHttpContextAccessor _httpContext;

    public SavischoolsClient(HttpClient http, IOptions<SavischoolsOptions> opts, IHttpContextAccessor httpContext)
    {
        _http = http;
        _httpContext = httpContext;
        _http.BaseAddress = new Uri(opts.Value.BaseUrl);
    }

    public Task<HttpResponseMessage> GetAsync(string path, CancellationToken ct = default)
        => SendAsync(HttpMethod.Get, path, null, ct);

    public Task<HttpResponseMessage> GetMeAsync(CancellationToken ct = default)
        => SendAsync(HttpMethod.Get, "api/users/me", null, ct);

    public Task<HttpResponseMessage> PostAsync<T>(string path, T body, CancellationToken ct = default)
        => SendAsync(HttpMethod.Post, path, JsonContent.Create(body), ct);

    private Task<HttpResponseMessage> SendAsync(HttpMethod method, string path, HttpContent? content, CancellationToken ct)
    {
        var request = new HttpRequestMessage(method, path) { Content = content };
        var auth = _httpContext.HttpContext?.Request.Headers["Authorization"].ToString();
        if (!string.IsNullOrEmpty(auth))
            request.Headers.TryAddWithoutValidation("Authorization", auth);
        request.Headers.TryAddWithoutValidation("X-Smartboard-Caller", "smartboard-api");
        return _http.SendAsync(request, ct);
    }
}
