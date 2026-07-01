using System.Data;

namespace Smartboard.Api.Infrastructure;

public interface ISaviKnowledgeBotConnectionFactory
{
    IDbConnection Create();
}
