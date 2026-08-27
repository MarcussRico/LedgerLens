# Sample dataset

Six CSVs of realistic Indian procurement data, plus the ground truth that says
what was planted in them. Drop the six into **Analyse your data** on
[ledgerlens-ten.vercel.app](https://ledgerlens-ten.vercel.app) and the live
engine will read them.

| File | Rows | What it is |
|---|---|---|
| `invoices.csv` | 1,008 | invoice header — amount, dates, status, approver |
| `pos.csv` | 915 | purchase orders with approver and requisitioner |
| `grns.csv` | 915 | goods-receipt notes, ordered vs received quantity |
| `vendors.csv` | 160 | vendor master — GSTIN, PAN, bank, address, MSME flag |
| `lines.csv` | 1,008 | invoice line items with free-text descriptions |
| `employees.csv` | 18 | employee master, for vendor↔employee links |
| `ground_truth.csv` | 34 | **what was planted**, and which rules should fire |

## Deliberately awkward

None of it is in our schema, because real exports never are:

- Headers are what an ERP calls them — `Doc Ref`, `Party Code`, `Txn Dt`,
  `Gross Val`, `Sanctioned By`, `Indent Raised By`, `MRN No`.
- Dates are `DD/MM/YYYY`. A parser defaulting to American order silently shifts
  a third of the corpus, so the pipeline has to infer the convention.
- Money arrives as `₹1,79,050.36` — lakh-crore grouping, currency symbol.
- Item descriptions are free text: `A4 PAPER 75GSM RM`,
  `Copier paper A-4 (75 gsm) 500sh` and `Paper, A4, white, 75gsm` are one item,
  and no price comparison is valid until they are.
- Vendor aliases and a shared-bank-account ring are present in the master.

## What the engine does with it

```
1,008 invoices · 915 POs · 1,008 lines · 160 vendor records
  ↓
160 vendor records  →  158 resolved entities
 69 raw descriptions →   54 catalogue items
  0 rows rejected
  ↓
42 detectors · 90 findings · 5.2 seconds
```

| Pillar | Findings |
|---|---|
| Behavioural Anomalies | 27 |
| Price & Vendor Intelligence | 23 |
| Duplicates & Overpayment | 21 |
| Compliance & Process | 14 |
| Vendor Integrity & Collusion | 5 |

| Tier | Amount | Confidence |
|---|---|---|
| Recoverable | ₹27,59,093 | High — already paid twice |
| Avoidable | ₹1,35,05,625 | Medium — priced above peer median |
| Negotiable | ₹71,02,772 | Modelled — projection, not a claim |
| **Total** | **₹2,33,67,490** | 7.86% of ₹29.7 Cr analysed |

That total **trips the plausibility guard**, and the response says so:

> This total is 7.9% of analysed spend, well above the 5% we would treat as
> plausible. Quote the measured tiers and treat the rest as an upper bound.

That is deliberate. A savings figure this large is a signal that the modelled
tier is doing too much work, and the engine says so rather than letting the
headline stand. It is a demonstration file with frauds planted at roughly 3% of
invoices — several times what a real book carries.

## Checking the engine rather than trusting it

`ground_truth.csv` lists all 34 planted frauds with the rule ids that should
fire on each. Compare it against the findings and mark our homework.

## Regenerating

```bash
cd backend
python -m ledgerlens.eval.export_sample --out ../samples \
    --seed 424242 --invoices 900 --frauds 34
```

Seeded, so the files are byte-identical every time.
