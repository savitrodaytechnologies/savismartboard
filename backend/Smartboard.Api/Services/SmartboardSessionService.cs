using Smartboard.Api.Auth;
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
    Task DeleteAsync(long sessionId, CancellationToken ct = default);
    Task<string> ExportAsync(long sessionId, ExportRequest req, CancellationToken ct = default);
    Task<string> ShareAsync(long sessionId, ShareRequest req, CancellationToken ct = default);
}

// TODO: Parivesh — implement session/save/export/share.
public sealed class SmartboardSessionService : ISmartboardSessionService
{
    private readonly ISmartboardSessionRepository _repo;
    private readonly ITeacherContextAccessor _teacher;

    public SmartboardSessionService(ISmartboardSessionRepository repo, ITeacherContextAccessor teacher)
    {
        _repo = repo;
        _teacher = teacher;
    }

    public Task<long> StartAsync(StartSessionRequest req, CancellationToken ct = default)
        => _repo.CreateSessionAsync(_teacher.SchoolId, _teacher.TeacherId, req, ct);

    public Task<SessionDto?> GetAsync(long sessionId, CancellationToken ct = default)
        => _repo.GetSessionAsync(_teacher.SchoolId, _teacher.TeacherId, sessionId, ct);

    public Task<IReadOnlyList<SessionDto>> GetRecentAsync(CancellationToken ct = default)
        => _repo.GetRecentSessionsAsync(_teacher.SchoolId, _teacher.TeacherId, ct);

    public Task SavePageAsync(long sessionId, SavePageRequest req, CancellationToken ct = default)
        => _repo.UpsertPageAsync(_teacher.SchoolId, _teacher.TeacherId, sessionId, req, ct);

    public Task EndAsync(long sessionId, CancellationToken ct = default)
        => _repo.EndSessionAsync(_teacher.SchoolId, _teacher.TeacherId, sessionId, ct);

    public Task DeleteAsync(long sessionId, CancellationToken ct = default)
        => _repo.DeleteSessionAsync(_teacher.SchoolId, _teacher.TeacherId, sessionId, ct);

    public Task<string> ExportAsync(long sessionId, ExportRequest req, CancellationToken ct = default)
        => Task.FromResult($"/exports/session-{sessionId}.pdf");

    public Task<string> ShareAsync(long sessionId, ShareRequest req, CancellationToken ct = default)
        => Task.FromResult($"/shared/session-{sessionId}");
}
