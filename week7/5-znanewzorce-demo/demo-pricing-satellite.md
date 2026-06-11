# Demo: Pricing Archetype Mapper on Satellite-Launch Credit Requirements

## Input Requirements (prompt)

> We are a rocket launching company that helps customers deploy their satellites into space. To pay for their rides, customers use a credit-based system. Credit costs are calculated based on a satellite's size, weight, and other environmental factors. The baseline fee is 10 credits per satellite for those weighing 500 grams or less. Every additional 100 grams incurs a fee of 2 credits. Customers can also purchase an Explorer Pass, which grants them 50 credits per week to use toward standard-sized satellites. If a satellite is non-standard in size, its credit price doubles. Furthermore, if a satellite does not meet standard safety regulations—such as containing uranium, utilizing pyrotechnics, or generating high levels of electromagnetic interference—a flat fee of 30 credits applies per satellite. This safety penalty is waived only if the customer has a University Agreement confirming the satellite is strictly for scientific research.

---

## Fit Test

Question: *"Can I ask 'how many credits does launching satellite X cost for customer Y in context C?' and get a reproducible, auditable answer with full breakdown?"*

**Yes.** The answer is a computed value (e.g. 54 credits) with a clear component breakdown: baseline + weight surcharge + non-standard multiplier + safety penalty. Credits are the "Money" type here — non-monetary, but a computed value depending on context, which is exactly what the pricing archetype supports.

| Signal | Present? |
|--------|----------|
| price depends on quantity / parameters (weight, size) | Yes — weight steps, size multiplier |
| different prices for different segments / context | Yes — safety compliance, University Agreement |
| need to audit why this price was charged | Yes — component breakdown required |
| price has components (base + surcharge + penalty) | Yes — baseline, weight, ×2 uplift, safety fee |
| price changes and old transactions must stay reproducible | Yes — confirmed in clarifying questions |
| user earns / spends / transfers N units | Partial — the Explorer Pass is accounting, NOT pricing |

**Result: fits.** (The Explorer Pass is split off to an accounting ledger — see Unmapped Concepts.) Continuing.

## Pricing Domain

**What's priced:** the credit cost to launch a single satellite.
**Value type:** Credits — non-monetary computed value, treated as the `Money` type (currency = `CREDITS`).
**Detected complexity level: 7** — multi-component breakdown, context-dependent activation (size standard, safety compliance, University Agreement), and **historical reproducibility required** (confirmed: past launches re-price using rates active at launch time → `ComponentVersion` with `definedAt`). Not level 8/9: no independent algorithm versioning, no multiple concurrent tariffs needing eligibility selection.

---

## Clarifying Questions (standard + gap-triggered)

### Question: Does the "non-standard size doubles the price" multiplier apply to the safety penalty too, or only the weight-based base?

> **Answer: Only the weight-based base.** The ×2 applies to (baseline + weight). The 30-credit safety penalty is added afterward as a flat fee. Breakdown: `(base × 2) + 30`.

### Question: Must a credit charge be reproducible later using the rules in effect at launch time?

> **Answer: Yes — version by launch time.** Full temporal versioning with `definedAt`. `versionAt(launchTimestamp)` reproduces historical prices. This pushes the model to level 7.

### Question: How does the Explorer Pass (50 credits/week toward standard satellites) fit?

> **Answer: Spendable credit balance — outside the pricing engine.** The Pass is a weekly allowance the customer holds and spends against the computed price. That is an accounting ledger ("how many credits does the customer have?"), not pricing. The engine still computes the full price; the Pass settles it.

### Question: How is the per-satellite charge driven?

> **Answer: One call per satellite.** The engine prices a single satellite given its weight/size/safety/agreement context. Multi-satellite orders sum N calls in the application layer.

---

## Resulting Model

# Pricing Archetype Model: Satellite Launch Credits

## Concept Mapping

