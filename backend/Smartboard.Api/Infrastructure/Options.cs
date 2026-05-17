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

public sealed class AiOptions
{
    public string BaseUrl { get; set; } = "";
    public string Model { get; set; } = "";
    public decimal MonthlyBudgetUsd { get; set; }
}

public sealed class S3Options
{
    public string BucketName { get; set; } = "savismartboard-sessions";
    public string Region { get; set; } = "ap-south-1";
}
