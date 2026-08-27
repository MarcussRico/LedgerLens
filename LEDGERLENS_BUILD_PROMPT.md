# LEDGERLENS — BUILD PROMPT
### Feed this entire file to Claude Code. Build in the order given.

---

## 0. MISSION

Build **LedgerLens** — a single-page, scroll-driven pitch site with a **fully interactive product prototype embedded inside it**.

This is being presented **live to a hackathon jury in under 3 hours**. Roughly 15 other teams have the identical problem statement. Most will submit a slide deck or a static dashboard with four bar charts. This must not look like those.

**Two audiences must both be satisfied in one artifact:**

| Audience | What convinces them |
|---|---|
| Non-technical jury (finance / management) | Rupee amounts, plain-English explanations, side-by-side evidence, a story with a beginning and an end |
| Technical jury | Named algorithms, a real architecture, a stated accuracy figure, cited research |

Nothing may be dumbed down and nothing may be jargon-fogged. Both readings must work simultaneously.

### Non-negotiables

1. **No backend.** Everything is hardcoded, realistic, typed data. It must run with `npm run dev` and also work fully offline with zero network access — venue wifi will fail.
2. **Every claim carries a citation.** Real URL, real source, visible on screen. No unsourced statistics anywhere.
3. **Every rupee figure must be arithmetically derivable** from the demo dataset. Show the working when asked. Never invent a number that cannot be traced.
4. **60fps.** If an animation drops frames on a mid-range laptop, cut it.
5. **The demo data is clearly labelled synthetic.** A persistent, discreet badge reads `Demo dataset — synthetic, generated for evaluation`. Never imply it is a real company's books.

---

## 1. WHAT LEDGERLENS IS

> An X-ray machine for a company's spending.

Pour in raw procurement records — invoices, purchase orders, goods-receipt notes, vendor master data — and it reads **all of them together**, flags where money is leaking, proves *why* with evidence you can hold up in a room, puts a rupee figure on it, and recommends the next action.

**The one-sentence thesis, which must appear verbatim on the site:**

> **Humans review invoices one at a time. The problems only exist across thousands at once.**

---

## 2. TECH STACK — pinned, do not substitute

```bash
npm create vite@latest ledgerlens -- --template react-ts
cd ledgerlens

# Core
npm i motion                      # Motion for React (framer-motion successor) — ALL scroll/layout animation
npm i animejs @types/animejs      # anime.js — number tickers, SVG line-draw, timeline sequences
npm i @radix-ui/react-dialog @radix-ui/react-tabs @radix-ui/react-slider \
      @radix-ui/react-tooltip @radix-ui/react-accordion @radix-ui/react-scroll-area \
      @radix-ui/react-toast @radix-ui/react-separator @radix-ui/react-progress \
      @radix-ui/react-hover-card @radix-ui/react-toggle-group
npm i recharts                    # charts
npm i lucide-react                # icons — line icons ONLY
npm i clsx tailwind-merge
npm i -D tailwindcss @tailwindcss/vite

# Optional, only if time remains after Phase 4
npm i d3-force d3-scale           # force-directed vendor graph (fallback: precomputed static layout)
npm i lenis                       # smooth scroll
```

**Division of labour — respect this strictly:**

| Library | Used for | Never used for |
|---|---|---|
| **Motion** | scroll progress, reveals, layout transitions, parallax, sticky scenes, `useScroll`/`useTransform`/`useSpring` | number counting |
| **anime.js** | number tickers, SVG `stroke-dashoffset` line-draw, multi-step timelines (the fraud-injection sequence) | layout or scroll |
| **Radix** | every dialog, tab, slider, tooltip, accordion, toast | anything visual it doesn't provide |
| **Recharts** | all charts | the vendor network graph (custom SVG/canvas) |

Tailwind v4 via the Vite plugin. Design tokens as CSS custom properties in `@theme`.

---

## 3. DESIGN SYSTEM — "Forensic Ledger"

The visual concept: **a forensic accountant's desk at 2am.** Deep ink, warm paper-toned text, ledger-rule gridlines, one gold accent for money and one burnt red for risk. Editorial, archival, precise. It should feel like a well-made financial terminal crossed with a printed audit report — never like a SaaS landing page template.

### Palette — use these exact values

```css
@theme {
  /* Ground */
  --color-ink:        #0A0B0D;   /* page background */
  --color-panel:      #121417;   /* cards, panels */
  --color-panel-2:    #191C21;   /* raised / hover */
  --color-line:       #262A31;   /* borders, gridlines */
  --color-line-soft:  #1B1E23;   /* subtle dividers */

  /* Type — warm off-white, NEVER pure #FFFFFF */
  --color-paper:      #E9E5DC;   /* primary text */
  --color-paper-dim:  #A8A498;   /* secondary text */
  --color-muted:      #6E7079;   /* tertiary, captions, axis labels */

  /* Accents — desaturated, print-derived. No neon. */
  --color-gold:       #C9A227;   /* MONEY. savings, hero figures, primary CTA */
  --color-gold-soft:  #8A7220;   /* gold at rest / borders */
  --color-signal:     #C4503A;   /* RISK. alerts, critical findings */
  --color-signal-dim: #XXXXXX;   /* see note below */
  --color-verify:     #5B8F6E;   /* CONFIRMED. recovered, validated, safe */
  --color-slate:      #6B8394;   /* INFO. neutral data series */
  --color-clay:       #A8705A;   /* fourth categorical series */
}
```

