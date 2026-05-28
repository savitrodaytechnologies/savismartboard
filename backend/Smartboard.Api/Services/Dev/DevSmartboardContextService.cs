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
        new(SchoolId: 1, TeacherId: "00000000-0000-0000-0000-000000000001", SchoolName: "Demo Public School", TeacherName: "Parivesh (Dev)");

    private static readonly Guid _id8  = new("10000000-0000-0000-0000-000000000008");
    private static readonly Guid _id9  = new("10000000-0000-0000-0000-000000000009");
    private static readonly Guid _id10 = new("10000000-0000-0000-0000-000000000010");

    private static readonly IReadOnlyList<ClassDto> _classes =
    [
        new(_id8,  "Class 8"),
        new(_id9,  "Class 9"),
        new(_id10, "Class 10")
    ];

    private static readonly Dictionary<Guid, IReadOnlyList<SectionDto>> _sections = new()
    {
        [new("10000000-0000-0000-0000-000000000008")] = [new(11, "8-A"), new(12, "8-B")],
        [new("10000000-0000-0000-0000-000000000009")] = [new(21, "9-A"), new(22, "9-B"), new(23, "9-C")],
        [new("10000000-0000-0000-0000-000000000010")] = [new(31, "10-A"), new(32, "10-B")]
    };

    private static readonly Dictionary<Guid, IReadOnlyList<SubjectDto>> _subjects = new()
    {
        [new("10000000-0000-0000-0000-000000000008")] = [new(new Guid("30000000-0000-0000-0000-000000000101"), "Mathematics"), new(new Guid("30000000-0000-0000-0000-000000000102"), "Science")],
        [new("10000000-0000-0000-0000-000000000009")] = [new(new Guid("30000000-0000-0000-0000-000000000201"), "Mathematics"), new(new Guid("30000000-0000-0000-0000-000000000202"), "Physics"), new(new Guid("30000000-0000-0000-0000-000000000203"), "Chemistry")],
        [new("10000000-0000-0000-0000-000000000010")] = [new(new Guid("30000000-0000-0000-0000-000000000301"), "Mathematics"), new(new Guid("30000000-0000-0000-0000-000000000302"), "Physics"), new(new Guid("30000000-0000-0000-0000-000000000303"), "Chemistry"), new(new Guid("30000000-0000-0000-0000-000000000304"), "Biology")]
    };

    private static readonly Dictionary<Guid, IReadOnlyList<TopicDto>> _topics = new()
    {
        [new Guid("30000000-0000-0000-0000-000000000101")] = [new(1001, "Fractions and Decimals", new Guid("30000000-0000-0000-0000-000000000101"), "g9_fractions"), new(1002, "Linear Equations", new Guid("30000000-0000-0000-0000-000000000101"), "g9_linear_eq"), new(1003, "Basic Geometry", new Guid("30000000-0000-0000-0000-000000000101"), "g9_geometry")],
        [new Guid("30000000-0000-0000-0000-000000000102")] = [new(1011, "Light and Optics", new Guid("30000000-0000-0000-0000-000000000102"), "g9_light"), new(1012, "Force and Motion", new Guid("30000000-0000-0000-0000-000000000102"), "g9_force"), new(1013, "Matter and Its States", new Guid("30000000-0000-0000-0000-000000000102"), "g9_matter")],
        [new Guid("30000000-0000-0000-0000-000000000201")] = [new(2001, "Polynomials", new Guid("30000000-0000-0000-0000-000000000201"), "g10_polynomials"), new(2002, "Quadratic Equations", new Guid("30000000-0000-0000-0000-000000000201"), "g10_quadratic"), new(2003, "Coordinate Geometry", new Guid("30000000-0000-0000-0000-000000000201"), "g10_coord_geom")],
        [new Guid("30000000-0000-0000-0000-000000000202")] = [new(2011, "Laws of Motion", new Guid("30000000-0000-0000-0000-000000000202"), "g10_laws_motion"), new(2012, "Work and Energy", new Guid("30000000-0000-0000-0000-000000000202"), "g10_work_energy"), new(2013, "Gravitation", new Guid("30000000-0000-0000-0000-000000000202"), "g10_gravitation")],
        [new Guid("30000000-0000-0000-0000-000000000203")] = [new(2021, "Atoms and Molecules", new Guid("30000000-0000-0000-0000-000000000203"), "g10_atoms"), new(2022, "Chemical Reactions", new Guid("30000000-0000-0000-0000-000000000203"), "g10_chem_reactions"), new(2023, "Acids, Bases & Salts", new Guid("30000000-0000-0000-0000-000000000203"), "g10_acids_bases")],
        [new Guid("30000000-0000-0000-0000-000000000301")] = [new(3001, "Real Numbers", new Guid("30000000-0000-0000-0000-000000000301"), "g11_real_numbers"), new(3002, "Pair of Linear Equations", new Guid("30000000-0000-0000-0000-000000000301"), "g11_linear_eq"), new(3003, "Circles", new Guid("30000000-0000-0000-0000-000000000301"), "g11_circles")],
        [new Guid("30000000-0000-0000-0000-000000000302")] = [new(3011, "Electricity", new Guid("30000000-0000-0000-0000-000000000302"), "g11_electricity"), new(3012, "Magnetic Effects", new Guid("30000000-0000-0000-0000-000000000302"), "g11_magnetic"), new(3013, "Light — Reflection", new Guid("30000000-0000-0000-0000-000000000302"), "g11_light")],
        [new Guid("30000000-0000-0000-0000-000000000303")] = [new(3021, "Chemical Equations", new Guid("30000000-0000-0000-0000-000000000303"), "g11_chem_eq"), new(3022, "Acids and Bases", new Guid("30000000-0000-0000-0000-000000000303"), "g11_acids"), new(3023, "Metals and Non-metals", new Guid("30000000-0000-0000-0000-000000000303"), "g11_metals")],
        [new Guid("30000000-0000-0000-0000-000000000304")] = [new(3031, "Life Processes", new Guid("30000000-0000-0000-0000-000000000304"), "g11_life_proc"), new(3032, "Control and Coordination", new Guid("30000000-0000-0000-0000-000000000304"), "g11_control"), new(3033, "Heredity", new Guid("30000000-0000-0000-0000-000000000304"), "g11_heredity")]
    };

    public Task<TeacherContextDto> GetContextAsync(CancellationToken ct = default)
        => Task.FromResult(_ctx);

    public Task<IReadOnlyList<ClassDto>> GetClassesAsync(CancellationToken ct = default)
        => Task.FromResult(_classes);

    public Task<IReadOnlyList<SectionDto>> GetSectionsAsync(Guid classId, CancellationToken ct = default)
        => Task.FromResult(_sections.GetValueOrDefault(classId, []));

    public Task<IReadOnlyList<SubjectDto>> GetSubjectsAsync(Guid classId, CancellationToken ct = default)
        => Task.FromResult(_subjects.GetValueOrDefault(classId, []));

    public Task<IReadOnlyList<TopicDto>> GetTopicsAsync(Guid subjectId, Guid classId, CancellationToken ct = default)
        => Task.FromResult(_topics.GetValueOrDefault(subjectId, []));

    public Task MarkTopicTaughtAsync(int topicId, CancellationToken ct = default)
        => Task.CompletedTask; // no-op in dev
}
