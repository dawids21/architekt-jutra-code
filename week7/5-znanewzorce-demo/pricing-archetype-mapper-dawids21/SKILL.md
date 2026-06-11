---
name: pricing-archetype-mapper-dawids21
description: Transform domain requirements into a pricing/valuation model. Identifies calculators (pure math functions), ranges, interpretations (total/unit/marginal), pricing components, parameter dependencies, validity/versioning, and applicability rules for any value-calculation system.
argument-hint: "[domain requirements or feature description]"
---

# Pricing Archetype Mapper

Transform any domain description that involves **calculating a value by rules** into a pricing-style model. The value does not need to be money — it can be loyalty points, granted gigabytes, interest, a commission, a penalty, a customer rating, or any other value computed from parameters.

The pricing archetype is really a **valuation archetype**: *price is not a number, it is a function*. A function, in turn, is not its meaning. So the model keeps two layers strictly separate:

- **Calculators** — pure math. `calculate(params) → value`. They know nothing about business meaning, like `sin(x)`.
- **Components** — business semantics. They name a slice of value ("VAT", "operator margin", "energy charge"), bind it to a calculator, and compose into a breakdown tree.

Time is a first-class dimension: components are versioned so any value can be recomputed exactly as it was at any point on the timeline.

**Output goal**: A complete, implementable model that gives the system a single source of truth for value, explainable breakdowns, auditable history, and the ability to recompute the past.

## When to Use

**Use this skill when:**
- A value is **computed from parameters** by a rule or formula (not just stored)
- The rule changes over **time** (promotions, seasonal rates, tariff changes) and the past must still be recomputable
- The value depends on **context** (segment, channel, quantity, location, time of day)
- One paid amount must be **broken down into components** (net, VAT, margins, fees) or split among stakeholders
- The result must be **explainable and auditable** ("why did this customer pay 142.70?")

**Output is useful for:**
- Domain modeling sessions before implementation

## When NOT to Use — Fit Test

Before starting the mapping, apply this test. If the domain fails it, **stop and tell the user** that the pricing archetype does not fit, and briefly explain why.

### The core question

> *"Can I ask 'what is the value of X, given these parameters and this point in time?' and get a number produced by a rule that may vary by time or context — a number I must be able to explain?"*

If **yes** → pricing archetype likely fits.
If the natural question is **"how much X does subject S have right now?"** (a balance with a transaction history) → that is the **accounting** archetype, not pricing. Pricing computes value; accounting records it.
If the natural question is **"what state is X in?"** → it's a state machine. Do not map.

### Signal table

| Signal in requirements | Likely archetype fit? |
|------------------------|-----------------------|
| "price/charge depends on time, segment, quantity, channel…" | ✅ Yes |
| "discount / surcharge / tariff / rate / fee / commission" | ✅ Yes |
| "calculate interest / VAT / penalty / loyalty points / granted GB" | ✅ Yes |
| "break the charge into components / who gets which slice of the cake" | ✅ Yes |
| "new price applies from date X / promo period / seasonal pricing" | ✅ Yes |
| "recompute last month's sessions at the rates that applied then" | ✅ Yes |
| "record that the user spent N / track a running balance" | ❌ No — accounting (ledger) |
| "where do we book this revenue / which account" | ❌ No — accounting |
| "order moves from placed → shipped → delivered" | ❌ No — state machine |
| "single fixed value, never changes, no breakdown ever needed" | ⚠️ Borderline — may just be a stored field |

### Borderline cases — how to decide

- **A single constant price that never changes and needs no breakdown**: This is the simplest possible model — a `SimpleFixed` calculator, or honestly just a field on the product. Apply the test: *will it ever vary by time/context, or need a component breakdown / audit trail?* If no to all, tell the user the full archetype is overkill and a stored field is the right, deliberate simplicity. If yes to any, it fits.
- **Tracking a balance vs. computing a value**: "User has 7 GB left" is accounting. "User's overage is charged at 4 zł/GB" is pricing. Many domains have **both** — pricing computes the rate/charge, accounting records consumption. If you see both, **do not silently carve off the non-pricing part.** Surface it as a clarifying question in Step 2 (e.g. *"The weekly allowance / prepaid balance / wallet looks like accounting — a balance the customer holds and draws down — rather than pricing, which computes a value from parameters. Should it be modeled outside the pricing engine as an accounting hand-off?"*), then map per the answer. The concept being in the requirements and looking pricing-adjacent (denominated in the same unit) is exactly why it deserves a question, not an assumption.
- **Recording where money goes**: Splitting a paid amount into VAT/margins for the *calculation* is pricing (component breakdown). Posting those slices to ledger accounts is accounting. The boundary: pricing knows *where the value came from*; accounting knows *where to record it*.