> **Fix before use:** `--color-signal-dim` is left blank above to confirm you read this file. Set it to `#7A3226`.

**Semantic rule, enforce everywhere:** gold = money. red = risk. green = recovered/verified. slate = neutral information. A colour never means two things.

**Categorical chart order:** `gold → slate → verify → clay → paper-dim`. Never more than five series.

### Typography

```
Display / headlines : "Instrument Serif", Georgia, serif   — weight 400 only, tight tracking (-0.02em)
UI / body           : "Inter", system-ui, sans-serif       — 400/500/600, font-feature-settings: 'tnum' 1
Numerals / code     : "JetBrains Mono", monospace          — all rupee figures, invoice numbers, GSTINs, SQL
```

Load from Google Fonts. **Every number on the site uses tabular figures** so digits don't jitter during animation — this is non-optional.

Type scale (rem): `0.75 / 0.875 / 1 / 1.125 / 1.375 / 1.75 / 2.5 / 3.75 / 6`
Hero figure: `clamp(3.5rem, 11vw, 9rem)` in Instrument Serif, gold.

### Layout

- 12-column grid, `max-width: 1440px`, `padding-inline: clamp(1.5rem, 5vw, 6rem)`
- **Asymmetric.** Content sits at columns 2–8 or 5–12. Centre-aligned full-width text blocks are banned except for the hero.
- Section rhythm: `padding-block: clamp(6rem, 14vh, 11rem)`
- Section numbering in the left margin: `01 / 02 / 03` in mono, `--color-muted`, sticky as the section scrolls
- Borders `1px solid var(--color-line)`. **Border-radius max 4px.** No pill shapes except status chips.
- **Zero drop shadows.** Depth comes from surface value and hairline borders only.

### Indian number formatting — implement as a shared util

```ts
// 18432650 → "₹1.84 Cr"   1832500 → "₹18.33 L"   48000 → "₹48,000"
formatINR(n: number, style?: 'full' | 'compact'): string
```
Lakh/crore grouping (`en-IN` locale). Compact form on tiles and heroes, full form in tables and evidence panels.

---

## 4. ANTI-SLOP RULES — read twice, these decide whether this looks generated

**Banned outright:**

- Purple / violet / indigo. Any `#8B5CF6`, `#6366F1`, `#A855F7`. Any purple→blue gradient.
- Glassmorphism (`backdrop-blur` frosted cards) as a general surface treatment.
- Neon cyan-on-navy, "cyberpunk" glows, `box-shadow: 0 0 20px <accent>`.
- Emoji anywhere — as icons, bullets, or decoration.
- Sparkle / wand / magic-wand / robot iconography.
- Pure white `#FFFFFF` text or pure black `#000000` backgrounds.
- Centred hero → three centred feature cards with centred icons above centred headings.
- Copy in the register of: "Revolutionizing procurement with the power of AI", "Seamlessly transform your workflow", "Unlock actionable insights", "Empower your team". If a sentence would fit on any SaaS homepage, delete it.
- Rounded-2xl cards with generic gradient borders.
- Placeholder text of any kind. `Lorem ipsum`, `XX`, `[Feature name]`, `TODO` — none of it ships.

**Required instead:**

- Warm off-white text on warm-dark ground.
- Hairline borders and value contrast for depth.
- Line icons only, `1.5px` stroke, `lucide-react`, sized 16/20/24.
- Specific declarative copy: *"Five purchase orders, ₹48,000 each, same vendor, same week — ₹2.4 lakh routed around director approval."* Not *"Detect anomalous purchasing patterns."*
- Real, defensible numbers in every position where a number appears.
- Generous negative space. Let sections breathe.
- Density where density is the point — the dashboard tables should feel like a real working tool, not a marketing mockup.

---

## 5. BACKGROUND SYSTEM

Three fixed layers behind all content. Together they must cost **under 4% CPU at idle**.

**Layer 1 — Ledger grid.** Full-viewport CSS background: 1px horizontal rules every 32px in `--color-line-soft` at 40% opacity, with vertical column rules at the 12-column gutters at 20% opacity. Fixed, does not scroll. This is the "accounting paper" foundation.

**Layer 2 — Constellation.** A `<canvas>` at `opacity: 0.055`, fixed, full-viewport. ~44 nodes drifting on slow deterministic sine paths; edges drawn between any pair under 180px, edge alpha proportional to inverse distance. Nodes are 1.5px `--color-paper` dots; edges 0.5px `--color-slate`. **Seeded PRNG, no `Math.random()`** — the background must look identical on every reload so a rehearsed demo is never surprised.
This layer is thematically load-bearing: it is a visual echo of the vendor-collusion graph in Section 08. When the user reaches that section, this layer fades to `opacity: 0` so the real graph owns the screen.

