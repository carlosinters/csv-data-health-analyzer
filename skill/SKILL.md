---
name: safe-data-parsing
description: Use when writing or reviewing code that parses, validates, or normalizes external data (CSV/file uploads, API responses, form input) — to catch places where error or quality signals get silently discarded for coding convenience.
---

# Safe Data Parsing

This skill applies when *writing code* that ingests external data, not just when eyeballing a file. It encodes the mistakes this project's own CSV analyzer had to be corrected on more than once during development — each one was code that made data quietly disappear or got gated too aggressively, not a one-off typo.

## The core rule

**Normalize for correctness, but never silently discard a quality-relevant signal for coding convenience without first counting and reporting it.**

Concrete cases from this project that had to be caught and fixed:

- `Papa.parse(..., { skipEmptyLines: true })` made a trailing blank line vanish from the row count with no trace. Fix: count skipped/empty rows separately and report the count, rather than letting the parser's convenience option hide them.
- `dynamicTyping: true` silently turns `""` into `null`. That's fine as a normalization step, but only if something downstream still counts it as "missing" rather than treating it as if the value were never there.
- `isLoadable = result.errors.length === 0` treated *any* parser error as fatal, discarding a file over recoverable issues (a stray quote, a delimiter mismatch) that Papa Parse can often already recover from. Fix: look at what the error actually is — check `result.data.length > 0` and only some error types are actually fatal, don't gate on the mere presence of an error array.

Before writing a `filter`, a `try/catch` that swallows, a `skip*` option, a `??`/default-value fallback, or an early-return gate around external data, ask: *does this make some subset of the input disappear without a trace, or does it get counted and surfaced somewhere?* If it disappears, that's the bug to avoid.

## Hard gates vs. findings

Reserve hard failure (stopping processing, rejecting the whole input) for genuinely catastrophic cases only — e.g., a file that produced zero usable rows. Everything else — missing values, duplicate rows, type mismatches, malformed rows the parser recovered from — should become a **finding** with a severity (good / warning / critical), not a reason to abort. Code that gates too early throws away information a downstream reader (human or LLM) could have used.

## Match the check to the data shape

Don't apply a statistical check where it's meaningless for the shape of the data. String-length or numeric-outlier detection on a categorical column (a country, a status code, a small fixed set of labels) will flag legitimate variety as "outliers." Check the column's cardinality first (e.g. distinct-value ratio) and skip statistical outlier detection on columns that look categorical.

## What code can't see, ask an LLM to look for

Some quality problems are only visible in the actual values, not in counts: the same real-world value written multiple ways ("USA" / "United States" / "US"), inconsistent units, an abbreviation vs. full-name split. When an LLM is available, give it representative sample values per column (not just aggregate stats) and explicitly ask it to look for this class of issue with its own severity — then combine that with the code-computed severity by taking the worse of the two. Never let the LLM's judgment silently downgrade a problem the code already found deterministically.

## Presenting results

If the output reaches a non-technical reader: lead with a plain-English verdict, not a table of raw numbers; show percentages alongside counts; rank problems worst-first; and make sure any score or color-coded severity is reproducible from the underlying findings — compute it in code, don't ask the LLM to invent a number.

## Installing this skill

This is a Claude Skill: a folder containing a `SKILL.md` with YAML frontmatter (`name`, `description`) followed by instructions in Markdown, matching the format at [docs.claude.com/en/docs/agents-and-tools/agent-skills/overview](https://docs.claude.com/en/docs/agents-and-tools/agent-skills/overview).

To use it in another project with Claude Code:

1. Copy the `skill/` folder into that project (or into `~/.claude/skills/` to make it available across all projects).
2. Claude Code picks up any `SKILL.md` under a `skills/` directory automatically — no further configuration needed. It will be offered whenever a task matches the `description` field above (writing or reviewing data-parsing/validation code).