### If the domain does not fit

Output:

```
## Archetype Fit Assessment: ❌ Does Not Fit

The pricing archetype requires a value that is COMPUTED from parameters by a rule that may
vary by time or context, and that must be explainable. This domain is a [accounting ledger /
state machine / graph / workflow / ...] because:

- [specific reason from the requirements]
- The natural question is "[how much does S have / what state is X in]?" not
  "what is the value of X given these parameters?"
```

Do NOT suggest alternative patterns or architectures. Stop here.

---

## Mapping Workflow

### Step 0: Get Requirements

- If provided as argument, use it directly
- If not provided, scan the recent conversation for domain context. If found, use that.
- Only if no argument AND no context in session, ask:
  > "Describe the domain — what value is being calculated, and what makes it vary (time, quantity, segment, channel)?"

---

### Step 1: Identify the Value Being Calculated

Detect what is being **computed** in the domain — the output of the pricing function.

**Detection signals:**
- Nouns that are *calculated*, not just stored: a charge, a rate, a fee, a discount, interest, points, granted units
- A number that depends on inputs (quantity, time, customer attributes)
- A number someone must later be able to justify

**Examples:** money (price, fee, commission), loyalty points, granted data (GB), interest, penalty amount, customer rating/score, discount percentage.

**Key question to answer:** *What value is produced, and what is its unit?*

**Output:** Named domain value (e.g., `CHARGING_SESSION_PRICE`, `OVERAGE_CHARGE`, `LOYALTY_POINTS_EARNED`) with its unit of measure.

**Money is a special case of Quantity.** If the value is money, model it as `Money` (amount + currency + arithmetic/rounding rules). If it is anything else (GB, points, hours), model it as `Quantity` (value + unit). Either way, the *structure of the model is identical* — only the semantics change. Note the canonical unit here; if multiple units/currencies exist, document conversion rules.

---

### Step 2: Ask Clarifying Questions

Before continuing, identify gaps between the requirements and pricing archetype capabilities. Ask about **two categories** of questions in a single `AskUserQuestion` call (up to 4 questions per call; split into multiple calls if more needed):

#### Category A — Standard pricing decisions

Ask only about those **not clearly addressed** in the requirements. Frame questions as **design choices**, not assumed defaults — the answer may be "yes for some cases, no for others":

- **Interpretation**: Which perspective does the business need — **total** (final amount for the whole volume), **unit** (average per unit), or **marginal** (cost of the n-th unit)? Or several at once? (Most billing systems need total; marketing/upsell often wants unit or marginal.)
- **Time-variability & history**: Does the value change over time (promotions, tariff changes)? Must past events be recomputed at the rate that applied **then**, or always at the current rate?
- **Breakdown**: Does the client, partner, or regulator need a **component breakdown** (which part is VAT, margin, energy, fee)? Or is a single number enough?
- **Rounding & precision**: What rounding rules and scale apply, and at which step?

#### Category B — Gap-triggered questions

Scan the requirements for **anything the pricing archetype supports but the requirements do not mention**. For each gap found, ask whether that dimension is wanted. Do not limit yourself to the list above — reason freely. Examples of gaps to look for:

- **Multiple valid price lists**: If several price lists can apply at once (standard, VIP, promo, mobile, partner) — which one wins, and what is being optimized (customer price, company margin, business rule)?
- **Applicability conditions**: Should some components apply only under conditions (segment = VIP, channel = mobile, quantity > threshold, time = night)? This is *whether* we calculate, separate from *how*.
- **Stakeholder split**: Is one paid amount divided among multiple parties (energy supplier, station operator, app operator, roaming partner, VAT)? Each slice is then a component.
- **Parameter dependencies**: Does one component depend on others (e.g., VAT computed on the *sum* of net components)?
- **Caps / floors**: Minimum charge, maximum charge, max discount, free tier (first N units free)?
- **Currency / unit**: One currency/unit or several? Interchangeable?

Collect answers before proceeding. If the user cannot answer, document the assumption made in **Implementation Notes**.

