using System.Text.Json.Serialization;

namespace Smartboard.Api.Models.Dto;

public sealed class LmsTokenRequestDto
{
    [JsonPropertyName("schoolId")]
    public string SchoolId { get; set; } = string.Empty;


    [JsonPropertyName("apiKey")]
    public string ApiKey { get; set; } = string.Empty;

    [JsonPropertyName("secretKey")]
    public string? SecretKey { get; set; }

    [JsonPropertyName("domainName")]
    public string? DomainName { get; set; }
}

public sealed class LmsTokenResponseDto
{
    [JsonPropertyName("success")]
    public bool Success { get; set; }

    [JsonPropertyName("message")]
    public string Message { get; set; } = string.Empty;

    [JsonPropertyName("token")]
    public string? Token { get; set; }

    [JsonPropertyName("schoolId")]
    public string? SchoolId { get; set; }

    [JsonPropertyName("schoolName")]
    public string? SchoolName { get; set; }

    [JsonPropertyName("schoolAddress")]
    public string? SchoolAddress { get; set; }

    [JsonPropertyName("schoolPhone")]
    public string? SchoolPhone { get; set; }

    public LmsTokenResponseDto() { }

    public LmsTokenResponseDto(bool success, string message, string? token, string? schoolId, string? schoolName, string? schoolAddress, string? schoolPhone)
    {
        Success = success;
        Message = message;
        Token = token;
        SchoolId = schoolId;
        SchoolName = schoolName;
        SchoolAddress = schoolAddress;
        SchoolPhone = schoolPhone;
    }
}


