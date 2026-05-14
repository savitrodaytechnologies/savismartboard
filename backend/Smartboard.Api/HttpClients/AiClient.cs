using Microsoft.Extensions.Options;
using Smartboard.Api.Infrastructure;

namespace Smartboard.Api.HttpClients;

public interface IAiClient
{
    // TODO: Parivesh — define the AI provider contract methods.
    Task<HttpResponseMessage> PostAsync(string path, HttpContent content, CancellationToken ct = default);
}

public sealed class AiClient : IAiClient
{
    private readonly HttpClient _http;

    public AiClient(HttpClient http, IOptions<AiOptions> opts)
    {
        _http = http;
        _http.BaseAddress = new Uri(opts.Value.BaseUrl);
    }

    public Task<HttpResponseMessage> PostAsync(string path, HttpContent content, CancellationToken ct = default)
        => _http.PostAsync(path, content, ct);
}
