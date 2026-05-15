using Dapper;
using Smartboard.Api.Infrastructure;

namespace Smartboard.Api.Repositories;

public interface ISmartboardUsageLogRepository
{
    Task LogAiAsync(int schoolId, int teacherId, long? sessionId, long? topicId, string requestType,
        string promptText, string? responseText, string? provider, string? modelName, int tokenCount,
        long? costMicroUsd, CancellationToken ct = default);
}

public sealed class SmartboardUsageLogRepository : ISmartboardUsageLogRepository
{
    private readonly ISqlConnectionFactory _db;
    public SmartboardUsageLogRepository(ISqlConnectionFactory db) => _db = db;

    public async Task LogAiAsync(int schoolId, int teacherId, long? sessionId, long? topicId,
        string requestType, string promptText, string? responseText, string? provider, string? modelName,
        int tokenCount, long? costMicroUsd, CancellationToken ct = default)
    {
        const string sql = """
            INSERT INTO dbo.SmartboardAiRequestLog
                (SchoolId, TeacherId, SessionId, TopicId, RequestType, SourceType, SourceId,
                 PromptText, ResponseText, Provider, ModelName, TokenCount, CostMicroUsd, CreatedOn)
            VALUES
                (@SchoolId, @TeacherId, @SessionId, @TopicId, @RequestType, NULL, NULL,
                 @PromptText, @ResponseText, @Provider, @ModelName, @TokenCount, @CostMicroUsd,
                 SYSUTCDATETIME());
            """;

        using var conn = _db.Create();
        await conn.ExecuteAsync(new CommandDefinition(sql, new
        {
            SchoolId = schoolId,
            TeacherId = teacherId,
            SessionId = sessionId,
            TopicId = topicId,
            RequestType = requestType,
            PromptText = promptText,
            ResponseText = responseText,
            Provider = provider,
            ModelName = modelName,
            TokenCount = tokenCount,
            CostMicroUsd = costMicroUsd
        }, cancellationToken: ct));
    }
}
