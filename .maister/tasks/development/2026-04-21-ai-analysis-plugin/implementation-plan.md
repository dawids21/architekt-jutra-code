# AI Analysis Plugin — Implementation Plan

**Date:** 2026-04-21
**Status:** draft

## Required reading

**Docs & standards** (from `.maister/docs/INDEX.md`)
- `plugins/CLAUDE.md` — plugin layout, manifest format, SDK usage, host UI classes (`tc-plugin`, `tc-table`, `tc-error`, `tc-primary-button`) used by the tab.
- `.maister/docs/standards/global/error-handling.md` — drives fail-fast validation and the `tc-error` UX on BAML/host failures.
- `.maister/docs/standards/global/minimal-implementation.md` — plugin stays advisory-only; no persistence, no extra abstractions beyond what `ai-description` already has.
- `.maister/docs/standards/backend/api.md` — `POST /api/analyze` follows REST/JSON conventions and the error shape already used by `ai-description`.

**Design & ADRs**
- `design.md` > Interface contracts — BAML function signature, HTTP request/response shape, UI states.
- `design.md` > Flows & state — synchronous request/response loop the UI and API route must implement.
- `design.md` > Module & component boundaries — exhaustive file list for the new plugin.
- `.maister/docs/ADRs/0001-ai-analysis-baml-function-split.md` — single BAML function `AnalyzeProduct`, one prompt with three rubrics.

**Code to mirror**
- `plugins/ai-description/` — entire plugin is the template; copy scaffolding verbatim and diverge only where noted below.
- `plugins/ai-description/src/pages/api/generate.ts` — structure for the API route (validation, `createServerSDK`, `getProduct`, BAML call, error mapping). Drop the `thisPlugin.objects.save` block and the `customInformation` field.
- `plugins/ai-description/src/pages/product-tab.tsx` — UI state pattern (`loading`/`generating`/`error`), `hostApp.getToken()` for `Authorization`, fetch + error handling. Drop the load-on-mount path and the permission/`canEdit` gating.
- `plugins/ai-description/baml_src/clients.baml` — shape for `LiteLlmProvider` + `LlmProvider` fallback. Add the `gpt-4o-mini` web-search option.
- `plugins/ai-description/baml_src/main.baml` — BAML function/class definition style and prompt layout.
- `plugins/ai-description/src/__tests__/generate.test.ts` — test layout using `node-mocks-http` + `jest.mock` for `baml_client` and `server-sdk`.
- `plugins/server-sdk.ts` — already supplies `createServerSDK` and `hostApp.getProduct`; no changes.

## File inventory

- **CREATE** `plugins/ai-analysis/manifest.json` — one `product.detail.tabs` extension, label "Analysis", path `/product-tab`, priority `60`, url `http://localhost:3011`.
- **CREATE** `plugins/ai-analysis/package.json` — Next.js dev/build/start on port 3011, baml-cli generate scripts, jest deps (copied from `ai-description`).
- **CREATE** `plugins/ai-analysis/next.config.js` — Next config with `experimental.externalDir` so `plugins/sdk.ts` / `plugins/server-sdk.ts` resolve.
- **CREATE** `plugins/ai-analysis/next-env.d.ts` — standard Next typings file.
- **CREATE** `plugins/ai-analysis/tsconfig.json` — copied from `ai-description` verbatim.
- **CREATE** `plugins/ai-analysis/jest.config.js` — ts-jest preset, roots `src`.
- **CREATE** `plugins/ai-analysis/.env.example` — `LITELLM_API_KEY=sk-litellm-dev-key`.
- **CREATE** `plugins/ai-analysis/.gitignore` — `node_modules/`, `.next/`, `baml_client/`, `.env`.
- **CREATE** `plugins/ai-analysis/baml_src/generators.baml` — TypeScript generator, version `0.220.0`.
- **CREATE** `plugins/ai-analysis/baml_src/clients.baml` — `LiteLlmProvider` targeting `gpt-4o-mini` via LiteLLM with web search option enabled, plus `LlmProvider` fallback wrapper.
- **CREATE** `plugins/ai-analysis/baml_src/main.baml` — `Verdict` enum, `DimensionResult`, `ProductAnalysis`, `AnalyzeProduct` function with prompt covering all three rubrics.
- **CREATE** `plugins/ai-analysis/src/domain.ts` — TS types `AnalysisRow`, `AnalysisResult` for the API response.
- **CREATE** `plugins/ai-analysis/src/pages/_document.tsx` — loads host `plugin-sdk.js` and `plugin-ui.css` (copied from `ai-description`).
- **CREATE** `plugins/ai-analysis/src/pages/product-tab.tsx` — Analyze button + three-row results table + error banner.
- **CREATE** `plugins/ai-analysis/src/pages/api/analyze.ts` — `POST /api/analyze` handler: validate productId → `hostApp.getProduct` → `b.AnalyzeProduct` → map to rows → return.
- **CREATE** `plugins/ai-analysis/src/__tests__/analyze.test.ts` — API-route unit tests mirroring `generate.test.ts`.
- **CREATE** `plugins/ai-analysis/src/__tests__/domain.test.ts` — minimal type/mapper test (only if any mapping logic is added; otherwise omit).

