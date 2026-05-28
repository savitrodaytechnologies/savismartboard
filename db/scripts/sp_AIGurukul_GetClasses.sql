-- ============================================================
-- Stored Procedure: sp_AIGurukul_GetClasses
-- Database        : savischoolprd002 (AWS RDS)
-- Description     : Returns all classes for a given school and curriculum.
-- Parameters      :
--   @schoolId   INT           -- school's numeric ID (e.g. 1203)
--   @curriculum NVARCHAR(50)  -- curriculum code (e.g. 'CBSE', 'ICSE', 'STATE')
-- Output          : result-set (classId UNIQUEIDENTIFIER, Name NVARCHAR)
-- ============================================================

CREATE OR ALTER PROCEDURE [dbo].[sp_AIGurukul_GetClasses]
    @schoolId   INT,
    @curriculum NVARCHAR(50) = N'CBSE'
AS
BEGIN
    SET NOCOUNT ON;

    -- Validate inputs
    IF @schoolId IS NULL OR @schoolId <= 0
        THROW 50010, '@schoolId must be a positive integer.', 1;

    IF @curriculum IS NULL OR LEN(LTRIM(RTRIM(@curriculum))) = 0
        THROW 50011, '@curriculum cannot be empty.', 1;

    SELECT
        classId,
        classCode AS Name
    FROM   dbo.Classes WITH (NOLOCK)
    WHERE  SchoolId   = @schoolId
      AND  Curriculum = @curriculum
    ORDER  BY displaySeq;
END

-- ── Quick test (run after deploying SP) ──────────────────────────────────────
-- EXEC dbo.sp_AIGurukul_GetClasses @schoolId = 1203, @curriculum = N'CBSE';
