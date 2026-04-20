# Logistics plugin — Implementation Plan

**Date:** 2026-04-20
**Status:** draft

## Required reading

**Docs & standards** (from `.maister/docs/INDEX.md`)
- `.maister/docs/standards/global/minimal-implementation.md` — two pages, no speculative hooks; do not add state for the deferred orphan-cleanup case.
- `.maister/docs/standards/global/commenting.md` — let `tc-*` class names and component structure speak; skip narration.
- `.maister/docs/standards/global/coding-style.md` — match the existing plugin naming (`handleX`, `loadX`, `onClick={() => void ...}`).
- `.maister/docs/standards/global/error-handling.md` — surface SDK errors via `tc-error`, mirror warehouse's try/catch around each SDK call.
- `.maister/docs/standards/global/validation.md` — trim name inputs, disable submit buttons on empty/whitespace.

**Design & ADRs**
- `design.md` > Module & component boundaries — authoritative file list for the new plugin.
- `design.md` > Flows & state — specifies the exact rename/edit state machine (`editingId: string | null`), load sequence, and save computation.
- `design.md` > Data model changes — shapes of `"method"` objects and `{ disabledMethods }` payload.
- `design.md` > Resolved questions — orphan `disabledMethods` entries stay on delete; do not cascade.

**Code to mirror**
- `plugins/warehouse/src/pages/WarehousePage.tsx` — list + add-form + delete pattern, loading state, error surface, button class usage. The `MethodsPage` reuses this shape and adds inline rename.
- `plugins/warehouse/src/domain.ts` — `toWarehouse` mapper style for `toDeliveryMethod`.
- `plugins/box-size/src/pages/ProductBoxTab.tsx` — `productId = sdk.thisPlugin.productId ?? ""`, defensive `try/catch` around `getData`, `saved` transient feedback flag, `setData` payload cast (`as unknown as Record<string, unknown>`). `ProductShippingTab` mirrors this end-to-end.
- `plugins/warehouse/vite.config.ts`, `plugins/warehouse/tsconfig.json`, `plugins/warehouse/index.html`, `plugins/warehouse/package.json` — copy verbatim then adjust name/port/title.
- `plugins/warehouse/src/main.tsx` — `BrowserRouter` + `Routes` layout.
- `plugins/CLAUDE.md` > UI & Styling — `tc-plugin`, `tc-card`, `tc-table`, `tc-primary-button`, `tc-ghost-button`, `tc-input` class set.

## File inventory

- **CREATE** `plugins/logistics/index.html` — HTML entry; `<title>Logistics Plugin</title>`, SDK script + `plugin-ui.css` link.
- **CREATE** `plugins/logistics/manifest.json` — identity + two extension points (`menu.main` at `/`, `product.detail.tabs` at `/product`).
- **CREATE** `plugins/logistics/package.json` — `"name": "logistics-plugin"`, same deps as warehouse.
- **CREATE** `plugins/logistics/tsconfig.json` — copied unchanged from warehouse.
- **CREATE** `plugins/logistics/vite.config.ts` — `server.port = 3010`, `strictPort: true`.
- **CREATE** `plugins/logistics/src/main.tsx` — `BrowserRouter` with two routes.
- **CREATE** `plugins/logistics/src/vite-env.d.ts` — copy from warehouse for Vite/React typings.
- **CREATE** `plugins/logistics/src/domain.ts` — `DeliveryMethod`, `ProductShippingData`, `toDeliveryMethod`, `toProductShippingData`.
- **CREATE** `plugins/logistics/src/pages/MethodsPage.tsx` — list, add, inline rename, delete.
- **CREATE** `plugins/logistics/src/pages/ProductShippingTab.tsx` — checkbox grid bound to `enabledMap`, save via `setData`.

_No files modified or deleted outside `plugins/logistics/`._

## Step-by-step plan

1. **Scaffold the plugin directory** — copy the warehouse files (`index.html`, `package.json`, `tsconfig.json`, `vite.config.ts`, `src/main.tsx`, `src/vite-env.d.ts`) into `plugins/logistics/`, then adjust: `vite.config.ts` port → `3010`; `package.json` name → `logistics-plugin`; `index.html` `<title>` → `Logistics Plugin`; remove warehouse-specific route imports from `main.tsx` (leave it not-yet-compiling — the page components land next).
   - Files: `plugins/logistics/index.html`, `plugins/logistics/package.json`, `plugins/logistics/tsconfig.json`, `plugins/logistics/vite.config.ts`, `plugins/logistics/src/main.tsx`, `plugins/logistics/src/vite-env.d.ts`.
   - Verify: `cd plugins/logistics && npm install` succeeds; `npx tsc -b --noEmit` reports only missing-module errors for `./pages/MethodsPage` and `./pages/ProductShippingTab`.

2. **Write the manifest** — create `manifest.json` with the two extension points from `design.md` > Interface contracts, `url: "http://localhost:3010"`, `name: "Logistics"`, `version: "1.0.0"`.
   - Files: `plugins/logistics/manifest.json`.
   - Verify: `cat plugins/logistics/manifest.json | jq .extensionPoints | length` prints `2`.

3. **Define the domain module** — create `src/domain.ts` with `DeliveryMethod`, `ProductShippingData`, `toDeliveryMethod(obj)`, and `toProductShippingData(raw)` that returns `{ disabledMethods: [] }` for `null`/missing/non-array payloads.
   - Files: `plugins/logistics/src/domain.ts`.
   - Verify: `npx tsc -b --noEmit` — only missing-page-module errors remain.

