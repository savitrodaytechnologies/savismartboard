-- ============================================================
-- Migration: 005 - Stored Procedure: sp_AIGurukul_Login
-- Description: Fetches teacher/staff details for login validation.
--              Input  : single @json with schoolId + logonId
--              Output : result-set row with all fields needed to
--                       verify BCrypt password and issue JWT in C#
-- Tables read:
--   SystemUsers  → password hash, status, userType
--   SchoolStaffs → firstName, emailAddress
--   schools      → school name
--
-- Example JSON input:
-- {
--   "schoolId" : 101,
--   "logonId"  : "manohar@school.com"
-- }
-- ============================================================

CREATE OR ALTER PROCEDURE [dbo].[sp_AIGurukul_Login]
    @json NVARCHAR(MAX)
AS
BEGIN
    SET NOCOUNT ON;

    -- ── Parse JSON input ──────────────────────────────────────────────────────
    DECLARE @schoolId BIGINT        = TRY_CAST(JSON_VALUE(@json, '$.schoolId') AS BIGINT);
    DECLARE @logonId  NVARCHAR(200) = JSON_VALUE(@json, '$.logonId');

    -- ── Validate ──────────────────────────────────────────────────────────────
    IF @schoolId IS NULL
        THROW 50010, 'schoolId is required in JSON payload.', 1;
    IF @logonId IS NULL OR LEN(LTRIM(RTRIM(@logonId))) = 0
        THROW 50011, 'logonId is required in JSON payload.',  1;

    -- ── Return user record (password hash verified by C# BCrypt) ─────────────
    SELECT TOP 1
        su.schoolId                          AS SchoolId,
        CAST(ss.staffId AS NVARCHAR(36))     AS StaffId,
        CAST(su.userId  AS NVARCHAR(36))     AS UserId,
        su.logonId                           AS LogonId,
        su.password                          AS PasswordHash,
        ss.firstName                         AS Name,
        s.name                               AS SchoolName,
        su.emailAddress                      AS Email
    FROM  [dbo].[SystemUsers]  su
    INNER JOIN [dbo].[SchoolStaffs] ss ON ss.staffId  = su.staffId
    INNER JOIN [dbo].[schools]      s  ON s.schoolId  = su.schoolId
    WHERE su.schoolId = @schoolId
      AND su.logonId  = @logonId
      AND su.delFlg   = 0
      AND su.status   = 'Active';
END
GO
