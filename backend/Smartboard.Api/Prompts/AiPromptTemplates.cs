using System.Reflection;

namespace Smartboard.Api.Prompts;

/// <summary>
/// Loads AI prompt templates from plain-text files embedded in the assembly.
/// To edit a prompt, open the corresponding .txt file under Prompts/ — no C# changes needed.
/// Files: AiPromptGlobal.txt, SelectionTab_solution.txt, SelectionTab_explain.txt,
///        SelectionTab_mistakes.txt, SelectionTab_quiz.txt
/// </summary>
public static class AiPromptTemplates
{
    /// <summary>Global system prompt injected into every AI call.</summary>
    public static readonly string AiPromptGlobal = Load("AiPromptGlobal.txt");

    private static readonly IReadOnlyDictionary<string, string> _selectionTabPrompts =
        new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            ["solution"] = Load("SelectionTab_solution.txt"),
            ["explain"]  = Load("SelectionTab_explain.txt"),
            ["mistakes"] = Load("SelectionTab_mistakes.txt"),
            ["quiz"]     = Load("SelectionTab_quiz.txt"),
        };

    /// <summary>Returns the task instruction for the given lasso-tab name (solution/explain/mistakes/quiz).</summary>
    public static string SelectionTabPrompt(string tab) =>
        _selectionTabPrompts.TryGetValue(tab, out var prompt) ? prompt : tab;

    // ── Loader ────────────────────────────────────────────────────────────────

    private static string Load(string filename)
    {
        var asm = Assembly.GetExecutingAssembly();
        var resourceName = $"Smartboard.Api.Prompts.{filename}";
        using var stream = asm.GetManifestResourceStream(resourceName)
            ?? throw new InvalidOperationException(
                $"Prompt template '{resourceName}' not found. " +
                $"Ensure the file exists under Prompts/ and is marked as EmbeddedResource in the .csproj.");
        using var reader = new StreamReader(stream);
        return reader.ReadToEnd().Trim();
    }
}
