using Smartboard.Api.Models.Dto;

namespace Smartboard.Api.Repositories;

public interface ISmartboardSessionRepository
{
    Task<long> CreateSessionAsync(int schoolId, int teacherId, StartSessionRequest req, CancellationToken ct = default);
    Task<SessionDto?> GetSessionAsync(int schoolId, int teacherId, long sessionId, CancellationToken ct = default);
    Task<IReadOnlyList<SessionDto>> GetRecentSessionsAsync(int schoolId, int teacherId, CancellationToken ct = default);
    Task UpsertPageAsync(int schoolId, int teacherId, long sessionId, SavePageRequest req, CancellationToken ct = default);
    Task EndSessionAsync(int schoolId, int teacherId, long sessionId, CancellationToken ct = default);
}

// TODO: Parivesh — implement with Dapper queries against MS SQL.
public sealed class SmartboardSessionRepository : ISmartboardSessionRepository
{
    public Task<long> CreateSessionAsync(int schoolId, int teacherId, StartSessionRequest req, CancellationToken ct = default)
        => Task.FromResult(0L);

    public Task<SessionDto?> GetSessionAsync(int schoolId, int teacherId, long sessionId, CancellationToken ct = default)
        => Task.FromResult<SessionDto?>(null);

    public Task<IReadOnlyList<SessionDto>> GetRecentSessionsAsync(int schoolId, int teacherId, CancellationToken ct = default)
        => Task.FromResult<IReadOnlyList<SessionDto>>(Array.Empty<SessionDto>());

    public Task UpsertPageAsync(int schoolId, int teacherId, long sessionId, SavePageRequest req, CancellationToken ct = default)
        => Task.CompletedTask;

    public Task EndSessionAsync(int schoolId, int teacherId, long sessionId, CancellationToken ct = default)
        => Task.CompletedTask;
}
