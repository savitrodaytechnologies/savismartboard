-- ============================================================
-- Migration: 004 - Stored Procedure: sp_AIGurukul_RegisterTeacher
-- Description: Registers a new school + teacher (staff + system user)
--              in a single atomic transaction.
--              Input  : single @json NVARCHAR(MAX) — parsed with JSON_VALUE
--              Output : result-set row (schoolId, staffId, userId, logonId)
-- Tables touched:
--   schools, ERPEnabledSchools, SchoolStaffCategories (schoolId=0),
--   SchoolDepartments (schoolId=0), SchoolStaffs, SystemUsers
--
-- Example JSON input:
-- {
--   "schoolName"     : "ABC School",
--   "contactPerson"  : "Manohar Kumar",
--   "emailAddress1"  : "manohar@school.com",
--   "password"       : "<bcrypt-hash>",
--   "phone1"         : "9999999999",
--   "country"        : "India",
--   "state"          : "Maharashtra",
--   "city"           : "Mumbai",
--   "postCode"       : "400001",
--   "addressLine1"   : "123 Main St",
--   "schoolType"     : "K12",
--   "operationTypeId": 1,
--   "currency"       : "INR",
--   "saviAgentId"    : 0
-- }
-- ============================================================

CREATE OR ALTER PROCEDURE [dbo].[sp_AIGurukul_RegisterTeacher]
    @json NVARCHAR(MAX)         -- Full registration payload as JSON