#### Handling "it depends / both / varies by situation" answers

Always include **"To zależy / It depends"** as an explicit option in every `AskUserQuestion` call — do not rely on the automatic "Other" fallback. Place it as the last option in each question. If the user selects it, treat the answer as a **policy**:

- Document the *policy* the model will accept (e.g., the rounding mode, the currency, the version update strategy) as an explicit configuration knob.
- Note in **Implementation Notes** that its value is computed externally by a policy/business-rules layer and passed in at transaction time
- Do **not** attempt to model the decision logic inside the pricing archetype

This is the correct outcome — variability means the rule lives above the calculator
or component, not inside it.

---

### Step 3: Map Domain Concepts to Pricing Archetypes

For each significant noun and verb in the requirements, produce an explicit mapping table:

```
| Domain Concept       | Pricing Archetype | Notes                          |
|----------------------|-------------------|--------------------------------|
| [domain noun/verb]   | Calculator / Range / Interpretation / Component (Simple/Composite) / Parameter Dependency / Validity / Version / Applicability Rule | [why] |
```

After the table, list any domain concepts that **could not be mapped**:

```
## Unmapped Concepts

The following domain concepts have no clear pricing archetype equivalent:
- [concept] — [reason it doesn't fit / decision needed]
```

This section must be present even if empty (`None identified`).

---

### Step 4: Identify Calculators (the math)

Determine every **pure function** that turns parameters into a value. A calculator knows nothing about business meaning — it is reusable math.

**Detection signals:**
- A formula or rule that maps inputs to a number
- A rate, a step price, a per-unit charge, a percentage, a daily increment

**For each calculator, define:**
- A technical identity (`calculatorId`, e.g., UUID) and a human name/description
- Its **type** and the parameters needed to *create* it vs. the parameters needed to *calculate*
- Its **interpretation** (see Step 6) — total, unit, or marginal

**Common calculator types** (pick from these; introduce new ones as needed):

| Type | Function | Example |
|------|----------|---------|
| `SimpleFixed` | Constant `f(x) = a` | Activation fee 49 zł; SMS 20 gr |
| `StepFunction` | `base + stepIncrement · floor(param / stepWidth)` | Parcel price by weight; parking per 30 min |
| `Discrete` | Lookup map; throws if key absent | Packages: 5 lessons = 99 zł, 10 = 179 zł |
| `DailyIncrement` | `startPrice + days · delta` | Course price rising each day of the sales window |
| `ContinuousLinearTime` | Linear interpolation between (startTime, startPrice) and (endTime, endPrice) | Price changing every second |
| `Percentage` | `param · rate` | VAT 23%, commission 10%, insurance premium |
| `CompositeFunction` | Picks a sub-calculator per range (see Step 5) | Day/night tariff; weight tiers |

**Critical rule:** A calculator returns **one value, and only a value**. It must never return a map of net/VAT/margin slices — that turns it into a context-bound monolith. Semantics belong to components (Step 7). The same `Percentage` calculator can be VAT, a margin, a commission, or an insurance premium — the *component* decides which.

---

### Step 5: Identify Ranges & Composite Functions

When a value is **piecewise** — different math on different segments of an axis — model the axis as ranges and wrap the segments in a `CompositeFunction` calculator.

**Detection signals:**
- "day vs night", "weekday vs weekend", "season", "Black Friday"
- weight/quantity tiers, distance bands, scoring brackets
- "first 10 minutes free, then 0.50/min"

**Range types** (all left-closed `[from, to)`, all answer "is value V in this range?"):

| Range | Axis | Notes |
|-------|------|-------|
| `TimeRange` | hour-of-day | supports cross-midnight (22:00–06:00) |
| `DateRange` | calendar dates | seasons, promo windows |
| `NumericRange` | any number | weight, quantity, km, scoring, even mapped segments |

**`Ranges` object** — the guardian. For each composite function, define:
- **Selector**: which parameter chooses the segment (e.g., `date`, `hour`, `weight`, `segment`)
- **Invariant**: all ranges share one axis and **must not overlap**

A non-time dimension can be mapped onto a `NumericRange` (e.g., segment B2C = `[0,1)`, B2B = `[1,2)`) — but consider whether that condition is really **applicability** (Step 9) rather than math.

**Output for each composite calculator:**

