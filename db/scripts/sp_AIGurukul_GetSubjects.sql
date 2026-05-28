-- ============================================================
-- Stored Procedure: sp_AIGurukul_GetSubjects
-- Database        : savischoolprd002 (AWS RDS)
-- Description     : Returns all subjects for a given class.
-- Parameters      :
--   @classId   UNIQUEIDENTIFIER  -- class GUID from dbo.Classes.classId
-- Output          : result-set (classSubjectId UNIQUEIDENTIFIER, subjectName NVARCHAR)
-- ============================================================

CREATE OR ALTER PROCEDURE [dbo].[sp_AIGurukul_GetSubjects]
    @classId UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;

    -- Validate inputs
    IF @classId IS NULL
        THROW 50020, '@classId must not be null.', 1;

    SELECT
        classSubjectId  AS SubjectId,
        description     AS Name
    FROM   dbo.ClassSubjects WITH (NOLOCK)
    WHERE  classId = @classId
    ORDER  BY classSubjectId;
END

-- ── Quick test (run after deploying SP) ──────────────────────────────────────
-- EXEC dbo.sp_AIGurukul_GetSubjects @classId = '<your-class-guid-here>';