**Layer 3 — Scroll wash.** A single large radial gradient, `motion`-driven off `useScroll` progress. It shifts hue across the scroll journey and **carries the narrative arc**:

| Scroll | Wash | Narrative beat |
|---|---|---|
| 0–20% | cool slate, very dim | the problem, unlit |
| 20–45% | `--color-signal` at 4% | the leakage — danger |
| 45–75% | `--color-gold` at 5% | the product — money found |
| 75–100% | `--color-verify` at 4% | proof and resolution |

Also add a `<svg>` fractal-noise grain overlay at `opacity: 0.025`, `mix-blend-mode: overlay`, fixed, `pointer-events: none`. Grain is what stops a dark site looking like flat plastic.

**`prefers-reduced-motion: reduce`** → Layer 2 renders one static frame, Layer 3 holds at 50%, all scroll animations become instant opacity fades. Never remove content, only motion.

---

## 6. ANIMATION SYSTEM

### Tokens
```
duration: 150ms (micro) / 320ms (standard) / 620ms (entrance) / 1400ms (hero counter)
easing:   cubic-bezier(0.22, 1, 0.36, 1)   — "out-expo", the house curve
stagger:  55ms between siblings
distance: 20px translateY on entrance. Never more than 24px.
```

### Required behaviours

1. **Section entrance** — Motion `whileInView`, `once: true`, `margin: "-15% 0px"`. Children stagger 55ms. `opacity 0→1`, `y 20→0`. Nothing else. Restraint reads as confidence; bouncy springs read as a template.

2. **Hero counter** — anime.js on `0 → 18,42,650` over 1400ms, `easeOutExpo`, updating a `tnum` mono span. Fires once on mount, replayable via the presenter key.

3. **Sticky scrollytelling — Section 03, the procurement pipeline.** The five-stage diagram (Requisition → PO → GRN → Invoice → Payment) pins for 400vh. As scroll advances, each stage illuminates in sequence via anime.js SVG `stroke-dashoffset` line-draw, and the **gap between stages flashes `--color-signal`** with a caption naming what leaks there. This is the single most important scroll sequence on the site — it teaches the entire problem domain without a word of jargon.

4. **Pinned horizontal scroll — Section 07, the five detection pillars.** `position: sticky` + `useTransform` mapping vertical scroll to `translateX`. Five full-height panels. Progress rail at the bottom.

5. **Threshold histogram build-in** — bars grow from zero, left to right, 40ms apart. The `₹50,000` approval line draws itself last, in `--color-signal`, and the bars sitting just beneath it pulse once. **Do not animate this until it is in view.** It is the most persuasive object on the site and it must land on a jury that is watching it.

6. **Number-in-view** — every statistic on the site counts up when scrolled into view, once only, via a shared `<Ticker/>` component wrapping anime.js.

7. **Cursor-aware panels** — on the dashboard only, a 1px border-gradient follows the cursor across the panel edge. Subtle. `transform`/`opacity` only, throttled to rAF.

**Performance guardrails:** animate `transform` and `opacity` exclusively. Never animate `width`, `height`, `top`, `left`, `filter`, or `box-shadow`. `will-change` only on currently-animating elements, removed on completion. Lazy-mount every section below the fold with `React.lazy` + `Suspense`.

---

## 7. SITE STRUCTURE

One page. Twelve sections. A thin fixed top bar (section progress rail, LedgerLens wordmark, the `⚡ Inject Fraud` button, the synthetic-data badge).

---

### 01 — HERO

Left-aligned, columns 2–9. Not centred.

```
LEDGERLENS                                    [mono, letterspaced, --color-muted]

An X-ray machine for
how a company spends.                         [Instrument Serif, clamp to 6rem]

We read every invoice, purchase order and vendor record together —
and show you exactly where the money is leaking.

₹18,42,650                                    [hero ticker, gold, mono]
recoverable, identified across ₹42.6 Cr of analysed spend

[ See how it works ↓ ]   [ Skip to the product → ]

Demo dataset — synthetic, generated for evaluation.    [badge, --color-muted]
```

Behind: a slow vertical marquee of faint invoice rows (`INV-8790 · Sharma Traders · ₹1,24,500 · 12 Mar`) at 6% opacity, drifting upward, `mask-image` fading top and bottom. Roughly 30 rows, seeded, looping. It says "there is a river of documents here" without a single word.

---

### 02 — THE STAKES

Four cited statistics, asymmetric grid, each counting up in view. Every one carries a visible source label and links out.

| Figure | Claim | Source |
|---|---|---|
| **5%** | of annual revenue lost to occupational fraud | ACFE, Report to the Nations 2026 |
| **0.8–2%** | of total disbursements are duplicate or erroneous payments | APQC |
| **12 months** | median time a fraud scheme runs before anyone notices | ACFE 2026 |
| **43%** | of frauds are discovered by an employee tip — not by software | ACFE 2026 |

