using Dapper;
using Smartboard.Api.Infrastructure;
using Smartboard.Api.Models.Domain;
using Smartboard.Api.Models.Dto;

namespace Smartboard.Api.Repositories;

public interface ISmartboardSessionRepository
{
    Task<long> CreateSessionAsync(int schoolId, int teacherId, StartSessionRequest req, CancellationToken ct = default);
    Task<SessionDto?> GetSessionAsync(int schoolId, int teacherId, long sessionId, CancellationToken ct = default);
    Task<IReadOnlyList<SessionDto>> GetRecentSessionsAsync(int schoolId, int teacherId, CancellationToken ct = default);
    Task UpsertPageAsync(int schoolId, int teacherId, long sessionId, SavePageRequest req, CancellationToken ct = default);
    Task EndSessionAsync(int schoolId, int teacherId, long sessionId, CancellationToken ct = default);
    Task DeleteSessionAsync(int schoolId, int teacherId, long sessionId, CancellationToken ct = default);
}

public sealed class SmartboardSessionRepository : ISmartboardSessionRepository
{
    private readonly ISqlConnectionFactory _db;
    public SmartboardSessionRepository(ISqlConnectionFactory db) => _db = db;

    public async Task<long> CreateSessionAsync(int schoolId, int teacherId, StartSessionRequest req, CancellationToken ct = default)
    {
        const string sql = """
            INSERT INTO dbo.SmartboardSession
                (SchoolId, TeacherId, ClassId, SectionId, SubjectId, TopicId, SessionTitle,
                 SessionDate, StartedAt, Status, CreatedOn)
            VALUES
                (@SchoolId, @TeacherId, @ClassId, @SectionId, @SubjectId, @TopicId, @SessionTitle,
                 CAST(SYSUTCDATETIME() AS DATE), SYSUTCDATETIME(), N'InProgress', SYSUTCDATETIME());
            SELECT CAST(SCOPE_IDENTITY() AS BIGINT);
            """;

        using var conn = _db.Create();
        return await conn.ExecuteScalarAsync<long>(
            new CommandDefinition(sql,
                new
                {
                    SchoolId = schoolId,
                    TeacherId = teacherId,
                    req.ClassId,
                    req.SectionId,
                    req.SubjectId,
                    req.TopicId,
                    req.SessionTitle
                },
                cancellationToken: ct));
    }

    public async Task<SessionDto?> GetSessionAsync(int schoolId, int teacherId, long sessionId, CancellationToken ct = default)
    {
        const string sessionSql = """
            SELECT SessionId, Status, StartedAt, EndedAt
            FROM   dbo.SmartboardSession
            WHERE  SessionId = @SessionId
              AND  SchoolId  = @SchoolId
              AND  TeacherId = @TeacherId;
            """;

        const string pagesSql = """
            SELECT p.SessionPageId, p.PageNo, p.PageType, p.SourceType, p.SourceId,
                   p.SourceVersionId, p.PageJson, p.Revision
            FROM   dbo.SmartboardSessionPage p
            INNER JOIN dbo.SmartboardSession s ON s.SessionId = p.SessionId
            WHERE  p.SessionId = @SessionId
              AND  s.SchoolId  = @SchoolId
              AND  s.TeacherId = @TeacherId
            ORDER BY p.PageNo;
            """;

        var p = new { SessionId = sessionId, SchoolId = schoolId, TeacherId = teacherId };
        using var conn = _db.Create();

        var session = await conn.QuerySingleOrDefaultAsync<SmartboardSession>(
            new CommandDefinition(sessionSql, p, cancellationToken: ct));

        if (session is null) return null;

        var pages = (await conn.QueryAsync<SessionPageDto>(
            new CommandDefinition(pagesSql, p, cancellationToken: ct))).ToList();

        return new SessionDto(session.SessionId, session.Status, session.StartedAt, session.EndedAt, pages);
    }

    public async Task<IReadOnlyList<SessionDto>> GetRecentSessionsAsync(int schoolId, int teacherId, CancellationToken ct = default)
    {
        const string sql = """
            SELECT TOP 10
                   SessionId, Status, StartedAt, EndedAt
            FROM   dbo.SmartboardSession
            WHERE  SchoolId  = @SchoolId
              AND  TeacherId = @TeacherId
            ORDER BY StartedAt DESC;
            """;

        using var conn = _db.Create();
        var rows = await conn.QueryAsync<SmartboardSession>(
            new CommandDefinition(sql, new { SchoolId = schoolId, TeacherId = teacherId }, cancellationToken: ct));

        return rows
            .Select(s => new SessionDto(s.SessionId, s.Status, s.StartedAt, s.EndedAt, []))
            .ToList();
    }

    public async Task UpsertPageAsync(int schoolId, int teacherId, long sessionId, SavePageRequest req, CancellationToken ct = default)
    {
        // Security: USING clause only produces a row when the session belongs to this teacher.
        const string sql = """
            MERGE dbo.SmartboardSessionPage AS tgt
            USING (
                SELECT @SessionId AS SessionId, @PageNo AS PageNo
                WHERE  EXISTS (
                    SELECT 1 FROM dbo.SmartboardSession
                    WHERE  SessionId = @SessionId
                      AND  SchoolId  = @SchoolId
                      AND  TeacherId = @TeacherId
                      AND  Status    = N'InProgress'
                )
            ) AS src
              ON  tgt.SessionId = src.SessionId
              AND tgt.PageNo    = src.PageNo
            WHEN MATCHED AND tgt.Revision < @Revision THEN
                UPDATE SET
                    PageType        = @PageType,
                    SourceType      = @SourceType,
                    SourceId        = @SourceId,
                    SourceVersionId = @SourceVersionId,
                    PageJson        = @PageJson,
                    Revision        = @Revision,
                    ModifiedOn      = SYSUTCDATETIME()
            WHEN NOT MATCHED THEN
                INSERT (SessionId, PageNo, PageType, SourceType, SourceId,
                        SourceVersionId, PageJson, Revision, CreatedOn)
                VALUES (@SessionId, @PageNo, @PageType, @SourceType, @SourceId,
                        @SourceVersionId, @PageJson, @Revision, SYSUTCDATETIME());
            """;

        using var conn = _db.Create();
        await conn.ExecuteAsync(new CommandDefinition(sql,
            new
            {
                SchoolId = schoolId,
                TeacherId = teacherId,
                SessionId = sessionId,
                req.PageNo,
                req.PageType,
                req.SourceType,
                req.SourceId,
                req.SourceVersionId,
                req.PageJson,
                req.Revision
            },
            cancellationToken: ct));
    }

    public async Task EndSessionAsync(int schoolId, int teacherId, long sessionId, CancellationToken ct = default)
    {
        const string sql = """
            UPDATE dbo.SmartboardSession
            SET    Status  = N'Ended',
                   EndedAt = SYSUTCDATETIME()
            WHERE  SessionId = @SessionId
              AND  SchoolId  = @SchoolId
              AND  TeacherId = @TeacherId
              AND  Status    = N'InProgress';
            """;

        using var conn = _db.Create();
        await conn.ExecuteAsync(new CommandDefinition(sql,
            new { SessionId = sessionId, SchoolId = schoolId, TeacherId = teacherId },
            cancellationToken: ct));
    }
}
