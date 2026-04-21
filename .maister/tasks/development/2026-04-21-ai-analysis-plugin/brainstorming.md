# AI Analysis Plugin

**Date:** 2026-04-21
**Type:** feature
**Status:** brainstorming

## Summary

A new plugin that adds an "Analysis" tab to the product detail page. On demand, it uses BAML + LiteLLM to evaluate three dimensions of a product record (description accuracy, category relevance, price reasonableness) and renders the results as a table. Advisory only — no blocking, no auto-correction, no persistence.

## Context

The platform already has plugins that produce content (e.g. `ai-description`). There is no plugin that reviews the quality of an existing product record. Sellers and moderators viewing a product have no automated way to sanity-check whether the description matches the product, whether the assigned category is appropriate, or whether the price is in line with the market. This plugin fills that gap as an on-demand check surfaced where the user already is — the product detail page.

## Requirements

- Plugin registers a `product.detail.tabs` extension point labeled **Analysis**.
- Opening the tab shows an empty state with an **Analyze** button.
- Clicking **Analyze** calls the plugin backend, which uses BAML to invoke an LLM via LiteLLM and returns a structured result.
- The result is rendered as a three-row table with columns: `Dimension | Verdict | Justification`.
  - Rows: **Description accuracy**, **Category relevance**, **Price reasonableness**.
  - Verdict is binary: **OK** or **Issue**.
  - Justification is a one-sentence LLM-written explanation, shown only when verdict == Issue. When verdict == OK, the justification cell is empty.
- Input to the analyzer is the product record only (title, description, category, price) — the same product type used by existing plugins.
- Description and category dimensions are judged from the product record alone.
- Price dimension uses `gpt-4o-mini` via LiteLLM with web search enabled, so the verdict is grounded in live market data rather than model training knowledge alone.
- Re-clicking **Analyze** re-runs the analysis and replaces the table.

## Anti-requirements

- Not blocking or gating: the plugin never prevents a product from being saved/published.
- No auto-correction or suggested rewrites.
- No persistence of analysis results — each run is ephemeral.
- No scheduled or batch analysis; on-demand only.
- No moderator dashboard / cross-product reporting.
- Out of scope dimensions: grammar/spelling checks, image moderation, fraud detection, duplicate-listing detection.
- No dedicated live market price feed — price grounding relies on LLM web search only.

## Constraints & assumptions

- Plugin follows the `ai-description` plugin pattern: Next.js backend app that hosts both the UI (iframe) and the BAML-driven API route.
- Plugin runs on **port 3011**.
- LiteLLM is already running in the platform; the plugin routes all LLM calls through it.
- `gpt-4o-mini` is available via LiteLLM and supports web search — used at minimum for the price dimension.
- BAML is used to guarantee structured output for all three dimensions.
- Input product type is the one already exposed to plugins (to be reused from existing plugin code, not redefined).
- Host UI styles (`tc-plugin`, `tc-table`, `tc-primary-button`, `tc-error`, etc.) are used for visual consistency.
- Error handling and API-route layout follow conventions already established in `ai-description`.

## Acceptance criteria

- [ ] Plugin exists at `plugins/ai-analysis/` (or equivalently named) as a Next.js app on port 3011.
- [ ] `manifest.json` declares one `product.detail.tabs` extension point with label **Analysis**.
- [ ] Plugin is registered with the host and the **Analysis** tab appears on the product detail page.
- [ ] The tab shows an **Analyze** button in its initial state.
- [ ] Clicking **Analyze** produces a three-row table with verdicts for description accuracy, category relevance, and price reasonableness within a reasonable time.
- [ ] Verdicts are binary (OK / Issue); justifications appear only for Issue rows and are a single sentence.
- [ ] The price verdict is produced using `gpt-4o-mini` via LiteLLM with web search.
- [ ] BAML is used for all LLM calls and returns structured data.
- [ ] LiteLLM / LLM failures surface a visible error in the UI (same pattern as `ai-description`), and the Analyze action remains retryable.
- [ ] Manual verification in the running app (opening a real product, clicking Analyze, seeing the table) passes.

## Edge cases

- **LLM / LiteLLM failure or malformed response** — the UI shows an error message (reusing the `tc-error` pattern from `ai-description`); the **Analyze** button remains usable for retry.
- **Web search returns no useful comparables for price** — the price row should still produce a verdict; exact fallback (default to OK vs. Issue with "insufficient market data") is deferred to implementation.
- **Re-running Analyze while a previous run is in flight** — UI should prevent overlapping requests (disabled button / loading state).
- **Missing or empty product fields** (e.g. no description, no category, no price) — behavior not specifically required, but analyzer should not crash; deferred to implementation.

## Integration points

- New directory: `plugins/ai-analysis/` modeled on `plugins/ai-description/`.
  - `manifest.json` — one `product.detail.tabs` extension point, label **Analysis**, URL `http://localhost:3011`.
  - `package.json` — Next.js dev server on port 3011, BAML generate scripts.
  - `baml_src/` — BAML schema/functions for the three-dimension analysis (shape and splitting of functions TBD).
  - `baml_client/` — generated.
  - `src/` — Next.js pages + API route that accepts a product record and returns the structured verdict result.
- Host registration via `PUT http://localhost:8080/api/plugins/{pluginId}/manifest` (per `plugins/CLAUDE.md`).
- UI imports SDK and styles from the host (`/assets/plugin-sdk.js`, `/assets/plugin-ui.css`).
- Reuses the existing product type exposed to plugins (look up in `ai-description` / shared plugin types rather than redefining).

## Open questions

- Fallback behavior for the price dimension when web search yields no useful comparables (default OK vs. Issue with "insufficient market data").
- Whether all three dimensions are produced by a single BAML function/call or split into separate calls (impacts latency, cost, and prompt clarity).
- Whether description and category dimensions should also use `gpt-4o-mini` or a cheaper model available in LiteLLM.
- Behavior when required product fields are missing/empty.
