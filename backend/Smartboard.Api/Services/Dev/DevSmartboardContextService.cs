using Smartboard.Api.Models.Dto;

namespace Smartboard.Api.Services.Dev;

/// <summary>
/// Development-only context service. Returns realistic hardcoded school data
/// so Parivesh can develop the smartboard core without Savischools running.
/// Replaced by SmartboardContextService (Manohar) in Production.
/// </summary>
public sealed class DevSmartboardContextService : ISmartboardContextService
{
    private static readonly TeacherContextDto _ctx =
        new(SchoolId: 1, TeacherId: 101, SchoolName: "Demo Public School", TeacherName: "Parivesh (Dev)");

    private static readonly IReadOnlyList<ClassDto> _classes =
    [
        new(1, "Class 8"),
        new(2, "Class 9"),
        new(3, "Class 10")
    ];

    private static readonly Dictionary<int, IReadOnlyList<SectionDto>> _sections = new()
    {
        [1] = [new(11, "8-A"), new(12, "8-B")],
        [2] = [new(21, "9-A"), new(22, "9-B"), new(23, "9-C")],
        [3] = [new(31, "10-A"), new(32, "10-B")]
    };

    private static readonly Dictionary<int, IReadOnlyList<SubjectDto>> _subjects = new()
    {
        [1] = [new(101, "Mathematics"), new(102, "Science")],
        [2] = [new(201, "Mathematics"), new(202, "Physics"), new(203, "Chemistry")],
        [3] = [new(301, "Mathematics"), new(302, "Physics"), new(303, "Chemistry"), new(304, "Biology")]
    };

    private static readonly Dictionary<int, IReadOnlyList<TopicDto>> _topics = new()
    {
        [101] = [new(1001, "Fractions and Decimals",   101), new(1002, "Linear Equations",     101), new(1003, "Basic Geometry",        101)],
        [102] = [new(1011, "Light and Optics",         102), new(1012, "Force and Motion",      102), new(1013, "Matter and Its States", 102)],
        [201] = [new(2001, "Polynomials",               201), new(2002, "Quadratic Equations",  201), new(2003, "Coordinate Geometry",   201)],
        [202] = [new(2011, "Laws of Motion",            202), new(2012, "Work and Energy",      202), new(2013, "Gravitation",           202)],
        [203] = [new(2021, "Atoms and Molecules",       203), new(2022, "Chemical Reactions",   203), new(2023, "Acids, Bases & Salts",  203)],
        [301] = [new(3001, "Real Numbers",              301), new(3002, "Pair of Linear Equations", 301), new(3003, "Circles",           301)],
        [302] = [new(3011, "Electricity",               302), new(3012, "Magnetic Effects",     302), new(3013, "Light — Reflection",   302)],
        [303] = [new(3021, "Chemical Equations",        303), new(3022, "Acids and Bases",      303), new(3023, "Metals and Non-metals", 303)],
        [304] = [new(3031, "Life Processes",            304), new(3032, "Control and Coordination", 304), new(3033, "Heredity",         304)]
    };

    public Task<TeacherContextDto> GetContextAsync(CancellationToken ct = default)
        => Task.FromResult(_ctx);

    public Task<IReadOnlyList<ClassDto>> GetClassesAsync(CancellationToken ct = default)
        => Task.FromResult(_classes);

    public Task<IReadOnlyList<SectionDto>> GetSectionsAsync(int classId, CancellationToken ct = default)
        => Task.FromResult(_sections.GetValueOrDefault(classId, []));

    public Task<IReadOnlyList<SubjectDto>> GetSubjectsAsync(int classId, CancellationToken ct = default)
        => Task.FromResult(_subjects.GetValueOrDefault(classId, []));

    public Task<IReadOnlyList<TopicDto>> GetTopicsAsync(int subjectId, int classId, CancellationToken ct = default)
        => Task.FromResult(_topics.GetValueOrDefault(subjectId, []));

    public Task MarkTopicTaughtAsync(int topicId, CancellationToken ct = default)
        => Task.CompletedTask; // no-op in dev
}
