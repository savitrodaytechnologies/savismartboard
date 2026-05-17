namespace Smartboard.Api.Infrastructure;

public sealed class SavischoolsOptions
{
    public string BaseUrl { get; set; } = "";
    public JwtOptions Jwt { get; set; } = new();
    public sealed class JwtOptions
    {
        public string Authority { get; set; } = "";
        public string Audience { get; set; } = "";
    }
}

public sealed class KBotOptions
{
    public string BaseUrl { get; set; } = "";
}

public sealed class AiProviderConfig
{
    public string BaseUrl { get; set; } = "";
    public string ApiKey  { get; set; } = "";
    public string Model   { get; set; } = "";
}

public sealed class AiOptions
{
    public string  ActiveProvider  { get; set; } = "deepseek";
    public decimal MonthlyBudgetUsd { get; set; }
    public Dictionary<string, AiProviderConfig> Providers { get; set; } =
        new(StringComparer.OrdinalIgnoreCase);

    /// <summary>Returns the config block for the currently active provider.</summary>
    public AiProviderConfig Active =>
        Providers.TryGetValue(ActiveProvider, out var p)
            ? p
            : throw new InvalidOperationException($"No AI provider config for '{ActiveProvider}'.");
}

public sealed class S3Options
{
    public string BucketName { get; set; } = "savismartboard-sessions";
    public string Region { get; set; } = "ap-south-1";
}
