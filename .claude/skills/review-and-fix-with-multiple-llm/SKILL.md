---
name: review-and-fix-with-multiple-llm
description: >-
  Multi-LLM code review and auto-fix skill. Forms an Agent Team to run multiple
  review skills in parallel with model-specific optimized prompts, normalizes
  heterogeneous outputs, aggregates findings by consensus with P0-P3 priority
  levels and confidence scoring, then fixes validated issues in priority order.
  Each model uses prompts tailored to its strengths (Codex: native /codex:review
  plugin with structured output, Claude: built-in /review command, Copilot:
  security-focused + false-positive filtering).
  Use when the user asks to review code with multiple LLMs/skills, requests
  multi-model code review, says "review with multiple LLMs", or lists several
  review skills to run together.
  Example invocations:
  - "Review this branch with review-netsync, github-copilot, codex:review"
  - "Run code review using all available LLM skills"
  - "Use multiple models to review and fix the current diff"
---

# Multi-LLM Code Review and Auto-Fix

Run multiple code-review skills in parallel via an Agent Team with
**model-specific optimized prompts**, normalize heterogeneous outputs into a
common format, aggregate findings by cross-model consensus, then fix validated
issues in priority order.

## Workflow

### 1. Parse the skill list

Extract skill names from the user's message or arguments.

**If no skill names are provided** (no arguments), auto-detect all available
review-capable skills from the current session's skill list. Include any skill
whose name or description suggests code review capability. Common candidates:

- Project-specific review skills (e.g., `review-netsync`, `review-*`)
- `review` (Claude Code built-in review)
- `github-copilot` (GPT-based review)
- `codex:review` (OpenAI Codex native review plugin)

**Always-include skills**: The following skills are known to be installed via
external plugins and may NOT appear in the system-reminder skill list. Always
include them in the candidate list regardless of whether they are visible in
the current session's skill list:

- `review` (Claude Code built-in review)
- `codex:review` (OpenAI Codex native review plugin, installed via codex plugin)

Present the detected list to the user and proceed. If no review-capable skills
are found, inform the user and stop.

**If skill names are provided**, use those directly.

Verify each skill exists in the current session's available skills list.
For skills in the always-include list above, skip this verification and
assume they are available. For any other skill that does not exist, report
it to the user immediately and continue with the remaining skills.

### 2. Launch parallel review agents

For each valid skill, spawn a background Agent (run_in_background: true) that:

1. Invokes the Skill tool with the target skill name.
2. Passes the **model-specific review prompt** (see below) as args.
3. Returns the full review output in the model's native format.

Launch ALL agents in a single message to maximize parallelism.

#### 2a. Prompt for project-specific skills

For project-specific review skills (e.g., `review-netsync`, `review-*`), invoke
the skill directly without overriding its prompt:

```
Run the {skill_name} skill to perform a code review on the current branch
({branch_name}). Use the Skill tool with skill: "{skill_name}".
Return the full review results exactly as output by the skill.
```

#### 2b. Prompt for `codex:review` (OpenAI Codex native review plugin)

Use the `/codex:review` skill directly — it has its own built-in review prompt
optimized for Codex and returns structured output. Do NOT pass custom review
instructions; the plugin handles everything internally.

```
Run the codex:review skill to perform a code review on the current branch.
Use the Skill tool with skill: "codex:review" and args: "--wait".
The --wait flag ensures the review runs in the foreground and returns results
immediately.
Return the full review results exactly as output by the skill.
```

The `/codex:review` plugin returns structured output with:
- `verdict`: "approve" or "needs-attention"
- `summary`: text summary
- `findings[]`: each with `severity` (critical/high/medium/low), `title`,
  `body`, `file`, `line_start`, `line_end`, `confidence` (0.0-1.0),
  `recommendation`
- `next_steps[]`: suggested actions

#### 2c. Prompt for `github-copilot` (GPT via Copilot CLI)

Optimized for GPT's strengths: thorough security analysis with confidence
thresholds, false-positive filtering, and categorized risk assessment.
Based on anthropics/claude-code-action security review and Claude's
`/security-review` prompt structure.

````
You are a senior security engineer and code quality analyst performing a
focused review of code changes on the {branch_name} branch compared to
{base_branch}.

## Review Focus Areas

### 1. Security (PRIMARY)
- Input validation and sanitization
- Authentication / Authorization logic
- Cryptography and secrets management
- Injection and code execution risks
- Data exposure and privacy

### 2. Code Quality
- Clean code principles and best practices
- Proper error handling and edge cases
- Code readability and maintainability

### 3. Performance
- Potential performance bottlenecks
- Database query efficiency
- Memory leaks or resource issues

### 4. Testing
- Adequate test coverage for new logic
- Test quality and edge cases
- Missing test scenarios

## Confidence-Based Filtering
- Only report findings with confidence >= 0.7 (HIGH CONFIDENCE).
- For findings with confidence 0.5-0.7, include but mark as "low confidence."
- Below 0.5, do not report. Minimize false positives.