## Step-by-step plan

1. **Scaffold the plugin directory.**
   - Copy `plugins/ai-description/{package.json, next.config.js, next-env.d.ts, tsconfig.json, jest.config.js, .env.example, .gitignore}` to `plugins/ai-analysis/`. Rename package name to `ai-analysis-plugin`; change the three port `3003` references in `package.json` scripts to `3011`.
   - Files: the eight files above.
   - Verify: `cd plugins/ai-analysis && npm install` runs; `postinstall` attempts `baml-cli generate` (will fail until step 2 — expected).

2. **Author BAML sources.**
   - Create `baml_src/generators.baml` (identical to `ai-description`).
   - Create `baml_src/clients.baml` — same `LiteLlmProvider` shape but add the LiteLLM web-search option so the price dimension is grounded (`options { ... web_search_options { search_context_size "medium" } }` or the equivalent LiteLLM passthrough key; confirm against current LiteLLM config before settling on the exact key).
   - Create `baml_src/main.baml` — declare `Verdict`, `DimensionResult`, `ProductAnalysis`, and `AnalyzeProduct(name, description, category, price)` with a prompt that (a) judges description/category from the record alone, (b) instructs the model to use web search for price and return `OK` with empty justification when comparables are insufficient, (c) returns `ISSUE` with a one-sentence justification when a dimension fails, (d) emits an empty-description ISSUE when fields are blank.
   - Files: `plugins/ai-analysis/baml_src/{generators,clients,main}.baml`.
   - Verify: `npx baml-cli generate` succeeds; `plugins/ai-analysis/baml_client/` is generated and contains `b.AnalyzeProduct`.

3. **Add the manifest.**
   - Files: `plugins/ai-analysis/manifest.json` — fields per design; `extensionPoints` has one entry.
   - Verify: `cat manifest.json | jq .` parses; `url` is `http://localhost:3011`; the single extension has `path: "/product-tab"` and `priority: 60`.

4. **Define domain types.**
   - Files: `plugins/ai-analysis/src/domain.ts` — export `AnalysisRow` (`dimension: "description" | "category" | "price"`, `verdict: "OK" | "ISSUE"`, `justification: string | null`) and `AnalysisResult` (`{ rows: AnalysisRow[] }`).
   - Verify: `npx tsc --noEmit` (via `next build` in later steps) compiles the file.

5. **Wire up `_document.tsx`.**
   - Files: `plugins/ai-analysis/src/pages/_document.tsx` — copy from `ai-description`.
   - Verify: file compiles.

