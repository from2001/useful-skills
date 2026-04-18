---
name: gemini
description: >-
  Delegate a task to Google's Gemini CLI and return its response. Use this skill
  whenever the user explicitly asks to use Gemini, ask Gemini, run something
  through Gemini, or get Gemini's take on something. Only triggers when the user
  specifically mentions "Gemini" — not for general second-opinion requests.
  Examples: "ask Gemini to explain this code", "use Gemini to write a script",
  "run this through Gemini", "have Gemini review this".
---

# Gemini CLI Skill

Send a prompt to Google's Gemini CLI in non-interactive headless mode and relay
the response back to the user.

## How it works

Run the Gemini CLI via Bash with these flags:

```
gemini "<prompt>" --yolo
```

- `"<prompt>"` — the prompt passed as a positional argument
- `--yolo` — auto-approve all tool actions

## Workflow

1. **Extract the prompt** from the user's message. Strip the "ask Gemini" /
   "use Gemini" prefix and pass the remaining content as the prompt.
   If the user's request references files or code in the current project,
   include relevant context (file paths, code snippets, diff output) in the
   prompt so Gemini has what it needs.

2. **Run the command**:
   ```bash
   gemini "<prompt>" --yolo
   ```
   Use a generous timeout (up to 300000ms) since Gemini may take time for
   complex tasks.

3. **Relay the response** back to the user as-is. Do not editorialize or
   summarize unless the user asks you to. If the output is very long, present
   it in full — let the user decide what matters.

## Error handling

- If the `gemini` command is not found, tell the user to install it:
  `npm install -g @anthropic-ai/gemini-cli` or check their PATH.
- If the command fails or times out, show the error output and suggest the user
  try a simpler prompt or check their Gemini API configuration.

## Important

- Always use `--yolo` so the CLI does not hang waiting for approval.
- Do not add `--model` or other flags unless the user explicitly requests them.
- Pass the prompt as a positional argument in a single quoted string. Escape any internal quotes.
