using Polly;
using Polly.Extensions.Http;

namespace Smartboard.Api.Infrastructure;

public static class HttpPolicies
{
    public static IAsyncPolicy<HttpResponseMessage> Retry() =>
        HttpPolicyExtensions
            .HandleTransientHttpError()
            .WaitAndRetryAsync(3, attempt => TimeSpan.FromMilliseconds(200 * Math.Pow(2, attempt)));
}
