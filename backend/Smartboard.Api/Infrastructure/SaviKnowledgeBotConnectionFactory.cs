using System.Data;
using Microsoft.Data.SqlClient;

namespace Smartboard.Api.Infrastructure;

public sealed class SaviKnowledgeBotConnectionFactory : ISaviKnowledgeBotConnectionFactory
{
    private readonly string _connectionString;

    public SaviKnowledgeBotConnectionFactory(IConfiguration configuration)
    {
        _connectionString = configuration.GetConnectionString("SaviKnowledgeBotDbConnection")
            ?? throw new InvalidOperationException("Missing connection string 'SaviKnowledgeBotDbConnection'.");
    }

    public IDbConnection Create() => new SqlConnection(_connectionString);
}
