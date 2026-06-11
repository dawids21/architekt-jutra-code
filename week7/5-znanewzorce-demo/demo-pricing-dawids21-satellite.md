# Demo: Pricing Archetype Mapper on Satellite-Launch Requirements

## Input Requirements (prompt)

> We are a rocket launching company that helps customers deploy their satellites into space. To pay for their rides, customers use a credit-based system. Credit costs are calculated based on a satellite's size, weight, and other environmental factors. The baseline fee is 10 credits per satellite for those weighing 500 grams or less. Every additional 100 grams incurs a fee of 2 credits. Customers can also purchase an Explorer Pass, which grants them 50 credits per week to use toward standard-sized satellites. If a satellite is non-standard in size, its credit price doubles. Furthermore, if a satellite does not meet standard safety regulations—such as containing uranium, utilizing pyrotechnics, or generating high levels of electromagnetic interference—a flat fee of 30 credits applies per satellite. This safety penalty is waived only if the customer has a University Agreement confirming the satellite is strictly for scientific research.

---

## Fit Test

Question: *"Can I ask 'what is the credit cost of launching this satellite, given its weight, size, and safety status?' and get a number produced by a rule that I must be able to explain?"*

**Yes.** Answer: e.g. 54 credits, broken into base+weight (12) + size doubling (+12) + safety penalty (+30), with each slice traceable to a rule.

| Signal | Present? |
|--------|----------|
| price/charge depends on quantity (weight), context (size, safety) | Yes — weight tiers, non-standard size, safety status |
| surcharge / penalty / fee | Yes — +2 per 100g, ×2 non-standard, flat 30-credit safety penalty |
| break the charge into components | Yes — base+weight / size doubling / safety penalty |
| applies only under a condition (waiver) | Yes — safety penalty waived with University Agreement |
| recompute past at the rate that applied then | Yes — confirmed time-varying with historical recomputation |
| track a running balance | The **Explorer Pass** does — flagged as accounting, out of pricing scope |

**Result: fits.** The Explorer Pass wallet is carved off to accounting. We continue.

## Domain Value

**SATELLITE_LAUNCH_COST** — the credit cost to launch one satellite. Unit: **credits**, modelled as `Quantity` (value + unit `"credits"`). The value is multi-dimensional (weight × size × safety status), so the business interpretation is **total**; no unit/marginal perspective exists ("cost per gram-of-non-standard-uranium" is meaningless).

---

## Clarifying Questions — round 1 (standard decisions)

### Question: Does the credit pricing change over time, requiring past launches to recompute at the rates that applied then?

> **Answer: Time-varying, recompute past.** Rates change over time and a past launch must recompute at its historical rates. Full versioning by timestamp.

### Question: Does the business need an explainable per-satellite breakdown, or just the final number?

> **Answer: It depends.** Display need varies by consumer.
>
> → Treated as a **policy**: the engine always produces the full breakdown internally; consumers choose to display the total or the slices. The model emits the slice tree; display is decided above the engine.

### Question: Which interpretation does the business need — total, unit, or marginal?

> **Answer: Total only.** The value is multi-dimensional, so unit/marginal are omitted.

---

## Clarifying Questions — round 2 (from gaps)

### Question: The Explorer Pass "grants 50 credits per week" — is that a wallet/balance (accounting) or part of pricing?

> **Answer: Out of pricing scope (accounting).** Pricing computes the per-satellite cost; a separate wallet/ledger holds the 50-credit weekly allowance, its refill, expiry, and "standard-sized only" eligibility, and deducts the computed cost. Pricing stays pure.

### Question: Is the 30-credit safety penalty also doubled for a non-standard satellite, or flat after the size multiplier?

> **Answer: Flat, never doubled.** The ×2 multiplier applies only to base+weight; the safety penalty is added afterward at face value. `cost = (base+weight)×sizeMult + 30`.

### Question: At a weight bracket edge, is the per-100g fee per-started-100g (`ceil`) or per-completed-100g (`floor`)?

> **Answer: `ceil` (per-started-100g).** A 501–600g satellite incurs one full +2 step; 601–700g incurs two.

---

## Result Model

# Pricing Archetype Model: Satellite Launch Cost

## Domain Value

**SATELLITE_LAUNCH_COST** — credits, canonical unit, modelled as `Quantity`. The credit cost to launch one satellite. Interpretation: **total** (multi-dimensional value). The engine always produces a full component breakdown; display is an external policy.

