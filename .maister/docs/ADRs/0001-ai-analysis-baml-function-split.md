# ADR-0001: Single BAML function for AI product analysis

**Date:** 2026-04-21
**Status:** accepted
**Related ADRs:** _None._

## Context

A product-quality analysis feature evaluates three dimensions of a product record — description accuracy, category relevance, and price reasonableness — and returns binary verdicts plus one-sentence justifications. Two of the dimensions (description, category) are judged from the product record alone. The third (price) requires grounding in current market prices and therefore needs an LLM call with web search enabled.

Forces:

- **Cost & latency.** Web-search-enabled calls are slower and more expensive than plain completions. Bundling all three dimensions into one web-search call pays that cost on dimensions that don't strictly need it.
- **Prompt clarity.** Per-dimension prompts let the model focus on one rubric at a time. A single combined prompt has to direct the model across three rubrics.
- **Failure isolation.** A single call means any failure (web-search timeout, malformed output) takes down the whole analysis. Multiple calls let dimensions fail independently.
- **Operational simplicity.** Each additional BAML function adds schema surface, generated client surface, and orchestration code in the API route. The feature is on-demand and advisory — not a hot path.
- **Structured output.** BAML guarantees the structured shape regardless of how many calls are made, so structure is not a deciding factor.

## Decision

Use **one** BAML function: `AnalyzeProduct(name, description, category, price) -> ProductAnalysis`, where `ProductAnalysis` carries all three `DimensionResult` fields (description, category, price). The function targets `gpt-4o-mini` via LiteLLM with web search enabled. The Next.js API route makes a single BAML call and returns the three rows.

## Alternatives considered

- **Two functions — record-only (description+category) without web search, and price with web search** — rejected: adds a second BAML client and orchestration in the API route for marginal cost/latency savings on an on-demand advisory feature; the feature is not latency-critical and the per-call overhead matters less than the simplicity of a single prompt and a single response shape.
- **Three functions, one per dimension** — rejected: triples the round-trips and the BAML surface for a feature where all three verdicts are always wanted together.

## Consequences

- One BAML client suffices: `gpt-4o-mini` via LiteLLM with web search.
- A single prompt must direct the model to apply three distinct rubrics and to use web search only where relevant (price). Prompt design carries more of the load than function structure.
- A single failure mode: if the call fails or returns malformed output, the whole table renders an error. The UI's existing `tc-error` pattern (Analyze remains retryable) covers this.
- Per-dimension partial-success is not possible. Acceptable trade-off given the brainstorming's advisory, on-demand framing.
- Adding a fourth dimension later means extending the same `ProductAnalysis` shape and the same prompt — no new orchestration.