AS
BEGIN
    SET NOCOUNT ON;

    -- ── Parse JSON input fields ───────────────────────────────────────────────
    DECLARE @schoolName      NVARCHAR(200)  = JSON_VALUE(@json, '$.schoolName');
    DECLARE @contactPerson   NVARCHAR(200)  = JSON_VALUE(@json, '$.contactPerson');
    DECLARE @emailAddress1   NVARCHAR(200)  = JSON_VALUE(@json, '$.emailAddress1');
    DECLARE @password        NVARCHAR(500)  = JSON_VALUE(@json, '$.password');    -- BCrypt hash
    DECLARE @phone1          NVARCHAR(50)   = ISNULL(JSON_VALUE(@json, '$.phone1'),          '');
    DECLARE @country         NVARCHAR(100)  = ISNULL(JSON_VALUE(@json, '$.country'),         'IN');
    DECLARE @state           NVARCHAR(100)  = ISNULL(JSON_VALUE(@json, '$.state'),           '');
    DECLARE @city            NVARCHAR(100)  = ISNULL(JSON_VALUE(@json, '$.city'),            '');
    DECLARE @postCode        NVARCHAR(20)   = ISNULL(JSON_VALUE(@json, '$.postCode'),        '');
    DECLARE @addressLine1    NVARCHAR(500)  = ISNULL(JSON_VALUE(@json, '$.addressLine1'),    '');
    DECLARE @schoolType      NVARCHAR(50)   = ISNULL(JSON_VALUE(@json, '$.schoolType'),      'K12');
    DECLARE @operationTypeId INT            = ISNULL(TRY_CAST(JSON_VALUE(@json, '$.operationTypeId') AS INT),  1);
    DECLARE @currency        NVARCHAR(10)   = ISNULL(JSON_VALUE(@json, '$.currency'),        'INR');
    DECLARE @saviAgentId     BIGINT         = ISNULL(TRY_CAST(JSON_VALUE(@json, '$.saviAgentId')     AS BIGINT), 0);

    -- ── Validate required fields ──────────────────────────────────────────────
    IF @schoolName    IS NULL OR LEN(LTRIM(RTRIM(@schoolName)))    = 0
        THROW 50001, 'schoolName is required in JSON payload.',    1;
    IF @contactPerson IS NULL OR LEN(LTRIM(RTRIM(@contactPerson))) = 0
        THROW 50002, 'contactPerson is required in JSON payload.', 1;
    IF @emailAddress1 IS NULL OR LEN(LTRIM(RTRIM(@emailAddress1))) = 0
        THROW 50003, 'emailAddress1 is required in JSON payload.', 1;
    IF @password      IS NULL OR LEN(@password)                    = 0
        THROW 50004, 'password is required in JSON payload.',      1;

    -- ── Working variables ─────────────────────────────────────────────────────
    DECLARE @schoolId        BIGINT;
    DECLARE @staffId         UNIQUEIDENTIFIER;
    DECLARE @userId          UNIQUEIDENTIFIER;
    DECLARE @createdBy       UNIQUEIDENTIFIER = NEWID();
    DECLARE @schoolGuid      UNIQUEIDENTIFIER = NEWID();
    DECLARE @staffCategoryId UNIQUEIDENTIFIER;
    DECLARE @departmentId    UNIQUEIDENTIFIER;

    BEGIN TRY
        BEGIN TRANSACTION;

        -- ── Step 1: Insert the new school ─────────────────────────────────────
        INSERT INTO [dbo].[schools] (
            delFlg, country, state, city, phone1, name, contactPerson,
            emailAddress1, createdBy, createdOn, status, schoolType,
            operationTypeId, currency, erpEnabled, officeOnly, postCode,
            addressLine1, phoneVerified, schoolGuid
        )
        VALUES (
            0, LEFT(@country, 2), LEFT(@state, 10), @city, @phone1, @schoolName, @contactPerson,
            @emailAddress1, @createdBy, GETDATE(), 'Active', @schoolType,
            @operationTypeId, @currency, 1, 0, @postCode,
            @addressLine1, 0, @schoolGuid
        );

        SET @schoolId = SCOPE_IDENTITY();

        -- ── Step 2: Register in ERPEnabledSchools ────────────────────────────
        INSERT INTO [dbo].[ERPEnabledSchools] (
            schoolId, delFlg, createdOn, createdBy,
            invoiceFrequency, isSideMenu, saviAgentId, schoolGuid
        )
        VALUES (
            @schoolId, 0, GETDATE(), @createdBy,
            'M', 1, @saviAgentId, NEWID()
        );

        -- ── Step 3: Get or create default StaffCategory (global, schoolId=0) ─
        SELECT TOP 1 @staffCategoryId = staffCategoryId
        FROM [dbo].[SchoolStaffCategories]
        WHERE schoolId = 0 AND name = 'General';

        IF @staffCategoryId IS NULL
        BEGIN
            SET @staffCategoryId = NEWID();
            INSERT INTO [dbo].[SchoolStaffCategories] (
                staffCategoryId, createdOn, createdBy,
                schoolId, name, description, defaultSystemRole
            )
            VALUES (
                @staffCategoryId, GETDATE(), @createdBy,
                0, 'General', 'General Category', 'Teacher'
            );
        END

        -- ── Step 4: Get or create default Department (global, schoolId=0) ────
        SELECT TOP 1 @departmentId = departmentId
        FROM [dbo].[SchoolDepartments]
        WHERE schoolId = 0 AND name = 'General';

        IF @departmentId IS NULL
        BEGIN
            SET @departmentId = NEWID();
            INSERT INTO [dbo].[SchoolDepartments] (
                departmentId, createdOn, createdBy,
                schoolId, name, description
            )
            VALUES (
                @departmentId, GETDATE(), @createdBy,
                0, 'General', 'General Department'
            );
        END

        -- ── Step 5: Insert staff record ───────────────────────────────────────
        SET @staffId = NEWID();

        INSERT INTO [dbo].[SchoolStaffs] (
            staffId, delFlg, firstName, gender, country, state,
            createdBy, createdOn, phone1, schoolId,
            staffCategoryId, departmentId, emailAddress
        )
        VALUES (
            @staffId, 0, @contactPerson, 'Unknown', LEFT(@country, 2), LEFT(@state, 6),
            @createdBy, GETDATE(), @phone1, @schoolId,
            @staffCategoryId, @departmentId, @emailAddress1
        );

        -- ── Step 6: Create system user (login account) ────────────────────────
        SET @userId = NEWID();

        INSERT INTO [dbo].[SystemUsers] (
            userId, delFlg, password, createdBy, createdOn,
            updatedBy, updatedOn, activatedOn,
            emailAddress, logonId, status, userType,
            schoolId, staffId, phoneVerified
        )
        VALUES (
            @userId, 0, @password, @createdBy, GETDATE(),
            @createdBy, GETDATE(), GETDATE(),
            @emailAddress1, @emailAddress1, 'Active', 'SchoolAdmin',
            @schoolId, @staffId, 0
        );

        COMMIT TRANSACTION;

        -- ── Return result row to C# (read via QueryFirstOrDefaultAsync) ───────
        SELECT
            @schoolId                      AS schoolId,
            CAST(@staffId AS NVARCHAR(36)) AS staffId,
            CAST(@userId  AS NVARCHAR(36)) AS userId,
            @emailAddress1                 AS logonId;

    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0
            ROLLBACK TRANSACTION;

        DECLARE @msg NVARCHAR(4000) = ERROR_MESSAGE();
        RAISERROR(@msg, 16, 1);
    END CATCH
END
GO
