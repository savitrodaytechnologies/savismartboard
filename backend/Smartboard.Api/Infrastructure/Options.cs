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
    public string BaseUrl  { get; set; } = "";
    public string ApiKey   { get; set; } = "";
    public string Model    { get; set; } = "";
    /// <summary>True only for models that accept image content (e.g. gpt-4o, claude-3+). DeepSeek text models do NOT support vision.</summary>
    public bool   Vision   { get; set; } = false;
    /// <summary>"openai" for OpenAI-compatible API (DeepSeek, OpenAI); "anthropic" for Anthropic Messages API.</summary>
    public string Protocol { get; set; } = "openai";
}

public sealed class AiOptions
{
    /// <summary>Provider used for all text-only calls (no image). Default: deepseek.</summary>
    public string  TextProvider     { get; set; } = "deepseek";
    /// <summary>Provider used when a lasso image is attached. Must be a Vision-capable provider. Default: copilot.</summary>
    public string  VisionProvider   { get; set; } = "copilot";
    public decimal MonthlyBudgetUsd { get; set; }
    public Dictionary<string, AiProviderConfig> Providers { get; set; } =
        new(StringComparer.OrdinalIgnoreCase);

    public AiProviderConfig GetProvider(string name) =>
        Providers.TryGetValue(name, out var p)
            ? p
            : throw new InvalidOperationException($"No AI provider config for '{name}'.");
}

public sealed class S3Options
{
    public string BucketName { get; set; } = "savismartboard-sessions";
    public string Region { get; set; } = "ap-south-1";
}
