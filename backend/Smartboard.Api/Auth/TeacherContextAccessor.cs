using System.Security.Claims;

namespace Smartboard.Api.Auth;

public interface ITeacherContextAccessor
{
    int SchoolId { get; }
    int TeacherId { get; }   // int for Smartboard session DB scoping
}

public sealed class TeacherContextAccessor : ITeacherContextAccessor
{
    public int SchoolId { get; }
    public int TeacherId { get; }

    public TeacherContextAccessor(IHttpContextAccessor http)
    {
        var user = http.HttpContext?.User;
        SchoolId  = int.TryParse(user?.FindFirst("school_id")?.Value, out var sid) ? sid : 0;
        // teacher_id is a GUID in Savischools JWT; session DB uses int — parse to 0 until schema migrated
        TeacherId = int.TryParse(user?.FindFirst("teacher_id")?.Value, out var tid) ? tid : 0;
    }
}
