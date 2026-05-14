namespace Smartboard.Api.Repositories;

public interface ISmartboardUsageLogRepository
{
    Task LogAiAsync(int schoolId, int teacherId, long? sessionId, long? topicId, string requestType,
        string promptText, string? responseText, string? provider, string? modelName, int tokenCount,
        long? costMicroUsd, CancellationToken ct = default);
}

// TODO: Parivesh — implement with Dapper insert.
public sealed class SmartboardUsageLogRepository : ISmartboardUsageLogRepository
{
    public Task LogAiAsync(int schoolId, int teacherId, long? sessionId, long? topicId, string requestType,
        string promptText, string? responseText, string? provider, string? modelName, int tokenCount,
        long? costMicroUsd, CancellationToken ct = default) => Task.CompletedTask;
}