```
CompositeFunction: [name]
  Selector: [param]
  Segments:
    [range] → [sub-calculator]
    [range] → [sub-calculator]
```

---

### Step 6: Choose Interpretation(s)

The same math can mean three different things. Interpretation is **configuration, not implementation** — do not create a separate class per perspective.

| Interpretation | Answers | Result type | Typical use |
|----------------|---------|-------------|-------------|
| **Total** | "what does the whole volume cost?" | `Money` / `Quantity` | invoices, cart, billing — the single source of truth |
| **Unit** | "average price per unit at this volume?" | money + unit | marketing, offer comparison, upsell |
| **Marginal** | "what does the n-th unit cost?" | money + unit + index | tiering transparency, dynamic incentives |

**Rules:**
- These are mathematically inter-convertible (total = Σ marginal; unit = total / n; marginal(n) = total(n) − total(n−1)) — *up to rounding*. Conversions are done by **adapters** (Step 7), not by duplicating calculators.
- A calculator declares which interpretation it natively computes. Do not make a `SimpleFixed` also return a total — that would smuggle a linear function into a constant one and break semantic consistency.
- **For multi-dimensional values (price depends on >1 parameter), "unit" usually does not exist** ("price per gigabyte-hour-device-time-of-day"?). Default to **total**; mention this when the domain is multi-dimensional.

If the business needs only one perspective (commonly total), say so and skip the rest — do not over-build.

---

### Step 7: Define Components (the semantics)

A **component** is a business-named part of the value, bound to a calculator. Calculators are *capability* (math); components are *meaning*. This is where the "cake" gets sliced.

**`SimpleComponent`** (leaf): identity (`componentId`), business name, a calculator reference, an `interpretation`, and:
- **Parameter mappings** — translate business parameter names into the calculator's technical names (e.g., business `time` → calculator `quantity`). Document via a `parameterMappings` map.
- It returns either a raw value or a `ComponentBreakdown` record.