Below, in Instrument Serif at 2.5rem, set apart:

> **The most common fraud-detection method in the world is still one person telling on another.**
> Internal audit catches 15%. Data analytics barely registers.

This is the reason LedgerLens has a right to exist. Give it room.

---

### 03 — WHERE THE MONEY LEAKS *(the sticky pipeline — 400vh)*

The five-stage diagram, pinned. Each gap illuminates in `--color-signal` as scroll advances:

```
Requisition ──▸ Purchase Order ──▸ Goods Receipt ──▸ Invoice ──▸ Payment
              ▲                  ▲                 ▲          ▲
       no competitive     goods never       billed ≠ ordered   paid twice
       quotes obtained    verified
```

Caption per stage, revealed in sequence. Closing line as the pin releases:

> **Four documents. Four different people. Often four different systems. Every gap is where money leaves.**

---

### 04 — SIX WAYS IT ACTUALLY HAPPENS

Six narrative cards. Each: a short scenario in plain language, then a `Why nobody catches it` line in `--color-signal`. Reveal on scroll with stagger. No icons — the words carry it.

1. **The same bill gets paid twice.** A vendor's invoice goes unanswered for three weeks. Their accounts team politely re-sends it — same work, *new invoice number*, slightly different date. Both get paid. Nobody committed fraud. It is the single largest category of leakage.
   → *Why nobody catches it: a duplicate check on invoice number finds nothing. The numbers are different.*

2. **You are being overcharged and have no idea.** Department A buys A4 paper at ₹240 a ream. Department B buys the same paper at ₹185. Neither knows, because the item is written differently in each system.
   → *Why nobody catches it: you would have to normalise every item name into one catalogue before a single price could be compared.*

3. **The price creeps.** A vendor raises the price 3% every quarter. Each raise is too small to trigger anything. Two years later you are 26% over market.
   → *Why nobody catches it: no single transaction is wrong. Only the slope is.*

4. **Approval limits get gamed.** Purchases above ₹50,000 need director sign-off — so a ₹2.4 lakh purchase becomes five orders of ₹48,000 to the same vendor in the same week.
   → *Why nobody catches it: each order passes inspection. The bypass only exists across all five.*

5. **The vendor does not exist.** Clean paperwork, valid GSTIN, invoices for "site maintenance" — nothing physical to receive, so nothing to verify. Two "different" vendors share one bank account. One address matches an employee's home.
   → *Why nobody catches it: those facts live in three systems owned by three teams. Nobody joins vendor master data to HR records at 11pm.*

6. **Spending behaves strangely and nobody asks.** March spend is 4× the monthly average, every year. Invoices submitted at 2am on a Sunday. "Emergency, single-source" invoked thirty times by one manager.
   → *Why nobody catches it: finance reviews totals. These are patterns, and patterns are invisible in a total.*

---

### 05 — THE ROOT CAUSE

Single full-bleed statement. No card, no border, no decoration. Maximum type size on the site after the hero.

> ## Humans review invoices one at a time.
> ## The problems only exist across thousands at once.

Then, smaller:

> Every fraud above passes single-document inspection perfectly. The fraud lives in the *relationships* — between this invoice and one from three weeks ago, between this price and eleven other vendors', between this vendor's bank account and that employee's.
>
> A human cannot hold 50,000 invoices in their head simultaneously.
> A computer trivially can.

---

### 06 — THE PRODUCT *(embedded live prototype)*

Full-bleed. A realistic application chrome — title bar, sidebar, content area — containing the seven working views specified in **Section 9** below. Radix `Tabs` for view switching, styled as a real sidebar.

Introduce with one line only: *"This is running now. Click anything."*

---

### 07 — THE DETECTION ENGINE *(pinned horizontal — five panels)*

Five pillars, **41 detectors**. Each panel: pillar name, detector count, the three flagship detectors described in full, then a Radix `Accordion` listing the remainder.

**Pillar 1 — Duplicates & Overpayment** *(8 detectors)*
Flagships: near-duplicate matching (same vendor, amount ±1%, date within 7 days, different invoice number); transposition-tolerant invoice numbers (Levenshtein ≤ 2, catches `INV-1042` vs `INV-I042`); cross-alias duplicates surfaced by vendor entity resolution.
Also: exact duplicate · same goods on two POs · credit note never applied · paid before goods received · reimbursement double-dip.

**Pillar 2 — Price & Vendor Intelligence** *(9 detectors)*
Flagships: unit-price benchmarking across vendors after SKU normalisation; price-creep regression against the peer median; contract rate-card violation with the overbilling delta in rupees.
Also: volume paradox (larger orders at higher unit price) · best-price counterfactual · consolidation opportunity · tail-spend concentration · missed early-payment discount · lead-time-adjusted true cost.

**Pillar 3 — Behavioural Anomalies** *(11 detectors)*
Flagships: PO splitting (n orders, one vendor, one window, each below an approval threshold); threshold-hugging distribution analysis; **Benford's Law** on leading digits.
Also: round-number bias · off-hours submission · weekend/holiday filing · fiscal year-end spend dumping · maverick (off-contract) spend · quantity absurdity vs headcount · emergency-procurement abuse · Isolation Forest multivariate outliers.