## Concept Mapping

| Domain Concept | Pricing Archetype | Notes |
|----------------|-------------------|-------|
| Baseline 10 credits ≤ 500g, +2 per extra 100g | `StepFunction` calculator over weight | base=10, step=2, stepWidth=100, freeThreshold=500 |
| Weight of satellite | Calculate-param (drives the step) | per-started-100g via `ceil` |
| Standard vs non-standard size | Applicability switch | chooses whether the ×2 adjustment applies |
| "Price doubles" for non-standard | `SizeAdjustment` component → `Percentage(100%)` | dependency: base ← BaseWeightCharge |
| Flat 30-credit safety penalty | `SafetyPenalty` component → `SimpleFixed(30)` | flat, never doubled |
| Uranium / pyrotechnics / EMI = unsafe | Applicability input `isUnsafe` | OR-of-hazards, computed above the engine |
| University Agreement waives penalty | Applicability condition (negation) | penalty applies iff `isUnsafe AND NOT universityAgreement` |
| Total credits per satellite | `LaunchCost` (CompositeComponent) | aggregates the three slices |
| Rates change over time, recompute past | `Validity` + `ComponentVersion` + calculate-by-timestamp | time selects version |
| Explorer Pass (50 credits/week) | **External — accounting wallet** | hand-off; pricing computes, ledger deducts |

## Unmapped Concepts

- **Explorer Pass weekly allowance** — an accounting balance (wallet held by the customer, drawn down, refilled weekly, expires). Pricing computes the cost; accounting deducts it. Not a value computed from parameters.
- **"Standard-sized satellites" qualifier on the Explorer Pass** — wallet eligibility rule, belongs to accounting, not pricing.

## Calculators

| Calculator | Type | Function / Formula | Create params | Calculate params | Interpretation |
|------------|------|--------------------|---------------|------------------|----------------|
| base_weight | `StepFunction` | `10 + 2 · max(0, ceil((weight − 500)/100))` | base=10, step=2, stepWidth=100, freeThreshold=500 | weight | total |
| size_double | `Percentage` | `baseAmount · 1.00` (adds 100% of base) | rate=1.00 | baseAmount | total |
| safety_flat | `SimpleFixed` | `30` | amount=30 | — | total |

Every calculator returns exactly one credit value; none returns a breakdown map. `Percentage` is generic math — the component gives "rate=1.00" the meaning "non-standard size doubling."

## Ranges & Composite Functions

None required. The weight rule is a single `StepFunction` (not piecewise across different sub-calculators). Size and safety are **applicability conditions** (the *whether*), not math segments (the *how*) — see Applicability Rules.

## Components

| Component | Kind | Calculator | Param Mappings | Dependencies | Interpretation | Business Meaning |
|-----------|------|-----------|----------------|--------------|----------------|------------------|
| BaseWeightCharge | Simple | base_weight (versioned) | satellite.weight → weight | — | total | Base + per-100g weight fee |
| SizeAdjustment | Simple | size_double | — | baseAmount ← result(BaseWeightCharge) | total | Extra charge from non-standard size (doubling) |
| SafetyPenalty | Simple | safety_flat (versioned) | — | — | total | Flat penalty for unsafe satellites |
| LaunchCost | Composite | — | — | — | total | Total credits the customer is charged |

```
LaunchCost (Composite)
├── BaseWeightCharge (Simple → base_weight, versioned)
├── SizeAdjustment   (Simple → size_double;  baseAmount ← BaseWeightCharge;  applies iff non-standard)
└── SafetyPenalty    (Simple → safety_flat;  applies iff unsafe AND NOT universityAgreement)
```

`BaseWeightCharge + SizeAdjustment` together equal "(base+weight) ×2 when non-standard" — adding 100% of the base to the base *is* doubling. Modelling the multiplier as a dependent component (rather than ×2 inside the weight calculator) keeps the weight math reusable and makes the doubling a visible, auditable line.

## Validity & Versioning

| Component | Version | Valid From | Valid To | Defined At | What Changed |
|-----------|---------|-----------|---------|-----------|--------------|
| BaseWeightCharge | v1 | −∞ | +∞ | (genesis) | base=10, step=2/100g, freeThreshold=500g |
| SizeAdjustment | v1 | −∞ | +∞ | (genesis) | doubling = +100% of base |
| SafetyPenalty | v1 | −∞ | +∞ | (genesis) | flat 30 credits |

