using Smartboard.Api.Models.Dto;

namespace Smartboard.Api.Services.Dev;

/// <summary>
/// Development-only KBot curriculum service with realistic seed data.
/// Replaced by KBotCurriculumService (Mukesh) in Production.
/// </summary>
public sealed class DevKBotCurriculumService : IKBotCurriculumService
{
    private static readonly BoardDto[] _boards =
    [
        new("cbse", "CBSE India", "India"),
        new("icse", "ICSE India", "India"),
        new("bseb", "Bihar State Board", "India"),
    ];

    private static readonly GradeDto[] _grades =
    [
        new(9, "Grade 9"), new(10, "Grade 10"), new(11, "Grade 11"), new(12, "Grade 12"),
    ];

    private static readonly KBotSubjectDto[] _subjects =
    [
        new("mathematics", "Mathematics", "#F59E0B"),
        new("physics", "Physics", "#3B82F6"),
        new("chemistry", "Chemistry", "#10B981"),
        new("biology", "Biology", "#84CC16"),
    ];

    private static readonly ChapterDto[] _chapters =
    [
        new(171, 1, "Real Numbers", 10, "mathematics", "cbse"),
        new(172, 2, "Polynomials", 10, "mathematics", "cbse"),
        new(180, 1, "Units and Measurement", 11, "physics", "cbse"),
        new(181, 2, "Motion in a Straight Line", 11, "physics", "cbse"),
    ];

    private static readonly KBotTopicDto[] _topics =
    [
        new(541, "g10_real_numbers_euclid", "Euclid's Division Lemma", 171, 2),
        new(542, "g10_polynomials_zeros", "Zeros of a Polynomial", 172, 2),
        new(543, "g11_units_measurement", "Units, Dimensions and Significant Figures", 180, 4),
        new(544, "g11_motion_equations", "Equations of Motion", 181, 3),
    ];

    private static readonly RagSnippetDto[] _snippets =
    [
        new("Units and Dimensions are the foundation of physical measurement. SI units define the international standard.", 54, 54),
        new("Significant figures represent the precision of a measurement and must be preserved during calculations.", 54, 54),
        new("Dimensional analysis helps verify equations and convert between unit systems.", 54, 54),
    ];

    public Task<IReadOnlyList<BoardDto>> GetBoardsAsync(CancellationToken ct = default)
        => Task.FromResult<IReadOnlyList<BoardDto>>(_boards);

    public Task<IReadOnlyList<GradeDto>> GetGradesAsync(string? board, string? subject, CancellationToken ct = default)
        => Task.FromResult<IReadOnlyList<GradeDto>>(_grades);

    public Task<IReadOnlyList<KBotSubjectDto>> GetSubjectsAsync(string? board, int? grade, CancellationToken ct = default)
        => Task.FromResult<IReadOnlyList<KBotSubjectDto>>(_subjects);

    public Task<IReadOnlyList<ChapterDto>> GetChaptersAsync(string? board, int? grade, string? subject, CancellationToken ct = default)
    {
        var filtered = _chapters.AsEnumerable();
        if (board is not null) filtered = filtered.Where(c => c.Board == board);
        if (grade is not null) filtered = filtered.Where(c => c.Grade == grade);
        if (subject is not null) filtered = filtered.Where(c => c.Subject == subject);
        return Task.FromResult<IReadOnlyList<ChapterDto>>(filtered.ToList());
    }

    public Task<IReadOnlyList<KBotTopicDto>> GetTopicsAsync(int? chapterId, string? board, int? grade, string? subject, CancellationToken ct = default)
    {
        var filtered = _topics.AsEnumerable();
        if (chapterId is not null) filtered = filtered.Where(t => t.ChapterId == chapterId);
        return Task.FromResult<IReadOnlyList<KBotTopicDto>>(filtered.ToList());
    }

    public Task<IReadOnlyList<RagSnippetDto>> GetRagSnippetsAsync(string slug, int max = 5, CancellationToken ct = default)
        => Task.FromResult<IReadOnlyList<RagSnippetDto>>(_snippets.Take(max).ToList());
}