**`CompositeComponent`** (composite pattern): identity, business name, and **children** (simple or composite) — **no calculator of its own**. It delegates and aggregates. Additionally:
- **Parameter dependencies** — a component may need the *result* of other components as input (the classic case: **VAT's base amount = sum of the net components**). Model these explicitly as dependencies, not as hidden ordering. This makes the component set a **graph**, not just a tree.
- It produces a `ComponentBreakdown` — a tree aggregating each level's result, which is the explainable price breakdown.

**Output for each component:**

```
Component: [business-name] ([Simple|Composite])
  Calculator: [calculator-name]            # Simple only
  Param mappings: [business → technical]   # Simple only
  Children: [...]                          # Composite only
  Dependencies: [param ← result-of(component(s))]   # e.g., baseAmount ← sum(net components)
  Interpretation: [total|unit|marginal]
  Meaning: [what this slice IS, who owns it]
```

**Adapters** (optional): if the business needs a perspective different from what a calculator natively produces, wrap it in an adapter (itself a calculator) that converts unit↔total↔marginal. A **facade** then exposes `calculateTotal` / `calculateUnit` / `calculateMarginal` and auto-selects adapters. Mention adapters only if multiple interpretations are required.

---

### Step 8: Detect Validity & Versioning (time)

If the value changes over time, the model must select logic **by time**, never by `if` and never by overwriting (a DB `update` destroys history and breaks recomputation of the past).

**Core rule:** The component's **identity is stable** (constant `componentId` for its whole lifecycle), but its **details are versioned and immutable**. Changing a price = appending a new version, never editing or re-pointing parents (no domino effect on every price list / product that references it).

**`Validity`** — a left-closed time interval `[validFrom, validTo)`; can answer "is timestamp T inside?" and "do two intervals overlap?".

**`ComponentVersion`** — an immutable snapshot: *what* applies, *when* it applies (`validity`), and *when it was defined* (`definedAt`).
- For a `SimpleComponent`: typically the calculator + parameter mappings + validity.
- For a `CompositeComponent`: the children + dependency mappings + validity.

**`VersionUpdateStrategy`** — the rule for adding versions: disallow overlaps, disallow duplicate periods, or allow anything. **Default: disallow overlapping/duplicate periods.**

**Calculation with time:** the parameter set carries a `timestamp`. The component selects the version valid at that timestamp, adapts interpretation, and calculates. → Future-dated changes, billing of past events at past rates, and full history all fall out of the model, not out of logs.

**Output:**

```
Component: [name]
  Version 1: validity [from, to)  defined_at [date]  → [what's in it]
  Version 2: validity [from, to)  defined_at [date]  → [what changed]
  Update strategy: [no-overlap | ...]
```

> Note: this mirrors **temporal composition** in the Product archetype. Products and pricing are *structurally isomorphic* (both versioned trees) but answer different questions and change at different rates — keep them as separate models unless the system is trivially simple.

---

### Step 9: Define Applicability Rules (whether to calculate)

The mature pricing model has **three orthogonal axes**. Keep them separate:

| Axis | Question | Lives in |
|------|----------|----------|
| **Calculator** | *How* do we calculate? | math (capability) |
| **Validity** | *When* does it apply? | version / time (Step 8) |
| **Applicability** | *Whether* we calculate at all? | rule layer (this step) |

**Detection signals:** "only for individual customers", "only above 10 minutes", "only in the mobile app", "night promo 22:00–06:00", "B2B pays from minute one", "A/B test of a new price list".

**Composition rules:**
- A `SimpleComponent` version applies **iff** it is valid in time **AND** its applicability rule holds (`validity AND applicability`).
- A `CompositeComponent` applies **iff** it is valid in time **AND at least one child is applicable** (`validity AND OR(children)`) — a missing slice does not void the whole price.

**Why pull conditions out of the math:** if a threshold like "first 10 minutes free" changes every campaign, or depends on segment/channel/country, baking it into a calculator turns the function into a bag of `if`s and makes "why did this customer get this price?" unanswerable. Applicability puts the *whether* in a layer built for change, and keeps the calculator as a clean, reusable, explainable function. (If the rules get genuinely complex, this is the seam where a dedicated business-rules engine plugs in.)

**Output:**

```
| Component (version) | Applicability condition | Source |
|---------------------|-------------------------|--------|
| [name]              | segment = B2C AND duration > 10 min | (R)/(A) |
```

---

### Step 9.5: Decision Sanity Check

**Before producing the final output**, enumerate every concrete decision embedded in the draft model and verify each one has a source. This prevents silent assumptions from leaking into the output.

For each decision, classify its source:
- **(R)** — explicitly stated in the requirements
- **(A)** — asked and answered in Step 2
- **(X)** — neither: assumed silently

**Decision checklist** (go through every one that appears in your draft):

| Decision area | Example decisions to check |
|---------------|---------------------------|
| Interpretation | Total / unit / marginal? Which per component? Does "unit" even exist (multi-dimensional)? |
| Calculator type | Fixed / step / discrete / linear / percentage / composite — does each match the real formula? |
| Range boundaries | Left-closed `[from, to)`? Cross-midnight handled? Overlaps forbidden? |
| Selector | Which parameter selects each composite segment? |
| Scope boundary | Did I exclude any domain concept as belonging to another archetype (accounting balance / state machine / workflow)? Was that exclusion asked, or assumed? A concept in the requirements that I unilaterally declared "out of pricing scope" is an `(X)` until confirmed. |
| Component split | Which slices exist (net, VAT, margins, fees)? Who owns each? |
| Parameter dependencies | Does VAT (or similar) compute on a *sum* of other components? Dependency made explicit? |
| Time / versioning | Does it change over time? Recompute past at historical version? Version update strategy? |
| Applicability | Which components apply only under conditions (segment/channel/threshold/time)? |
| Multiple price lists | Several valid at once — which wins, and what's optimized? |
| Rounding / precision | Rounding mode, scale, at which step? |
| Caps / floors / free tier | Min charge, max charge, max discount, first-N-free? |
| Currency / unit | Canonical unit/currency? Conversions? Multi-currency? |
| Orchestration boundary | Does pricing compute only (called by ordering/billing), or is it pulled into process logic? |

**For every (X) decision found:**

1. If the decision has low impact (purely technical, easily changed): mark as explicit assumption in Implementation Notes.
2. If the decision affects business behavior (e.g., recompute-the-past policy, which price list wins, what each component means, an applicability condition): **stop and ask** using `AskUserQuestion` before delivering the model.

Do not deliver the model until all material (X) decisions are either confirmed or documented as explicit assumptions.

---

## Output Format

```markdown
# Pricing Archetype Model: [Domain Name]

## Domain Value
[Value name, description, canonical unit/currency, and which interpretation(s) the business needs]
[If money: model as Money. If other: model as Quantity. Note multi-unit conversions if any.]

## Concept Mapping

| Domain Concept | Pricing Archetype | Notes |
|----------------|-------------------|-------|
| ...            | ...               | ...   |

## Unmapped Concepts
[List or "None identified"]

## Calculators

| Calculator | Type | Function / Formula | Create params | Calculate params | Interpretation |
|------------|------|--------------------|---------------|------------------|----------------|
| [name] | [type] | [formula] | [...] | [...] | total/unit/marginal |

## Ranges & Composite Functions
[For each CompositeFunction calculator:]
**[name]** — selector: `[param]`, axis: [time/date/numeric]
| Range | Sub-calculator |
|-------|----------------|
| [from, to) | [calculator] |

## Components

| Component | Kind | Calculator | Param Mappings | Dependencies | Interpretation | Business Meaning |
|-----------|------|-----------|----------------|--------------|----------------|------------------|
| [name] | Simple/Composite | [calc or —] | [biz→tech] | [param ← result-of(...)] | [...] | [the slice it represents] |

[Breakdown tree — show the composite structure, e.g.:]
TotalPrice (Composite)
├── EnergyCharge (Simple → energy_rate)
├── OperatorMargin (Simple → percentage)
└── VAT (Simple → percentage; baseAmount ← sum(EnergyCharge, OperatorMargin))

## Validity & Versioning

| Component | Version | Valid From | Valid To | Defined At | What Changed |
|-----------|---------|-----------|---------|-----------|--------------|
| [name] | v1 | [date] | [date] | [date] | [...] |

Version update strategy: [no-overlap | no-duplicate-period | open]

## Applicability Rules

| Component (version) | Condition (whether to apply) |
|---------------------|------------------------------|
| [name] | [segment/channel/threshold/time condition] |

## Worked Breakdown Example
[A concrete calculation: given params + timestamp, show selected versions and the resulting
component breakdown summing to the total.]

## Implementation Notes
[Key decisions, assumptions for unanswered questions, rounding rules, orchestration boundary
(who calls pricing), edge cases. Note any variable policies resolved above the model.]
```

---

## Common Patterns & Pitfalls

### Pattern: Math Stays in Calculators, Semantics in Components

The single most important rule. A calculator is a pure function — `Percentage(0.23)` is just "multiply by 0.23". Whether that is VAT, a margin, a commission, or an insurance premium is decided by the **component** that uses it. This lets one calculator be reused everywhere and keeps each piece testable and resistant to business change.

**Anti-pattern:** making a calculator return a map of `{net, vat, operatorMargin, …}`. The moment it does, it stops being reusable math and becomes a context-bound monolith — every VAT-rate change or new fee forces you to repackage the whole calculator. Keep calculators returning one value; build the breakdown out of components.

### Pattern: Clients Must Not Calculate — Pricing Owns Arithmetic

Frontend, mobile, back-office panel, and an integration each "helpfully" computing the price is how you get four different numbers for the same order and an endless blame ping-pong. Pricing is the **single source of truth**: it owns the arithmetic, the rounding, the order of operations, the consistency. Clients call it and display the result; they never recompute it themselves.

### Pattern: Pricing Is a Capability, Not a Shared Library or a Process

Pricing is a generic *valuation capability* — the green Lego baseplate other modules build on. Treat it like Product or Accounting: its own module, model, persistence, and API.

- **Not a shared library** (shared-kernel anti-pattern): a library can't remember which rule applied when, can't replay the past, and turns every price change into a version bump + redeploy of every consumer. It makes pricing nobody's domain.
- **Not part of a process**: ordering/billing **orchestrate** pricing — they call it per line and pass parameters in. Pricing does not know it's an order, doesn't listen to order events, doesn't know order status. When usage is billed over time (logistics end-of-month, telecom cycles), **billing** sits in between and orchestrates pricing; billing aggregates cycles but never computes the price itself.
- **Accounting hand-off**: pricing knows *where the value came from* (components: VAT, commission, margin); accounting knows *where to record it* (chart of accounts, ledger entries). Pricing knows no chart of accounts; accounting knows no pricing formula. Integration runs through billing or events.

### Pitfall: Confusing Product Structure with Pricing Structure

Products and pricing are structurally isomorphic — both are versioned composite trees with applicability. But Product answers *what we sell* (stable, regulatory, contractual), and Pricing answers *how much it's worth, here, now* (volatile, experimental). Catalogue changes and price changes do **not** move in lockstip. Keep them as two models unless variability in both is genuinely low.

---

## Quality Checks

Before returning the model, verify:

- [ ] Every calculator returns exactly **one** value (never a breakdown map)
- [ ] Every calculator has a declared type and a declared interpretation
- [ ] Semantics live only in components; no business meaning leaked into calculators
- [ ] Every composite calculator has a selector and non-overlapping, same-axis ranges
- [ ] Ranges are left-closed `[from, to)`; cross-midnight handled where relevant
- [ ] Parameter dependencies (e.g., VAT base = sum of nets) are explicit, not implied by ordering
- [ ] Time-varying components are **versioned** (stable id + immutable versions), never overwritten
- [ ] A version-update strategy is stated
- [ ] Calculation by timestamp selects the version — no `if`-on-date logic
- [ ] Applicability (whether) is separated from calculator (how) and validity (when)
- [ ] The interpretation(s) chosen match real business need; "unit" omitted for multi-dimensional values
- [ ] Rounding/precision rules are documented
- [ ] Concept mapping table is present and complete
- [ ] Unmapped concepts section is present (even if empty)
- [ ] All clarifying answers (or explicit assumptions) are reflected in the model
- [ ] Orchestration boundary is stated (pricing computes; ordering/billing orchestrate)

---

## Example

**Input:** "EV charging session. Customer pays one amount, but it splits into wholesale energy, the station operator's (CPO) margin, and VAT. Energy is 0.85 zł/kWh by day (08:00–22:00) and 0.42 zł/kWh at night. From Feb 1 the day energy rate rises to 0.95 zł/kWh. We must be able to recompute January sessions at January rates. VAT is 23% on everything."

**Output:**

```markdown
# Pricing Archetype Model: EV Charging Session

## Domain Value
CHARGING_SESSION_PRICE — measured in PLN (zł), modelled as `Money`. Business needs the
**total** plus a **component breakdown** (energy / CPO margin / VAT) for transparency and the
multi-party split. No unit/marginal perspective required (value is multi-dimensional).

## Concept Mapping

| Domain Concept | Pricing Archetype | Notes |
|----------------|-------------------|-------|
| Energy price by time of day | CompositeFunction calculator over TimeRange | day vs night segments |
| Day/night rate change on Feb 1 | ComponentVersion + Validity | append version, don't overwrite |
| Wholesale energy charge | SimpleComponent (EnergyCharge) | semantics over energy calculator |
| CPO margin | SimpleComponent (OperatorMargin) → Percentage | who owns this slice: station operator |
| VAT 23% | SimpleComponent (VAT) → Percentage | base = sum of net components (dependency) |
| Total the customer pays | CompositeComponent (TotalPrice) | aggregates the three slices |
| Recompute January at January rates | Versioning + calculate-by-timestamp | time selects version |

## Unmapped Concepts
None identified.

## Calculators

| Calculator | Type | Function / Formula | Create params | Calculate params | Interpretation |
|------------|------|--------------------|---------------|------------------|----------------|
| energy_day_jan | SimpleFixed (per kWh rate) | 0.85 · kWh | rate=0.85 | kWh | total |
| energy_night | SimpleFixed (per kWh rate) | 0.42 · kWh | rate=0.42 | kWh | total |
| energy_day_feb | SimpleFixed (per kWh rate) | 0.95 · kWh | rate=0.95 | kWh | total |
| energy_tariff_jan | CompositeFunction | picks day/night by hour | ranges, selector=hour | kWh, hour | total |
| energy_tariff_feb | CompositeFunction | picks day/night by hour | ranges, selector=hour | kWh, hour | total |
| pct_23 | Percentage | baseAmount · 0.23 | rate=0.23 | baseAmount | total |
| cpo_pct | Percentage | baseAmount · 0.10 | rate=0.10 | baseAmount | total |

## Ranges & Composite Functions

**energy_tariff_jan** — selector: `hour`, axis: time
| Range | Sub-calculator |
|-------|----------------|
| [08:00, 22:00) | energy_day_jan |
| [22:00, 08:00) (cross-midnight) | energy_night |

**energy_tariff_feb** — selector: `hour`, axis: time
| Range | Sub-calculator |
|-------|----------------|
| [08:00, 22:00) | energy_day_feb |
| [22:00, 08:00) (cross-midnight) | energy_night |

## Components

| Component | Kind | Calculator | Param Mappings | Dependencies | Interpretation | Business Meaning |
|-----------|------|-----------|----------------|--------------|----------------|------------------|
| EnergyCharge | Simple | energy_tariff_* (versioned) | session.kWh→kWh, session.hour→hour | — | total | Wholesale energy cost |
| OperatorMargin | Simple | cpo_pct | baseAmount←EnergyCharge | baseAmount ← result(EnergyCharge) | total | Station operator's (CPO) margin |
| VAT | Simple | pct_23 | — | baseAmount ← sum(EnergyCharge, OperatorMargin) | total | 23% tax on the net total |
| TotalPrice | Composite | — | — | — | total | What the customer pays |

TotalPrice (Composite)
├── EnergyCharge   (Simple → energy_tariff_*, versioned)
├── OperatorMargin (Simple → cpo_pct;  baseAmount ← EnergyCharge)
└── VAT            (Simple → pct_23;    baseAmount ← sum(EnergyCharge, OperatorMargin))

## Validity & Versioning

| Component | Version | Valid From | Valid To | Defined At | What Changed |
|-----------|---------|-----------|---------|-----------|--------------|
| EnergyCharge | v1 | −∞ | 2025-02-01 | 2024-12-15 | day rate 0.85, night 0.42 (energy_tariff_jan) |
| EnergyCharge | v2 | 2025-02-01 | +∞ | 2025-01-20 | day rate → 0.95 (energy_tariff_feb) |

Version update strategy: no-overlap (versions may not cover the same period twice).

## Applicability Rules

| Component (version) | Condition (whether to apply) |
|---------------------|------------------------------|
| (none) | All components always apply in this domain |

## Worked Breakdown Example
Session on **2025-01-15**, 20 kWh charged during the day (hour 14:00):
- EnergyCharge: timestamp 2025-01-15 selects **v1** → energy_tariff_jan, day → 0.85 · 20 = **17.00 zł**
- OperatorMargin: 0.10 · 17.00 = **1.70 zł**
- VAT: 0.23 · (17.00 + 1.70) = 0.23 · 18.70 = **4.30 zł**
- **TotalPrice = 23.00 zł**

The same session dated **2025-02-15** would select EnergyCharge **v2** (0.95) → 19.00, margin 1.90,
VAT 4.81, total **25.71 zł** — without any `if`, purely from version selection by timestamp.

## Implementation Notes
- Calculation is driven by a `timestamp` parameter; each component selects the version valid at
  that timestamp. This is what lets January sessions recompute at January rates. *(R)*
- VAT is modelled as a dependency on the *sum* of net components, not as fixed ordering — adding a
  future net component (e.g., parking) automatically flows into the VAT base. *(R — "VAT on everything")*
- **Interpretation = total only**, no unit/marginal; "unit" omitted because the value is
  multi-dimensional (kWh × time-of-day). *(R — only the final amount + split is asked for)*
- **Component split** = EnergyCharge / OperatorMargin / VAT; OperatorMargin base = EnergyCharge,
  VAT base = sum of the two nets. *(R)*
- **CPO margin rate = 10%.** The requirements named the *margin* slice but never its rate — a
  material gap. **Asked the user; answered 10%.** *(A)*
- **Rounding = half-up to 2 decimals, per component.** Not in the requirements and it changes the
  amount charged. **Asked the user; confirmed.** *(A)*
- **Version update strategy = no-overlap.** Default; nothing in requirements dictated it.
  **Confirmed with the user.** *(A)*
- **No applicability conditions** — all components always apply. Requirements mention no
  segment/channel/threshold limits; **confirmed none apply.** *(A)*
- **No caps / floors / free tier** (no minimum charge, no free kWh, no maximum). **Confirmed.** *(A)*
- **Single currency PLN, canonical unit kWh, no conversions; one price list at a time.** *(R — only
  zł/kWh appear; no VIP/promo/partner lists described)*
- **Orchestration boundary**: pricing computes only; the billing/ordering layer calls it per
  session and passes kWh, hour, and timestamp. Posting the VAT/margin slices to the ledger is an
  accounting concern, out of scope. *(X — architectural default, low-risk; documented here rather
  than asked)*
```
