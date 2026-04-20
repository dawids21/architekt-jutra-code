# Logistics plugin

**Date:** 2026-04-20
**Type:** feature
**Status:** brainstorming

## Summary

A new iframe plugin for the aj microkernel platform that lets admins manage a global list of couriers/delivery methods and opt specific products out of individual methods. Runs standalone on port 3010.

## Context

The aj platform already has a plugin system with working references (`plugins/warehouse`, `plugins/box-size`). Logistics is the next plugin. It introduces the concept of delivery methods into the system so that future core work (orders, checkout) has a data source to read from.

For now no part of the core consumes this data — the plugin is being built ahead of the consumer so the admin UX exists when the consumer lands. There is no auth layer yet; any admin using the host can manage methods.

Port 3010 is chosen intentionally to leave room for other modules being deployed later without port collisions.

## Requirements

**Global method management (`menu.main` sidebar screen, path `/`):**
- Admin can view a list of all delivery methods currently defined.
- Admin can add a new method by entering a single `name` field (e.g. "DHL", "DPD", "InPost").
- Admin can remove an existing method.
- Courier and delivery method are conflated for now — one entry = one name.
- Stored as plugin objects: `thisPlugin.objects.save("method", <id>, { name })`.

**Per-product method restriction (`product.detail.tabs` tab, path `/product`):**
- Tab shows all globally defined methods as checkboxes.
- Each checkbox reflects the enabled/disabled state for the current product.
- Default state when a product has no plugin data: every method is enabled.
- Admin toggles checkboxes and saves — disabled methods are persisted.
- Stored as plugin data on the product: `thisPlugin.setData(productId, { disabledMethods: [methodId, ...] })`. Absence from the list = available (opt-out semantics).

**Deployment:**
- Plugin dev server runs on `http://localhost:3010`.
- Manifest registered against the host at `PUT /api/plugins/logistics/manifest`.

## Anti-requirements

- No shipping rate or price calculation.
- No carrier API integration (no DHL/DPD/InPost API calls).
- No label generation, tracking, or shipment lifecycle.
- No separate "courier" entity distinct from "method" — one flat list.
- No per-tenant scoping and no auth integration.
- No read-side API, filter, or badge exposed to other parts of the system. The core will consume this data later; the plugin does not need to accommodate that consumer yet.
- No handling of in-flight orders or carts when methods are changed — core will handle that when it becomes a consumer.

## Constraints & assumptions

- Standalone React + Vite plugin, loaded into the host via iframe using the shared SDK (`plugins/sdk.ts`).
- Follows the `plugins/warehouse` template: `index.html`, `manifest.json`, `src/main.tsx` with routes, `src/domain.ts` for types/mappers, `src/pages/` for each extension point.
- Uses the host's shared stylesheet (`plugin-ui.css`) via `tc-*` classes. No inline styling beyond layout concerns.
- Product entity lives in core. The plugin reads product information via `hostApp.getProducts()` / `hostApp.getProduct(productId)` and does not own product data.
- Assumes the host's existing SDK endpoints (`thisPlugin.objects.*`, `thisPlugin.getData/setData`) are sufficient — no new host-side features needed.
- Assumes the host is running at `http://localhost:8080` during development (for SDK script and `plugin-ui.css`).

## Acceptance criteria

- [ ] Plugin dev server runs on port 3010 and renders inside the host iframe.
- [ ] Manifest registered with `pluginId = logistics`, declaring `menu.main` (path `/`) and `product.detail.tabs` (path `/product`).
- [ ] Sidebar "Logistics" screen lists all methods and supports adding a method by name and removing an existing method.
- [ ] Newly added methods persist across reloads.
- [ ] Product detail "Shipping" tab shows one checkbox per globally defined method.
- [ ] For a product with no prior plugin data, all checkboxes render as enabled.
- [ ] Unchecking a method and saving persists the disabled state for that product only; other products are unaffected.
- [ ] Reloading the product tab reflects the persisted disabled state.
- [ ] Demo flow works end to end: add "DHL", "DPD", "InPost" globally → on product X uncheck DHL → reload product X shows DHL still unchecked, product Y shows all three enabled.

## Edge cases

- **Empty global method list**: product tab shows an empty state (no checkboxes, short message).
- **Product has no plugin data yet**: treat as "all methods enabled" — do not write to the product until the admin explicitly saves.
- **Orphan method IDs**: if a global method is deleted while some product still lists its ID in `disabledMethods`, the ID becomes a stale orphan. Out of scope for this task; documented as known residue since nothing currently consumes the data.
- **Duplicate method names**: not prevented. Names are display-only; uniqueness is by object ID.

## Integration points

- New directory: `plugins/logistics/` (copied from `plugins/warehouse/` as the starting template).
- `plugins/logistics/manifest.json` — declares the two extension points and the `http://localhost:3010` URL.
- `plugins/logistics/src/main.tsx` — router with `/` and `/product` routes.
- `plugins/logistics/src/pages/MethodsPage.tsx` — sidebar screen (list + add + remove).
- `plugins/logistics/src/pages/ProductShippingTab.tsx` — product detail tab (checkbox grid).
- `plugins/logistics/src/domain.ts` — `DeliveryMethod` type and mapper from `PluginObject`.
- Host registration: one-time `curl PUT /api/plugins/logistics/manifest` against the running host.
- No changes to the host codebase or to other plugins.

## Open questions

- Should deleting a global method also strip that method's ID from every product's `disabledMethods` list? Currently out of scope (no consumer yet), but worth revisiting when core starts reading this data.
