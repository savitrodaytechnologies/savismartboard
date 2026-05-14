-- =========================================================================
-- Savismartboard — Migration 001: Create Smartboard schema (SQL Server)
-- Idempotent: safe to run multiple times.
-- =========================================================================

IF DB_NAME() IS NULL
BEGIN
    RAISERROR('Connect to the target database before running this migration.', 16, 1);
    RETURN;
END

-- 1) SmartboardSession --------------------------------------------------------
IF OBJECT_ID(N'dbo.SmartboardSession', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.SmartboardSession
    (
        SessionId       BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_SmartboardSession PRIMARY KEY,
        SchoolId        INT             NOT NULL,
        TeacherId       INT             NOT NULL,
        ClassId         INT             NOT NULL,
        SectionId       INT             NULL,
        SubjectId       INT             NOT NULL,
        TopicId         INT             NULL,
        SessionTitle    NVARCHAR(250)   NOT NULL,
        SessionDate     DATE            NOT NULL,
        StartedAt       DATETIME2(0)    NOT NULL CONSTRAINT DF_SmartboardSession_StartedAt DEFAULT (SYSUTCDATETIME()),
        EndedAt         DATETIME2(0)    NULL,
        Status          NVARCHAR(50)    NOT NULL CONSTRAINT DF_SmartboardSession_Status DEFAULT (N'InProgress'),
        CreatedOn       DATETIME2(0)    NOT NULL CONSTRAINT DF_SmartboardSession_CreatedOn DEFAULT (SYSUTCDATETIME())
    );

    CREATE INDEX IX_SmartboardSession_School_Teacher_Date
        ON dbo.SmartboardSession (SchoolId, TeacherId, SessionDate DESC);
END
GO

-- 2) SmartboardSessionPage ----------------------------------------------------
IF OBJECT_ID(N'dbo.SmartboardSessionPage', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.SmartboardSessionPage
    (
        SessionPageId    BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_SmartboardSessionPage PRIMARY KEY,
        SessionId        BIGINT          NOT NULL,
        PageNo           INT             NOT NULL,
        PageType         NVARCHAR(50)    NOT NULL,
        SourceType       NVARCHAR(50)    NULL,
        SourceId         BIGINT          NULL,
        SourceVersionId  BIGINT          NULL,
        PageJson         NVARCHAR(MAX)   NOT NULL,
        SnapshotUrl      NVARCHAR(1000)  NULL,
        Revision         INT             NOT NULL CONSTRAINT DF_SmartboardSessionPage_Revision DEFAULT (1),
        CreatedOn        DATETIME2(0)    NOT NULL CONSTRAINT DF_SmartboardSessionPage_CreatedOn DEFAULT (SYSUTCDATETIME()),
        ModifiedOn       DATETIME2(0)    NULL,
        CONSTRAINT FK_SmartboardSessionPage_Session
            FOREIGN KEY (SessionId) REFERENCES dbo.SmartboardSession (SessionId)
    );

    CREATE UNIQUE INDEX UX_SmartboardSessionPage_Session_PageNo
        ON dbo.SmartboardSessionPage (SessionId, PageNo);
END
GO

-- 3) SmartboardSessionExport --------------------------------------------------
IF OBJECT_ID(N'dbo.SmartboardSessionExport', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.SmartboardSessionExport
    (
        ExportId         BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_SmartboardSessionExport PRIMARY KEY,
        SessionId        BIGINT          NOT NULL,
        ExportType       NVARCHAR(50)    NOT NULL,
        FileUrl          NVARCHAR(1000)  NOT NULL,
        CreatedOn        DATETIME2(0)    NOT NULL CONSTRAINT DF_SmartboardSessionExport_CreatedOn DEFAULT (SYSUTCDATETIME()),
        CreatedByUserId  INT             NOT NULL,
        CONSTRAINT FK_SmartboardSessionExport_Session
            FOREIGN KEY (SessionId) REFERENCES dbo.SmartboardSession (SessionId)
    );
END
GO

-- 4) SmartboardAiRequestLog ---------------------------------------------------
IF OBJECT_ID(N'dbo.SmartboardAiRequestLog', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.SmartboardAiRequestLog
    (
        AiRequestLogId   BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_SmartboardAiRequestLog PRIMARY KEY,
        SchoolId         INT             NOT NULL,
        TeacherId        INT             NOT NULL,
        TopicId          INT             NULL,
        SessionId        BIGINT          NULL,
        RequestType      NVARCHAR(100)   NOT NULL,
        SourceType       NVARCHAR(50)    NULL,
        SourceId         BIGINT          NULL,
        PromptText       NVARCHAR(MAX)   NOT NULL,
        ResponseText     NVARCHAR(MAX)   NULL,
        Provider         NVARCHAR(50)    NULL,
        ModelName        NVARCHAR(100)   NULL,
        TokenCount       INT             NULL,
        CostMicroUsd     BIGINT          NULL,
        CreatedOn        DATETIME2(0)    NOT NULL CONSTRAINT DF_SmartboardAiRequestLog_CreatedOn DEFAULT (SYSUTCDATETIME())
    );

    CREATE INDEX IX_SmartboardAiRequestLog_School_Created
        ON dbo.SmartboardAiRequestLog (SchoolId, CreatedOn DESC);
END
GO

-- 5) SmartboardSchoolSetting --------------------------------------------------
IF OBJECT_ID(N'dbo.SmartboardSchoolSetting', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.SmartboardSchoolSetting
    (
        SettingId               INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_SmartboardSchoolSetting PRIMARY KEY,
        SchoolId                INT             NOT NULL,
        IsSmartboardEnabled     BIT             NOT NULL CONSTRAINT DF_SmartboardSchoolSetting_Smartboard DEFAULT (1),
        IsAiEnabled             BIT             NOT NULL CONSTRAINT DF_SmartboardSchoolSetting_Ai DEFAULT (1),
        AllowExport             BIT             NOT NULL CONSTRAINT DF_SmartboardSchoolSetting_Export DEFAULT (1),
        AllowStudentSharing     BIT             NOT NULL CONSTRAINT DF_SmartboardSchoolSetting_Sharing DEFAULT (1),
        IsAiSharingAllowed      BIT             NOT NULL CONSTRAINT DF_SmartboardSchoolSetting_AiSharing DEFAULT (0),
        AiMonthlyBudgetUsd      DECIMAL(10,2)   NOT NULL CONSTRAINT DF_SmartboardSchoolSetting_Budget DEFAULT (0),
        CreatedOn               DATETIME2(0)    NOT NULL CONSTRAINT DF_SmartboardSchoolSetting_CreatedOn DEFAULT (SYSUTCDATETIME()),
        ModifiedOn              DATETIME2(0)    NULL,
        CONSTRAINT UX_SmartboardSchoolSetting_School UNIQUE (SchoolId)
    );
END
GO
