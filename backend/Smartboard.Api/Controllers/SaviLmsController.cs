using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Smartboard.Api.Models.Dto;
using Smartboard.Api.Services;
using Smartboard.Api.HttpClients;

namespace Smartboard.Api.Controllers;

[ApiController]
[Authorize(AuthenticationSchemes = "LmsJwt")]
[Route("api/v1/smartboard/lms")]
public sealed class SaviLmsController : ControllerBase
{
    private readonly ISaviLmsService _svc;
    private readonly IAiClient _ai;

    public SaviLmsController(ISaviLmsService svc, IAiClient ai)
    {
        _svc = svc;
        _ai = ai;
    }

    [HttpGet("topics/{slug}/questions")]
    public async Task<IActionResult> GetQuestions(string slug, [FromQuery] int? difficulty, CancellationToken ct)
        => Ok(await _svc.GetQuestionsAsync(slug, difficulty, ct));

    [HttpGet("questions")]
    public async Task<IActionResult> GetQuestions(
        [FromQuery] string? topicIds,
        [FromQuery] string? chapterIds,
        [FromQuery] bool randomSelection = true,
        [FromQuery] string? questionTypeCounts = null,
        [FromQuery] int defaultLimit = 100,
        CancellationToken ct = default)
    {
        var questions = await _svc.GetQuestionsAsync(topicIds, chapterIds, randomSelection, questionTypeCounts, defaultLimit, ct);
        return Ok(questions);
    }

    [HttpGet("questions/{questionId:long}")]
    public async Task<IActionResult> GetQuestion(long questionId, CancellationToken ct)
        => (await _svc.GetQuestionAsync(questionId, ct)) is { } q ? Ok(q) : NotFound();

    [HttpGet("questions/{questionId:long}/explanation")]
    public async Task<IActionResult> GetExplanation(long questionId, CancellationToken ct)
        => (await _svc.GetExplanationAsync(questionId, ct)) is { } q ? Ok(q) : NotFound();

    [HttpGet("questions/{questionId:long}/solved-card")]
    public async Task<IActionResult> GetSolved(long questionId, CancellationToken ct)
        => (await _svc.GetSolvedCardAsync(questionId, ct)) is { } q ? Ok(q) : NotFound();

    [HttpPost("topics/{slug}/questions/submit")]
    public async Task<IActionResult> SubmitQuestions(string slug, [FromBody] QuestionSubmitRequestDto request, CancellationToken ct)
        => Ok(await _svc.SubmitQuestionsAsync(slug, request, ct));

    [HttpPost("papers")]
    public async Task<IActionResult> SubmitQuestionPaper([FromBody] LmsPaperSubmitRequestDto request, CancellationToken ct)
        => Ok(await _svc.SubmitQuestionPaperAsync(request, ct));

