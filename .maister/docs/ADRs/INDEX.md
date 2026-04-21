# ADR Index

Architecture Decision Records — persistent record of non-obvious technical decisions made on this project. Each ADR is self-contained; read the file for context, decision, alternatives, and consequences.

## Status legend

- **proposed** — drafted as part of an in-flight design; not yet confirmed.
- **accepted** — confirmed and in force.
- **superseded** — replaced by a later ADR (link to it in the file).

## Records

- [ADR-0001](0001-ai-analysis-baml-function-split.md) — **Single BAML function for AI product analysis** — _accepted_. The ai-analysis plugin uses one BAML call (`gpt-4o-mini` via LiteLLM with web search) producing all three dimension verdicts, prioritizing prompt/orchestration simplicity over per-dimension cost and failure isolation.
