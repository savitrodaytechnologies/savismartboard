-- ============================================================
-- Stored Procedure: sp_AIGurukul_LoginByEmail
-- Database        : savischoolprd002 (AWS RDS)
-- Description     : Returns teacher record by email only (no schoolId required).
--                   Used by the Google OAuth sign-in flow.
-- Parameters      :
--   @email NVARCHAR(200) -- teacher's email (SystemUsers.logonId)
-- Output          : one row matching TeacherRecord C# class, or no rows
-- ============================================================

CREATE OR ALTER PROCEDURE [dbo].[sp_AIGurukul_LoginByEmail]
    @email NVARCHAR(200)
AS
BEGIN
    SET NOCOUNT ON;

    IF @email IS NULL OR LEN(LTRIM(RTRIM(@email))) = 0
        THROW 50030, '@email must not be empty.', 1;

    SELECT TOP 1
        su.schoolId     AS SchoolId,
        ss.staffId      AS StaffId,
        su.userId       AS UserId,
        su.logonId      AS LogonId,
        su.password     AS PasswordHash,
        ss.firstName    AS Name,
        s.name          AS SchoolName,
        su.logonId      AS Email
    FROM   dbo.SystemUsers  su
    INNER JOIN dbo.SchoolStaffs ss ON ss.schoolId = su.schoolId
    INNER JOIN dbo.Schools      s  ON s.schoolId  = su.schoolId
    WHERE  su.logonId = @email
      AND  su.delFlg  = 0
    ORDER BY su.schoolId;
END

-- ── Quick test (run after deploying SP) ──────────────────────────────────────
-- EXEC dbo.sp_AIGurukul_LoginByEmail @email = 'teacher@example.com';
