namespace Smartboard.Api.Models.Domain;

public sealed class SmartboardSession
{
    public long SessionId { get; set; }
    public int SchoolId { get; set; }
    public int TeacherId { get; set; }
    public Guid ClassId { get; set; }
    public int? SectionId { get; set; }
    public Guid SubjectId { get; set; }
    public int? TopicId { get; set; }
    public string SessionTitle { get; set; } = "";
    public DateTime SessionDate { get; set; }
    public DateTime StartedAt { get; set; }
    public DateTime? EndedAt { get; set; }
    public string Status { get; set; } = "InProgress";
    public DateTime CreatedOn { get; set; }
}

public sealed class SmartboardSessionPage
{
    public long SessionPageId { get; set; }
    public long SessionId { get; set; }
    public int PageNo { get; set; }
    public string PageType { get; set; } = "Card";
    public string? SourceType { get; set; }
    public long? SourceId { get; set; }
    public long? SourceVersionId { get; set; }
    public string PageJson { get; set; } = "{}";
    public string? SnapshotUrl { get; set; }
    public int Revision { get; set; }
    public DateTime CreatedOn { get; set; }
    public DateTime? ModifiedOn { get; set; }
}