## False-Positive Exclusion
Do NOT report these as issues:
- Theoretical race conditions without demonstrated impact
- Rate limiting suggestions (unless auth-related)
- Non-critical field validation in internal APIs
- Regex denial-of-service on bounded inputs
- Memory consumption without evidence of leak

## Scope
Focus ONLY on security and quality implications newly added by this branch.
Do not flag pre-existing issues.

## Output Format
Organize findings by severity tier:

### CRITICAL (fix immediately)
For each: File, Line, Description, Confidence (0.0-1.0), Suggested fix

### HIGH PRIORITY
For each: File, Line, Description, Confidence (0.0-1.0), Suggested fix

### MEDIUM
For each: File, Line, Description, Confidence (0.0-1.0), Suggested fix

### LOW (informational)
For each: File, Line, Description, Confidence (0.0-1.0)

### SUMMARY
- Overall risk assessment: PASS | NEEDS_FIXES | CRITICAL
- Total findings with confidence breakdown
````

#### 2d. Prompt for `review` (Claude Code built-in review)

Use the `/review` skill directly — it is Claude Code's built-in pull request
review command. It analyzes the current branch diff and returns structured
review findings. Do NOT pass custom review instructions; invoke it as-is.

```
Run the review skill to perform a code review on the current branch.
Use the Skill tool with skill: "review".
Return the full review results exactly as output by the skill.
```

The `/review` built-in returns review findings with severity levels and
file/line references. Normalize its output using the same rules as the
fallback/free-text parser (section 3a, "Free-text" column):
- Priority: keyword match (CRITICAL→0, HIGH→1, MEDIUM→2, LOW→3)
- Confidence: default 0.85 (Claude's own review tends to be high quality)
- File/line: regex for file paths and `:NN` patterns
- Overall: heuristic from summary section
- Suggestion: regex for code blocks
- Category: keyword match

#### 2e. Fallback prompt for other/unknown LLM skills

For any LLM skill not matching the above (unknown model), use a general-purpose
structured prompt:

````
Review the code changes on the {branch_name} branch compared to {base_branch}.

Focus on: bugs, logic errors, security vulnerabilities, performance issues,
and code quality.

For each issue found, provide:
- File path and line number(s)
- Severity: CRITICAL, HIGH, MEDIUM, or LOW
- Description of the problem
- Suggested fix (code if possible)

End with an overall assessment: PASS, NEEDS_FIXES, or CRITICAL.
````

### 3. Normalize and aggregate results

After all agents complete, normalize each model's native output format into a
common internal format, then aggregate.

#### 3a. Normalize outputs to common format

Each model returns findings in its own format. Normalize all into this internal
structure before aggregation:

```
{
  "source": "model_name",
  "overall_assessment": "PASS|NEEDS_FIXES|CRITICAL",
  "findings": [
    {
      "id": "F1",
      "title": "Brief title",
      "category": "correctness|security|performance|error_handling|test_coverage|api_contract|maintainability|scalability|modularity|observability",
      "priority": 0-3,
      "confidence": 0.0-1.0,
      "file": "path/to/file.ext",
      "line_start": 42,
      "line_end": 45,
      "description": "What is wrong and why",
      "suggestion": "replacement code or null"
    }
  ]
}
```

**Normalization rules per model:**

| Source field | Codex (codex:review) | Copilot/GPT | Claude (/review) | Free-text |
|---|---|---|---|---|
| priority | `severity`: critical→0, high→1, medium→2, low→3 | CRITICAL→0, HIGH→1, MEDIUM→2, LOW→3 | keyword match (same as free-text) | keyword match |
| confidence | `confidence` directly | `Confidence` field directly | default 0.85 | `consensus_count / total` |
| file | `file` directly | `File` field | regex for file paths | regex for file paths |
| line_start/end | `line_start`/`line_end` directly | `Line` field | regex for `:NN` patterns | regex for `:NN` patterns |
| overall | `verdict`: approve→PASS, needs-attention→NEEDS_FIXES | `SUMMARY` section → map | heuristic | heuristic |
| suggestion | `recommendation` field | `Suggested fix` field | regex for code blocks | regex for code blocks |
| category | infer from title/body keywords | section header → map | keyword match | keyword match |

**Category mapping:**
- Copilot's "Security" section → `security`
- Copilot's "Code Quality" section → `correctness` or `maintainability`

**Suggestion mapping:**
- Codex (`codex:review`): use `recommendation` field as the suggestion
- Copilot/GPT: extract from `Suggested fix` field

#### 3b. Deduplicate by root cause

- Group findings that reference the **same file** and **overlapping line ranges**
  (within 5 lines tolerance).
- Use title/description similarity for findings in different files that describe
  the same root cause.
- When merging, preserve the most detailed description from any reviewer.

#### 3c. Assign consensus, priority, and confidence

- **consensus**: Count of reviewers that flagged this issue (e.g., 3/4).
- **priority**: Use the highest (most severe) priority any reviewer assigned.
- **confidence**: Use the highest confidence score from any reviewer.
  If no reviewer provided a confidence score, default to
  `consensus_count / total_reviewers`.
- **sources**: List which models flagged this issue (e.g., "codex, claude").
- **Sort** all findings by: priority ascending (P0 first), then confidence
  descending within the same priority.

#### 3d. Merge suggestion blocks

- When multiple models provide `suggestion` code for the same finding, prefer
  the suggestion from the model that assigned the highest priority for that
  finding. If priorities match, prefer the longest/most complete suggestion.
- Track which model provided the selected suggestion.

### 4. Display the Review Summary Table

Present the aggregated results with the overall assessment:

**Overall Assessment: CRITICAL / NEEDS_FIXES / PASS**
- CRITICAL if any finding is P0
- NEEDS_FIXES if any finding is P1 or P2
- PASS if no findings or all are P3

```
| # | Priority | Category | Issue | File:Line | Consensus | Confidence | Sources |
|---|----------|----------|-------|-----------|-----------|------------|---------|
| 1 | P0 | security | Hardcoded API key | config.py:23 | 3/3 | 0.95 | codex, claude, copilot |
| 2 | P1 | correctness | Off-by-one in loop | parser.rs:142-145 | 2/3 | 0.85 | codex, claude |
| 3 | P2 | performance | N+1 query | api/users.py:88 | 2/3 | 0.80 | claude, copilot |
| 4 | P3 | maintainability | Complex nested logic | utils.py:55-70 | 1/3 | 0.60 | claude |
```

After the table, for each finding with a `suggestion` block, display the
suggested fix in a collapsible details section:

```
<details>
<summary>F1: Suggested fix for config.py:23 (by codex)</summary>

\`\`\`suggestion
replacement code here
\`\`\`

</details>
```

### 5. Fix validated issues

Apply fixes for findings that meet ALL criteria:

1. Priority is P0, P1, or P2 (skip P3).
2. Consensus >= 50% of reviewers (e.g., 2/4 or higher).
3. Confidence >= 0.7.
4. A `suggestion` code block is available from at least one reviewer.

**Fix order** -- process fixes strictly by priority:

1. All P0 findings first (in file order to minimize conflicts).
2. Then P1 findings.
3. Then P2 findings.
4. After each priority tier, run the project's quality checks (linters, type
   checkers, tests) as documented in CLAUDE.md or project conventions. If checks
   fail, revert that tier's changes and report which fixes caused the regression.