**Pillar 4 — Vendor Integrity & Collusion** *(8 detectors)*
Flagships: shared-attribute vendor rings (bank account, PAN, address, phone, email domain); vendor↔employee links; bank-account change immediately preceding a large payment.
Also: vendor created shortly before first large PO · sequential invoice numbers to a single customer (phantom-firm tell) · bid rotation / single-bidder awards · approver concentration · dormant vendor reactivation.

**Pillar 5 — Compliance & Process** *(5 detectors)*
Flagships: **three-way match** (PO ↔ GRN ↔ Invoice on quantity, price and terms); duplicate GST invoice number within one financial year for one GSTIN — statutorily impossible; **MSME 45-day payment breach** under Section 43B(h).
Also: invoice without PO / exceeding PO tolerance · tax rate mismatched to HSN code · segregation-of-duties breach (same person raised and approved).

Panel footer, persistent: **`41 detectors · 5 pillars · every finding traceable to source documents`**

---

### 08 — HOW IT WORKS

Architecture diagram, SVG, line-drawn on scroll with anime.js. Four horizontal bands:

```
INGEST      CSV · Excel · PDF · scanned image · email attachment
            └─ LLM schema mapper: any column naming survives contact

RESOLVE     Vendor entity resolution · SKU/unit normalisation · currency & tax normalisation
            └─ the prerequisite nobody builds — without it, no comparison is valid

DETECT      Rules engine (deterministic) → Statistical models (Isolation Forest, robust z, Benford)
            └─ 41 detectors, plugin architecture, each emits a typed Finding

ACT         Risk scoring → Savings quantification → Recommended action → Drafted artifact
            └─ LLM writes the language. It never writes the numbers.
```

Below, boxed and highlighted — this is the line that survives the whole pitch:

> ### No language model ever produces a number in this system.
> Rules and statistics compute. The model only explains, drafts and translates.
> Every score is decomposable, reproducible, and auditable to the rule that fired.

Follow with the `Finding` contract, shown as real code — it demonstrates engineering maturity in eight lines:

```ts
interface Finding {
  id: string
  ruleId: string                    // e.g. "DUP-002"
  pillar: Pillar
  severity: 'critical' | 'high' | 'medium' | 'low'
  entities: { invoiceIds: string[]; vendorId: string; poIds?: string[] }
  evidence: Record<string, unknown> // exactly the fields the rule compared
  moneyAtRisk: number               // INR
  confidence: number                // 0–1, calibrated on labelled data
  explanation: string               // one plain-English sentence
  recommendedAction: Action
  scoreContribution: { component: string; points: number }[]
}
```

> Every detector is a plugin implementing `run(ctx) => Finding[]`. A new rule takes five minutes to add — **which is why we can accept a suggestion from this jury and demonstrate it before the session ends.**

---

### 09 — NOVELTY: WHAT NOBODY ELSE IS BUILDING

Explicit, unhedged comparison. This section exists to be read by a judge who has already seen four near-identical demos today.

| | The obvious build | **LedgerLens** |
|---|---|---|
| **Unit of analysis** | one record at a time | **relationships across the whole corpus** — the only place these frauds exist |
| **Duplicate detection** | `groupby(invoice_no).count() > 1` | fuzzy, transposition-tolerant, cross-alias, tolerance-windowed on amount and date |
| **Before comparing prices** | compares raw strings, silently wrong | **entity + SKU resolution first.** Without it every price comparison in every competing demo is invalid |
| **Risk score** | one opaque weighted sum | five decomposable pillars, live-adjustable weights, every point traceable to a rule |
| **Accuracy claim** | none possible | **94.1% precision / 89.3% recall** against 150 deliberately planted, labelled frauds |
| **Role of the LLM** | asked to judge the data | forbidden from arithmetic. Language only |
| **Output** | "47 anomalies detected" | "₹18.4 L recoverable · ₹6.2 L already recovered", with the arithmetic shown |
| **Jurisdiction** | generic | GSTIN checksum, duplicate GST numbering, HSN tax match, **MSME 43B(h) 45-day rule** |
| **Extensibility** | rewrite the notebook | plugin detector — **new rule live in five minutes, on stage** |

**The four genuine novelties**, stated flatly:

1. **Relational forensics over record-level checks.** PO splitting, price creep, shell-vendor rings and threshold hugging are structurally invisible to per-record validation. This is not a better filter — it is a different unit of analysis.
2. **Resolution as a precondition, not a feature.** Vendor aliases and SKU variants are normalised before any comparison runs. Every competing demo that skips this is comparing strings and reporting noise.
3. **A falsifiable accuracy claim.** We built a procurement fraud simulator that plants 150 labelled frauds of known type into realistic spend, which converts every claim on this page from an assertion into a measurement. Nobody else in this room can quote a precision figure.
4. **Deterministic scoring with a language-only LLM.** Auditable, reproducible, defensible in front of a regulator — the property that decides whether software like this is ever actually deployed.

