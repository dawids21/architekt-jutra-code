# Logistics plugin — Design

**Date:** 2026-04-20
**Status:** final
**ADRs:** None

## Overview

A new standalone React + Vite plugin at `plugins/logistics/` serving on port 3010, structurally a clone of `plugins/warehouse/`. Delivery methods are persisted as plugin objects of type `"method"` via `thisPlugin.objects`; per-product opt-out is persisted as plugin data `{ disabledMethods: string[] }` via `thisPlugin.setData`. Two pages back the two manifest extension points — a sidebar list manager (add, rename, delete) and a product-detail checkbox grid.

## Required reading for implementation

- `plugins/CLAUDE.md` — plugin file layout, manifest rules, SDK surface (`thisPlugin.objects.*`, `thisPlugin.getData/setData`), UI classes (`tc-*`), and the register-via-`PUT`-manifest workflow.
- `plugins/warehouse/` — the template this plugin copies from; implementations of `menu.main` CRUD (`WarehousePage.tsx`) and `product.detail.tabs` (`ProductStockTab.tsx`) are the closest analogues.
- `plugins/box-size/` — the reference for the `thisPlugin.getData/setData` pattern used on the product tab.
- `plugins/sdk.ts` — shared SDK types (`PluginSDKType`, `PluginObject`) imported by all plugins.

## Approach

Copy the `plugins/warehouse/` scaffold (`index.html`, `manifest.json`, `package.json`, `vite.config.ts`, `tsconfig.json`, `src/main.tsx`, `src/domain.ts`, `src/pages/`) into `plugins/logistics/`. Strip the warehouse-specific pages, the `product.list.filters` and `product.detail.info` extension points, and their routes. Add two pages matching the two remaining extension points.

Global methods use `thisPlugin.objects` (type `"method"`, data shape `{ name: string }`) — same storage pattern warehouse uses for warehouses. Per-product opt-out uses `thisPlugin.setData(productId, { disabledMethods })` — same storage pattern box-size uses for box dimensions. No entity binding is needed on method objects (they are not queried per-product via the objects API).

No host-side changes. No new SDK surface.

## Module & component boundaries

New directory `plugins/logistics/`, mirroring `plugins/warehouse/`:

- **`plugins/logistics/manifest.json`** — plugin identity + two extension points.
- **`plugins/logistics/package.json`** — name `logistics-plugin`, same deps/scripts as warehouse.
- **`plugins/logistics/vite.config.ts`** — `server.port = 3010`, `strictPort: true`.
- **`plugins/logistics/tsconfig.json`** — copy from warehouse unchanged.
- **`plugins/logistics/index.html`** — copy from warehouse, update `<title>`.
- **`plugins/logistics/src/main.tsx`** — `BrowserRouter` with `/` → `MethodsPage`, `/product` → `ProductShippingTab`.
- **`plugins/logistics/src/domain.ts`** — `DeliveryMethod` type, `toDeliveryMethod(PluginObject)` mapper, `ProductShippingData` type for the `getData` payload.
- **`plugins/logistics/src/pages/MethodsPage.tsx`** — sidebar screen: list, add-by-name form, inline rename per row, delete button per row. Manages `DeliveryMethod[]` state via `thisPlugin.objects.list/save/delete`.
- **`plugins/logistics/src/pages/ProductShippingTab.tsx`** — product detail tab: loads all methods + this product's `disabledMethods`, renders a checkbox grid, persists disabled set via `setData` on save.

No changes to `plugins/sdk.ts`, `plugins/warehouse/`, `plugins/box-size/`, or the host.

## Data model changes

_No database schema changes — all data flows through existing SDK endpoints._

**Plugin-owned storage shapes** (persisted via the SDK):

- Method object: stored via `thisPlugin.objects.save("method", <uuid>, { name })`.
  - `objectType`: `"method"`
  - `objectId`: `crypto.randomUUID()` at creation time
  - `data`: `{ name: string }`
  - No `entityType`/`entityId` binding.
- Product shipping data: stored via `thisPlugin.setData(productId, { disabledMethods })`.
  - `data`: `{ disabledMethods: string[] }` — array of method `objectId`s that are opted-out.
  - Absent key (`getData` returns `null`/empty) ⇒ all methods enabled (opt-out semantics).
  - Empty `disabledMethods` array ⇒ all methods enabled (explicit state after user unchecks nothing).

## Interface contracts

No new HTTP endpoints or service interfaces. Internal module surface:

```ts
// src/domain.ts
export interface DeliveryMethod {
  objectId: string;
  name: string;
}
export interface ProductShippingData {
  disabledMethods: string[];
}
export function toDeliveryMethod(obj: PluginObject): DeliveryMethod;
export function toProductShippingData(raw: Record<string, unknown> | null): ProductShippingData;
```

`toProductShippingData` normalizes absent/partial data to `{ disabledMethods: [] }` so callers never branch on null.

**Page components** take no props; they read `productId` / context from `getSDK().thisPlugin`:

```ts
export function MethodsPage(): JSX.Element;
export function ProductShippingTab(): JSX.Element;
```

**Manifest** (`plugins/logistics/manifest.json`):

