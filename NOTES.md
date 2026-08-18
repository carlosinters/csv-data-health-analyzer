# Notes

## AI tools used and how

I used Claude Code throughout, in a tutoring mode: I asked it to explain each concept (git, TypeScript, React hooks, Papa Parse's API, JSON Schema differences between Gemini and Claude) before writing code, and to implement changes in small, explicit steps that I reviewed and approved rather than accepting large generated blocks. I ran `git add`/`commit`/`push` and `npm run dev` myself, and did all the browser testing myself, so I could actually see what changed at each step. Inside the app itself, the LLM (Gemini or Claude, user's choice) is used for exactly one thing: given the code-computed statistics and sample values for each column, it writes a plain-English guess at what the column represents and flags data-quality issues that raw counts can't show — like the same country written as "USA", "United States", and "US" in `ship_country`, which no missing/duplicate/type check would ever catch.

## Something that worked well

Splitting the quality logic into two layers turned out well: a fast, deterministic, code-only pass (`analysis.ts`/`severity.ts`) that always runs and never depends on an API key, and an optional LLM pass on top of it that adds interpretation and catches semantic issues the statistics can't. The app is fully useful with no key at all, and the AI layer is additive rather than load-bearing — if the LLM call fails or is skipped, the rest of the analysis and the UI still work.

## Where the AI got it wrong, and how I noticed

The first outlier detector flagged values in categorical columns like `ship_country` as statistical outliers just because they were long strings — I noticed while reading the actual flagged values in the console and saw they were just different but perfectly valid country names, not genuine anomalies. Fixed by gating outlier detection on the column's distinct-value ratio so it skips columns that look categorical. Separately, an early version of `isLoadable` treated any Papa Parse error as fatal and threw the whole file out; I asked whether all parser error types were really that serious, which led to checking `result.data.length > 0` instead so recoverable row-level errors are reported as findings instead of blocking the analysis.

## What I cut, and why

- **Drag-and-drop file upload** — a plain `<input type="file">` covers the requirement (upload in the browser) with far less code and risk in an 8–10 hour budget.
- **A second LLM call for a higher file-level summary and detailed kickoff-questions in the company context** — I designed the prompt for it early on, but decided the single column-diagnosis call already satisfied "one good use beats three shallow ones," and a second call would add cost and latency without a clearly bigger payoff but could potentially be more aligned with the company tone and pace for the meeting giving more value to the manager.
- **Configurable severity thresholds** — the "20% missing = critical" style thresholds are fixed constants rather than a settings panel, since this is a first-read tool, not a configurable pipeline.

## Time spent

Roughly 10 hours, but that includes breaks for eating ice cream while creative thinking the system architecture.

## What I'd do with two more days

Add a second, smaller LLM pass that turns the whole-file findings into 3–5 specific kickoff questions to ask the client ("what does `flag_3` mean?", "is `ship_country` supposed to be normalized?") — the most direct answer to the brief's "what we should ask the client about." I'd also add a few more targeted checks (date-format consistency within a column, case-inconsistency in categorical values) and a lightweight test suite around `analysis.ts` and `severity.ts`, since right now correctness relies on manually inspecting the sample file.
