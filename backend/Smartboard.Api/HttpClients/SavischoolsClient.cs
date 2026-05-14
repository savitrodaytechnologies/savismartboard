using Microsoft.Extensions.Options;
using Smartboard.Api.Infrastructure;

namespace Smartboard.Api.HttpClients;

public interface ISavischoolsClient
{
    // TODO: Manohar — define the upstream contract methods.
    Task<HttpResponseMessage> GetAsync(string path, CancellationToken ct = default);
}

public sealed class SavischoolsClient : ISavischoolsClient
{
    private readonly HttpClient _http;

    public SavischoolsClient(HttpClient http, IOptions<SavischoolsOptions> opts)
    {
        _http = http;
        _http.BaseAddress = new Uri(opts.Value.BaseUrl);
    }

    public Task<HttpResponseMessage> GetAsync(string path, CancellationToken ct = default)
        => _http.GetAsync(path, ct);
}
