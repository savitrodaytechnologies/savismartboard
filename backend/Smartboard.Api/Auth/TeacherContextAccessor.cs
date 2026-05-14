using System.Security.Claims;

namespace Smartboard.Api.Auth;

public interface ITeacherContextAccessor
{
    int SchoolId { get; }
    int TeacherId { get; }
}

public sealed class TeacherContextAccessor : ITeacherContextAccessor
{
    public int SchoolId { get; }
    public int TeacherId { get; }

    public TeacherContextAccessor(IHttpContextAccessor http)
    {
        var user = http.HttpContext?.User;
        SchoolId = ParseClaim(user, "school_id");
        TeacherId = ParseClaim(user, "teacher_id");
    }

    private static int ParseClaim(ClaimsPrincipal? user, string type)
    {
        var v = user?.FindFirst(type)?.Value;
        return int.TryParse(v, out var n) ? n : 0;
    }
}
