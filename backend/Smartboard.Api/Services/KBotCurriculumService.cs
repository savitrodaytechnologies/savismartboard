using Smartboard.Api.HttpClients;
using Smartboard.Api.Models.Dto;

namespace Smartboard.Api.Services;

public interface IKBotCurriculumService
{
    /// <summary>GET /boards</summary>
    Task<IReadOnlyList<BoardDto>> GetBoardsAsync(CancellationToken ct = default);

    /// <summary>GET /grades?board={code}&amp;subject={code}</summary>
    Task<IReadOnlyList<GradeDto>> GetGradesAsync(string? board, string? subject, CancellationToken ct = default);

    /// <summary>GET /subjects?board={code}&amp;grade={int}</summary>
    Task<IReadOnlyList<KBotSubjectDto>> GetSubjectsAsync(string? board, int? grade, CancellationToken ct = default);

    /// <summary>GET /chapters?board={code}&amp;grade={int}&amp;subject={code}</summary>
    Task<IReadOnlyList<ChapterDto>> GetChaptersAsync(string? board, int? grade, string? subject, CancellationToken ct = default);

    /// <summary>GET /topics?chapter_id={int}&amp;board={code}&amp;grade={int}&amp;subject={code}</summary>
    Task<IReadOnlyList<KBotTopicDto>> GetTopicsAsync(int? chapterId, string? board, int? grade, string? subject, CancellationToken ct = default);

    /// <summary>GET /topic/{slug}/rag-snippets?max={int} — plain-text excerpts for LLM grounding.</summary>
    Task<IReadOnlyList<RagSnippetDto>> GetRagSnippetsAsync(string slug, int max = 5, CancellationToken ct = default);
}

// TODO: Mukesh — implement against the real KBot API (see docs/kbot-smartboard-integration.md §2 and §6).
public sealed class KBotCurriculumService : IKBotCurriculumService
{
    private readonly IKBotClient _client;
    public KBotCurriculumService(IKBotClient client) => _client = client;

    public Task<IReadOnlyList<BoardDto>> GetBoardsAsync(CancellationToken ct = default)
        => Task.FromResult<IReadOnlyList<BoardDto>>(Array.Empty<BoardDto>());

    public Task<IReadOnlyList<GradeDto>> GetGradesAsync(string? board, string? subject, CancellationToken ct = default)
        => Task.FromResult<IReadOnlyList<GradeDto>>(Array.Empty<GradeDto>());

    public Task<IReadOnlyList<KBotSubjectDto>> GetSubjectsAsync(string? board, int? grade, CancellationToken ct = default)
        => Task.FromResult<IReadOnlyList<KBotSubjectDto>>(Array.Empty<KBotSubjectDto>());

    public Task<IReadOnlyList<ChapterDto>> GetChaptersAsync(string? board, int? grade, string? subject, CancellationToken ct = default)
        => Task.FromResult<IReadOnlyList<ChapterDto>>(Array.Empty<ChapterDto>());

    public Task<IReadOnlyList<KBotTopicDto>> GetTopicsAsync(int? chapterId, string? board, int? grade, string? subject, CancellationToken ct = default)
        => Task.FromResult<IReadOnlyList<KBotTopicDto>>(Array.Empty<KBotTopicDto>());

    public Task<IReadOnlyList<RagSnippetDto>> GetRagSnippetsAsync(string slug, int max = 5, CancellationToken ct = default)
        => Task.FromResult<IReadOnlyList<RagSnippetDto>>(Array.Empty<RagSnippetDto>());
}
