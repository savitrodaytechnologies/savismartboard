using System.Data;
using System.Text.Json;
using Dapper;
using Smartboard.Api.Infrastructure;
using Smartboard.Api.Models.Dto;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Microsoft.IdentityModel.Tokens;
using System.Text;

namespace Smartboard.Api.Services;

public sealed class SaviLmsService : ISaviLmsService
{
    private readonly ISaviLmsConnectionFactory _db;
    private readonly ISaviKnowledgeBotConnectionFactory _knowledgeDb;
    private readonly IConfiguration _config;
    private static bool _schemaInitialized = false;
    private static readonly object _schemaLock = new();

    public SaviLmsService(ISaviLmsConnectionFactory db, ISaviKnowledgeBotConnectionFactory knowledgeDb, IConfiguration config)
    {
        _db = db;
        _knowledgeDb = knowledgeDb;
        _config = config;
        EnsureSchemaInitialized();
    }

    private void EnsureSchemaInitialized()
    {
        if (_schemaInitialized) return;

        lock (_schemaLock)
        {
            if (_schemaInitialized) return;

            using var conn = _db.Create();
            conn.Open();

            // Create LmsQuestions Table
            conn.Execute(@"
                IF OBJECT_ID(N'dbo.LmsQuestions', N'U') IS NULL
                BEGIN
                    CREATE TABLE dbo.LmsQuestions
                    (
                        QuestionId    BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_LmsQuestions PRIMARY KEY,
                        TopicSlug     NVARCHAR(100)   NOT NULL,
                        QuestionText  NVARCHAR(MAX)   NOT NULL,
                        QuestionType  NVARCHAR(50)    NOT NULL,
                        OptionsJson   NVARCHAR(MAX)   NULL,
                        AnswerText    NVARCHAR(MAX)   NULL,
                        Difficulty    INT             NOT NULL,
                        Source        NVARCHAR(100)   NOT NULL,
                        IsVerified    BIT             NOT NULL DEFAULT (0),
                        CreatedOn     DATETIME2(0)    NOT NULL DEFAULT (SYSUTCDATETIME())
                    );
                    CREATE INDEX IX_LmsQuestions_TopicSlug ON dbo.LmsQuestions(TopicSlug);
                END");

            // Create LmsExplanations Table
            conn.Execute(@"
                IF OBJECT_ID(N'dbo.LmsExplanations', N'U') IS NULL
                BEGIN
                    CREATE TABLE dbo.LmsExplanations
                    (
                        ExplanationId BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_LmsExplanations PRIMARY KEY,
                        QuestionId    BIGINT          NOT NULL CONSTRAINT FK_LmsExplanations_Questions REFERENCES dbo.LmsQuestions(QuestionId) ON DELETE CASCADE,
                        Html          NVARCHAR(MAX)   NOT NULL,
                        VersionId     BIGINT          NOT NULL DEFAULT (1),
                        CreatedOn     DATETIME2(0)    NOT NULL DEFAULT (SYSUTCDATETIME())
                    );
                    CREATE UNIQUE INDEX UX_LmsExplanations_QuestionId ON dbo.LmsExplanations(QuestionId);
                END");

            // Create LmsSolvedCards Table
            conn.Execute(@"
                IF OBJECT_ID(N'dbo.LmsSolvedCards', N'U') IS NULL
                BEGIN
                    CREATE TABLE dbo.LmsSolvedCards
                    (
                        SolvedCardId  BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_LmsSolvedCards PRIMARY KEY,
                        QuestionId    BIGINT          NOT NULL CONSTRAINT FK_LmsSolvedCards_Questions REFERENCES dbo.LmsQuestions(QuestionId) ON DELETE CASCADE,
                        Html          NVARCHAR(MAX)   NOT NULL,
                        VersionId     BIGINT          NOT NULL DEFAULT (1),
                        CreatedOn     DATETIME2(0)    NOT NULL DEFAULT (SYSUTCDATETIME())
                    );
                    CREATE UNIQUE INDEX UX_LmsSolvedCards_QuestionId ON dbo.LmsSolvedCards(QuestionId);
                END");

            // Create LmsQuestionPapers Table
            conn.Execute(@"
                IF OBJECT_ID(N'dbo.LmsQuestionPapers', N'U') IS NULL
                BEGIN
                    CREATE TABLE dbo.LmsQuestionPapers
                    (
                        QuestionPaperId BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_LmsQuestionPapers PRIMARY KEY,
                        SchoolId        VARCHAR(50)     NOT NULL,
                        Title           NVARCHAR(255)   NOT NULL,
                        Duration        INT             NOT NULL,
                        TotalMarks      INT             NOT NULL,
                        Difficulty      VARCHAR(50)     NOT NULL,
                        QuestionCount   INT             NOT NULL,
                        PaperSets       INT             NOT NULL,
                        QuestionType    VARCHAR(50)     NOT NULL,
                        Mode            VARCHAR(50)     NOT NULL,
                        BoardId         VARCHAR(50)     NOT NULL,
                        GradeId         VARCHAR(50)     NOT NULL,
                        SubjectId       VARCHAR(50)     NOT NULL,
                        SchoolName      NVARCHAR(255)   NULL,
                        SchoolAddress   NVARCHAR(500)   NULL,
                        SchoolPhone     NVARCHAR(100)   NULL,
                        Status          VARCHAR(20)     NOT NULL DEFAULT ('Pending'),
                        CreatedOn       DATETIME        NOT NULL DEFAULT (GETDATE()),
                        UpdatedOn       DATETIME        NOT NULL DEFAULT (GETDATE())
                    );
                END
                ELSE
                BEGIN
                    IF NOT EXISTS(SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.LmsQuestionPapers') AND name = 'SchoolName')
                    BEGIN
                        ALTER TABLE dbo.LmsQuestionPapers ADD SchoolName NVARCHAR(255) NULL;
                        ALTER TABLE dbo.LmsQuestionPapers ADD SchoolAddress NVARCHAR(500) NULL;
                        ALTER TABLE dbo.LmsQuestionPapers ADD SchoolPhone NVARCHAR(100) NULL;
                    END
                END");
            // Create LmsQuestionPaperSections Table


            conn.Execute(@"
                IF OBJECT_ID(N'dbo.LmsQuestionPaperSections', N'U') IS NULL
                BEGIN
                    CREATE TABLE dbo.LmsQuestionPaperSections
                    (
                        QuestionPaperSectionId BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_LmsQuestionPaperSections PRIMARY KEY,
                        QuestionPaperId        BIGINT          NOT NULL CONSTRAINT FK_LmsQuestionPaperSections_Papers REFERENCES dbo.LmsQuestionPapers(QuestionPaperId) ON DELETE CASCADE,
                        SectionName            VARCHAR(100)    NOT NULL,
                        Title                  NVARCHAR(255)   NOT NULL,
                        Marks                  INT             NOT NULL,
                        SortOrder              INT             NOT NULL
                    );
                END");

            // Create LmsQuestionPaperDetails Table
            conn.Execute(@"
                IF OBJECT_ID(N'dbo.LmsQuestionPaperDetails', N'U') IS NULL
                BEGIN
                    CREATE TABLE dbo.LmsQuestionPaperDetails
                    (
                        QuestionPaperDetailId   BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_LmsQuestionPaperDetails PRIMARY KEY,
                        QuestionPaperId         BIGINT          NOT NULL CONSTRAINT FK_LmsQuestionPaperDetails_Papers REFERENCES dbo.LmsQuestionPapers(QuestionPaperId) ON DELETE CASCADE,
                        QuestionPaperSectionId  BIGINT          NOT NULL CONSTRAINT FK_LmsQuestionPaperDetails_Sections REFERENCES dbo.LmsQuestionPaperSections(QuestionPaperSectionId),
                        QuestionId              VARCHAR(50)     NOT NULL,
                        QuestionText            NVARCHAR(MAX)   NOT NULL,
                        QuestionType            VARCHAR(50)     NOT NULL,
                        ChapterId               VARCHAR(50)     NULL,
                        TopicId                 NVARCHAR(MAX)   NULL,
                        OptionsJson             NVARCHAR(MAX)   NULL,
                        Difficulty              VARCHAR(50)     NOT NULL,
                        Marks                   INT             NOT NULL,
                        Source                  VARCHAR(100)    NOT NULL,
                        Slug                    VARCHAR(255)    NULL,
                        SortOrder               INT             NOT NULL
                    );
                END");

            _schemaInitialized = true;
        }
    }

    public async Task<IReadOnlyList<QuestionSummaryDto>> GetQuestionsAsync(string slug, int? difficulty, CancellationToken ct = default)
    {
        using var conn = _db.Create();
        string sql = @"
            SELECT QuestionId, QuestionType, Difficulty, QuestionText, Source 
            FROM dbo.LmsQuestions 
            WHERE TopicSlug = @slug";
        
        if (difficulty.HasValue)
        {
            sql += " AND Difficulty = @difficulty";
        }

        var rows = await conn.QueryAsync<(long QuestionId, string QuestionType, int Difficulty, string QuestionText, string Source)>(
            new CommandDefinition(sql, new { slug, difficulty }, cancellationToken: ct));

        return rows.Select(r => new QuestionSummaryDto(
            r.QuestionId, 
            r.QuestionType, 
            r.Difficulty, 
            Truncate(r.QuestionText, 120), 
            r.Source)).ToList();
    }

    public async Task<IReadOnlyList<LmsQuestionResponseDto>> GetQuestionsAsync(
        string? topicIds,
        string? chapterIds,
        bool randomSelection,
        string? questionTypeCounts,
        int defaultLimit,
        CancellationToken ct = default)
    {
        using var conn = _knowledgeDb.Create();

        var parameters = new DynamicParameters();
        parameters.Add("@TopicIds", topicIds);
        parameters.Add("@ChapterIds", chapterIds);
        parameters.Add("@RandomSelection", randomSelection);
        parameters.Add("@QuestionTypeCounts", questionTypeCounts);
        parameters.Add("@DefaultLimit", defaultLimit);

        var rows = await conn.QueryAsync<dynamic>(
            new CommandDefinition(
                "dbo.sp_GetQuestions",
                parameters,
                commandType: CommandType.StoredProcedure,
                cancellationToken: ct));

        var results = new List<LmsQuestionResponseDto>();

        foreach (var row in rows)
        {
            if (row is not IDictionary<string, object> dict) continue;

            var dto = new LmsQuestionResponseDto
            {
                Id = GetDictValue<long>(dict, "id", "questionid"),
                QuestionText = GetDictValue<string>(dict, "question_text", "questiontext") ?? string.Empty,
                QuestionType = GetDictValue<string>(dict, "question_type", "questiontype") ?? string.Empty,
                AnswerText = GetDictValue<string>(dict, "answer_text", "answertext"),
                SolutionText = GetDictValue<string>(dict, "solution_text", "solutiontext"),
                HintText = GetDictValue<string>(dict, "hint_text", "hinttext"),
                Difficulty = GetDictValue<int>(dict, "difficulty"),
                Marks = GetDictValue<int?>(dict, "marks"),
                Source = GetDictValue<string>(dict, "source"),
                IsVerified = GetDictValue<bool>(dict, "is_verified", "isverified"),
                SourceRef = GetDictValue<string>(dict, "source_ref", "sourceref")
            };

            string[]? options = null;
            var optionsStr = GetDictValue<string>(dict, "options_json", "options");
            if (!string.IsNullOrWhiteSpace(optionsStr))
            {
                try
                {
                    options = JsonSerializer.Deserialize<string[]>(optionsStr);
                }
                catch
                {
                    // Ignore parsing error
                }
            }

            dto.Options = options;
            results.Add(dto);
        }

        return results;
    }

    private static T? GetDictValue<T>(IDictionary<string, object> dict, params string[] keys)
    {
        var targetType = typeof(T);
        var underlyingType = Nullable.GetUnderlyingType(targetType) ?? targetType;

        foreach (var key in keys)
        {
            foreach (var dictKey in dict.Keys)
            {
                if (string.Equals(dictKey, key, StringComparison.OrdinalIgnoreCase))
                {
                    var val = dict[dictKey];
                    if (val != null && val != DBNull.Value)
                    {
                        try
                        {
                            if (underlyingType == typeof(bool))
                            {
                                if (val is bool b) return (T)(object)b;
                                if (val is int i) return (T)(object)(i != 0);
                                if (val is long l) return (T)(object)(l != 0);
                            }
                            return (T)Convert.ChangeType(val, underlyingType);
                        }
                        catch
                        {
                            // ignore conversion failure
                        }
                    }
                }
            }
        }
        return default;
    }

    public async Task<QuestionDto?> GetQuestionAsync(long questionId, CancellationToken ct = default)
    {
        using var conn = _db.Create();
        const string sql = @"
            SELECT QuestionId, QuestionText, QuestionType, OptionsJson, AnswerText, Difficulty, Source, IsVerified 
            FROM dbo.LmsQuestions 
            WHERE QuestionId = @questionId";

        var row = await conn.QueryFirstOrDefaultAsync<dynamic>(
            new CommandDefinition(sql, new { questionId }, cancellationToken: ct));

        if (row is null) return null;

        string[]? options = null;
        if (row.OptionsJson is string optionsJsonStr && !string.IsNullOrWhiteSpace(optionsJsonStr))
        {
            try
            {
                options = JsonSerializer.Deserialize<string[]>(optionsJsonStr);
            }
            catch
            {
                // Fallback in case of parse issues
            }
        }

        return new QuestionDto(
            (long)row.QuestionId,
            (string)row.QuestionText,
            (string)row.QuestionType,
            options,
            (string?)row.AnswerText,
            (int)row.Difficulty,
            (string)row.Source,
            (bool)row.IsVerified);
    }

    public async Task<ExplanationDto?> GetExplanationAsync(long questionId, CancellationToken ct = default)
    {
        using var conn = _db.Create();
        const string sql = @"
            SELECT QuestionId, Html, VersionId 
            FROM dbo.LmsExplanations 
            WHERE QuestionId = @questionId";

        var row = await conn.QueryFirstOrDefaultAsync<(long QuestionId, string Html, long VersionId)>(
            new CommandDefinition(sql, new { questionId }, cancellationToken: ct));

        if (row.QuestionId == 0) return null;

        return new ExplanationDto(row.QuestionId, row.Html, row.VersionId);
    }

    public async Task<SolvedCardDto?> GetSolvedCardAsync(long questionId, CancellationToken ct = default)
    {
        using var conn = _db.Create();
        const string sql = @"
            SELECT QuestionId, Html, VersionId 
            FROM dbo.LmsSolvedCards 
            WHERE QuestionId = @questionId";

        var row = await conn.QueryFirstOrDefaultAsync<(long QuestionId, string Html, long VersionId)>(
            new CommandDefinition(sql, new { questionId }, cancellationToken: ct));

        if (row.QuestionId == 0) return null;

        return new SolvedCardDto(row.QuestionId, row.Html, row.VersionId);
    }

    public async Task<QuestionSubmitResponseDto> SubmitQuestionsAsync(string slug, QuestionSubmitRequestDto request, CancellationToken ct = default)
    {
        using var conn = _db.Create();
        if (conn.State != ConnectionState.Open) conn.Open();

        using var transaction = conn.BeginTransaction();
        var questionIds = new List<long>();

        try
        {
            foreach (var item in request.Questions)
            {
                string? optionsJson = item.Options != null ? JsonSerializer.Serialize(item.Options) : null;
                
                const string insertQuestionSql = @"
                    INSERT INTO dbo.LmsQuestions (TopicSlug, QuestionText, QuestionType, OptionsJson, AnswerText, Difficulty, Source, IsVerified)
                    VALUES (@slug, @QuestionText, @QuestionType, @optionsJson, @AnswerText, @Difficulty, @Source, 1);
                    SELECT CAST(SCOPE_IDENTITY() as bigint);";

                long questionId = await conn.QuerySingleAsync<long>(new CommandDefinition(
                    insertQuestionSql,
                    new { 
                        slug, 
                        item.QuestionText, 
                        QuestionType = item.QuestionType ?? "MCQ", 
                        optionsJson, 
                        item.AnswerText, 
                        Difficulty = item.Difficulty ?? 2, 
                        request.Source 
                    },
                    transaction: transaction,
                    cancellationToken: ct));

                questionIds.Add(questionId);

                // Insert explanation / solved card if SolutionText is present
                if (!string.IsNullOrWhiteSpace(item.SolutionText))
                {
                    const string insertExplanationSql = @"
                        INSERT INTO dbo.LmsExplanations (QuestionId, Html, VersionId)
                        VALUES (@questionId, @SolutionText, 1);";

                    await conn.ExecuteAsync(new CommandDefinition(
                        insertExplanationSql,
                        new { questionId, item.SolutionText },
                        transaction: transaction,
                        cancellationToken: ct));

                    const string insertSolvedCardSql = @"
                        INSERT INTO dbo.LmsSolvedCards (QuestionId, Html, VersionId)
                        VALUES (@questionId, @SolutionText, 1);";

                    await conn.ExecuteAsync(new CommandDefinition(
                        insertSolvedCardSql,
                        new { questionId, item.SolutionText },
                        transaction: transaction,
                        cancellationToken: ct));
                }
            }

            transaction.Commit();
            return new QuestionSubmitResponseDto(questionIds.Count, questionIds);
        }
        catch
        {
            transaction.Rollback();
            throw;
        }
    }

    public async Task<LmsPaperSubmitResponseDto> SubmitQuestionPaperAsync(LmsPaperSubmitRequestDto request, CancellationToken ct = default)
    {
        using var conn = _db.Create();
        if (conn.State != ConnectionState.Open) conn.Open();

        using var transaction = conn.BeginTransaction();

        try
        {
            // 1. Insert into LmsQuestionPapers
            const string insertPaperSql = @"
                INSERT INTO dbo.LmsQuestionPapers (
                    SchoolId, SchoolName, SchoolAddress, SchoolPhone, Title, Duration, TotalMarks, Difficulty, QuestionCount, PaperSets, 
                    QuestionType, Mode, BoardId, GradeId, SubjectId, Status, CreatedOn, UpdatedOn
                ) VALUES (
                    @SchoolId, @SchoolName, @SchoolAddress, @SchoolPhone, @Title, @Duration, @TotalMarks, @Difficulty, @QuestionCount, @PaperSets, 
                    @QuestionType, @Mode, @BoardId, @GradeId, @SubjectId, 'Active', GETDATE(), GETDATE()
                );
                SELECT CAST(SCOPE_IDENTITY() as bigint);";

            long paperId = await conn.QuerySingleAsync<long>(new CommandDefinition(
                insertPaperSql,
                new {
                    SchoolId = request.SchoolId,
                    SchoolName = request.SchoolName,
                    SchoolAddress = request.SchoolAddress,
                    SchoolPhone = request.SchoolPhone,
                    Title = request.Paper.Title,
                    Duration = request.Paper.Duration,
                    TotalMarks = request.Paper.TotalMarks,
                    Difficulty = request.Paper.Difficulty,
                    QuestionCount = request.Paper.QuestionCount,
                    PaperSets = request.Paper.PaperSets,
                    QuestionType = request.Paper.QuestionType,
                    Mode = request.Paper.Mode,
                    BoardId = request.Selection.BoardId,
                    GradeId = request.Selection.GradeId,
                    SubjectId = request.Selection.SubjectId
                },
                transaction: transaction,
                cancellationToken: ct));

            // 2. Insert into LmsQuestionPaperSections
            var sectionIdMap = new Dictionary<string, long>();
            int sectionOrder = 1;

            foreach (var sec in request.Sections)
            {
                const string insertSectionSql = @"
                    INSERT INTO dbo.LmsQuestionPaperSections (QuestionPaperId, SectionName, Title, Marks, SortOrder)
                    VALUES (@paperId, @SectionName, @Title, @Marks, @SortOrder);
                    SELECT CAST(SCOPE_IDENTITY() as bigint);";

                long sectionId = await conn.QuerySingleAsync<long>(new CommandDefinition(
                    insertSectionSql,
                    new {
                        paperId,
                        SectionName = sec.Id,
                        Title = sec.Title,
                        Marks = sec.Marks,
                        SortOrder = sectionOrder++
                    },
                    transaction: transaction,
                    cancellationToken: ct));

                sectionIdMap[sec.Id] = sectionId;
            }

            // 3. Insert into LmsQuestionPaperDetails
            int questionOrder = 1;
            foreach (var q in request.Questions)
            {
                if (!sectionIdMap.TryGetValue(q.SectionId, out long sectionId))
                {
                    throw new InvalidOperationException($"Question refers to missing section ID: {q.SectionId}");
                }

                string? optionsJson = q.Options != null ? JsonSerializer.Serialize(q.Options) : null;

                const string insertQuestionSql = @"
                    INSERT INTO dbo.LmsQuestionPaperDetails (
                        QuestionPaperId, QuestionPaperSectionId, QuestionId, QuestionText, QuestionType, 
                        ChapterId, TopicId, OptionsJson, Difficulty, Marks, Source, Slug, SortOrder
                    ) VALUES (
                        @paperId, @sectionId, @QuestionId, @QuestionText, @QuestionType, 
                        @ChapterId, @TopicId, @optionsJson, @Difficulty, @Marks, @Source, @Slug, @SortOrder
                    );";

                await conn.ExecuteAsync(new CommandDefinition(
                    insertQuestionSql,
                    new {
                        paperId,
                        sectionId,
                        QuestionId = q.Id,
                        QuestionText = q.Text,
                        QuestionType = q.Type,
                        ChapterId = q.ChapterId,
                        TopicId = q.TopicId,
                        optionsJson,
                        Difficulty = q.Difficulty,
                        Marks = q.Marks,
                        Source = q.Source,
                        Slug = q.Slug,
                        SortOrder = questionOrder++
                    },
                    transaction: transaction,
                    cancellationToken: ct));
            }

            transaction.Commit();
            return new LmsPaperSubmitResponseDto(paperId, true, "Question paper submitted and saved successfully.");
        }
        catch (Exception ex)
        {
            transaction.Rollback();
            return new LmsPaperSubmitResponseDto(0, false, $"Failed to submit question paper: {ex.Message}");
        }
    }

    public async Task<IReadOnlyList<LmsPaperListItemDto>> GetQuestionPapersBySchoolAsync(string schoolId, CancellationToken ct = default)
    {
        using var conn = _db.Create();
        const string sql = @"
            SELECT QuestionPaperId, SchoolId, SchoolName, SchoolAddress, SchoolPhone, Title, Duration, TotalMarks, Difficulty, QuestionCount, 
                   PaperSets, QuestionType, Mode, BoardId, GradeId, SubjectId, Status, CreatedOn
            FROM dbo.LmsQuestionPapers
            WHERE SchoolId = @schoolId
            ORDER BY QuestionPaperId DESC";

        var rows = await conn.QueryAsync<LmsPaperListItemDto>(
            new CommandDefinition(sql, new { schoolId }, cancellationToken: ct));

        return rows.ToList();
    }

    public async Task<LmsPaperDetailDto?> GetQuestionPaperByIdAsync(long paperId, CancellationToken ct = default)
    {
        using var conn = _db.Create();
        const string paperSql = @"
            SELECT QuestionPaperId, SchoolId, SchoolName, SchoolAddress, SchoolPhone, Title, Duration, TotalMarks, Difficulty, QuestionCount, 
                   PaperSets, QuestionType, Mode, BoardId, GradeId, SubjectId, Status, CreatedOn
            FROM dbo.LmsQuestionPapers
            WHERE QuestionPaperId = @paperId";


        var paper = await conn.QueryFirstOrDefaultAsync<LmsPaperListItemDto>(
            new CommandDefinition(paperSql, new { paperId }, cancellationToken: ct));

        if (paper is null) return null;

        const string sectionSql = @"
            SELECT QuestionPaperSectionId, QuestionPaperId, SectionName, Title, Marks, SortOrder
            FROM dbo.LmsQuestionPaperSections
            WHERE QuestionPaperId = @paperId
            ORDER BY SortOrder, QuestionPaperSectionId";

        var sectionRows = await conn.QueryAsync<LmsPaperDetailSectionDto>(
            new CommandDefinition(sectionSql, new { paperId }, cancellationToken: ct));
        var sections = sectionRows.ToList();

        const string detailSql = @"
            SELECT QuestionPaperDetailId, QuestionPaperId, QuestionPaperSectionId, QuestionId, QuestionText, QuestionType,
                   ChapterId, TopicId, OptionsJson, Difficulty, Marks, Source, Slug, SortOrder
            FROM dbo.LmsQuestionPaperDetails
            WHERE QuestionPaperId = @paperId
            ORDER BY SortOrder, QuestionPaperDetailId";

        var rawDetails = (await conn.QueryAsync<dynamic>(
            new CommandDefinition(detailSql, new { paperId }, cancellationToken: ct))).ToList();

        var questions = new List<LmsPaperDetailQuestionDto>();
        foreach (var r in rawDetails)
        {
            if (r is not IDictionary<string, object> dict) continue;

            string[]? options = null;
            var optionsStr = GetDictValue<string>(dict, "OptionsJson", "optionsjson");
            if (!string.IsNullOrWhiteSpace(optionsStr))
            {
                try
                {
                    options = JsonSerializer.Deserialize<string[]>(optionsStr);
                }
                catch
                {
                    // Ignore JSON deserialize error
                }
            }

            questions.Add(new LmsPaperDetailQuestionDto(
                GetDictValue<long>(dict, "QuestionPaperDetailId"),
                GetDictValue<long>(dict, "QuestionPaperId"),
                GetDictValue<long>(dict, "QuestionPaperSectionId"),
                GetDictValue<string>(dict, "QuestionId") ?? string.Empty,
                GetDictValue<string>(dict, "QuestionText") ?? string.Empty,
                GetDictValue<string>(dict, "QuestionType") ?? string.Empty,
                GetDictValue<string>(dict, "ChapterId"),
                GetDictValue<string>(dict, "TopicId"),
                options,
                GetDictValue<string>(dict, "Difficulty") ?? "Medium",
                GetDictValue<int>(dict, "Marks"),
                GetDictValue<string>(dict, "Source") ?? "KBot",
                GetDictValue<string>(dict, "Slug"),
                GetDictValue<int>(dict, "SortOrder")
            ));
        }

        return new LmsPaperDetailDto(paper, sections, questions);
    }

    public async Task<LmsTokenResponseDto> AuthenticateSchoolAsync(LmsTokenRequestDto request, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(request.SecretKey))
        {
            return new LmsTokenResponseDto(false, "SecretKey is required for authentication.", null, null, null, null, null);
        }

        using var conn = _db.Create();

        var reqDomain = request.DomainName?.TrimEnd('/') ?? "";

        const string userSql = @"
            SELECT lmsUserId, productName, domainName, SecretKey, startDate, endDate, IsActive
            FROM dbo.LmsUsers
            WHERE SecretKey = @secretKey 
              AND (
                  (domainName IS NULL OR LEN(domainName) = 0) 
                  OR 
                  (domainName = @reqDomain OR domainName = @reqDomain + '/')
              )
              AND IsActive = 1";

        try
        {
            var user = await conn.QueryFirstOrDefaultAsync<dynamic>(
                new CommandDefinition(userSql, new { secretKey = request.SecretKey, reqDomain = reqDomain }, cancellationToken: ct));

            if (user is IDictionary<string, object> userDict)
            {
                // Date Validation
                var now = DateTime.UtcNow;
                var startDate = GetDictValue<DateTime?>(userDict, "startdate", "startDate");
                var endDate = GetDictValue<DateTime?>(userDict, "enddate", "endDate");
                
                if (startDate.HasValue && now < startDate.Value)
                    return new LmsTokenResponseDto(false, "Subscription has not started yet.", null, null, null, null, null);
                
                if (endDate.HasValue && now > endDate.Value)
                    return new LmsTokenResponseDto(false, "Subscription has expired.", null, null, null, null, null);

                string pName = GetDictValue<string>(userDict, "productname", "productName") ?? "UniversalSDK";
                string uId = GetDictValue<long>(userDict, "lmsuserid", "lmsUserId").ToString();

                var lmsKeyString = _config["LmsJwt:Key"] ?? "savischools-lms-sdk-secret-key-32-chars!!";
                var securityKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(lmsKeyString));
                var credentials = new SigningCredentials(securityKey, SecurityAlgorithms.HmacSha256);

                var claims = new[]
                {
                    new Claim(JwtRegisteredClaimNames.Sub, uId),
                    new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString()),
                    new Claim("productName", pName),
                    new Claim("domainName", reqDomain)
                };

                var token = new JwtSecurityToken(
                    issuer: "SaviLMS",
                    audience: "SaviLMS_SDK",
                    claims: claims,
                    expires: DateTime.UtcNow.AddHours(24),
                    signingCredentials: credentials);

                string jwtToken = new JwtSecurityTokenHandler().WriteToken(token);

                return new LmsTokenResponseDto(true, "Authentication successful.", jwtToken, uId, pName, null, null);
            }
        }
        catch (Exception ex)
        {
            return new LmsTokenResponseDto(false, "Backend Error: " + ex.Message, null, null, null, null, null);
        }
        
        return new LmsTokenResponseDto(false, "Invalid Secret Key.", null, null, null, null, null);
    }

    private static string Truncate(string s, int maxLen) =>
        s.Length <= maxLen ? s : s[..maxLen].TrimEnd() + "…";
}