    [HttpGet("papers")]
    public async Task<IActionResult> GetQuestionPapers([FromQuery] string schoolId, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(schoolId))
            return BadRequest("SchoolId is required.");
        return Ok(await _svc.GetQuestionPapersBySchoolAsync(schoolId, ct));
    }

    [HttpGet("papers/{paperId:long}")]
    public async Task<IActionResult> GetQuestionPaper(long paperId, CancellationToken ct)
        => (await _svc.GetQuestionPaperByIdAsync(paperId, ct)) is { } paper ? Ok(paper) : NotFound();

    [HttpGet("paper-groups")]
    public async Task<IActionResult> GetPaperGroups([FromQuery] string schoolId, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(schoolId))
            return BadRequest("SchoolId is required.");
        return Ok(await _svc.GetPaperGroupsBySchoolAsync(schoolId, ct));
    }

    [AllowAnonymous]
    [HttpPost("auth/token")]
    public async Task<IActionResult> AuthenticateSchool([FromBody] LmsTokenRequestDto? request, CancellationToken ct)
    {
        var req = request ?? new LmsTokenRequestDto();
        var result = await _svc.AuthenticateSchoolAsync(req, ct);
        if (!result.Success) return Unauthorized(result);
        return Ok(result);
    }

    [AllowAnonymous]
    [HttpGet("skill-files/{id:int}")]
    public async Task<IActionResult> GetSkillFileContent(int id)
    {
        var content = await _svc.GetSkillFilesContentForTopicsAsync(new List<int> { id });
        if (content == null) return NotFound("Skill file not found.");
        return Ok(new { content });
    }

    [AllowAnonymous]
    [HttpPost("lesson-plans/generate")]
    public async Task<IActionResult> GenerateLessonPlan([FromBody] LmsLessonPlanGenerateRequest request, CancellationToken ct)
    {
        if (request == null) return BadRequest("Request body cannot be null.");

        var topics = request.Topics ?? new List<LmsTopicItem>();
        if (topics.Count == 0 && !string.IsNullOrWhiteSpace(request.TopicName))
            topics = new List<LmsTopicItem> { new LmsTopicItem(request.TopicName, request.TopicIds?.FirstOrDefault() ?? 0) };
        if (topics.Count == 0)
            return BadRequest("At least one topic must be selected.");

        // SLIDES JSON
        const string slidesSystemPrompt =
            "You are an AI presentation designer. Generate a classroom presentation as a JSON ARRAY ONLY.\n" +
            "Return ONLY valid JSON — no markdown fences, no extra text.\n" +
            "Schema: [{\"id\":1,\"title\":\"...\",\"type\":\"title|content|quiz\",\"content\":{\"title\":\"...\",\"subtitle\":\"...\",\"bullets\":[\"...\"],\"questions\":[{\"q\":\"...?\",\"opts\":[\"A\",\"B\",\"C\",\"D\"]}]}}]\n" +
            "Generate exactly 10 slides: 1=Title, 2=Objectives, 3=Key Concepts, 4=Explanation, 5=Real-life Example, 6=Activity, 7=HOTS, 8=Quick Quiz (type=quiz, 2 questions with 4 options), 9=Summary, 10=Homework.\n" +
            "Each content slide: 4–5 specific bullets. Be 100% specific to the topic.";

        var results = new List<object>();

        foreach (var topic in topics)
        {
            string? skillFileContent = null;
            if (topic.Id > 0)
                skillFileContent = await _svc.GetSkillFilesContentForTopicsAsync(new List<int> { topic.Id });

            string ctx =
                $"Board: {request.Standard}\n" +
                $"Class: {request.ClassName}\n" +
                $"Subject: {request.SubjectName}\n" +
                $"Chapter: {request.ChapterName}\n" +
                $"Topic: {topic.Name}\n" +
                $"Duration: {request.Duration}\n" +
                $"Student Level: {request.Complexity}\n" +
                $"Language: {request.Language}\n" +
                $"Learning Style: {request.LearningStyle}\n" +
                $"Plan Type: {request.Type}-wise\n" +
                $"IMPORTANT: All content must be specific to topic '{topic.Name}' only.";

            if (!string.IsNullOrEmpty(skillFileContent))
                ctx += $"\n\nSyllabus Reference Content:\n{skillFileContent}";

            string slidesCtx = $"Class: {request.ClassName} | Subject: {request.SubjectName} | Topic: {topic.Name} | Duration: {request.Duration}";

            try
            {
                string planContent = "";
                var tSlides = _ai.ChatAsync(slidesSystemPrompt, new AiMessage(slidesCtx), ct);

                if (request.Type == "academic")
                {
                    const string lessonPlanSystemPrompt =
                        "You are an expert curriculum coordinator and AI Academic Planner.\n" +
                        "Generate a highly professional Academic Plan and Syllabus Tracker based on the syllabus context.\n" +
                        "Output ONLY clean markdown - no JSON, no code fences, no preamble.\n\n" +
                        "Use the following structure:\n" +
                        "# Academic Planner & Syllabus Tracker: <Topic>\n\n" +
                        "## 1. Chapter Division & Topic Split\n" +
                        "Estimate the total teaching periods (e.g. 10 Periods) and list the split topics:\n" +
                        "| Topic Name | Sub-Concepts | Allocated Periods | Key Activity |\n" +
                        "|---|---|---|---|\n\n" +
                        "## 2. Monthly Syllabus Calendar\n" +
                        "Divide the syllabus across a standard academic month:\n" +
                        "- **Week 1 (Target: Topics 1-2)**: [Detailed description of lessons and learning goals]\n" +
                        "- **Week 2 (Target: Topics 3-4)**: [Detailed description]\n" +
                        "- **Week 3 (Target: Topics 5)**: [Detailed description]\n" +
                        "- **Week 4 (Target: Revision & Assessment)**: [Detailed description]\n\n" +
                        "## 3. Daily Period-wise Lesson Outlines\n" +
                        "For each estimated period, provide a 3-line quick outline:\n" +
                        "- **Period 1: <Topic Name>**\n" +
                        "  - *Learning Goal*: [Goal]\n" +
                        "  - *Blackboard Setup*: [Key words/diagram to draw]\n" +
                        "  - *Activity/Homework*: [Task]\n\n" +
                        "## 4. Assessment & Reporting Plan\n" +
                        "- **Formative check points**: [Worksheet and quiz triggers]\n" +
                        "- **Weekly/Monthly Metrics**: [Admin progress metrics]";

                    var tPlan = _ai.ChatAsync(lessonPlanSystemPrompt, new AiMessage(ctx), ct);
                    await Task.WhenAll(tPlan, tSlides);

                    static string CleanFences(string raw)
                    {
                        raw = raw.Trim();
                        if (!raw.StartsWith("```")) return raw;
                        return string.Join("\n", raw.Split('\n').Where(l => !l.Trim().StartsWith("```")));
                    }

                    planContent = CleanFences(tPlan.Result);
                }
                else if (request.Mode == "short")
                {
                    const string lessonPlanSystemPrompt =
                        "You are an expert curriculum assistant. Generate a highly structured, point-wise short classroom lesson plan in JSON format ONLY.\n" +
                        "Return ONLY valid JSON matching this schema exactly — no markdown fences, no extra text:\n" +
                        "{\n" +
                        "  \"lessonInfo\": { \"subject\": \"...\", \"class\": \"...\", \"chapter\": \"...\", \"topic\": \"...\", \"duration\": \"45 Minutes\", \"date\": \"\", \"teacherName\": \"\", \"schoolName\": \"Savitroday School\" },\n" +
                        "  \"learningObjectives\": { \"remember\": \"...\", \"understand\": \"...\", \"apply\": \"...\", \"analyze\": \"...\", \"evaluate\": \"...\" },\n" +
                        "  \"prerequisiteKnowledge\": [\"...\"],\n" +
                        "  \"teachingMaterials\": { \"general\": [\"Textbook\", \"Blackboard\", \"Notebook\"], \"digital\": [\"PPT\", \"Projector\", \"Video\"], \"activityMaterials\": [\"...\"] },\n" +
                        "  \"lessonFlow\": {\n" +
                        "    \"introduction\": { \"duration\": \"5 min\", \"teacherActivities\": [\"...\"], \"studentActivities\": [\"...\"], \"guidingQuestions\": [\"...\"] },\n" +
                        "    \"conceptExplanation\": { \"duration\": \"15 min\", \"concepts\": [ { \"title\": \"...\", \"explanation\": \"...\", \"example\": \"...\", \"blackboardContent\": \"...\" } ] },\n" +
                        "    \"activity\": { \"duration\": \"10 min\", \"title\": \"...\", \"teacherInstructions\": \"...\", \"studentTask\": \"...\", \"expectedOutcome\": \"...\" },\n" +
                        "    \"practice\": { \"duration\": \"5 min\", \"questions\": [ { \"type\": \"MCQ\", \"question\": \"...\", \"answer\": \"...\" }, { \"type\": \"Short Answer\", \"question\": \"...\", \"answer\": \"...\" } ] },\n" +
                        "    \"recap\": { \"duration\": \"3 min\", \"summaryPoints\": [\"...\"], \"oralQuestions\": [\"...\"] },\n" +
                        "    \"homework\": { \"reading\": \"...\", \"writing\": \"...\", \"activity\": \"...\", \"digitalAssignment\": \"...\" }\n" +
                        "  },\n" +
                        "  \"blackboardPlan\": { \"topic\": \"...\", \"definition\": \"...\", \"formula\": \"...\", \"diagram\": \"...\", \"example\": \"...\", \"summary\": \"...\" },\n" +
                        "  \"assessment\": { \"formative\": [\"Observation\", \"Question Answer\", \"Activity\"], \"summative\": [\"Worksheet\", \"Quiz\", \"Exit Ticket\"] },\n" +
                        "  \"differentiation\": { \"slowLearners\": [\"...\"], \"averageLearners\": [\"...\"], \"advancedLearners\": [\"...\"] },\n" +
                        "  \"realLifeConnection\": {},\n" +
                        "  \"teacherNotes\": { \"commonMistakes\": [\"...\"], \"teachingTips\": [\"...\"] },\n" +
                        "  \"aiResources\": { \"presentationPrompt\": \"...\", \"worksheetPrompt\": \"...\", \"quizPrompt\": \"...\", \"imagePrompt\": \"...\", \"videoSuggestion\": \"...\" },\n" +
                        "  \"timeBreakdown\": { \"introduction\": \"5 min\", \"conceptExplanation\": \"15 min\", \"activity\": \"10 min\", \"practice\": \"5 min\", \"recap\": \"3 min\", \"homework\": \"2 min\", \"buffer\": \"5 min\" }\n" +
                        "}";

                    var tPlan = _ai.ChatAsync(lessonPlanSystemPrompt, new AiMessage(ctx), ct);
                    await Task.WhenAll(tPlan, tSlides);

                    static string CleanFences(string raw)
                    {
                        raw = raw.Trim();
                        if (!raw.StartsWith("```")) return raw;
                        return string.Join("\n", raw.Split('\n').Where(l => !l.Trim().StartsWith("```")));
                    }

                    planContent = FormatShortPlanJsonToMarkdown(CleanFences(tPlan.Result));
                }
                else
                {
                    const string Role =
                        "You are an expert curriculum designer, master teacher, and AI lesson planning specialist creating a Universal Hybrid Lesson Plan.\n" +
                        "RULES: Fill every section dynamically with highly relevant topic-specific content. Do not write placeholders. Use clean markdown tables, bold text, and lists. Focus on Micro-teaching Skills (Explanation, Illustration, Blackboard writing, Set Induction).\n" +
                        "Output ONLY plain markdown — no JSON, no code fences, no preamble, no explanation outside the requested sections.\n\n";

                    string chunk1Sys = Role +
                        "Generate Sections 1–4 of a Universal Hybrid Lesson Plan.\n\n" +
                        "# Hybrid Lesson Plan: <Topic>\n\n" +
                        "## 1. Metadata\n" +
                        "A 2-column key-value table matching this format EXACTLY to prevent horizontal squishing on print:\n" +
                        "| Category | Details |\n" +
                        "|---|---|\n" +
                        "| **Lesson Title** | [fill Title] |\n" +
                        "| **Subject** | [fill Subject] |\n" +
                        "| **Class** | [fill Class] |\n" +
                        "| **Chapter** | [fill Chapter] |\n" +
                        "| **Duration** | [fill Duration] |\n" +
                        "| **Date** | [Leave Blank for User] |\n" +
                        "| **School Name** | Savitroday School |\n" +
                        "| **Teacher Name** | [Leave Blank for User] |\n\n" +
                        "## 2. Instructional Framework\n" +
                        "### A. Learning Objectives\n" +
                        "**Cognitive Domain**:\n" +
                        "- **Knowledge**: [what students will recall/define/state]\n" +
                        "- **Understanding**: [what students will explain/describe/illustrate]\n" +
                        "- **Application**: [what students will apply/solve/compare]\n" +
                        "- **Analysis**: [what students will analyze/differentiate/classify]\n" +
                        "- **Synthesis**: [what students will create/design/formulate]\n" +
                        "- **Evaluation**: [what students will evaluate/judge/justify]\n\n" +
                        "**Affective Domain**:\n" +
                        "- **Attitude**: [develop interest/curiosity]\n" +
                        "- **Values**: [appreciate/understand importance]\n" +
                        "- **Participation**: [actively participate in discussions]\n\n" +
                        "**Psychomotor Domain**:\n" +
                        "- **Skill**: [demonstrate/draw/observe/record]\n" +
                        "- **Precision**: [accurately write/solve/measure]\n" +
                        "- **Coordination**: [use tools/equipment properly]\n\n" +
                        "### B. Sub-Concepts Mapping\n" +
                        "Table: Sub-Topic | Key Points | Time Allocation | Teaching Strategy (exactly 3 sub-concepts specific to this topic)\n\n" +
                        "## 3. Pedagogical Approach\n" +
                        "- **Teaching Methods**: Lecture Method, Demonstration Method, Question-Answer Method, Activity-Based Learning, Group Discussion\n" +
                        "- **Selected Method**: [choose 1-2 core methods and explain briefly why they fit this topic]\n" +
                        "- **Micro-Teaching Skills Checklist**:\n" +
                        "  - Skill of Set Induction (Introduction)\n" +
                        "  - Skill of Explanation (Main Concept)\n" +
                        "  - Skill of Illustration with Examples\n" +
                        "  - Skill of Blackboard Writing\n" +
                        "  - Skill of Reinforcement (Recapitulation)\n" +
                        "  - Skill of Probing Questioning (Evaluation)\n  - Skill of Stimulus Variation\n  - Skill of Closure (Summarizing)\n\n" +
                        "## 4. Teaching Aids\n" +
                        "- **General Aids**: Blackboard/Whiteboard, Chalk/Markers, Duster, Textbook, Notebooks\n" +
                        "- **Visual Aids**: Chart/Poster, Flashcards, PPT/Google Slides, Video/Animation, Diagram/Model\n" +
                        "- **Digital Aids**: Laptop/Projector, AI Tools, Online Quiz, Interactive Whiteboard\n" +
                        "- **Specific Aids**: [Subject-specific aids - e.g., Lab equipment, Map, Number cards]\n";

                    string chunk2Sys = Role +
                        "Generate Section 5: Procedure (Phases 1–3) of a Universal Hybrid Lesson Plan.\n\n" +
                        "## 5. Procedure\n" +
                        "### Phase 1: Introduction (Skill of Set Induction)\n" +
                        "- **Duration**: 5 Minutes\n" +
                        "- **Teacher Activity**: [Brief hook/demo/story/testing questions to generate curiosity]\n" +
                        "- **Pupil Activity**: [Student responses and observations]\n" +
                        "- **Transition (Declaration of Topic)**: Teacher announces topic and writes it on the blackboard.\n" +
                        "- **Brisk AI / ChatGPT Prompt**: [A copy-pasteable prompt for the teacher to generate alternative hook activities for this specific topic]\n\n" +
                        "### Phase 2: Presentation / Development\n" +
                        "- **Duration**: 20 Minutes\n" +
                        "Generate exactly 3 logical sub-sections matching the sub-concepts listed in Chunk 1. For EACH write:\n" +
                        "#### Sub-Concept [Number]: [Subtopic Name]\n" +
                        "- **Skill**: Skill of Explanation + Illustration\n" +
                        "- **Teacher Explanation**: [Detailed paragraph explaining the sub-concept scientifically and clearly]\n" +
                        "- **Blackboard Text**: [Bullet points for board]\n" +
                        "- **Illustration**: [Analogy, diagram, or real-world example]\n" +
                        "- **Student Activity**: [What students will do/say during explanation]\n" +
                        "- **Brisk AI / ChatGPT Prompt**: [A copy-pasteable prompt for the teacher to generate worksheets/resources for this sub-concept]\n\n" +
                        "### Phase 3: Recapitulation & Daily Life Connection\n" +
                        "- **Duration**: 5 Minutes\n" +
                        "- **Skill**: Skill of Reinforcement\n" +
                        "List 3 real-world phenomena and explain how they connect to the topic:\n" +
                        "1. **[Phenomenon 1]**: [Explanation]\n" +
                        "2. **[Phenomenon 2]**: [Explanation]\n" +
                        "3. **[Phenomenon 3]**: [Explanation]\n" +
                        "- **Brisk AI / ChatGPT Prompt**: [Prompt to generate more real-life connections]\n";

                    string chunk3Sys = Role +
                        "Generate Section 5: Procedure (Phases 4–5), Sections 6–10, and Resources/Time Management of a Universal Hybrid Lesson Plan.\n\n" +
                        "## 5. Procedure (Continued)\n" +
                        "### Phase 4: Evaluation (Skill of Probing Questioning)\n" +
                        "- **Duration**: 5 Minutes\n" +
                        "Write out these 5 specific questions with expected answers and Bloom's levels:\n" +
                        "1. **Objective/MCQ** (Bloom's Level: Knowledge/Recall): [Question with 4 options and answer]\n" +
                        "2. **Short Answer** (Bloom's Level: Understanding): [Question asking to define/state + answer]\n" +
                        "3. **Application** (Bloom's Level: Application): [Question asking to apply + answer]\n" +
                        "4. **Differentiation/Comparison** (Bloom's Level: Analysis): [Question asking to compare + answer]\n" +
                        "5. **Higher Order Thinking (HOT)** (Bloom's Level: Synthesis/Evaluation): [Question asking to evaluate/create + answer]\n" +
                        "- **Brisk AI / ChatGPT Prompt**: [Prompt to generate interactive quizzes for this topic]\n\n" +
                        "### Phase 5: Home Assignment\n" +
                        "- **Duration**: 2 Minutes\n" +
                        "- **Reading**: [Book page/section reference]\n" +
                        "- **Writing**: [Notebook exercises]\n" +
                        "- **Activity/Project**: [Simple physical project/drawing]\n" +
                        "- **Digital**: [Online quiz watch/quizizz assignment link instructions]\n\n" +
                        "## 6. Differentiation\n" +
                        "### Learning Styles Support\n" +
                        "- **Visual**: [use of charts/videos]\n" +
                        "- **Auditory**: [verbal discussion tasks]\n" +
                        "- **Kinesthetic**: [hands-on tasks/drawing]\n" +
                        "- **Reading/Writing**: [reading worksheet notes]\n" +
                        "### Student Levels Support\n" +
                        "- **Struggling Students**: [3 specific support strategies]\n" +
                        "- **Average Students**: [2 core tasks]\n" +
                        "- **Advanced Students**: [2 extension/enrichment tasks]\n" +
                        "### Special Needs Accommodations\n" +
                        "- **ADHD**: [movement break tips]\n" +
                        "- **Dyslexia**: [visual aid prompts]\n" +
                        "- **Visual Impairment**: [large print/tactile notes]\n" +
                        "- **Hearing Impairment**: [visual captions/cues]\n\n" +
                        "## 7. Assessment Plan\n" +
                        "- **Formative Assessment (During Class)**: [Observation checklist, Exit ticket, oral questioning]\n" +
                        "- **Summative Assessment (End of Class)**: [Worksheet, QuizIZZ, Paper-pen check]\n" +
                        "- **Bloom's Taxonomy Alignment Table**: Aligning evaluation questions to Bloom's cognitive stages.\n\n" +
                        "## 8. AI Integration\n" +
                        "List detailed tool suggestions with prompts:\n" +
                        "- **Brisk AI**: [Generating timed assessments/rubrics prompt]\n" +
                        "- **ChatGPT/Gemini**: [Generating custom definitions/examples prompt]\n" +
                        "- **Google Forms / Quizizz**: [Creation parameters]\n\n" +
                        "## 9. Blackboard Summary Layout\n" +
                        "Render a markdown code box mimicking the blackboard layout:\n" +
                        "```\n" +
                        "|---------------------------------------------------------|\n" +
                        "| Class: [Class] | Subject: [Subject]  | Date: YYYY-MM-DD |\n" +
                        "| Topic: <Topic Name>                                     |\n" +
                        "|---------------------------------------------------------|\n" +
                        "| Definition: ...                                         |\n" +
                        "| Key Concepts:                                           |\n" +
                        "| 1. ...               2. ...              3. ...         |\n" +
                        "| Diagram/Formula/Example Sketch Box:                     |\n" +
                        "| [ASCII Diagram Placeholder]                             |\n" +
                        "| Home Assignment: ...                                    |\n" +
                        "|---------------------------------------------------------|\n" +
                        "```\n\n" +
                        "## 10. Teacher Self-Reflection Checklist\n" +
                        "- **Pre-Class Planning**: Preparation, Challenges, and Backup plans.\n" +
                        "- **Post-Class Reflection Checklist**: [4 questions for the teacher]\n" +
                        "- **Skills Practiced Checklist**: Set Induction | Explanation | Illustration | Blackboard Writing | Reinforcement | Probing Questioning | Closure\n\n" +
                        "## 11. Resources\n" +
                        "- **Teacher Resources**: [Reference texts, Khan Academy, BYJU'S]\n" +
                        "- **Student Resources**: [Textbooks, interactive websites]\n" +
                        "- **Digital Resources**: [YouTube playlist, classroom links]\n\n" +
                        "## 12. Time Management Breakdown\n" +
                        "List time division: Introduction (5 min) | Presentation (20 min) | Recapitulation (5 min) | Evaluation (5 min) | Homework (2 min) | Buffer (3 min) | Total Duration: 40 min.\n";

                    var t1 = _ai.ChatAsync(chunk1Sys, new AiMessage(ctx), ct);
                    var t2 = _ai.ChatAsync(chunk2Sys, new AiMessage(ctx), ct);
                    var t3 = _ai.ChatAsync(chunk3Sys, new AiMessage(ctx), ct);

                    await Task.WhenAll(t1, t2, t3, tSlides);

                    static string CleanFences(string raw)
                    {
                        raw = raw.Trim();
                        if (!raw.StartsWith("```")) return raw;
                        return string.Join("\n", raw.Split('\n').Where(l => !l.Trim().StartsWith("```")));
                    }

                    planContent = string.Join("\n\n---\n\n",
                        new[] { t1.Result, t2.Result, t3.Result }
                            .Select(CleanFences));
                }

                string planTitle = $"Lesson Plan: {topic.Name}";
                var h1 = planContent.Split('\n').FirstOrDefault(l => l.StartsWith("# "));
                if (h1 != null && h1.Length > 2)
                    planTitle = h1[2..].Trim();

                static string CleanFencesSlides(string raw)
                {
                    raw = raw.Trim();
                    if (!raw.StartsWith("```")) return raw;
                    return string.Join("\n", raw.Split('\n').Where(l => !l.Trim().StartsWith("```")));
                }

                string slidesRaw = CleanFencesSlides(tSlides.Result);
                object slidesObj;
                try
                {
                    using var sdoc = System.Text.Json.JsonDocument.Parse(slidesRaw);
                    slidesObj = sdoc.RootElement.Clone();
                }
                catch { slidesObj = Array.Empty<object>(); }

                results.Add(new
                {
                    lessonPlanId = 0,
                    topicId = topic.Id,
                    topicName = topic.Name,
                    plan = new { id = 0, title = planTitle, content = planContent, slides = slidesObj }
                });
            }
            catch (Exception ex)
            {
                results.Add(new
                {
                    topicId = topic.Id,
                    topicName = topic.Name,
                    error = $"Generation failed: {ex.Message}"
                });
            }
        }

        return Content(System.Text.Json.JsonSerializer.Serialize(results), "application/json");
    }

    private static string FormatShortPlanJsonToMarkdown(string rawJson)
    {
        try
        {
            using var doc = System.Text.Json.JsonDocument.Parse(rawJson);
            var root = doc.RootElement;

            var sb = new System.Text.StringBuilder();

            // Title
            var topic = GetJsonString(root, "lessonInfo", "topic") ?? "Lesson";
            sb.AppendLine($"# Hybrid Lesson Plan: {topic}\n");

            // 1. Metadata Table
            sb.AppendLine("## 1. Metadata");
            sb.AppendLine("| Category | Details |");
            sb.AppendLine("|---|---|");
            sb.AppendLine($"| **Lesson Title** | {GetJsonString(root, "lessonInfo", "topic")} |");
            sb.AppendLine($"| **Subject** | {GetJsonString(root, "lessonInfo", "subject")} |");
            sb.AppendLine($"| **Class** | {GetJsonString(root, "lessonInfo", "class")} |");
            sb.AppendLine($"| **Chapter** | {GetJsonString(root, "lessonInfo", "chapter")} |");
            sb.AppendLine($"| **Duration** | {GetJsonString(root, "lessonInfo", "duration")} |");
            sb.AppendLine($"| **School Name** | {GetJsonString(root, "lessonInfo", "schoolName") ?? "Savitroday School"} |\n");

            // 2. Learning Objectives & Teaching Aids
            sb.AppendLine("## 2. Learning Objectives & Teaching Aids");
            sb.AppendLine("### A. Learning Objectives");
            if (root.TryGetProperty("learningObjectives", out var objProps))
            {
                sb.AppendLine($"- **Remember**: {GetPropString(objProps, "remember")}");
                sb.AppendLine($"- **Understand**: {GetPropString(objProps, "understand")}");
                sb.AppendLine($"- **Apply**: {GetPropString(objProps, "apply")}");
                sb.AppendLine($"- **Analyze**: {GetPropString(objProps, "analyze")}");
                sb.AppendLine($"- **Evaluate**: {GetPropString(objProps, "evaluate")}");
            }
            
            sb.AppendLine("\n### B. Teaching Materials");
            if (root.TryGetProperty("teachingMaterials", out var matProps))
            {
                sb.AppendLine($"- **General**: {JoinJsonArray(matProps, "general")}");
                sb.AppendLine($"- **Digital**: {JoinJsonArray(matProps, "digital")}");
                sb.AppendLine($"- **Activity**: {JoinJsonArray(matProps, "activityMaterials")}");
            }
            sb.AppendLine();

            // 3. Teaching Procedure
            sb.AppendLine("## 3. Teaching Procedure");
            if (root.TryGetProperty("lessonFlow", out var flow))
            {
                if (flow.TryGetProperty("introduction", out var intro))
                {
                    sb.AppendLine($"### Phase 1: Introduction ({GetPropString(intro, "duration") ?? "5 min"})");
                    sb.AppendLine($"- **Teacher Activities**: {JoinJsonArray(intro, "teacherActivities")}");
                    sb.AppendLine($"- **Student Activities**: {JoinJsonArray(intro, "studentActivities")}");
                    sb.AppendLine($"- **Guiding Questions**: {JoinJsonArray(intro, "guidingQuestions")}");
                }

                if (flow.TryGetProperty("conceptExplanation", out var exp))
                {
                    sb.AppendLine($"\n### Phase 2: Concept Explanation ({GetPropString(exp, "duration") ?? "15 min"})");
                    if (exp.TryGetProperty("concepts", out var conceptsList) && conceptsList.ValueKind == System.Text.Json.JsonValueKind.Array)
                    {
                        foreach (var concept in conceptsList.EnumerateArray())
                        {
                            sb.AppendLine($"#### Concept: {GetPropString(concept, "title")}");
                            sb.AppendLine($"- **Explanation**: {GetPropString(concept, "explanation")}");
                            sb.AppendLine($"- **Real-Life Example**: {GetPropString(concept, "example")}");
                            sb.AppendLine($"- **Blackboard Content**: {GetPropString(concept, "blackboardContent")}");
                        }
                    }
                }

                if (flow.TryGetProperty("activity", out var act))
                {
                    sb.AppendLine($"\n### Phase 3: Learning Activity ({GetPropString(act, "duration") ?? "10 min"})");
                    sb.AppendLine($"- **Title**: {GetPropString(act, "title")}");
                    sb.AppendLine($"- **Teacher Instructions**: {GetPropString(act, "teacherInstructions")}");
                    sb.AppendLine($"- **Student Task**: {GetPropString(act, "studentTask")}");
                    sb.AppendLine($"- **Expected Outcome**: {GetPropString(act, "expectedOutcome")}");
                }

                if (flow.TryGetProperty("practice", out var prac))
                {
                    sb.AppendLine($"\n### Phase 4: Guided Practice ({GetPropString(prac, "duration") ?? "5 min"})");
                    if (prac.TryGetProperty("questions", out var questionsList) && questionsList.ValueKind == System.Text.Json.JsonValueKind.Array)
                    {
                        foreach (var q in questionsList.EnumerateArray())
                        {
                            sb.AppendLine($"- **Question ({GetPropString(q, "type")})**: {GetPropString(q, "question")}  ");
                            sb.AppendLine($"  *Answer*: {GetPropString(q, "answer")}");
                        }
                    }
                }

                if (flow.TryGetProperty("recap", out var recap))
                {
                    sb.AppendLine($"\n### Phase 5: Recapitulation ({GetPropString(recap, "duration") ?? "3 min"})");
                    sb.AppendLine($"- **Summary Points**: {JoinJsonArray(recap, "summaryPoints")}");
                    sb.AppendLine($"- **Oral Questions**: {JoinJsonArray(recap, "oralQuestions")}");
                }
            }
            sb.AppendLine();

            // 4. Evaluation & Homework
            sb.AppendLine("## 4. Assessment & Homework");
            if (root.TryGetProperty("lessonFlow", out var flowHome) && flowHome.TryGetProperty("homework", out var hw))
            {
                sb.AppendLine($"- **Reading**: {GetPropString(hw, "reading")}");
                sb.AppendLine($"- **Writing**: {GetPropString(hw, "writing")}");
                sb.AppendLine($"- **Activity**: {GetPropString(hw, "activity")}");
                sb.AppendLine($"- **Digital Assignment**: {GetPropString(hw, "digitalAssignment")}");
            }
            sb.AppendLine();

            // 5. Blackboard Plan
            sb.AppendLine("## 5. Blackboard Summary Layout");
            if (root.TryGetProperty("blackboardPlan", out var bb))
            {
                sb.AppendLine("```");
                sb.AppendLine("|---------------------------------------------------------|");
                sb.AppendLine($"| Topic: {GetPropString(bb, "topic")}");
                sb.AppendLine($"| Definition: {GetPropString(bb, "definition")}");
                sb.AppendLine($"| Formula: {GetPropString(bb, "formula")}");
                sb.AppendLine($"| Diagram/Visual Sketch: {GetPropString(bb, "diagram")}");
                sb.AppendLine($"| Key Example: {GetPropString(bb, "example")}");
                sb.AppendLine($"| Summary: {GetPropString(bb, "summary")}");
                sb.AppendLine("|---------------------------------------------------------|");
                sb.AppendLine("```");
            }
            sb.AppendLine();

            // 6. Additional Resource Details
            sb.AppendLine("## 6. Real-life Connection & Differentiation");
            
            // Real life connections
            if (root.TryGetProperty("realLifeConnection", out var rlc))
            {
                if (rlc.ValueKind == System.Text.Json.JsonValueKind.Array)
                    sb.AppendLine($"- **Real-Life Connections**: {JoinJsonArray(root, "realLifeConnection")}");
                else if (rlc.ValueKind == System.Text.Json.JsonValueKind.String)
                    sb.AppendLine($"- **Real-Life Connection**: {rlc.GetString()}");
                else if (rlc.ValueKind == System.Text.Json.JsonValueKind.Object)
                {
                    var connectionItems = new List<string>();
                    foreach (var prop in rlc.EnumerateObject())
                    {
                        connectionItems.Add($"**{prop.Name}**: {prop.Value.ToString()}");
                    }
                    sb.AppendLine($"- **Real-Life Connection**: {string.Join("; ", connectionItems)}");
                }
            }
            else if (root.TryGetProperty("realLifeConnections", out var rlcs))
            {
                sb.AppendLine($"- **Real-Life Connections**: {JoinJsonArray(root, "realLifeConnections")}");
            }

            // Differentiation
            if (root.TryGetProperty("differentiation", out var diff))
            {
                sb.AppendLine("- **Differentiation Plan**:");
                sb.AppendLine($"  * *Slow Learners*: {JoinJsonArray(diff, "slowLearners")}");
                sb.AppendLine($"  * *Average Learners*: {JoinJsonArray(diff, "averageLearners")}");
                sb.AppendLine($"  * *Advanced Learners*: {JoinJsonArray(diff, "advancedLearners")}");
            }

            // Teacher Notes
            if (root.TryGetProperty("teacherNotes", out var notes))
            {
                sb.AppendLine("- **Teacher Notes**:");
                sb.AppendLine($"  * *Common Mistakes*: {JoinJsonArray(notes, "commonMistakes")}");
                sb.AppendLine($"  * *Teaching Tips*: {JoinJsonArray(notes, "teachingTips")}");
            }

            return sb.ToString();
        }
        catch (Exception ex)
        {
            return $"# Generated Lesson Plan\n\nFailed to parse structured JSON: {ex.Message}\n\nRaw Output:\n\n{rawJson}";
        }
    }

    private static string? GetJsonString(System.Text.Json.JsonElement elem, string parent, string child)
    {
        if (elem.TryGetProperty(parent, out var p) && p.TryGetProperty(child, out var c))
            return c.GetString();
        return null;
    }

    private static string? GetPropString(System.Text.Json.JsonElement elem, string propName)
    {
        if (elem.TryGetProperty(propName, out var p))
            return p.GetString();
        return null;
    }

    private static string JoinJsonArray(System.Text.Json.JsonElement elem, string propName)
    {
        if (elem.TryGetProperty(propName, out var p))
        {
            if (p.ValueKind == System.Text.Json.JsonValueKind.Array)
            {
                var items = new List<string>();
                foreach (var item in p.EnumerateArray())
                {
                    var val = item.GetString();
                    if (!string.IsNullOrEmpty(val)) items.Add(val);
                }
                return string.Join("; ", items);
            }
            if (p.ValueKind == System.Text.Json.JsonValueKind.String)
            {
                return p.GetString() ?? string.Empty;
            }
            return p.ToString();
        }
        return string.Empty;
    }

    [AllowAnonymous]
    [HttpPost("lesson-plans/save")]
    public async Task<IActionResult> SaveLessonPlan([FromBody] LmsLessonPlanSaveRequestDto request, CancellationToken ct)
    {
        try
        {
            var schoolIdVal = request.SchoolId ?? GetSchoolIdSafe();
            var teacherIdVal = request.TeacherId ?? GetTeacherIdSafe();

            var finalRequest = request with { SchoolId = schoolIdVal, TeacherId = teacherIdVal };
            var id = await _svc.SaveSmartboardLessonPlanAsync(finalRequest, ct);
            return Ok(id);
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[SaveLessonPlan Error]: {ex}");
            return StatusCode(500, new { error = ex.Message, details = ex.ToString() });
        }
    }

    [HttpGet("lesson-plans")]
    public async Task<IActionResult> GetSavedLessonPlans(
        [FromQuery] string? schoolId,
        [FromQuery] string? classId,
        [FromQuery] string? subjectId,
        CancellationToken ct)
    {
        try
        {
            // SchoolId is optional — resolve from query, JWT claim, or null (returns all)
            int? sid = null;
            if (!string.IsNullOrWhiteSpace(schoolId) && int.TryParse(schoolId, out var parsedSid))
                sid = parsedSid;
            else
            {
                var claimSid = GetSchoolIdSafe();
                if (claimSid.HasValue) sid = claimSid.Value;
            }

            var plans = await _svc.GetSmartboardLessonPlansByFilterAsync(sid, classId, subjectId, ct);
            return Ok(plans);
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[GetSavedLessonPlans Error]: {ex}");
            return StatusCode(500, new { error = ex.Message, details = ex.ToString() });
        }
    }

    [AllowAnonymous]
    [HttpPost("syllabus-plans/save")]
    public async Task<IActionResult> SaveSyllabusPlan([FromBody] LmsSyllabusPlanSaveDto request, CancellationToken ct)
    {
        try
        {
            var schoolIdVal = request.SchoolId ?? GetSchoolIdSafe();
            var teacherIdVal = request.TeacherId ?? GetTeacherIdSafe();

            var finalRequest = request with { SchoolId = schoolIdVal, TeacherId = teacherIdVal };
            var id = await _svc.SaveSyllabusPlanAsync(finalRequest, ct);
            return Ok(id);
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[SaveSyllabusPlan Error]: {ex}");
            return StatusCode(500, new { error = ex.Message, details = ex.ToString() });
        }
    }

    public class HtmlToPdfRequest
    {
        public string Html { get; set; } = string.Empty;
        public string Title { get; set; } = "Document";
        public string Orientation { get; set; } = "Portrait";
    }

    [AllowAnonymous]
    [HttpPost("pdf/convert")]
    public IActionResult ConvertHtmlToPdf([FromBody] HtmlToPdfRequest request)
    {
        if (request == null || string.IsNullOrWhiteSpace(request.Html))
        {
            return BadRequest("HTML content cannot be empty.");
        }

        try
        {
            var htmlToPdfConverter = new HiQPdf.HtmlToPdf();
            htmlToPdfConverter.SerialNumber = "z4emnp+r-qYOmrb2u-vbb+/uH/-7/7v/e/7-+f7+7/z+-4f794fb2-9vY=";

            htmlToPdfConverter.Document.PageSize = HiQPdf.PdfPageSize.A4;
            if (string.Equals(request.Orientation, "Landscape", StringComparison.OrdinalIgnoreCase))
            {
                htmlToPdfConverter.Document.PageOrientation = HiQPdf.PdfPageOrientation.Landscape;
            }
            else
            {
                htmlToPdfConverter.Document.PageOrientation = HiQPdf.PdfPageOrientation.Portrait;
            }

            htmlToPdfConverter.Document.Margins = new HiQPdf.PdfMargins(20, 20, 20, 20);

            byte[] pdfBuffer = htmlToPdfConverter.ConvertHtmlToMemory(request.Html, null);

            string safeTitle = string.Concat(request.Title.Split(Path.GetInvalidFileNameChars())).Replace(" ", "_");
            string fileName = $"{safeTitle}.pdf";

            return File(pdfBuffer, "application/pdf", fileName);
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[ConvertHtmlToPdf Error]: {ex}");
            return StatusCode(500, new { error = ex.Message, details = ex.ToString() });
        }
    }

    [AllowAnonymous]
    [HttpPost("resource/generate")]
    public async Task<IActionResult> GenerateResource([FromBody] LmsResourceGenerateRequest request, CancellationToken ct)
    {
        if (request == null) return BadRequest("Request body cannot be null.");
        if (string.IsNullOrWhiteSpace(request.Type)) return BadRequest("Resource Type is required.");
        if (string.IsNullOrWhiteSpace(request.TopicName)) return BadRequest("Topic Name is required.");

        string systemPrompt = "";
        string userPrompt = 
            $"Board: {request.BoardId}\n" +
            $"Class: {request.ClassId}\n" +
            $"Subject: {request.SubjectId}\n" +
            $"Chapter: {request.ChapterName}\n" +
            $"Topic: {request.TopicName}\n\n" +
            $"Please generate specific contents for this grade and subject context. Do not write generic placeholders. Write final usable questions/details.";

        if (request.Type.ToLower() == "ppt")
        {
            systemPrompt = 
                "You are an expert classroom presenter and pedagogy expert. Generate a structured slide deck content in markdown format.\n" +
                "Generate content for exactly 10 slides. Return ONLY clean markdown, do not wrap in markdown json/xml fences, do not write preamble.\n\n" +
                "For EACH slide, write:\n" +
                "---\n" +
                "### Slide [Number]: [Slide Title]\n" +
                "- **Visual Layout Description**: [Brief description of visual/diagram/chart to show on slide]\n" +
                "- **Key Bullet Points**:\n" +
                "  - [Bullet Point 1]\n" +
                "  - [Bullet Point 2]\n" +
                "  - [Bullet Point 3]\n" +
                "- **Teacher Oral Script**: [A paragraph of exactly what the teacher should say out loud to explain this slide to the class]\n";
        }
        else if (request.Type.ToLower() == "worksheet")
        {
            systemPrompt = 
                "You are an expert curriculum assistant. Generate a high-quality student worksheet in markdown format.\n" +
                "Return ONLY clean markdown - no JSON fences, no code blocks, no intro/outro.\n\n" +
                "Use the following structure:\n" +
                "# Concept Worksheet: <Topic Name>\n" +
                "**Class**: [Class] | **Subject**: [Subject]\n\n" +
                "## Section A: Multiple Choice Questions (5 Questions)\n" +
                "Provide 5 MCQs specific to this topic. For each question list 4 options (A, B, C, D) and clear numbering.\n\n" +
                "## Section B: Short Answer Questions (5 Questions)\n" +
                "Provide 5 short conceptual questions suitable for student answers.\n\n" +
                "## Section C: HOTS / Analytical Questions (3 Questions)\n" +
                "Provide 3 Higher Order Thinking Skills scenario-based questions.\n\n" +
                "## Answer Key & Explanations\n" +
                "Include correct answers and detailed explanations for all questions in Sections A, B, and C.";
        }
        else if (request.Type.ToLower() == "homework")
        {
            systemPrompt = 
                "You are an expert school teacher. Generate a comprehensive homework assignment sheet in markdown format containing between 10 to 20 questions covering all question types (MCQs, Fill in the Blanks, Short Answers, and Long/HOTS questions).\n" +
                "Return ONLY clean markdown - no JSON fences, no code blocks, no intro/outro.\n\n" +
                "Structure:\n" +
                "# Homework Assignment: <Topic Name>\n" +
                "**Class**: [Class] | **Subject**: [Subject]\n\n" +
                "## Section A: Multiple Choice Questions (5 Questions)\n" +
                "Provide 5 MCQs. List 4 options (A, B, C, D) for each.\n\n" +
                "## Section B: Fill in the Blanks (5 Questions)\n" +
                "Provide 5 fill-in-the-blank questions.\n\n" +
                "## Section C: Short Answer Questions (5 Questions)\n" +
                "Provide 5 conceptual short questions.\n\n" +
                "## Section D: Long / Analytical Questions (3 Questions)\n" +
                "Provide 3 application or scenario-based long questions.\n\n" +
                "## Answer Key & Solutions\n" +
                "Provide correct answers and concise solutions for all 18 homework questions.";
        }
        else
        {
            return BadRequest($"Unsupported resource type: {request.Type}");
        }

        try
        {
            var content = await _ai.ChatAsync(systemPrompt, new AiMessage(userPrompt), ct);
            return Ok(new { content = content });
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[GenerateResource Error]: {ex}");
            return StatusCode(500, new { error = ex.Message, details = ex.ToString() });
        }
    }

    [HttpGet("syllabus-plans")]
    public async Task<IActionResult> GetSavedSyllabusPlans(
        [FromQuery] string? schoolId,
        [FromQuery] string? classId,
        [FromQuery] string? subjectId,
        CancellationToken ct)
    {
        try
        {
            int? sid = null;
            if (!string.IsNullOrWhiteSpace(schoolId) && int.TryParse(schoolId, out var parsedSid))
                sid = parsedSid;
            else
            {
                var claimSid = GetSchoolIdSafe();
                if (claimSid.HasValue) sid = claimSid.Value;
            }

            var plans = await _svc.GetSyllabusPlansByFilterAsync(sid, classId, subjectId, ct);
            return Ok(plans);
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[GetSavedSyllabusPlans Error]: {ex}");
            return StatusCode(500, new { error = ex.Message, details = ex.ToString() });
        }
    }

    [HttpPost("lesson-plans/validate")]
    public async Task<IActionResult> ValidateLessonPlan([FromBody] LmsLessonPlanValidateRequest request, CancellationToken ct)
    {
        string prompt = 
            "You are the Guardian Layer AI, a strict quality auditor for academic curriculum and lesson plans. " +
            "Your job is to analyze the provided lesson plan content and determine if there are any issues, formatting gaps, or lack of pedagogical completeness.\n\n" +
            "Evaluate the plan on:\n" +
            "1. Concept Depth: Is the explanation too brief or missing concrete examples?\n" +
            "2. Age Appropriateness: Are terms and objectives suited for the class level?\n" +
            "3. Format Integrity: Are all required sections present?\n" +
            "4. Resource Sufficiency: Are visual aids, quiz questions, and activities clearly defined?\n\n" +
            "You MUST reply in a strict JSON format matching this schema:\n" +
            "{\n" +
            "  \"isValid\": false or true,\n" +
            "  \"issues\": [\n" +
            "    \"Detailed explanation of issue 1...\",\n" +
            "    \"Detailed explanation of issue 2...\"\n" +
            "  ]\n" +
            "}\n" +
            "Do NOT include markdown block wrappers (no ```json). Output raw json only.";

        string responseJson = await _ai.ChatAsync(prompt, new AiMessage(request.Content), ct);
        
        responseJson = responseJson.Trim();
        if (responseJson.StartsWith("```"))
        {
            responseJson = string.Join("\n", responseJson.Split('\n').Where(l => !l.Trim().StartsWith("```")));
        }

        return Content(responseJson, "application/json");
    }

    [HttpPost("lesson-plans/resolve")]
    public async Task<IActionResult> ResolveLessonPlan([FromBody] LmsLessonPlanResolveRequest request, CancellationToken ct)
    {
        string prompt = 
            "You are the Guardian Resolution Engine. Fix the specified issues in the lesson plan and output the fully corrected, pedagogical lesson plan in clean Markdown format.\n\n" +
            "Issues to Resolve:\n" +
            string.Join("\n", request.Issues.Select(i => "- " + i)) + "\n\n" +
            "Output ONLY the corrected lesson plan markdown text. Do not write introductory words or conversational summaries.";

        string correctedContent = await _ai.ChatAsync(prompt, new AiMessage(request.Content), ct);
        
        correctedContent = correctedContent.Trim();
        if (correctedContent.StartsWith("```"))
        {
            correctedContent = string.Join("\n", correctedContent.Split('\n').Where(l => !l.Trim().StartsWith("```")));
        }

        return Ok(new { content = correctedContent });
    }

    private int GetSchoolId()
    {
        var claim = User.FindFirst("school_id")?.Value;
        if (int.TryParse(claim, out var sid)) return sid;

        claim = User.FindFirst(System.IdentityModel.Tokens.Jwt.JwtRegisteredClaimNames.Sub)?.Value;
        if (int.TryParse(claim, out sid)) return sid;

        return 1;
    }

    private int GetTeacherId()
    {
        var claim = User.FindFirst("teacher_id")?.Value;
        if (int.TryParse(claim, out var tid)) return tid;
        return 1;
    }

    // Safe versions that return null instead of default 1 when no auth context exists
    private int? GetSchoolIdSafe()
    {
        try
        {
            var claim = User?.FindFirst("school_id")?.Value;
            if (int.TryParse(claim, out var sid)) return sid;
            claim = User?.FindFirst(System.IdentityModel.Tokens.Jwt.JwtRegisteredClaimNames.Sub)?.Value;
            if (int.TryParse(claim, out sid)) return sid;
        }
        catch { }
        return null;
    }

    private int? GetTeacherIdSafe()
    {
        try
        {
            var claim = User?.FindFirst("teacher_id")?.Value;
            if (int.TryParse(claim, out var tid)) return tid;
        }
        catch { }
        return null;
    }

    [HttpPost("syllabus-plans/generate")]
    public async Task<IActionResult> GenerateSyllabusPlan([FromBody] LmsSyllabusGenerateRequest request, CancellationToken ct)
    {
        string prompt = 
            "You are an expert academic curriculum coordinator. Your job is to distribute the given school chapters across the academic months dynamically provided in the request and suggest a hands-on activity / project work for each month.\n\n" +
            "Rules:\n" +
            "1. You MUST schedule chapters to correct months dynamically. Distribute chapters logically across the months list.\n" +
            "2. Suggest one relevant, creative activity or project work for each month based on the chapters assigned to that month.\n" +
            "3. You must ONLY output a valid JSON response matching this structure:\n" +
            "{\n" +
            "  \"months\": {\n" +
            "    \"[MonthNameFromRequest]\": { \"chapterIds\": [\"id1\", \"id2\"], \"activity\": \"Activity details...\" },\n" +
            "    ...\n" +
            "  }\n" +
            "}\n" +
            "Ensure all chapters are assigned to at least one month. If no chapters are assigned to a month, return \"chapterIds\": [] and \"activity\": \"Revision & Term Assessments\".\n" +
            "Do NOT include markdown block wrappers (no ```json). Output raw json only.";

        string userMessage = $"Subject: {request.SubjectName}\nClass: {request.ClassName}\nBook: {request.BookUsed}\n" + 
            $"Target Months: {string.Join(", ", request.Months)}\n" +
            $"Chapters:\n" + 
            string.Join("\n", request.Chapters.Select(c => $"- {c.Id}: {c.Name}"));

        string responseJson = await _ai.ChatAsync(prompt, new AiMessage(userMessage), ct);
        
        responseJson = responseJson.Trim();
        if (responseJson.StartsWith("```"))
        {
            responseJson = string.Join("\n", responseJson.Split('\n').Where(l => !l.Trim().StartsWith("```")));
        }

        return Content(responseJson, "application/json");
    }
}

public sealed class LmsTopicItem
{
    public string Name { get; set; } = string.Empty;
    public int Id { get; set; }

    public LmsTopicItem() { }

    public LmsTopicItem(string name, int id)
    {
        Name = name;
        Id = id;
    }
}

public sealed record LmsLessonPlanGenerateRequest(
    string ClassName,
    string SubjectName,
    string ChapterName,
    string? TopicName,
    string Complexity,
    string Duration,
    string Language,
    string LearningStyle,
    string Standard,
    string Type,
    List<int>? TopicIds,
    List<LmsTopicItem>? Topics,
    string? Mode,
    string? ClassId,
    string? SubjectId,
    string? ChapterId
);

public sealed record LmsLessonPlanValidateRequest(string Content);
public sealed record LmsLessonPlanResolveRequest(string Content, List<string> Issues);

public sealed record LmsSyllabusGenerateRequest(
    string SubjectName,
    string ClassName,
    string Session,
    string BookUsed,
    List<LmsSyllabusChapterItem> Chapters,
    List<string> Months
);

public sealed record LmsSyllabusChapterItem(string Id, string Name);