| Domain Concept | Pricing Archetype | Notes |
|----------------|-------------------|-------|
| Baseline fee 10 credits (≤500 g) | SimpleComponent + StepFunctionCalculator (base) | First step of the weight function |
| +2 credits per additional 100 g over 500 g | StepFunctionCalculator increment | `base=10, threshold=500g, step=100g, increment=2` |
| Non-standard size → price doubles | SimpleComponent (multiplier) on base only | Applicability: `size == NON_STANDARD`; scope = base only |
| Safety penalty 30 credits (uranium / pyrotechnics / high EMI) | SimpleComponent + SimpleFixedCalculator(30) | Applicability: `meets_safety == false` |
| Penalty waived with University Agreement | Applicability condition on safety component | `has_university_agreement == true` ⇒ not applicable |
| Per-satellite charge | One pricing call per satellite | Quantity handled in application layer |
| Rate changes over time | New ComponentVersion, `validFrom` | Reproducibility via `versionAt(launchTimestamp)` |
| Explorer Pass (50 credits/week) | **Accounting ledger — OUTSIDE engine** | Spendable balance; engine computes price, ledger settles |
| Standard size (for Pass eligibility) | Parameter `size` | Drives ×2 component; Pass spendability handled outside |

## Unmapped Concepts

- **Explorer Pass balance (50 credits/week):** an **accounting ledger**, not a pricing component. The natural question is *"how many credits does the customer have?"* — earn/spend semantics — which is the accounting archetype. The engine computes the full launch price; a separate balance/ledger layer settles it. Recommend `accounting-archetype-mapper`.
- **"Standard size" for Pass usage:** the Pass applies only to standard-sized satellites. That eligibility test lives in the settlement/ledger layer, not the pricing engine.

## Calculator Design

| Calculator ID | Type | Parameters | Interpretation | Notes |
|---------------|------|-----------|----------------|-------|
| `calc-weight-base` | StepFunctionCalculator | `base=10, freeThreshold=500g, step=100g, increment=2` | TOTAL | `f(w) = 10 + ⌈max(0, w−500)/100⌉ × 2` |
| `calc-nonstandard-multiplier` | SimpleFixedCalculator | `factor = 2` | TOTAL | Pure multiplier; applied via `ProductOf` against base |
| `calc-safety-penalty` | SimpleFixedCalculator | `amount = 30 credits` | TOTAL | Flat per-satellite penalty |

All calculators are pure math — no compliance checks, no agreement checks, no time checks. Those live in Applicability and Validity.

## Component Tree

```
satellite-launch-price (Composite, ROOT)
├── base-price (Composite)
│   ├── weight-base        (Simple) → calc-weight-base            [param: weight_g]
│   └── nonstandard-uplift (Simple) → calc-nonstandard-multiplier
│         Applicability: size == NON_STANDARD
│         ParameterValue: ProductOf(ValueOf(weight-base), 2) − ValueOf(weight-base)
└── safety-penalty         (Simple) → calc-safety-penalty
      Applicability: meets_safety == false AND has_university_agreement == false
```

| Component ID | Type | Calculator / Children | ParameterValue Dependencies | Notes |
|-------------|------|----------------------|---------------------------|-------|
| `satellite-launch-price` | Composite | [`base-price`, `safety-penalty`] | `SumOf(base-price, safety-penalty)` | Root; safety added after doubling |
| `base-price` | Composite | [`weight-base`, `nonstandard-uplift`] | `SumOf(weight-base, nonstandard-uplift)` | The "doubles" scope — base only |
| `weight-base` | Simple | `calc-weight-base` | — | param: `weight_g` |
| `nonstandard-uplift` | Simple | `calc-nonstandard-multiplier` | `ProductOf(ValueOf(weight-base), 2) − ValueOf(weight-base)` | Doubling shown as a line item |

> Design choice: doubling is modeled as an explicit **uplift line item** rather than mutating the base, so the breakdown shows *why* the price doubled.

## Validity Rules

