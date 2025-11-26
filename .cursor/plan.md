## AI Essay → Review → Revision Pipeline

### Goal

Implement a **Bun-friendly TypeScript CLI** (`bun run index.ts`) that:

- Prompts the user for an essay topic.
- Uses **model A (OpenRouter via Vercel AI SDK)** to generate an essay.
- Uses **model B** to review that essay and produce feedback.
- Calls **model A again** with the feedback to produce a revised essay.
- Saves all three artifacts as **markdown files** on disk in a consistent location, with the `runs/` directory ignored by git.

### High-level Design

- **Runtime & entrypoint**: Keep using Bun with `index.ts` as the main CLI entrypoint.
- **AI client setup**:
- Add `ai` and the **OpenRouter provider for the Vercel AI SDK** as dependencies (no separate `openai` package needed since we are using OpenRouter directly).
- Configure a small `aiClient.ts` module (or keep logic inline in `index.ts` if very small) that wires the AI SDK to OpenRouter using an `OPENROUTER_API_KEY` env var.
- Hard-code two model IDs (e.g. one for essay generation, one for review) with clear `const` names so you can easily change them later.
- **Pipeline orchestration**:
- Implement a `runEssayPipeline()` function that:
- Reads the prompt from stdin (simple interactive question).
- Calls the **essay model** with a system prompt + user prompt to generate the initial essay.
- Calls the **review model** with system instructions plus the essay content to generate feedback.
- Calls the **essay model** again with the original prompt and the feedback to produce a revised essay.
- Keep everything **strongly typed** with small TypeScript interfaces for the pipeline results.
- **Markdown file output**:
- Decide on a simple folder and naming scheme (e.g. `runs/<timestamp>-essay.md`, `runs/<timestamp>-review.md`, `runs/<timestamp>-revision.md`).
- Use Bun / Node fs APIs in a small utility to write each step as a separate markdown file.
- Include basic front-matter or headings (e.g. `# Original Essay`, `# Review Feedback`, `# Revised Essay`) for easy inspection in an editor.
- Ensure `runs/` is added to `.gitignore` so generated artifacts don’t clutter git history.

### Implementation Steps

- **setup-deps**: Add `ai` and the OpenRouter provider for the AI SDK to `package.json` and document the required `OPENROUTER_API_KEY` env var in `README.md`.
- **ai-client**: Create a small AI client configuration that:
- Instantiates the AI SDK with the OpenRouter provider.
- Exposes typed helpers like `generateEssay(prompt)`, `reviewEssay(essay)`, and `reviseEssay(prompt, essay, feedback)`.
- **pipeline-logic**: Implement `runEssayPipeline()` in `index.ts` that:
- Interactively asks for a prompt via stdin.
- Runs the three AI steps in sequence (no streaming needed) with clear logging to the console.
- Returns a typed result object containing the three text outputs.
- **file-output**: Add a small utility function to:
- Create a `runs/` directory if it doesn’t exist.
- Write three markdown files with timestamped names and simple headings.
- Confirm that `runs/` is listed in `.gitignore`.
- **polish-types**: Ensure all public functions are type-safe (typed params and return types where helpful) and that the code compiles under the existing `tsconfig`.

### Todos

- **setup-deps**: Add and configure Vercel AI SDK (`ai`) and the OpenRouter provider, and document `OPENROUTER_API_KEY`.
- **ai-client**: Implement the AI client helper(s) for essay generation, review, and revision using hard-coded OpenRouter model IDs.
- **pipeline-logic**: Implement the CLI flow in `index.ts` to run the generation → review → revision pipeline.
- **file-output**: Implement markdown file-writing utilities (create `runs/` directory, timestamped filenames, headings) and ensure `runs/` is in `.gitignore`.
- **polish-types**: Run TypeScript checks and tighten any loose types if needed.
