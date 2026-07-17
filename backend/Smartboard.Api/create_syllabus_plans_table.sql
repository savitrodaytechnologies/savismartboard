-- DDL Script to create dedicated Syllabus Plan storage table in MS SQL Server
IF OBJECT_ID('dbo.LmsSyllabusPlan', 'U') IS NOT NULL
    DROP TABLE dbo.LmsSyllabusPlan;
GO

CREATE TABLE dbo.LmsSyllabusPlan (
    -- 1. Primary Keys & Identifiers
    SyllabusPlanId  BIGINT IDENTITY(1,1) NOT NULL,
    SchoolId        INT NOT NULL,                      -- Multitenant validation
    TeacherId       INT NULL,                          -- Author / Lead Teacher reference
    
    -- 2. Scope & Context Parameters
    BoardId         NVARCHAR(100) NOT NULL,            -- Curriculum Board Code/Name (e.g. CBSE India, ICSE)
    ClassId         NVARCHAR(100) NOT NULL,            -- Grade level ID (e.g. Grade 6, 7)
    SubjectId       NVARCHAR(100) NOT NULL,            -- Subject ID (e.g. Science, Mathematics)
    SessionYear     VARCHAR(20) NOT NULL,              -- Academic session (e.g. 2026-27)
    
    -- 3. Human-Readable Context Display
    BoardName       NVARCHAR(100) NULL,                
    ClassName       NVARCHAR(100) NULL,                
    SubjectName     NVARCHAR(100) NULL,                
    BookName        NVARCHAR(255) NULL,                -- Primary Textbook used (e.g. Primary Mathematics Book 6)
    
    -- 4. Syllabus & Monthly Roadmap Distribution Payload
    -- Stores month-wise chapter/topic distribution mappings, exam weights, blueprint settings, and milestones
    PlanJson        NVARCHAR(MAX) NOT NULL,            
    
    -- 5. Timestamps
    CreatedOn       DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    UpdatedOn       DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    
    CONSTRAINT PK_LmsSyllabusPlan PRIMARY KEY CLUSTERED (SyllabusPlanId)
);
GO

-- 6. Indexes for Fast Filtering & Uniqueness Lookup
-- Ensures a single active syllabus plan exists per school, board, class, subject and session.
CREATE UNIQUE NONCLUSTERED INDEX UX_LmsSyllabusPlan_UniquePlan
    ON dbo.LmsSyllabusPlan (SchoolId, BoardId, ClassId, SubjectId, SessionYear);
GO

-- General filter lookups index
CREATE NONCLUSTERED INDEX IX_LmsSyllabusPlan_Filters
    ON dbo.LmsSyllabusPlan (SchoolId, ClassId, SubjectId)
    INCLUDE (SessionYear, BookName, UpdatedOn);
GO