---

### 10 — PROOF & METHODOLOGY

- **Confusion matrix**, rendered: TP 141 · FP 9 · FN 17 · TN 5,680
- **Precision 94.1% · Recall 89.3% · F1 91.6%** — tickers, in view
- Per-pillar precision breakdown, horizontal bars
- **Why we can measure this at all:** the fraud simulator, explained in three sentences. Ground truth exists because we planted it.
- **Where we are weakest**, stated openly: recall on price-creep detection (74%) — slow drifts under 2% per quarter fall below the detection floor on an 18-month window. *Naming your own weakness is the strongest credibility move available in a jury Q&A. Do not omit this.*
- **Full source list**, linked, in a bordered panel:
  - ACFE, *Occupational Fraud 2026: A Report to the Nations* — https://www.acfe.com/about-the-acfe/newsroom-for-media/press-releases/press-release-detail?s=occupational-fraud-2026-a-report-to-the-nations-pr
  - ACFE 2026 key findings summary — https://www.pbmares.com/key-findings-from-the-2026-acfe-report-to-the-nations/
  - APQC / IOFM duplicate-payment benchmarks — https://www.expensepoint.com/blog/duplicate-payments/
  - Maverick-spend benchmarks — https://www.stampli.com/resources/procurement-maverick-spend-benchmarks/
  - Nigrini, M. — *Benford's Law: Applications for Forensic Accounting, Auditing and Fraud Detection* (Wiley, 2012)
  - Liu, Ting & Zhou — *Isolation Forest*, ICDM 2008
  - Income Tax Act, India — **Section 43B(h)**, MSME 45-day payment rule

---

### 11 — IMPACT, WITH THE ARITHMETIC SHOWN

Three savings tiers. Each shows its formula, not just its total. Never claim a number you cannot derive on demand.

| Tier | Basis | Amount | Confidence |
|---|---|---|---|
| **Recoverable** | duplicate payments already made — 11 confirmed pairs | **₹8.4 L** | High |
| **Avoidable** | (unit price − peer median) × volume, across 34 flagged SKUs | **₹6.7 L** | Medium |
| **Negotiable** | vendor consolidation + missed early-payment discounts | **₹3.3 L** | Modelled |
| | | **₹18.4 L** | on ₹42.6 Cr analysed |

Below: **₹18.4 L on ₹42.6 Cr = 0.43% of spend recovered** — then the honest framing line:

> Conservative. Published benchmarks put duplicate payments alone at 0.8–2% of disbursements. We are claiming only what this dataset lets us prove.

Then the **realization pipeline**: Identified ₹18.4 L → Validated ₹11.2 L → Actioned ₹7.8 L → **Recovered ₹6.2 L**. Animated horizontal funnel, gold draining into green.

---

### 12 — COVERAGE MATRIX + ROADMAP + CLOSE

**Coverage matrix.** All eight expected-solution bullets from the problem statement, each mapped to what is built, plus a final row for what goes beyond the brief. This table exists so that no judge can name something you missed.

| Required | Delivered |
|---|---|
| Analyse invoices and procurement records | 5,847 invoices · 1,203 POs · 118 vendors · 18 months · 41 detectors |
| Detect duplicate invoices | 8 detectors — exact, fuzzy, transposition, cross-alias, cross-PO |
| Identify unusual purchases | 11 behavioural detectors + Isolation Forest |
| Compare vendor pricing | SKU-normalised benchmarking, peer median, creep regression |
| Detect abnormal spending patterns | Benford, threshold-hugging, off-hours, year-end dumping |
| Generate procurement risk scores | 5-pillar decomposable PRS, live weights, calibrated |
| Estimate potential savings | 3-tier model with confidence bands and shown arithmetic |
| Recommend better purchasing decisions | Per-finding action + drafted email, brief, memo |
| **Beyond the brief** | vendor–employee collusion graph · entity resolution · three-way match · India compliance layer · fraud simulator with ground truth · NL query with visible SQL · human-in-the-loop feedback · tamper-evident audit log · live rule injection |

**Roadmap**, honest about state: `Tonight` (backend live on the real pipeline) → `This week` (OCR ingestion, feedback learning loop) → `Production` (ERP connectors for Tally/SAP/Zoho, role-based access, tamper-evident audit log).

**Close.** Restate the thesis line. One CTA: `⚡ Inject a fraud and watch it get caught`.

---

## 8. THE `⚡ INJECT FRAUD` SEQUENCE — the closing move

Persistent button, top-right, always visible from any scroll position. When a judge clicks it, an anime.js timeline runs. **Total: 6.5 seconds.** Rehearse it.

