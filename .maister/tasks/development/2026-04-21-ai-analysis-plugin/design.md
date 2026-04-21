# AI Analysis Plugin — Design

**Date:** 2026-04-21
**Status:** final
**ADRs:** [.maister/docs/ADRs/0001-ai-analysis-baml-function-split.md](../../../docs/ADRs/0001-ai-analysis-baml-function-split.md)

## Overview

A new Next.js plugin at `plugins/ai-analysis/` (port 3011) registers a `product.detail.tabs` extension labeled **Analysis**. On click, its UI calls a single API route, which invokes one BAML function (`gpt-4o-mini` via LiteLLM with web search) that returns verdicts for all three dimensions, and renders them as a three-row table. No persistence: each click re-runs the analysis and replaces the table.

## Required reading for implementation

- `plugins/CLAUDE.md` — plugin layout, manifest format, SDK usage, host UI classes (`tc-plugin`, `tc-table`, `tc-error`, `tc-primary-button`); the new plugin follows this contract.
- `plugins/ai-description/` — the reference Next.js + BAML plugin this design mirrors for project structure, BAML client setup, API-route shape, and error-handling pattern.

## Approach

Mirror the `ai-description` plugin's structure (Next.js app, BAML in `baml_src/`, generated `baml_client/`, API route under `src/pages/api/`, UI under `src/pages/`). Diverge in two ways: (1) the BAML client targets `gpt-4o-mini` via LiteLLM **with web search enabled** (single client, single function), (2) **no `thisPlugin.objects` persistence** — the API route returns the verdict directly and the UI holds it in component state until the next Analyze click.

The Analyze flow is synchronous request/response: UI POSTs `productId` → API route fetches the product via `hostApp.getProduct` → invokes `b.AnalyzeProduct(...)` once → returns the three-row response → UI renders the table. Any failure in the BAML call surfaces as a single error banner; Analyze remains clickable for retry.

## Module & component boundaries

New plugin directory: `plugins/ai-analysis/` — sibling of `plugins/ai-description/`. Files:

- `manifest.json` — one `product.detail.tabs` extension, label **Analysis**, path `/product-tab`, priority `60`, URL `http://localhost:3011`.
- `package.json` — Next.js dev/build/start on port 3011; `baml-cli generate` scripts copied from `ai-description`.
- `baml_src/generators.baml` — TypeScript generator (same as `ai-description`).
- `baml_src/clients.baml` — defines `LiteLlmProvider` (openai provider, `gpt-4o-mini`, base_url to LiteLLM, with the option that enables web search) and a `LlmProvider` fallback wrapper around it. Same shape as `ai-description/baml_src/clients.baml`, modified to enable web search.
- `baml_src/main.baml` — defines `AnalyzeProduct` (see Interface contracts).
- `baml_client/` — generated, gitignored per existing convention.
- `src/pages/_document.tsx` — loads `plugin-sdk.js` and `plugin-ui.css` from the host (copied from `ai-description`).
- `src/pages/product-tab.tsx` — the UI component (Analyze button → table).
- `src/pages/api/analyze.ts` — the API route.
- `src/domain.ts` — TypeScript types for the API response (`AnalysisRow`, `AnalysisResult`).
- `tsconfig.json`, `next.config.js`, `next-env.d.ts`, `.env.example`, `.gitignore` — copied from `ai-description`.

No host-side changes. No new shared SDK code.

## Data model changes

_No data model changes._ The plugin does not persist analysis results; nothing is written to the host database or to `thisPlugin.objects`.

## Interface contracts

### BAML function (`baml_src/main.baml`)

```baml
enum Verdict { OK, ISSUE }

class DimensionResult {
  verdict Verdict
  justification string?  // present only when verdict == ISSUE; one sentence
}

class ProductAnalysis {
  description DimensionResult
  category    DimensionResult
  price       DimensionResult
}

function AnalyzeProduct(
  name: string, description: string, category: string, price: float
) -> ProductAnalysis {
  client LlmProvider
  // prompt: judge description and category from the record alone;
  // for price, use web search to gauge market price; if comparables
  // are insufficient, return verdict OK with empty justification.
}
```

