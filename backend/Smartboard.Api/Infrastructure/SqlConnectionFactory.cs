using System.Data;
using Microsoft.Data.SqlClient;

namespace Smartboard.Api.Infrastructure;

public interface ISqlConnectionFactory
{
    IDbConnection Create();
}

public sealed class SqlConnectionFactory : ISqlConnectionFactory
{
    private readonly string _connectionString;

    public SqlConnectionFactory(IConfiguration configuration)
    {
        _connectionString = configuration.GetConnectionString("Smartboard")
            ?? throw new InvalidOperationException("Missing connection string 'Smartboard'.");
    }

    public IDbConnection Create() => new SqlConnection(_connectionString);
}