6. **Implement `POST /api/analyze`.**
   - Files: `plugins/ai-analysis/src/pages/api/analyze.ts`.
   - Behaviour: reject non-POST with 405; validate `productId` (trim, non-empty) returning 400 `{ error: "Missing required fields", details: ["productId"] }`; `createServerSDK("ai-analysis", undefined, req)`; `hostApp.getProduct(productId)` cast to `{ name, description, category, price }` (use the same shape the host returns — verify via running host in step 11); invoke `b.AnalyzeProduct(name, description, category, price)`; map `ProductAnalysis` into `{ rows: [ {dimension:"description", ...}, {dimension:"category", ...}, {dimension:"price", ...} ] }`, setting `justification` to `null` when `verdict === "OK"` (or when the BAML field is missing). Catch errors, log, return 500 `{ error }` (matching `ai-description`'s status-from-message heuristic).
   - Verify: `npm run build` compiles.

7. **Implement the UI (`product-tab.tsx`).**
   - Files: `plugins/ai-analysis/src/pages/product-tab.tsx`.
   - States: `result: AnalysisResult | null`, `loading: boolean` (initially `false`), `error: string | null`. Read `productId` from `thisPlugin.productId`; show the missing-productId error if absent.
   - Render: `<div className="tc-plugin">`, heading "AI Analysis", optional `tc-error` banner, optional three-row `tc-table` (`Dimension | Verdict | Justification`, empty cell when verdict is OK, `tc-badge--success`/`tc-badge--danger` inside verdict cell), and a `tc-primary-button` labelled "Analyze" / "Analyzing…" / "Re-analyze" (disabled while loading).
   - `handleAnalyze`: get token via `sdk.hostApp.getToken()`, `fetch("/api/analyze", { POST, Authorization, body: { productId } })`; on failure set error and keep previous table; on success overwrite `result`.
   - Verify: `npm run build` compiles.

8. **Unit tests for the API route.**
   - Files: `plugins/ai-analysis/src/__tests__/analyze.test.ts`, copied from `generate.test.ts` and adapted: mock `../../baml_client` > `b.AnalyzeProduct`, mock `../../../server-sdk` > `createServerSDK`. Drop the `mockObjectsSave` stub.
   - Cases (see Test plan).
   - Verify: `npm test` passes.

9. **Manifest registration.**
   - Run the dev server (`npm run dev` in `plugins/ai-analysis`) — port 3011 listens.
   - Register once: `curl -X PUT http://localhost:8080/api/plugins/ai-analysis/manifest -H "Content-Type: application/json" -d @plugins/ai-analysis/manifest.json`.
   - Verify: `curl http://localhost:8080/api/plugins` lists `ai-analysis` with the Analysis tab.

10. **Populate `.env`.**
    - Copy `.env.example` to `.env`, confirm `LITELLM_API_KEY` value matches the dev value used by `ai-description`'s `.env`.
    - Verify: `grep LITELLM_API_KEY plugins/ai-analysis/.env` prints the expected key.

11. **End-to-end manual check.**
    - Host running on :8080, plugin on :3011, LiteLLM on :4000.
    - Open a product detail page in the host UI → "Analysis" tab appears → click Analyze → three-row table renders within a few seconds; re-click replaces it.
    - Test empty-description product (expect ISSUE row), non-existent `productId` (expect 500 + `tc-error`), and LiteLLM down (expect 500 + retryable button).
    - Verify: all three paths match design.md > Flows & state and the brainstorming acceptance criteria.

## Test plan

**Unit tests**
- `src/__tests__/analyze.test.ts`
  - `rejects_missingProductId_returns400WithDetails` — empty body → 400 with `details: ["productId"]`.
  - `rejects_nonPostMethod_returns405` — `GET` → 405.
  - `accepts_validRequest_fetchesProductAndInvokesBaml` — returns 200; asserts `getProduct` was called with the stringified id and `AnalyzeProduct` was called with `(name, description, category, price)`.
  - `success_mapsProductAnalysisToThreeRows` — verdicts/justifications flow into the `rows` array in the fixed dimension order; `justification` is `null` when verdict is `OK`.
  - `productFetchFails_returns500` — `getProduct` rejects → 500.
  - `bamlFailure_returns500_withoutLeakingInternals` — `AnalyzeProduct` rejects → 500 and response body does not include the raw provider message (mirrors the existing `generate.test.ts` assertion style).

**Integration tests**
- _N/A — the plugin has no host-side code; the Next.js API route is covered by the unit tests above with `createServerSDK` and BAML mocked, matching the `ai-description` test strategy._

**Manual verification**
- Analyze tab renders and produces the three-row table on a real product.
- Re-click replaces the previous table.
- `tc-error` appears when the backend is stopped; Analyze stays clickable.
- Price row actually reflects web-grounded reasoning (spot-check on a few products with clearly over/under-priced listings).

## Verification checklist

- [ ] `npm run build` in `plugins/ai-analysis/` succeeds with no TS errors.
- [ ] `npm test` in `plugins/ai-analysis/` passes.
- [ ] `npx baml-cli generate` regenerates `baml_client/` cleanly.
- [ ] Manifest registered via `PUT /api/plugins/ai-analysis/manifest` returns 200.
- [ ] In the host UI, the "Analysis" tab appears on product detail and renders the three-row table end to end.
- [ ] Error path (LiteLLM unreachable) renders `tc-error` and the Analyze button remains clickable.
- [ ] No references to `thisPlugin.objects` anywhere in `plugins/ai-analysis/` (enforces the "no persistence" design rule).
- [ ] `design.md` > "Assumptions to verify" — none outstanding.

## Risks surfaced during planning

- **Risk:** The exact BAML/LiteLLM syntax to enable web search on `gpt-4o-mini` is not prescribed anywhere in the repo. The `ai-description` client config doesn't exercise this flag.
  **Why it matters:** Getting the option name wrong will silently produce a non-web-grounded price verdict — a functional regression the tests won't catch because they mock BAML.
  **Mitigation:** Before finalising `baml_src/clients.baml`, confirm the LiteLLM + BAML option name against LiteLLM's current config (`litellm/` directory or proxy docs) and test with a live call that asks a date-sensitive price question where a non-searching model would fail.

- **Risk:** The host's `getProduct` response shape is assumed to include `name`, `description`, `category`, and `price` as a number, but `ai-description` only uses `name`/`description`. If `category` arrives as an object/id or `price` as a string, the BAML call signature will be wrong.
  **Why it matters:** Causes a runtime type mismatch in the API route, surfaced only during manual verification.
  **Mitigation:** Before step 6, inspect the host's product DTO (hit `GET http://localhost:8080/api/products/{id}` once) and adjust the cast / mapping accordingly. If `category` is a nested object, extract the display name in the route before passing to BAML.