| Component | VersionUpdateStrategy | validFrom (current) | validTo | Notes |
|-----------|----------------------|---------------------|---------|-------|
| `weight-base` | REJECT_OVERLAPPING | Business launch date | open-ended (end-of-time sentinel) | Rate/threshold change → new version |
| `nonstandard-uplift` | REJECT_OVERLAPPING | Business launch date | open-ended | If ×2 factor ever changes |
| `safety-penalty` | REJECT_OVERLAPPING | Business launch date | open-ended | 30-credit fee change → new version |

`REJECT_OVERLAPPING` chosen so exactly one version is active at any `launchTimestamp` — no ambiguity for historical re-pricing. Each `ComponentVersion` carries `definedAt`, satisfying level-7 reproducibility.

## Applicability Conditions

| Component | Condition Dimensions | Logic | Non-Applicable Behavior |
|-----------|---------------------|-------|------------------------|
| `nonstandard-uplift` | `size` | `size == NON_STANDARD` | `Money.zero()`, included in breakdown |
| `safety-penalty` | `meets_safety`, `has_university_agreement` | `meets_safety == false AND has_university_agreement == false` | `Money.zero()`, included in breakdown |

The waiver is pure boolean Applicability: a University Agreement makes the safety component **not applicable**, regardless of compliance status. No conditional math inside the calculator.

## Context Dimensions (Parameters)

| Parameter | Type | Mandatory | Purpose |
|-----------|------|-----------|---------|
| `timestamp` (launch time) | Instant | Yes | `versionAt()` — selects rate version active at launch |
| `weight_g` | BigDecimal | Yes | Input to `calc-weight-base` |
| `size` | Enum {STANDARD, NON_STANDARD} | Yes | Applicability of `nonstandard-uplift` |
| `meets_safety` | Boolean | Yes | Applicability of `safety-penalty` |
| `has_university_agreement` | Boolean | Yes | Waiver — applicability of `safety-penalty` |
| `currency` | Currency | No | Defaults to `CREDITS` |

## Product-Pricing Mapping

**Scenario: 1:1** — one launch service maps to one pricing component tree. Single credit tariff; no eligibility-selection layer.

| Product | Pricing Component Root | Notes |
|---------|----------------------|-------|
| `satellite-launch` | `satellite-launch-price` | Single tariff for all satellites |

## Interpretation

**TOTAL only.** The business question is "how many credits to launch this satellite?" UNIT (credits per gram) and MARGINAL (cost of the next 100 g) are not required; no adapters needed.

## Implementation Notes

- **Level 7 justification:** historical reproducibility confirmed → `ComponentVersion` + `definedAt` mandatory; `versionAt(launchTimestamp)` is the audit log (history is a model outcome, not a separate log).
- **Doubling scope (A):** ×2 applies to the weight-based base only; safety penalty added after as a flat 30 — modeled by `SumOf(doubled-base, safety-penalty)`.
- **Weight-step boundary (X, low impact — flag):** "every additional 100 g incurs 2 credits" modeled as `⌈(w−500)/100⌉` — a partial 100 g block charges the full 2 credits (501 g ⇒ 12). If only completed blocks should charge, switch to floor. Default chosen: ceiling.
- **Worked example (501 g, ceiling):** base = 10 + ⌈1/100⌉×2 = 12. Non-standard ⇒ uplift +12 ⇒ 24. Non-compliant, no agreement ⇒ +30 ⇒ **54 credits**.
- **Explorer Pass out of scope (A):** spendable weekly credit balance → accounting ledger. Engine returns the full price; settlement against the Pass happens in a separate ledger/application layer.
- **Per-satellite (A):** engine prices one satellite per call; multi-satellite orders summed in the application layer.
- **Append-only versions:** historical `ComponentVersion`s are never deleted or edited.
- **Currency = CREDITS:** single "currency"; no conversion.

### Legend
- **(R)** stated in requirements · **(A)** asked and answered · **(X)** silent assumption