**Conflicting suggestions**: If two or more models provide contradictory
`suggestion` blocks for the same finding (different fix approaches), present
both options to the user instead of auto-fixing. Let the user choose.

**P3 findings**: Display in the review table but explicitly skip during the fix
phase. Add a note: "P3 findings are informational -- review and address manually
if desired."

### 6. Display the Fix Summary Table

Present what was fixed as a markdown table:

```
| # | Priority | Fix description | File(s) | Suggestion by |
|---|----------|----------------|---------|---------------|
| 1 | P0 | Removed hardcoded API key | config.py | codex |
| 2 | P1 | Fixed loop bound off-by-one | parser.rs | claude |
```

## Language Handling

Detect the language of the user's message (including any additional instructions).
If the user writes in a non-English language (e.g., Japanese), display the Review
Summary Table and Fix Summary Table in that same language. The table structure and
column names should also be localized.

Japanese example:

```
**Overall Assessment: CRITICAL**

| # | 優先度 | カテゴリ | 問題 | ファイル:行 | 合意 | 信頼度 | 検出元 |
|---|--------|----------|------|-------------|------|--------|--------|
| 1 | P0 | security | ハードコードされたAPIキー | config.py:23 | 3/3 | 0.95 | codex, claude, copilot |
| 2 | P1 | correctness | ループ境界のオフバイワン | parser.rs:142-145 | 2/3 | 0.85 | codex, claude |
```

```
| # | 優先度 | 修正内容 | ファイル | 提案元 |
|---|--------|---------|---------|--------|
| 1 | P0 | ハードコードされたAPIキーを削除 | config.py | codex |
| 2 | P1 | ループ境界のオフバイワンを修正 | parser.rs | claude |
```

## Error Handling

- **Skill not found**: Report which skill(s) are unavailable and proceed with the rest.
  If zero skills are available, inform the user and stop.
- **Agent timeout or failure**: Report the failed agent, present results from successful
  agents only. Reduce the consensus denominator accordingly.
- **Output parse failure**: If a model returns output that cannot be normalized into
  the common format, attempt heuristic extraction (look for file paths, line numbers,
  severity keywords). If heuristic extraction also fails, log a warning with the model
  name and exclude it from consensus counting (reduce the denominator).
- **Conflicting suggestions**: If two models provide contradictory `suggestion` blocks
  for the same finding, present both to the user with source labels and let the user
  choose, rather than auto-fixing.
- **Fix regression**: If quality checks fail after applying a tier of fixes, revert that
  tier, report which fixes caused the regression, and continue with the next tier.
- **No issues found**: Report that all reviewers found no issues. Do not fabricate findings.
- **No fixable issues**: If all issues are P3, lack consensus, or have confidence < 0.7,
  display the review table but skip the fix phase. Inform the user.
