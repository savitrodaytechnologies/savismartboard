using Smartboard.Api.HttpClients;
using Smartboard.Api.Models.Dto;

namespace Smartboard.Api.Services;

public interface ISmartboardContextService
{
    Task<TeacherContextDto> GetContextAsync(CancellationToken ct = default);
    Task<IReadOnlyList<ClassDto>> GetClassesAsync(CancellationToken ct = default);
    Task<IReadOnlyList<SectionDto>> GetSectionsAsync(int classId, CancellationToken ct = default);
    Task<IReadOnlyList<SubjectDto>> GetSubjectsAsync(int classId, CancellationToken ct = default);
    Task<IReadOnlyList<TopicDto>> GetTopicsAsync(int subjectId, int classId, CancellationToken ct = default);
    Task MarkTopicTaughtAsync(int topicId, CancellationToken ct = default);
}

// TODO: Manohar — implement against the real Savischools API.
public sealed class SmartboardContextService : ISmartboardContextService
{
    private readonly ISavischoolsClient _client;
    public SmartboardContextService(ISavischoolsClient client) => _client = client;

    public Task<TeacherContextDto> GetContextAsync(CancellationToken ct = default)
        => Task.FromResult(new TeacherContextDto(0, 0, "TBD", "TBD"));

    public Task<IReadOnlyList<ClassDto>> GetClassesAsync(CancellationToken ct = default)
        => Task.FromResult<IReadOnlyList<ClassDto>>(Array.Empty<ClassDto>());

    public Task<IReadOnlyList<SectionDto>> GetSectionsAsync(int classId, CancellationToken ct = default)
        => Task.FromResult<IReadOnlyList<SectionDto>>(Array.Empty<SectionDto>());

    public Task<IReadOnlyList<SubjectDto>> GetSubjectsAsync(int classId, CancellationToken ct = default)
        => Task.FromResult<IReadOnlyList<SubjectDto>>(Array.Empty<SubjectDto>());

    public Task<IReadOnlyList<TopicDto>> GetTopicsAsync(int subjectId, int classId, CancellationToken ct = default)
        => Task.FromResult<IReadOnlyList<TopicDto>>(Array.Empty<TopicDto>());

    public Task MarkTopicTaughtAsync(int topicId, CancellationToken ct = default) => Task.CompletedTask;
}
