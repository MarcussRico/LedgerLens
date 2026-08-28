# LedgerLens

**An X-ray machine for how a company spends.**

Pour in raw procurement records — invoices, purchase orders, goods-receipt
notes, vendor master data — and it reads all of them *together*, flags where
money is leaking, proves why with evidence you can hold up in a room, puts a
rupee figure on it, and drafts the next action.

> Humans review invoices one at a time. The problems only exist across thousands at once.

| | |
|---|---|
| **Live site** | https://ledgerlens-ten.vercel.app |
| **Live engine** | https://ledgerlens-api-production-8ed9.up.railway.app/api/health |
| **Try it on real data** | site → *Analyse your data* → *Load the sample dataset* |

---

## What it does

Four stages. **Ingest** takes whatever the ERP exported. **Resolve** works out
which suppliers are the same company and which line items are the same product.
**Detect** runs 42 detectors across five pillars. **Act** prices each finding
and drafts the letter.

| Pillar | Prefix | Detectors | Survive `zero_trust` |
|---|---|---|---|
| Duplicates & Overpayment | `DUP` | 8 | 1 |
| Price & Vendor Intelligence | `PRC` | 9 | 1 |
| Behavioural Anomalies | `BHV` | 11 | 3 |
| Vendor Integrity & Collusion | `VND` | 8 | 8 |
| Compliance & Process | `CMP` | 6 | 6 |

**No language model ever produces a number.** Rules and statistics compute; the
model maps column headers, explains findings in English and drafts
correspondence. That is enforced, not requested: a drafted letter containing a
figure absent from the evidence is discarded before it is returned.

## Measured, not asserted

A simulator plants 150 labelled frauds of known type into realistic spend and
the engine runs blind. One command reproduces every figure below:

```bash
cd backend && PYTHONPATH=. python -m ledgerlens.eval.run
```

```
TP 148   FP 17   FN 2   TN 1419        150 planted, seed 20260827

precision  89.7%        ROC-AUC   0.960
recall     98.7%        PR-AUC    0.899   (baseline 0.118)
F1         94.0%
```

Savings opportunities are scored separately — a consolidation opportunity is a
correct finding but not a fraud claim.

**Two caveats we state rather than bury.** Recall is an upper bound: the
simulator plants the kinds of fraud these detectors were built to find, so it
proves they work on their targets, not that they cover everything unimagined.
And Behavioural is our least precise pillar at 87.0%.

## Scale

| Invoices | Ingest + resolve | Detect | Total | Findings |
|---|---|---|---|---|
| 1,121 | 0.06s | 1.11s | **1.17s** | 109 |
| 20,121 | 0.22s | 4.95s | **5.17s** | 953 |
| 50,121 | 0.48s | 12.00s | **12.48s** | 2,468 |

About 4,000 documents a second, near-linear.

## Two design decisions worth reading

**A shared bank account is not an identity merge.** GSTIN and PAN are legal
registrations and merge into one entity. A bank account shared by
*differently-named* vendors is the collusion signal — merging those would erase
the finding the pillar exists to produce.

**Corroboration is not more money.** When three detectors fire on one invoice
pair, the savings model counts the event once at the highest single assessment.
Summing them inflated the headline threefold.

## Run it

```bash
# site
cd ledgerlens && npm install && npm run dev

# engine
cd backend && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
PYTHONPATH=. .venv/bin/python -m uvicorn ledgerlens.api.main:app --reload
PYTHONPATH=. .venv/bin/python -m pytest tests/ -q     # 37 tests
```

`GROQ_API_KEY` is optional. Without it, column mapping falls back to the
deterministic dictionary — which already places 48 of the sample's 49 columns —
and drafting is disabled.

## Layout

```
ledgerlens/   the site — 12 narrative sections, 8 dashboard views
backend/      the engine — ingest · resolve · detect · score · savings · eval · api
samples/      six messy CSVs plus the ground truth of what was planted in them
deck/         the pitch deck, generated as native PowerPoint vector shapes
pitch/        the presenter script
```

## Honest state

The demo dataset is **synthetic and labelled as such throughout**; no finding
describes a real person or business. Findings are claims requiring review, never
verdicts. Open-ended natural language is not wired up — the three questions in
*Ask LedgerLens* are prepared, and the page says so. The feedback loop that
reweights a detector from analyst labels is designed, not built.
