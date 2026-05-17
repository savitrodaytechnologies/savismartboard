-- =========================================================================
-- Migration 003: Add PageJsonUrl column to SmartboardSessionPage
-- =========================================================================
-- After a session ends, PageJson is uploaded to S3 (gzip-compressed) and
-- the object key is stored here. PageJson is then set to NULL to free DB
-- space. On load, the backend fetches the JSON from S3 transparently.
--
-- Idempotent: safe to run multiple times.
-- =========================================================================

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID(N'dbo.SmartboardSessionPage')
      AND name = N'PageJsonUrl'
)
BEGIN
    ALTER TABLE dbo.SmartboardSessionPage
        ADD PageJsonUrl NVARCHAR(1000) NULL;
END
GO

-- PageJson must be nullable so rows can be set to NULL after S3 archival.
-- Safe to run if it's already nullable.
IF EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID(N'dbo.SmartboardSessionPage')
      AND name = N'PageJson'
      AND is_nullable = 0
)
BEGIN
    ALTER TABLE dbo.SmartboardSessionPage
        ALTER COLUMN PageJson NVARCHAR(MAX) NULL;
END
GO