4. **Implement `MethodsPage`** — build the list + add-form + per-row `Edit/Save/Cancel/Delete` controls following `WarehousePage.tsx`'s structure. State: `methods: DeliveryMethod[]`, `newName: string`, `editingId: string | null`, `editingName: string`, `loading`, `error`. Handlers: `loadMethods` (calls `objects.list("method")` + `toDeliveryMethod`), `handleAdd` (trim-empty guard → `objects.save("method", crypto.randomUUID(), { name })`), `handleStartEdit(id, currentName)`, `handleSaveEdit` (trim-empty guard, upsert via `objects.save("method", editingId, { name })`), `handleCancelEdit`, `handleDelete` (`objects.delete("method", objectId)`). Wire route `/` in `main.tsx`.
   - Files: `plugins/logistics/src/pages/MethodsPage.tsx`, `plugins/logistics/src/main.tsx`.
   - Verify: `npx tsc -b --noEmit` passes; `npm run dev -- --port 3010` serves; after `PUT`-registering the manifest, clicking the *Logistics* sidebar item lets you add, rename, and delete a method, and the list survives a page reload.

5. **Implement `ProductShippingTab`** — mirror `ProductBoxTab.tsx`. On mount: read `productId = sdk.thisPlugin.productId ?? ""`; in parallel `objects.list("method")` and `thisPlugin.getData(productId)` inside a single `try/catch` that treats any error/`null` as empty payload; normalize via `toProductShippingData`; build `enabledMap: Record<string, boolean>` where a method is enabled iff its id is *not* in `disabledMethods`. Render a checkbox per method; `Save` computes `disabledMethods = methods.filter(m => !enabledMap[m.objectId]).map(m => m.objectId)` and calls `setData`. Empty methods list → short empty-state message. Wire route `/product` in `main.tsx`.
   - Files: `plugins/logistics/src/pages/ProductShippingTab.tsx`, `plugins/logistics/src/main.tsx`.
   - Verify: with at least one method defined, open a product's *Shipping* tab in the host — all checkboxes are initially on; un-ticking one and clicking *Save* persists; reopening the tab shows the same un-ticked state; after `thisPlugin.removeData(productId)` all checkboxes return to on.

6. **Register the manifest with the host** — once the plugin dev server is up, run the `PUT` call from `design.md` > Integration changes.
   - Files: _none — runtime step._
   - Verify: `curl -s http://localhost:8080/api/plugins/logistics/manifest | jq .name` prints `"Logistics"`; the sidebar shows a *Logistics* item with the `truck` icon; the product detail view shows a *Shipping* tab.

## Test plan

_N/A — repo has no plugin-side test harness (neither warehouse nor box-size ship tests); adding one is out of scope._

**Manual verification**
- *Add*: type `Courier`, click *Add* — appears in the table; reload → still there.
- *Add (empty)*: click *Add* with an empty or whitespace name — nothing happens, no error thrown.
- *Rename*: click *Edit* on a method; type a new name; click *Save* — row reflects the new name; only one row enters edit mode at a time (clicking *Edit* on another row either is blocked or resets the first).
- *Rename (empty)*: with the input trimmed empty, *Save* button is disabled.
- *Rename (cancel)*: click *Edit*, change text, click *Cancel* — row reverts and exits edit mode.
- *Delete*: click *Delete* — row disappears; reload confirms persistence.
- *Product tab, no data*: open a product's *Shipping* tab with methods defined and no prior `setData` — every checkbox is on.
- *Product tab, persisted opt-out*: uncheck one method, *Save*, close and reopen the tab — same method stays unchecked.
- *Product tab, no methods*: with zero methods defined, the tab renders the empty-state message and no *Save* button-action failure.
- *Orphan id after delete*: un-tick method M on product P, save, then delete method M on `MethodsPage`; reopen product P's tab — tab loads cleanly (the orphan id in `disabledMethods` is silently ignored because it is no longer in `methods`).

## Verification checklist

- [ ] `npx tsc -b --noEmit` from `plugins/logistics/` passes with no errors and no new warnings.
- [ ] `npm run build` succeeds in `plugins/logistics/`.
- [ ] Manifest `PUT` returns 200 and `GET .../manifest` echoes back the two extension points.
- [ ] All *Manual verification* scenarios above succeed end-to-end in the running host.
- [ ] No edits landed outside `plugins/logistics/` (confirm with `git status`).
- [ ] `design.md` > Assumptions to verify: none outstanding — nothing to confirm.

## Risks surfaced during planning

- **Risk:** `sdk.ts` exposes `thisPlugin.objects.save(type, id, data, options?)` where the optional `options` clears any entity binding when omitted. The design intentionally does *not* pass `entityType`/`entityId` for `"method"` objects, which is correct — but if a reader copies the warehouse call verbatim they will accidentally bind every method to a product.
  **Why it matters:** entity-bound methods would not be returned by plain `objects.list("method")` without the same filter, silently breaking the `MethodsPage` list.
  **Mitigation:** in step 4, explicitly pass only three arguments to `objects.save("method", ...)` and call that out in the code — the mirrored `WarehousePage.handleAddWarehouse` already does this correctly, so the instruction is "mirror the warehouse pattern, not the stock pattern".

- **Risk:** `ProductShippingTab` loading path uses `Promise.all` over `objects.list` + `getData`, and the design says a single `try/catch` should treat any failure as "no data". Wrapping both in one `try/catch` means a methods-list failure also degrades silently to "no methods", which is not what the design intends (it means "no shipping overrides yet").
  **Why it matters:** a genuine SDK/network fault on `objects.list` would hide behind an empty-state UI instead of surfacing an error.
  **Mitigation:** in step 5, scope the permissive `try/catch` to the `getData` call only (mirroring `ProductBoxTab`'s `try { getData } catch {}`), and let `objects.list` errors bubble into the page-level `error` state the same way `MethodsPage` handles them.
