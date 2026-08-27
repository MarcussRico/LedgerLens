# LedgerLens

An X-ray machine for how a company spends.

A single-page, scroll-driven pitch site with a fully interactive product prototype
embedded inside it. No backend. Runs entirely offline — fonts are self-hosted and
there is not one network request after first load.

> **Humans review invoices one at a time. The problems only exist across thousands at once.**

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # typecheck + production bundle into dist/
npm run preview  # serve the built bundle
```

## Deploy to Vercel

The repo is Vercel-ready — `vercel.json` pins the Vite preset, the `dist` output
directory and an SPA rewrite.

```bash
npx vercel          # preview
npx vercel --prod   # production
```

Or import the repository in the Vercel dashboard; the framework is detected
automatically and no environment variables are required.

## Presenter controls

Bound on `window`, ignored while focus is in an input.

| Key | Action |
|---|---|
| `1`–`9` | jump to section *n* |
| `F` | trigger the fraud-injection sequence (6.5s, replayable) |
| `R` | replay every ticker currently on screen |
| `P` | toggle the speaker-notes overlay |
| `Esc` | close any open dialog |

## Where things live

```
src/data/        the whole dataset, fully typed, no `any`
  types.ts       Finding, Vendor, Invoice, PurchaseOrder, Sku, GraphNode
  vendors.ts     118 vendors, incl. the Sharma alias triple and the HDFC ****4471 ring
  invoices.ts    240 modelled invoices + the 11 confirmed duplicate pairs + PO splitting
  skus.ts        normalised catalogue and the raw variant strings that resolve to each
  findings.ts    163 findings conforming exactly to the Finding interface
  detectors.ts   the detector registry — every count on the site derives from it
  metrics.ts     every headline figure, each with a `derivation` string
  graph.ts       precomputed collusion-network layout
  citations.ts   every source: label, publisher, year, url
src/sections/    the twelve narrative sections
src/dashboard/   the seven working views + the evidence drawer
src/components/  background layers, top bar, injection rig, presenter notes, primitives
```

## The arithmetic

Every rupee figure resolves to `src/data/metrics.ts`, and the UI exposes it —
hover any dotted-underlined figure for its derivation.

```
Recoverable   ₹8,42,650   11 confirmed duplicate pairs, summed
Avoidable     ₹6,70,000   Σ (unit price − peer median) × volume, 34 SKU–vendor pairs
Negotiable    ₹3,30,000   consolidation ₹2,18,000 + missed discounts ₹1,12,000
              ─────────
Identified   ₹18,42,650   on ₹42.6 Cr analysed = 0.43% of spend
```

The confusion matrix partitions the corpus exactly:
`TP 134 + FP 8 + FN 16 + TN 5,689 = 5,847 invoices`, and `TP 134 + FN 16 = 150` planted frauds.
Precision 94.4% · recall 89.3% · F1 91.8%.

`moneyAtRisk` on a finding is *exposure under review*, which is deliberately a
different quantity from the savings model above. The findings register says so
in its footer.

## Notes on two numbers that differ from the brief

- **42 detectors, not 41.** The brief's headline says 41, but its own five pillar
  lists enumerate 42. The count is computed from the detector registry
  (`DETECTOR_COUNT`) so the footer, the architecture band and the coverage matrix
  can never drift from what the accordion actually contains.
- **Precision 94.4%, not 94.1%.** The brief's matrix (TP 141 / FP 9 / FN 17) does
  not reconcile with "150 planted frauds" and does not yield 94.1 / 89.3. The
  matrix here is internally consistent, sums to the corpus, and recall lands on
  the stated 89.3%.

## Constraints honoured

- Zero network requests at runtime — Inter, Instrument Serif and JetBrains Mono
  are subset and self-hosted in `public/fonts` (~110 KB total).
- No `Math.random()` anywhere. Every generated figure comes from a seeded
  mulberry32 PRNG, so the site is byte-identical on every reload.
- `prefers-reduced-motion: reduce` removes motion, never content: the
  constellation renders one static frame, the scroll wash holds, pinned scenes
  become stacked sections.
- Animation is restricted to `transform` and `opacity`.
- TypeScript strict, zero `any`, clean `npm run build`, no console output.
