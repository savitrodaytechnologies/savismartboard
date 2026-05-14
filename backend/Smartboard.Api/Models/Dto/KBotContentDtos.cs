namespace Smartboard.Api.Models.Dto;

public sealed record ContentCardSummaryDto(long CardId, string Title, int VersionCount);
public sealed record ContentCardVersionDto(long CardId, int VersionId, string Label, DateTime UpdatedAt);
public sealed record RenderedCardDto(long CardId, int VersionId, string Html, int ViewportWidth, int ViewportHeight, string ETag);