### HTTP API (`POST /api/analyze`)

Request body:

```ts
{ productId: string | number }
```

Response `200`:

```ts
{
  rows: [
    { dimension: "description" | "category" | "price",
      verdict: "OK" | "ISSUE",
      justification: string | null }
  ]
}
```

- Response `400` `{ error, details: ["productId"] }` — missing/blank `productId`.
- Response `500` `{ error }` — `hostApp.getProduct` failed, BAML call failed, or response malformed. UI renders this with `tc-error`; Analyze remains clickable.

### UI component contract

`product-tab.tsx` reads `thisPlugin.productId` from the SDK and renders one of three states: initial (Analyze button only), loading (button disabled, "Analyzing…"), result (three-row table plus Analyze button to re-run). Re-clicks while `loading` are blocked by the disabled state. Errors render via `tc-error` above the button without clearing any prior table.

## Flows & state

1. User opens Analysis tab → component mounts, reads `productId`, shows initial state.
2. User clicks **Analyze** → component sets `loading=true`, disables the button, POSTs `{ productId }` to `/api/analyze` with the host JWT in `Authorization`.
3. API route validates `productId` → calls `hostApp.getProduct(productId)` via `createServerSDK("ai-analysis", undefined, req)`.
4. API route invokes `b.AnalyzeProduct(name, description, category, price)` once.
5. API route maps the `ProductAnalysis` result to the three-row response and returns `200`.
6. Response returns to UI → component sets `result`, `loading=false`, renders table.
7. Re-click → repeat from step 2; new result replaces the previous table.

## Integration changes

**`plugins/ai-analysis/`** _(new directory)_ — full plugin scaffold modeled on `plugins/ai-description/`. Differences from the template: port 3011, single BAML function `AnalyzeProduct`, BAML client configured for web search, no `thisPlugin.objects` calls in the API route, response shape is the three-row array (not a single description object).

**`plugins/ai-analysis/manifest.json`** _(new)_ — declares one `product.detail.tabs` extension with label **Analysis**, path `/product-tab`, priority `60`.

**Host registration** — one-time `PUT http://localhost:8080/api/plugins/ai-analysis/manifest -H "Content-Type: application/json" -d @manifest.json` after the dev server is running. No host code changes.

**LiteLLM** — already configured to route `gpt-4o-mini` with web search; no LiteLLM-side changes required.

## Resolved questions

- **Q:** Fallback for the price dimension when web search yields no useful comparables.
  **A:** The `AnalyzeProduct` prompt instructs the model to return the price row as `verdict: OK` with an empty justification when comparables are insufficient. Rationale: the brainstorming forbids blocking/gating behavior, so a default-OK is consistent with the plugin's advisory posture; flagging "Issue" purely on missing data would generate noise.

- **Q:** Single BAML function vs. split.
  **A:** Single function. See [ADR-0001](../../../docs/ADRs/0001-ai-analysis-baml-function-split.md).

- **Q:** Whether description/category use `gpt-4o-mini` or a cheaper model.
  **A:** `gpt-4o-mini` for the single call. Required by the price dimension and shared with the other two — no second model surface introduced.

- **Q:** Behavior when required product fields are missing/empty.
  **A:** The API route does not pre-validate field contents. Empty strings are passed through to BAML; the prompt instructs the model to return `verdict: ISSUE` with a justification like "Description is empty". Rationale: the LLM is already the judge; reusing it for the missing-field case avoids a parallel rule engine and produces uniform UI.

## Assumptions to verify

_No outstanding assumptions._

## Out of scope (design-level)

- Caching analysis results across re-clicks within the same tab session — each click re-runs by design.
- Per-dimension retry from the UI (only whole-analysis retry is offered).
- Showing the raw web-search citations the price call may have used — only the verdict and one-sentence justification are surfaced.
