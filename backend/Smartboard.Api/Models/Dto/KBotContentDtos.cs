namespace Smartboard.Api.Models.Dto;

/// <summary>Availability and metadata for one card level (L0–L6) within a topic.</summary>
public sealed record CardLevelStatusDto(
    string Level,
    bool Exists,
    long? CardId,
    long? CurrentVersionId,
    int? VersionCount,
    bool IsPublished,
    bool IsStale);

/// <summary>All card levels for a topic. Returned by GET /topic/{slug}/cards.</summary>
public sealed record TopicCardsDto(string Slug, string Title, IReadOnlyList<CardLevelStatusDto> Cards);

/// <summary>A single version row. Returned by GET /cards/{card_id}/versions.</summary>
public sealed record ContentCardVersionDto(
    long CardId,
    long VersionId,
    int Version,
    string Label,
    DateTime UpdatedAt,
    bool IsCurrent,
    bool IsPublished);

/// <summary>Rendered HTML card ready for display. Returned by GET /cards/{card_id}/render.</summary>
public sealed record RenderedCardDto(long CardId, long VersionId, string Html, int ViewportWidth, int ViewportHeight, string ETag);