```
0.0s  Radix Toast: "Incoming — INV-8842 · Sharma Traders · ₹1,24,500 · 24 Aug"
0.4s  Scroll smoothly to the dashboard. A new row slides into the invoice stream,
      gold left-border, pulsing.
1.2s  Status line cycles, mono, ~200ms each:
        "Resolving vendor identity…"
        "Normalising line items…"
        "Matching against 5,847 records…"
        "Running 41 detectors…"
3.6s  The row's border snaps to --color-signal. Panel border flashes once.
3.9s  Alert card slides in:
        !  DUPLICATE PAYMENT RISK — 96% match
           INV-8842 (₹1,24,500, 24 Aug)  <->  INV-8790 (₹1,24,500, 18 Aug)
           Same vendor · same 4 line items · 6 days apart · different invoice number
           Rule DUP-002 · Confidence 0.96 · ₹1,24,500 at risk
           [ View evidence ]   [ Draft recovery email ]
4.6s  Hero figure tickers ₹18,42,650 → ₹19,67,150.
      Findings counter 163 → 164. Both in gold.
6.5s  Settle. Alert stays on screen.
```

Must be **replayable** — clicking again resets cleanly and reruns. It will be clicked more than once.

---

## 9. THE EMBEDDED DASHBOARD — seven views

Client: **Vaigai Industries Ltd** (fictional). ₹42.6 Cr analysed · 5,847 invoices · 1,203 POs · 118 vendors · 18 months · 163 findings.

### 9.1 Command Center
Hero `₹18,42,650 recoverable` · four tiles (spend analysed, invoices scanned, findings, **₹6,21,400 already recovered**) · savings funnel · monthly spend line with anomaly markers punched on · **Top 5 findings by rupee value**, each row opening the evidence drawer · Procurement Health Index gauge (0–100, currently 62) · bottom strip: `Ingest → Resolve → Detect → Act`.

### 9.2 Findings Register
Radix `ScrollArea` table — severity · rule ID · vendor · ₹ at risk · confidence · status. Filter chips per pillar. Sortable columns.

**Click any row → Evidence Drawer** (Radix `Dialog`, slides from right, 620px). This is the most important interaction on the site:
- **Two invoices side by side.** Matching fields highlighted `--color-verify` at 15%, differing fields `--color-gold` at 15%. Actual document-like layout — vendor block, GSTIN, line items, totals.
- `Why this fired` — one plain sentence.
- **Score decomposition bar**: `+22 near-duplicate · +15 price above peer median · +9 off-hours filing`, segments in gold, each with a tooltip.
- `₹1,24,500 at risk` in mono, large.
- Actions: **Draft recovery email** · Mark false positive · Escalate to audit.

**Draft recovery email** opens a second Radix `Dialog` and **types the email out character by character** (anime.js, ~18ms/char, skippable on click). Real, sendable, professional copy referencing both invoice numbers, both dates, the amount and the line items. Four seconds, and it is the moment the jury believes the product is intelligent.

