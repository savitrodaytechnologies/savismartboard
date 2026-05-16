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
        [501] = new(501, "A train travels 180 km in 3 hours. What is its average speed?", "numerical", null, "60 km/h", 2, "ncert_exercise", false),
        [502] = new(502, "Solve: 3x − 7 = 2x + 5", "numerical", null, "12", 2, "ncert_exercise", false),
        [503] = new(503, "A body of mass 5 kg is moving with velocity 10 m/s. Calculate its kinetic energy.", "numerical", null, "250 J", 3, "ncert_exercise", false),
        [504] = new(504, "Two forces 30 N and 40 N act at right angles. Find the resultant.", "numerical", null, "50 N", 3, "ncert_exercise", false),
        [505] = new(505, "Derive the second equation of motion from first principles.", "long_answer", null, null, 4, "ncert_exercise", false),
    };

    private static readonly Dictionary<long, ExplanationDto> _explanations = new()
    {
        [501] = new(501, "<div class=\"kbot-card\"><p>Speed = Distance ÷ Time = 180 ÷ 3 = 60 km/h</p></div>", 501),
        [502] = new(502, "<div class=\"kbot-card\"><p>Move terms: 3x − 2x = 5 + 7 → x = 12</p></div>", 502),
        [503] = new(503, "<div class=\"kbot-card\"><p>KE = ½mv² = ½ × 5 × 100 = 250 J</p></div>", 503),
        [504] = new(504, "<div class=\"kbot-card\"><p>Resultant = √(30² + 40²) = √2500 = 50 N</p></div>", 504),
        [505] = new(505, "<div class=\"kbot-card\"><p>Using v = u + at, integrate to get s = ut + ½at²</p></div>", 505),
    };

    private static readonly Dictionary<long, SolvedCardDto> _solved = new()
    {
        [501] = new(501, "<div class=\"kbot-card\"><ol><li>Identify: Distance = 180 km, Time = 3 h</li><li>Formula: Speed = Distance / Time</li><li>Calculate: 180 / 3 = <strong>60 km/h</strong></li></ol></div>", 501),
        [502] = new(502, "<div class=\"kbot-card\"><ol><li>3x − 7 = 2x + 5</li><li>3x − 2x = 5 + 7</li><li>x = <strong>12</strong></li></ol></div>", 502),
        [503] = new(503, "<div class=\"kbot-card\"><ol><li>Given: m = 5 kg, v = 10 m/s</li><li>KE = ½mv²</li><li>KE = ½ × 5 × 10² = <strong>250 J</strong></li></ol></div>", 503),
        [504] = new(504, "<div class=\"kbot-card\"><ol><li>Forces are perpendicular — use Pythagoras</li><li>R = √(30² + 40²)</li><li>R = √2500 = <strong>50 N</strong></li></ol></div>", 504),
    };

    public Task<IReadOnlyList<QuestionSummaryDto>> GetQuestionsAsync(string slug, int? difficulty, CancellationToken ct = default)
    {
        var all = _questions.Values
            .Select(q => new QuestionSummaryDto(q.QuestionId, q.QuestionType, q.Difficulty,
                q.QuestionText[..Math.Min(80, q.QuestionText.Length)] + "…", q.Source))
            .Where(q => difficulty is null || q.Difficulty == difficulty)
            .ToList();
        return Task.FromResult<IReadOnlyList<QuestionSummaryDto>>(all);
    }

    public Task<QuestionDto?> GetQuestionAsync(long questionId, CancellationToken ct = default)
        => Task.FromResult<QuestionDto?>(_questions.GetValueOrDefault(questionId));

    public Task<ExplanationDto?> GetExplanationAsync(long questionId, CancellationToken ct = default)
        => Task.FromResult<ExplanationDto?>(_explanations.GetValueOrDefault(questionId));

    public Task<SolvedCardDto?> GetSolvedCardAsync(long questionId, CancellationToken ct = default)
        => Task.FromResult<SolvedCardDto?>(_solved.GetValueOrDefault(questionId));

    public Task<QuestionSubmitResponseDto> SubmitQuestionsAsync(string slug, QuestionSubmitRequestDto request, CancellationToken ct = default)
    {
        // Dev: pretend all submitted questions were saved, returning fake IDs starting at 9000
        var ids = Enumerable.Range(9000, request.Questions.Count).Select(i => (long)i).ToList();
        return Task.FromResult(new QuestionSubmitResponseDto(request.Questions.Count, ids));
    }
}
