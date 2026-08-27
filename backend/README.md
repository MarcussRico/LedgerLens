# LedgerLens — engine

Procurement forensics. Rules and statistics compute; the language model only
maps schemas, explains and drafts. **No figure in any response is produced by an
LLM.**

## Run

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
PYTHONPATH=. .venv/bin/python -m uvicorn ledgerlens.api.main:app --reload
```

## Prove the accuracy claim

```bash
PYTHONPATH=. .venv/bin/python -m ledgerlens.eval.run
```

Generates a seeded corpus with 150 labelled frauds, runs all 42 detectors blind,
and scores them. Latest measured run:

```
TP 148   FP 16   FN 2   TN 1405
precision 90.2%   recall 98.7%   F1 94.3%
```

Savings opportunities (consolidation, best-price counterfactual, tail spend,
lead-time cost) are scored **separately**. They are correct, useful findings but
they are not fraud claims, and mixing them into a fraud confusion matrix would
describe neither the engine nor the metric accurately.

The corpus deliberately includes vendors that share attributes for innocent
reasons — fifteen on a free-mail domain, eight in one industrial estate, three
filed by the same accountant. None is a ring. Without them the collusion pillar
is never actually tested, and its precision reads 100% because nothing in the
data can trip it.

### An honest caveat on recall

The simulator plants frauds of types the detectors were written to find, so
recall measured this way is an upper bound. It demonstrates the detectors work
on the patterns they target; it does not prove coverage of patterns nobody
thought of. Precision is the more trustworthy half of this measurement.

## Scale

Near-linear, measured end to end on one Railway container:

| Invoices | POs | Ingest + resolve | Detect | Total | Findings |
|---|---|---|---|---|---|
| 1,121 | 1,016 | 0.06s | 1.11s | **1.17s** | 109 |
| 5,121 | 5,017 | 0.09s | 1.65s | **1.74s** | 232 |
| 20,121 | 20,017 | 0.22s | 4.95s | **5.17s** | 953 |
| 50,121 | 50,016 | 0.48s | 12.00s | **12.48s** | 2,468 |

About 4,000 documents a second. The engine is not the bottleneck; getting the
data out of the ERP is.

## Finding zero — the Data Integrity Score

Before interpreting anything in a ledger, grade whether the ledger behaves like
real accounting data: Benford first and second digit, round-number rate,
terminal-digit uniformity, filing-time entropy, identifier integrity. Each is a
mathematical invariant that holds whatever the business does, so none of it
needs to trust the client's history — which is also why they all survive
`zero_trust`.

The bundled sample scores **72/100**. That is not a flattering number and it is
not meant to be: the planted frauds park amounts just under ₹50,000, which bends
the first-digit distribution exactly as the check says it does.

A grade is withheld rather than guessed when the file is too small to test.

## Audit trail

Every finding is hashed over its own content, the hashes are chained in a fixed
order, and the run reduces to a single root. Re-run the same files and the root
is identical; change one rupee and it is not. The corpus fingerprint identifies
the input by row counts and column sums without retaining any of it.

## Layout

```
ingest/    readers · profiler · deterministic-first schema mapper · validation
resolve/   vendor entity resolution · SKU normalisation
detect/    42 detectors, one file per pillar, registered by decorator
score/     decomposable PRS, every point traceable to a rule_id
savings/   three tiers, deduplicated by economic event
eval/      fraud simulator + accuracy harness
api/       FastAPI, camelCase at the edge only
```

## Detectors

| Pillar | Prefix | Count | Baseline-free |
|---|---|---|---|
| Duplicates & Overpayment | `DUP` | 8 | 1 |
| Price & Vendor Intelligence | `PRC` | 9 | 1 |
| Behavioural Anomalies | `BHV` | 11 | 3 |
| Vendor Integrity & Collusion | `VND` | 8 | 8 |
| Compliance & Process | `CMP` | 6 | 6 |

`zero_trust=True` keeps only the baseline-free set, for when the client's own
history may itself be forged.

## Two design decisions worth knowing

**A shared bank account is not an identity merge.** GSTIN and PAN are legal
registrations and merge into one entity. A bank account shared by
*differently-named* vendors is the VND-001 collusion signal — merging those
would erase the finding the pillar exists to produce.

**Corroboration is not more money.** When three detectors fire on one invoice
pair, the savings model counts the event once at the highest single assessment.
Summing them inflated the headline by 3×.

## Deployed

**https://ledgerlens-api-production-8ed9.up.railway.app**

```bash
curl https://ledgerlens-api-production-8ed9.up.railway.app/api/health
```

The API cannot run on Vercel Functions — pandas, scikit-learn and DuckDB total
~358 MB against a 250 MB limit. It runs on Railway from the `Dockerfile` here.
`render.yaml` is also committed if you would rather move it.

```bash
railway up --service ledgerlens-api
```

`GROQ_API_KEY` is set as a Railway variable, never in the repo. The service runs
without it — schema mapping falls back to deterministic matching, and drafting
returns 503 rather than guessing.

### Routes

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | detector count, LLM availability |
| GET | `/api/detectors` | the full registry, by pillar |
| POST | `/api/analyse` | upload CSV/XLSX → findings, savings, risk scores |
| POST | `/api/explain` | rephrase a finding for an audience (language only) |
| POST | `/api/draft` | draft recovery email / audit memo (language only) |
