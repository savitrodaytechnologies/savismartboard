using Smartboard.Api.Auth;
using Smartboard.Api.Infrastructure;
using Smartboard.Api.Models.Dto;
using Smartboard.Api.Repositories;

namespace Smartboard.Api.Services;

public interface ISmartboardSessionService
{
    Task<long> StartAsync(StartSessionRequest req, CancellationToken ct = default);
    Task<SessionDto?> GetAsync(long sessionId, CancellationToken ct = default);
    Task<IReadOnlyList<SessionDto>> GetRecentAsync(CancellationToken ct = default);
    Task SavePageAsync(long sessionId, SavePageRequest req, CancellationToken ct = default);
    Task EndAsync(long sessionId, CancellationToken ct = default);
    Task RenameAsync(long sessionId, string title, CancellationToken ct = default);
    Task DeleteAsync(long sessionId, CancellationToken ct = default);
    Task<string> ExportAsync(long sessionId, ExportRequest req, CancellationToken ct = default);
    Task<string> ShareAsync(long sessionId, ShareRequest req, CancellationToken ct = default);
}

public sealed class SmartboardSessionService : ISmartboardSessionService
{
    private readonly ISmartboardSessionRepository _repo;
    private readonly ITeacherContextAccessor _teacher;
    private readonly IS3PageArchiveService _archive;
    private readonly ILogger<SmartboardSessionService> _log;

    public SmartboardSessionService(
        ISmartboardSessionRepository repo,
        ITeacherContextAccessor teacher,
        IS3PageArchiveService archive,
        ILogger<SmartboardSessionService> log)
    {
        _repo = repo;
        _teacher = teacher;
        _archive = archive;
        _log = log;
    }

    public Task<long> StartAsync(StartSessionRequest req, CancellationToken ct = default)
        => _repo.CreateSessionAsync(_teacher.SchoolId, _teacher.TeacherId, req, ct);

    public async Task<SessionDto?> GetAsync(long sessionId, CancellationToken ct = default)
    {
        var session = await _repo.GetSessionAsync(_teacher.SchoolId, _teacher.TeacherId, sessionId, ct);
        if (session is null) return null;

        // Re-hydrate any pages whose PageJson was archived to S3 after the session ended.
        var archivedPages = session.Pages
            .Where(p => p.PageJson is null && p.PageJsonUrl is not null)
            .ToList();

        if (archivedPages.Count == 0) return session;

        var all = session.Pages.ToList();
        await Task.WhenAll(archivedPages.Select(async p =>
        {
            try
            {
                var json = await _archive.RestorePageAsync(p.PageJsonUrl!, ct);
                var idx = all.FindIndex(q => q.PageNo == p.PageNo);
                if (idx >= 0) all[idx] = p with { PageJson = json };
            }
            catch (Exception ex)
            {
                _log.LogWarning(ex, "Failed to restore page {PageNo} from S3 for session {SessionId}", p.PageNo, sessionId);
            }
        }));

        return session with { Pages = all };
    }

    public Task<IReadOnlyList<SessionDto>> GetRecentAsync(CancellationToken ct = default)
        => _repo.GetRecentSessionsAsync(_teacher.SchoolId, _teacher.TeacherId, ct);

    public Task SavePageAsync(long sessionId, SavePageRequest req, CancellationToken ct = default)
        => _repo.UpsertPageAsync(_teacher.SchoolId, _teacher.TeacherId, sessionId, req, ct);

    public async Task EndAsync(long sessionId, CancellationToken ct = default)
    {
        var schoolId = _teacher.SchoolId;
        var teacherId = _teacher.TeacherId;

        // Mark ended first — this is the critical state change.
        await _repo.EndSessionAsync(schoolId, teacherId, sessionId, ct);

        // Archive page blobs to S3 (best-effort — if S3 fails, PageJson stays in DB, no data loss).
        try
        {
            var session = await _repo.GetSessionAsync(schoolId, teacherId, sessionId, ct);
            if (session?.Pages is { Count: > 0 } pages)
            {
                var toArchive = pages.Where(p => p.PageJson is not null).ToList();
                var archived = new List<(int PageNo, string S3Key)>(toArchive.Count);

                foreach (var page in toArchive)
                {
                    var key = await _archive.ArchivePageAsync(sessionId, page.PageNo, page.PageJson!, ct);
                    archived.Add((page.PageNo, key));
                }

                if (archived.Count > 0)
                    await _repo.ArchiveSessionPagesAsync(sessionId, archived, ct);
            }
        }
        catch (Exception ex)
        {
            _log.LogWarning(ex,
                "S3 archival failed for session {SessionId} — PageJson retained in DB (no data loss)", sessionId);
        }
    }

    public Task RenameAsync(long sessionId, string title, CancellationToken ct = default)
        => _repo.RenameSessionAsync(_teacher.SchoolId, _teacher.TeacherId, sessionId, title, ct);

    public Task DeleteAsync(long sessionId, CancellationToken ct = default)
        => _repo.DeleteSessionAsync(_teacher.SchoolId, _teacher.TeacherId, sessionId, ct);

    public Task<string> ExportAsync(long sessionId, ExportRequest req, CancellationToken ct = default)
        => Task.FromResult($"/exports/session-{sessionId}.pdf");

    public Task<string> ShareAsync(long sessionId, ShareRequest req, CancellationToken ct = default)
        => Task.FromResult($"/shared/session-{sessionId}");
}
