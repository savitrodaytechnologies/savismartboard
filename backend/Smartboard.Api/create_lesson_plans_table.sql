-- DDL Script to create Lesson Plan storage table in MS SQL Server
IF OBJECT_ID('dbo.SmartboardLessonPlan', 'U') IS NOT NULL
    DROP TABLE dbo.SmartboardLessonPlan;
GO

CREATE TABLE dbo.SmartboardLessonPlan (
    -- 1. Primary Keys & Identifiers
    LessonPlanId   BIGINT IDENTITY(1,1) NOT NULL,
    SchoolId       INT NOT NULL,                      -- Multitenant validation
    TeacherId      INT NOT NULL,                      -- Author (Teacher)
    
    -- 2. Curriculum Reference IDs (For fast database lookups/relations)
    ClassId        NVARCHAR(100) NULL,                -- Curriculum Class Code/ID
    SubjectId      NVARCHAR(100) NULL,                -- Curriculum Subject Code/ID
    ChapterId      NVARCHAR(100) NULL,                -- Curriculum Chapter Code/ID
    TopicId        NVARCHAR(100) NULL,                -- Curriculum Topic Code/ID
    
    -- 3. Human-Readable Names (For displaying in lists and searches)
    ClassName      NVARCHAR(100) NULL,                -- Name of the class (e.g. Class 9)
    SubjectName    NVARCHAR(100) NULL,                -- Name of the subject (e.g. Physics)
    ChapterName    NVARCHAR(150) NULL,                -- Name of the chapter (e.g. Motion)
    TopicName      NVARCHAR(255) NOT NULL,            -- Name of the topic (e.g. Distance vs Displacement)
    
    -- 4. Complete Lesson Plan & Slide Deck Data
    PlanJson       NVARCHAR(MAX) NOT NULL,            -- Entire content & slides stored in single JSON
    
    -- 5. Timestamps
    CreatedOn      DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    UpdatedOn      DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    
    CONSTRAINT PK_SmartboardLessonPlan PRIMARY KEY CLUSTERED (LessonPlanId)
);
GO

-- 6. High-Performance Filters Index
-- Used when a teacher filters the dashboard list by Class/Subject/Chapter
CREATE NONCLUSTERED INDEX IX_SmartboardLessonPlan_Curriculum_Filters
    ON dbo.SmartboardLessonPlan (SchoolId, ClassId, SubjectId, ChapterId)
    INCLUDE (TopicName, CreatedOn);
GO

-- Topic ID lookup index
CREATE NONCLUSTERED INDEX IX_SmartboardLessonPlan_TopicLookup
    ON dbo.SmartboardLessonPlan (TopicId);
GO