All components start with a single open-ended version. A future rate change (e.g. base fee → 12 from 2027-01-01) is appended as v2 `[2027-01-01, +∞)` and v1 closed to `[−∞, 2027-01-01)` — never overwritten. A launch dated before the cutover selects v1; the past recomputes exactly.

**Version update strategy:** `no-overlap` — no two versions of the same component may cover the same instant.

## Applicability Rules

| Component (version) | Condition (whether to apply) | Source |
|---------------------|------------------------------|--------|
| BaseWeightCharge | always | (R) |
| SizeAdjustment | `satellite.size = non-standard` | (R) |
| SafetyPenalty | `satellite.isUnsafe = true AND customer.universityAgreement = false` | (R) |

`isUnsafe` is true when the satellite contains uranium, uses pyrotechnics, **or** generates high EMI. The OR-of-hazards is computed above the engine and passed in as a boolean — the model only needs the resulting flag, not the hazard list.

## Worked Breakdown Example

**Satellite:** weight 600g, **non-standard** size, contains uranium (`isUnsafe = true`), **no** University Agreement. Launch date 2026-06-12 → all components select **v1**.

- BaseWeightCharge: 600g > 500g → `10 + 2 · ceil((600−500)/100)` = `10 + 2·1` = **12 credits**
- SizeAdjustment: applies (non-standard) → `12 · 1.00` = **+12 credits**
- SafetyPenalty: applies (unsafe AND no agreement) → **+30 credits**
- **LaunchCost = 12 + 12 + 30 = 54 credits** ✓ (matches `(10+2)×2 + 30 = 54`)

Variants of the same satellite:
- **With a University Agreement:** SafetyPenalty not applicable → 12 + 12 = **24 credits**
- **Standard size, safe:** only BaseWeightCharge → **12 credits**
- **550g, standard, safe:** `10 + 2·ceil(50/100)` = `10 + 2` = **12 credits** (per-started-100g)

Accounting (out of pricing scope) then deducts the computed cost from the customer's Explorer Pass wallet, if held.

## Implementation Notes

- **Explorer Pass = accounting hand-off, not pricing.** Pricing computes the per-satellite cost; a separate wallet/ledger holds the 50-credit weekly allowance, refill, expiry, and "standard-sized only" eligibility, and deducts the cost. (A) — confirmed as out of pricing scope.
- **Safety penalty is flat, applied after the size multiplier — never doubled.** `(base+weight)×sizeMult + 30`. (A) — resolves the "price doubles" vs "flat fee per satellite" ambiguity.
- **Size doubling modelled as a dependent component** (`Percentage(100%)` on BaseWeightCharge), not ×2 baked into the weight calculator. Keeps the weight math pure/reusable and makes the doubling an explicit, auditable line. (X — modelling choice; mathematically identical, low impact.)
- **Full versioning by timestamp**, even though only one ruleset exists today — because past launches must recompute at historical rates. Each component selects its version via the launch `timestamp`; no `if`-on-date logic. (A)
- **Weight rounding = `ceil` (per-started-100g).** A satellite 501–600g incurs one full +2 step; 601–700g incurs two. (A) — confirmed.
- **Interpretation = total only.** Value is multi-dimensional; unit/marginal omitted. (R)
- **Breakdown always produced internally; display is a consumer policy.** The "it depends" answer is treated as policy — the engine emits the slice tree, consumers choose total vs. breakdown. (A)
- **`isUnsafe` and `universityAgreement` are passed-in booleans.** Hazard evaluation (uranium OR pyrotechnics OR high EMI) and agreement verification live above pricing; only the resulting flags enter the model. (R)
- **No caps / floors / free tier** beyond the 500g baseline-included allowance; no minimum or maximum charge stated. (R — none described)
- **Single unit: credits, no conversion; one ruleset** (no competing VIP/promo price lists). (R)
- **Version update strategy = no-overlap.** (X — default, low impact.)
- **Orchestration boundary:** pricing computes cost per satellite; a launch/booking or billing layer calls it (passing weight, size, isUnsafe, universityAgreement, timestamp) and orchestrates the accounting wallet deduction. Pricing knows nothing of orders, wallets, or weekly cycles. (X — architectural default.)
