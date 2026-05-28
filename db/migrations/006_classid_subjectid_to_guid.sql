-- ============================================================
-- Migration 006: Change ClassId and SubjectId from INT to UNIQUEIDENTIFIER
--                in dbo.SmartboardSession
-- Database  : Savismartboard (local / RDS)
-- Run once  : idempotent via column-type check
-- ============================================================

-- ClassId: INT → UNIQUEIDENTIFIER
IF EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'dbo'
      AND TABLE_NAME   = 'SmartboardSession'
      AND COLUMN_NAME  = 'ClassId'
      AND DATA_TYPE    = 'int'
)
BEGIN
    ALTER TABLE dbo.SmartboardSession
        ALTER COLUMN ClassId UNIQUEIDENTIFIER NOT NULL;
    PRINT 'SmartboardSession.ClassId changed to UNIQUEIDENTIFIER.';
END
ELSE
    PRINT 'SmartboardSession.ClassId already UNIQUEIDENTIFIER — skipped.';

-- SubjectId: INT → UNIQUEIDENTIFIER
IF EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'dbo'
      AND TABLE_NAME   = 'SmartboardSession'
      AND COLUMN_NAME  = 'SubjectId'
      AND DATA_TYPE    = 'int'
)
BEGIN
    ALTER TABLE dbo.SmartboardSession
        ALTER COLUMN SubjectId UNIQUEIDENTIFIER NOT NULL;
    PRINT 'SmartboardSession.SubjectId changed to UNIQUEIDENTIFIER.';
END
ELSE
    PRINT 'SmartboardSession.SubjectId already UNIQUEIDENTIFIER — skipped.';
