# Educode AI Coach

Educode includes an always-available code-learning assistant at `POST /api/ai/explain/`.
Teachers can grade a student submission against a selected room question with `POST /api/ai/evaluate/`.

## What it does

- Parses Python with the standard-library AST.
- Detects syntax errors, unsafe `eval`/`exec`, possible hard-coded secrets, excessive file size, and iteration risks.
- Gives maintainability and testing guidance.
- Returns findings with severity, a complexity hint, and a next learning step.
- Uses OpenAI automatically when `OPENAI_API_KEY` is configured; otherwise it runs as the local **Educode Local Coach** with no external API dependency.
- Uses Google Gemini for teacher grading when `GEMINI_API_KEY` is configured; otherwise grading falls back to the local evaluator.
- Teacher grading returns a score out of 100, feedback, and findings tied to the selected question.

Set the Gemini key only in the untracked `apps/api-django/.env` file:

```text
GEMINI_API_KEY=your-key
GEMINI_MODEL=gemini-2.0-flash
```

Never commit or paste API keys into source files.

## Resume description

**Educode AI Learning and Proctoring Platform** — Built a Django REST + React platform with an AI code coach that combines Python AST analysis, security checks, complexity guidance, and optional OpenAI tutoring; added WebRTC classrooms, five-second exam snapshots, and tab-switch monitoring.
