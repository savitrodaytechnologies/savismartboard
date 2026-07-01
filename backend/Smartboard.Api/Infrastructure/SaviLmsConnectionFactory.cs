using System.Data;
using Microsoft.Data.SqlClient;

namespace Smartboard.Api.Infrastructure;

public interface ISaviLmsConnectionFactory
{
    IDbConnection Create();
}

public sealed class SaviLmsConnectionFactory : ISaviLmsConnectionFactory
{
    private readonly string _connectionString;

    public SaviLmsConnectionFactory(IConfiguration configuration)
    {
        _connectionString = configuration.GetConnectionString("SaviLMSDbConnection")
            ?? throw new InvalidOperationException("Missing connection string 'SaviLMSDbConnection'.");
    }

    public IDbConnection Create() => new SqlConnection(_connectionString);
}
