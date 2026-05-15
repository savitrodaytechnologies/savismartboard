using Smartboard.Api.Models.Dto;

namespace Smartboard.Api.Services.Dev;

/// <summary>
/// Development-only KBot question service. Returns realistic hardcoded questions.
/// Replaced by KBotQuestionService (Mukesh) in Production.
/// </summary>
public sealed class DevKBotQuestionService : IKBotQuestionService
{
    private static readonly Dictionary<long, QuestionDto> _questions = new()
    {
        [501] = new(501, "A train travels 180 km in 3 hours. What is its average speed?", "Easy"),
        [502] = new(502, "Solve: 3x − 7 = 2x + 5", "Easy"),
        [503] = new(503, "A body of mass 5 kg is moving with velocity 10 m/s. Calculate its kinetic energy.", "Medium"),
        [504] = new(504, "Two forces 30 N and 40 N act at right angles. Find the resultant.", "Medium"),
        [505] = new(505, "Derive the second equation of motion from first principles.", "Hard"),
    };

    private static readonly Dictionary<long, BasicExplanationDto> _explanations = new()
    {
        [501] = new(501, "Speed = Distance ÷ Time = 180 ÷ 3 = 60 km/h"),
        [502] = new(502, "Move terms: 3x − 2x = 5 + 7 → x = 12"),
        [503] = new(503, "KE = ½mv² = ½ × 5 × 100 = 250 J"),
        [504] = new(504, "Resultant = √(30² + 40²) = √(900 + 1600) = √2500 = 50 N"),
        [505] = new(505, "Using v = u + at, integrate to get s = ut + ½at²"),
    };

    private static readonly Dictionary<long, SolvedCardDto> _solved = new()
    {
        [501] = new(501,
            "<ol><li>Identify: Distance = 180 km, Time = 3 h</li><li>Formula: Speed = Distance / Time</li><li>Calculate: 180 / 3 = <strong>60 km/h</strong></li></ol>",
            VersionId: 1),
        [502] = new(502,
            "<ol><li>3x − 7 = 2x + 5</li><li>3x − 2x = 5 + 7</li><li>x = <strong>12</strong></li></ol>",
            VersionId: 1),
        [503] = new(503,
            "<ol><li>Given: m = 5 kg, v = 10 m/s</li><li>KE = ½mv²</li><li>KE = ½ × 5 × 10² = ½ × 500 = <strong>250 J</strong></li></ol>",
            VersionId: 1),
        [504] = new(504,
            "<ol><li>Forces are perpendicular: use Pythagoras</li><li>R = √(30² + 40²)</li><li>R = √2500 = <strong>50 N</strong></li></ol>",
            VersionId: 1),
    };

    public Task<IReadOnlyList<QuestionSummaryDto>> GetQuestionsAsync(long topicId, string? difficulty, CancellationToken ct = default)
    {
        var all = _questions.Values
            .Select(q => new QuestionSummaryDto(q.QuestionId, q.Difficulty, q.Body[..Math.Min(80, q.Body.Length)] + "…"))
            .Where(q => difficulty is null || q.Difficulty.Equals(difficulty, StringComparison.OrdinalIgnoreCase))
            .ToList();
        return Task.FromResult<IReadOnlyList<QuestionSummaryDto>>(all);
    }

    public Task<QuestionDto?> GetQuestionAsync(long questionId, CancellationToken ct = default)
        => Task.FromResult<QuestionDto?>(_questions.GetValueOrDefault(questionId));

    public Task<BasicExplanationDto?> GetBasicExplanationAsync(long questionId, CancellationToken ct = default)
        => Task.FromResult<BasicExplanationDto?>(_explanations.GetValueOrDefault(questionId));

    public Task<SolvedCardDto?> GetSolvedCardAsync(long questionId, CancellationToken ct = default)
        => Task.FromResult<SolvedCardDto?>(_solved.GetValueOrDefault(questionId));
}
