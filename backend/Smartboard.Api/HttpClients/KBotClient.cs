using Microsoft.Extensions.Options;
using Smartboard.Api.Infrastructure;

namespace Smartboard.Api.HttpClients;

public interface IKBotClient
{
    // TODO: Mukesh — define the upstream KBot contract methods.
    Task<HttpResponseMessage> GetAsync(string path, CancellationToken ct = default);
}

public sealed class KBotClient : IKBotClient
{
    private readonly HttpClient _http;

    public KBotClient(HttpClient http, IOptions<KBotOptions> opts)
    {
        _http = http;
        _http.BaseAddress = new Uri(opts.Value.BaseUrl);
    }

    public Task<HttpResponseMessage> GetAsync(string path, CancellationToken ct = default)
        => _http.GetAsync(path, ct);
}