### 9.3 Price Intelligence
SKU selector → unit price across all vendors, bars with a median reference line, "34% above median" callout · price-creep chart (one vendor's line drifting above the peer median over 18 months, divergence shaded) · best-price counterfactual · contract-rate vs invoiced-rate table with delta column.

### 9.4 Vendor Integrity Graph
Force-directed network — vendors, employees, bank accounts, addresses as typed nodes. One cluster in `--color-signal`: **three vendors sharing bank account `HDFC ****4471`, one linked to an employee's registered address.** Click a node → vendor card (risk score, spend, first-PO date, invoice-sequence tell). Side panel: vendor scorecard — price index · on-time % · defect % · dispute rate · risk.
*If `d3-force` costs too much time: precompute node positions into a static array and animate edges only. It looks identical.*

### 9.5 Pattern Lab
- **Threshold-hugging histogram** — the ₹50,000 approval line, the spike beneath it, the cliff after. Build-in animation. The most persuasive object on the site.
- **Benford's Law** — expected vs actual leading-digit distribution, deviation bars in signal red, chi-square stated.
- PO-splitting case table: *"5 POs × ₹48,000 · Sharma Traders · 12–16 Mar · ₹2,40,000 routed around director approval"*
- Off-hours heatmap, day × hour, Sunday-02:00 burning.
- Fiscal year-end spend spike, March at 4.1× the monthly mean.

### 9.6 Risk Score Studio
Five Radix `Slider`s, one per pillar. **Moving any slider reshuffles the vendor leaderboard live** with Motion `layout` animations on the rows. Score decomposition for the selected vendor. Calibration panel: precision · recall · F1 · confusion matrix.
*Hand the laptop to a judge on this screen. It converts skeptics faster than any sentence.*

### 9.7 Ask LedgerLens
Chat input, three pre-loaded suggested questions. Canned answers, each returning: a one-line natural-language answer, **the generated SQL shown beneath it**, and a small chart. Showing the SQL is the trust mechanism — it proves nothing is being hallucinated.
Suggested questions: *"Which vendor overcharged us the most?"* · *"Show me every purchase just below the approval limit"* · *"What did we spend on IT hardware last quarter?"*

---

## 10. DATA

All data lives in `src/data/*.ts`, fully typed, no `any`. Realistic Indian names, GSTINs (valid format), HSN codes, dates spanning 18 months.

```
vendors.ts    118 vendors — name, GSTIN, PAN, bank (masked), address, phone,
                            onboardedAt, category, scorecard, riskScore
                            Include deliberate alias pairs: "Sharma Traders" /
                            "M/s Sharma Traders Pvt Ltd" / "SHARMA TRADERS PVT LTD"
invoices.ts   ~240 fully-modelled invoices (representing the stated 5,847;
                            never claim the array is the full corpus)
                            id, vendorId, poId, date, amount, tax, lineItems[],
                            submittedAt (timestamp — drives off-hours detection),
                            status, gstInvoiceNo
pos.ts        purchase orders with approvalThreshold and approver
findings.ts   163 findings conforming exactly to the Finding interface
skus.ts       normalised catalogue + the raw variant strings that map to each
graph.ts      nodes and edges for the collusion network
metrics.ts    every headline figure, each with a `derivation` string explaining
              the arithmetic — so a judge asking "where did that come from"
              gets an answer from the UI itself
citations.ts  every source: label, publisher, year, url
```

**Every planted fraud must be reachable from the UI.** If the copy claims 11 confirmed duplicate pairs, all 11 exist in `findings.ts` and open in the evidence drawer.

---

## 11. PRESENTER CONTROLS

Live demo, projector, no mouse fumbling:

- `1`–`9` — jump to section n (smooth scroll)
- `F` — trigger fraud injection
- `R` — replay all in-view number tickers
- `P` — toggle a speaker-notes overlay: current section, the line to say, the next action
- `Esc` — close any open dialog

Bind on `window`, ignore when focus is in an input.

---

## 12. ACCESSIBILITY & QUALITY

- Contrast ≥ 4.5:1 for body text. Verify `--color-paper` on `--color-ink` and every accent on its ground.
- Full keyboard navigation, visible focus rings in `--color-gold`.
- `prefers-reduced-motion` fully honoured.
- Semantic landmarks, `aria-label` on every icon-only control.
- Charts carry an accessible text summary.
- TypeScript strict. No `any`. No console errors or warnings.
- Works at 1280×720 (projector), 1920×1080, and 390px wide.
- **Every string on the site is final copy.** Nothing shipped as a placeholder.

---

## 13. BUILD ORDER — 3 hours, ship at each phase

Commit at every phase boundary. **If time runs out, the site must be presentable at whatever phase you reached** — so build in this order strictly, and never leave a phase half-finished before starting the next.

| Phase | Minutes | Deliverable |
|---|---|---|
| **1. Foundation** | 0–25 | Vite + TS + Tailwind v4. Design tokens. Fonts. Background layers 1–3. Top bar. `Ticker`, `Section`, `Cite`, `formatINR` primitives. **Deploy-ready shell.** |
| **2. Narrative** | 25–70 | Sections 01, 02, 04, 05, 11, 12. All copy final. Scroll reveals. This alone is already a presentable pitch — that is the point. |
| **3. Dashboard core** | 70–115 | Command Center + Findings Register + **Evidence Drawer** + draft-email modal. The single highest-value block on the site. |
| **4. Signature visuals** | 115–145 | Pattern Lab (threshold histogram first, Benford second), Risk Score Studio sliders, Price Intelligence. |
| **5. Inject Fraud** | 145–160 | The full 6.5s timeline. Test it five times. |
| **6. Depth if time** | 160–175 | Sticky pipeline (03), pinned horizontal pillars (07), vendor graph (09), Ask LedgerLens. |
| **7. Harden** | 175–180 | Presenter keys. Reduced-motion pass. Projector resolution check. Offline check. `npm run build`. |

**Cut in this order if behind:** vendor force-graph → Ask LedgerLens → pinned horizontal scroll → sticky pipeline. **Never cut:** the evidence drawer, the threshold histogram, the fraud injection, or the citations.

---

## 14. DEFINITION OF DONE

- [ ] `npm run build` clean. Zero TS errors, zero console warnings.
- [ ] Runs fully with the network disabled.
- [ ] `--color-signal-dim` set to `#7A3226`.
- [ ] Every statistic on the site links to a real source.
- [ ] Every rupee figure has a `derivation` in `metrics.ts`.
- [ ] Fraud injection runs cleanly five times in a row.
- [ ] Evidence drawer opens from every one of the top 5 findings.
- [ ] Risk sliders visibly reshuffle the leaderboard.
- [ ] Legible at 1280×720 on a projector.
- [ ] No purple. No glassmorphism. No emoji. No placeholder text.
- [ ] Reduced-motion mode loses no content.
- [ ] Synthetic-data badge visible.

---

## 15. HOW THIS LOSES — avoid all four

1. **It looks generated.** Purple gradients, centred feature-card grids, glass panels. Section 4 exists to prevent this. Obey it literally.
2. **It over-claims.** One number a judge can't trace and every other number becomes suspect. Show the arithmetic. State the 74% price-creep recall weakness out loud.
3. **It breaks on stage.** No network at demo time. Rehearse the injection. Have `npm run build` output ready as a fallback.
4. **It is all narrative and no product.** The dashboard must feel like a working tool — dense tables, real interactions, not a marketing mockup with charts.

**Build it.**