```json
{
  "name": "Logistics",
  "version": "1.0.0",
  "url": "http://localhost:3010",
  "description": "Manage delivery methods and per-product shipping availability",
  "extensionPoints": [
    { "type": "menu.main", "label": "Logistics", "icon": "truck", "path": "/", "priority": 110 },
    { "type": "product.detail.tabs", "label": "Shipping", "path": "/product", "priority": 60 }
  ]
}
```

Registration is a one-time `PUT http://localhost:8080/api/plugins/logistics/manifest` against the host, as documented in `plugins/CLAUDE.md`.

## Flows & state

**Add method** (`MethodsPage`): user types name → click *Add* → `objects.save("method", uuid, { name })` → refresh via `objects.list("method")` → render updated list. Empty-name submissions are ignored (match warehouse).

**Rename method** (`MethodsPage`): click *Edit* on a row → the row's name cell becomes a `tc-input` bound to local editing state, with *Save*/*Cancel* buttons replacing *Edit*/*Delete*. *Save* calls `objects.save("method", objectId, { name })` (upsert — same `objectId` replaces the existing object) → refresh via `objects.list("method")` → exit edit mode. *Cancel* discards local state and exits edit mode. Empty trimmed name disables *Save*. Only one row may be in edit mode at a time; the page tracks `editingId: string | null`.

**Delete method** (`MethodsPage`): click *Delete* on a row → `objects.delete("method", objectId)` → refresh via `objects.list("method")`. No cascade into any product's `disabledMethods` — see *Resolved questions*.

**Load product tab** (`ProductShippingTab`):
1. Read `productId` from `thisPlugin.productId`.
2. In parallel: `objects.list("method")` → methods; `thisPlugin.getData(productId)` → raw plugin data. Wrap `getData` in a try/catch that treats any error or `null` result as "no data yet" (mirror the box-size plugin's defensive pattern).
3. Normalize raw data via `toProductShippingData`; derive `enabledMap: Record<methodId, boolean>` where `enabledMap[m.objectId] = !disabledMethods.includes(m.objectId)`.
4. Render a checkbox per method driven by `enabledMap`.
5. Empty methods list → render empty state (no checkboxes, short message).

**Save product tab**: compute `disabledMethods = methods.filter(m => !enabledMap[m.objectId]).map(m => m.objectId)` → `thisPlugin.setData(productId, { disabledMethods })` → show saved feedback.

State is fully component-local (`useState`). No global store, no cross-page state sharing.

## Integration changes

**`plugins/logistics/`** (new directory) — copy the warehouse scaffold verbatim, then delete warehouse-specific files and references.

**`plugins/logistics/manifest.json`** — declare `pluginId = logistics` implicitly (via registration path); two extension points (`menu.main` at `/`, `product.detail.tabs` at `/product`); `url = http://localhost:3010`. Drop warehouse's `product.list.filters` and `product.detail.info` entries.

**`plugins/logistics/vite.config.ts`** — change `server.port` from `3001` to `3010`.

**`plugins/logistics/package.json`** — rename to `logistics-plugin`; dependency versions match warehouse.

**`plugins/logistics/index.html`** — update `<title>` to *Logistics Plugin*; keep the SDK `<script>` and `plugin-ui.css` `<link>` pointing to `http://localhost:8080`.

**`plugins/logistics/src/main.tsx`** — two routes only: `/` → `MethodsPage`, `/product` → `ProductShippingTab`.

**`plugins/logistics/src/domain.ts`** — replace `Warehouse`/`StockEntry`/`Product` types and mappers with `DeliveryMethod`, `ProductShippingData`, and their mappers.

**`plugins/logistics/src/pages/MethodsPage.tsx`** — new page. Structural analogue of warehouse's `WarehousePage.tsx` *Warehouses* section (list + add-form + delete) but with a single `name` field, inline rename per row (via `tc-input` + *Save*/*Cancel*), and no secondary stock-management block.

**`plugins/logistics/src/pages/ProductShippingTab.tsx`** — new page. Structural analogue of `ProductStockTab.tsx` but editable: checkbox grid + *Save* button, backed by `getData`/`setData` rather than `objects`.

**Host registration** — run once after the first manifest is written: `curl -X PUT http://localhost:8080/api/plugins/logistics/manifest -H 'Content-Type: application/json' -d @plugins/logistics/manifest.json`. Re-run on any manifest change.

No edits to `plugins/sdk.ts`, `plugins/CLAUDE.md`, or any host code.

## Resolved questions

- **Q:** Should deleting a global method also strip that method's ID from every product's `disabledMethods` list?
  **A:** No — leave orphan IDs in place. Rationale: no consumer reads this data yet, so an orphan is harmless; retaining the ID preserves admin intent if the method is recreated with the same `objectId` (it won't be, since IDs are UUIDs, but the principle stands) and avoids fan-out writes over products. Revisit when the core order/checkout consumer is built — at that point, either the consumer filters unknown IDs at read-time, or we add a cleanup step here. Captured as known residue in the brainstorming's edge-case list.

## Assumptions to verify

_No outstanding assumptions._

## Out of scope (design-level)

- **Cleanup of orphan `disabledMethods` entries** — see *Resolved questions*. Deferred until the core consumer exists.
- **Entity-binding method objects to products** — the `thisPlugin.objects` API supports per-entity binding, but with opt-out semantics the product side already stores its own overrides via `setData`. Binding would complicate the model without benefit.
