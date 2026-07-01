using System.Text.Json.Serialization;

namespace Smartboard.Api.Models.Dto;

public sealed class LmsQuestionResponseDto
{
    [JsonPropertyName("id")]
    public long Id { get; set; }

    [JsonPropertyName("question_text")]
    public string QuestionText { get; set; } = null!;

    [JsonPropertyName("question_type")]
    public string QuestionType { get; set; } = null!;

    [JsonPropertyName("options")]
    public string[]? Options { get; set; }

    [JsonPropertyName("answer_text")]
    public string? AnswerText { get; set; }

    [JsonPropertyName("solution_text")]
    public string? SolutionText { get; set; }

    [JsonPropertyName("hint_text")]
    public string? HintText { get; set; }

    [JsonPropertyName("difficulty")]
    public int Difficulty { get; set; }

    [JsonPropertyName("marks")]
    public int? Marks { get; set; }

    [JsonPropertyName("source")]
    public string? Source { get; set; }

    [JsonPropertyName("is_verified")]
    public bool IsVerified { get; set; }

    [JsonPropertyName("source_ref")]
    public string? SourceRef { get; set; }
}
