"""
Procurement fraud simulator.

Generates realistic spend and plants a known number of labelled frauds into it.
This is the only reason we can quote a precision figure instead of asserting
quality: ground truth exists because we put it there.

Everything is seeded. The same seed produces the same corpus and the same
ground truth, so an accuracy number is reproducible by anyone who runs it.
"""
from __future__ import annotations

import random
from dataclasses import dataclass, field
from datetime import date, timedelta

import pandas as pd

# fraud type -> the rules that ought to fire on it
FRAUD_RULES: dict[str, set[str]] = {
    "duplicate_resend": {"DUP-002", "DUP-004", "DUP-007"},
    "exact_duplicate": {"DUP-001", "DUP-002"},
    "transposed_number": {"DUP-004", "DUP-002"},
    "cross_alias_duplicate": {"DUP-007", "DUP-002"},
    "po_splitting": {"BHV-001", "BHV-002"},
    "price_gouging": {"PRC-001", "PRC-004"},
    "price_creep": {"PRC-003"},
    "vendor_ring": {"VND-001"},
    "vendor_employee": {"VND-003"},
    "three_way_mismatch": {"CMP-001"},
    "msme_breach": {"CMP-004"},
    "duplicate_gst_no": {"CMP-002"},
    "self_approval": {"CMP-006"},
    "off_hours": {"BHV-005"},
}

FIRST = ["Sharma", "Venkat", "Iyer", "Rajan", "Balaji", "Krishnan", "Meenakshi",
         "Ganesh", "Anand", "Nithya", "Pandian", "Murugan", "Selvam", "Kannan",
         "Ramesh", "Kalyani", "Thangam", "Vetri", "Sundar", "Palani", "Nataraj",
         "Ilango", "Mahesh", "Bhaskar", "Yamuna", "Karthik", "Suriya", "Aruna"]
SUFFIX = ["Traders", "Enterprises", "Industries", "& Sons", "Agencies", "Supplies",
          "Systems", "Works", "Distributors", "Associates", "Technologies", "Packaging"]
CATEGORIES = ["IT Hardware", "Office Supplies", "Facilities", "Logistics",
              "Raw Materials", "Professional Services", "Packaging", "Electricals"]
ITEMS = [
    ("A4 Copier Paper 75 GSM", "ream", "4802", 192.0,
     ["A4 PAPER 75GSM RM", "Copier paper A-4 (75 gsm) 500sh", "Paper, A4, white, 75gsm"]),
    ("24in LED Monitor FHD IPS", "nos", "8528", 9180.0,
     ["MONITOR 24 FHD IPS", "24 inch LED display 1080p IPS", "Screen 24in IPS FHD"]),
    ("Business Laptop i5 16GB 512GB", "nos", "8471", 62400.0,
     ["LAPTOP i5 16GB 512 SSD", "Notebook computer intel i5", "Laptop corporate i5/16/512"]),
    ("Corrugated Box 5-ply", "nos", "4819", 39.5,
     ["CORRUGATED BOX 5PLY", "5 ply carton box", "BOX 5-PLY LARGE"]),
    ("LED Panel Light 36W", "nos", "9405", 1090.0,
     ["LED PANEL 36W 2X2", "Panel light LED 36 watt", "LIGHT-LED-36W"]),
    ("Copper Cable 4 sq mm FRLS", "m", "8544", 73.2,
     ["CABLE CU 4SQMM FRLS", "Copper wire 4 sq.mm FRLS", "CU-CBL-4SQMM"]),
    ("Housekeeping Service", "month", "9985", 84000.0,
     ["SITE MAINTENANCE MONTHLY", "Housekeeping services plant", "Facility upkeep monthly"]),
    ("MS Angle 50x50x6mm", "kg", "7216", 58.2,
     ["MS ANGLE 50X50X6", "Mild steel angle 50mm", "ANGLE-MS-50"]),
]
# Approvers and requisitioners must be disjoint pools. Drawing both from one
# small list made ~16% of the "clean" baseline self-approved, so CMP-006
# correctly fired everywhere and the measured precision collapsed. The
# detector was right; the simulated data was not clean.
CITY_TAGS = ["Madurai", "Coimbatore", "Chennai", "Salem", "Trichy", "Erode",
             "Hosur", "Karur", "Tiruppur", "Sivakasi"]

APPROVERS = [f"E-1{i:02d} {n}" for i, n in enumerate(
    ["R. Muthukumar", "S. Anitha", "K. Prakash", "D. Lakshmi", "V. Sundaram",
     "A. Fathima", "P. Raghavan", "N. Devika", "M. Sathish", "J. Kavitha",
     "T. Arulmozhi", "B. Senthil", "G. Priya", "H. Vasanth", "L. Meena",
     "C. Dinesh", "F. Nazreen", "Q. Ravi"])]
REQUISITIONERS = [f"E-2{i:02d} {n}" for i, n in enumerate(
    ["A. Bose", "B. Chitra", "C. Elango", "D. Fatima", "E. Gopal", "F. Hema",
     "G. Iyappan", "H. Jaya", "I. Karan", "J. Latha", "K. Mohan", "L. Nisha",
     "M. Om", "N. Pooja", "O. Qadir", "P. Rekha", "Q. Suresh", "R. Tara",
     "S. Uma", "T. Vikram", "U. Wasim", "V. Xavier", "W. Yamini", "X. Zubin"])]


@dataclass
class PlantedFraud:
    fraud_id: str
    fraud_type: str
    expected_rules: set[str]
    invoice_ids: list[str] = field(default_factory=list)
    po_ids: list[str] = field(default_factory=list)
    vendor_ids: list[str] = field(default_factory=list)
    note: str = ""


@dataclass
class SyntheticCorpus:
    invoices: pd.DataFrame
    pos: pd.DataFrame
    grns: pd.DataFrame
    vendors: pd.DataFrame
    lines: pd.DataFrame
    employees: pd.DataFrame
    ground_truth: list[PlantedFraud]

    def ground_truth_frame(self) -> pd.DataFrame:
        return pd.DataFrame([
            {"fraud_id": f.fraud_id, "fraud_type": f.fraud_type,
             "expected_rules": "|".join(sorted(f.expected_rules)),
             "invoice_ids": "|".join(f.invoice_ids),
             "po_ids": "|".join(f.po_ids),
             "vendor_ids": "|".join(f.vendor_ids),
             "note": f.note}
            for f in self.ground_truth
        ])


def _gstin(rng: random.Random, pan: str) -> str:
    letters = "ABCDEFGHJKLMNPQRSTUVWXYZ"
    return f"33{pan}{rng.randint(1, 9)}Z{rng.choice(letters)}"


def _pan(rng: random.Random, tag: str) -> str:
    letters = "ABCDEFGHJKLMNPQRSTUVWXYZ"
    core = (tag.upper() + "XXX")[:3]
    return f"A{core}{rng.choice(letters)}{rng.randint(1000, 9999)}{rng.choice(letters)}"


def generate(
    *, seed: int = 20260827, n_vendors: int = 118, n_invoices: int = 1400,
    target_frauds: int = 150, start: date = date(2025, 3, 1), months: int = 18,
) -> SyntheticCorpus:
    rng = random.Random(seed)
    end = start + timedelta(days=months * 30)
    span = (end - start).days

    def rdate() -> date:
        return start + timedelta(days=rng.randint(0, span))

    # ── vendors ───────────────────────────────────────────────────────────
    vendors: list[dict] = []
    seen_names: set[str] = set()
    for i in range(n_vendors):
        # The name pool cycles, so a plain modulo produced genuinely identical
        # trade names on legally distinct vendors (different GSTINs, so
        # resolution correctly refused to merge them). VND-001 then flagged
        # them on their derived email domain — defensible behaviour, but not a
        # planted fraud, so it read as a false positive and depressed the
        # measured precision of the whole pillar.
        name = f"{FIRST[i % len(FIRST)]} {SUFFIX[(i * 5 + 3) % len(SUFFIX)]}"
        if name in seen_names:
            name = f"{name} ({CITY_TAGS[i % len(CITY_TAGS)]})"
        suffix_n = 2
        while name in seen_names:
            name = f"{FIRST[i % len(FIRST)]} {SUFFIX[(i * 5 + 3) % len(SUFFIX)]} {suffix_n}"
            suffix_n += 1
        seen_names.add(name)
        pan = _pan(rng, name)
        vendors.append({
            "vendor_id": f"V-{i + 1:03d}", "name": name,
            "gstin": _gstin(rng, pan), "pan": pan,
            # unique by construction: accidental collisions across 148 vendors
            # made VND-001 fire on random pairs and looked like over-detection
            "bank_account": f"{rng.choice(['HDFC', 'ICICI', 'AXIS', 'SBIN', 'KVBL'])}-{100000 + i}",
            "address": f"{rng.randint(2, 188)}/{rng.randint(1, 9)} "
                       f"{rng.choice(['Bypass Road', 'GST Road', 'Mill Street', 'Industrial Estate'])}",
            "phone": f"+91 9{rng.randint(100000000, 999999999)}",
            # derived from the vendor id as well as the name: truncating the
            # name alone collapsed "Venkat Distributors" and "Venkat
            # Distributors (Erode)" onto one domain
            "email_domain": ("".join(c for c in name.lower() if c.isalnum())[:14]
                             + str(i) + ".co.in"),
            "onboarded_at": (start - timedelta(days=rng.randint(30, 900))).isoformat(),
            "msme_registered": rng.random() < 0.35,
            "category": CATEGORIES[i % len(CATEGORIES)],
        })

    employees = [{"employee_id": a.split(" ", 1)[0], "name": a.split(" ", 1)[1],
                  "address": f"{rng.randint(2, 90)}/{rng.randint(1, 9)} Anna Nagar",
                  "phone": f"+91 9{rng.randint(100000000, 999999999)}",
                  "bank_account": f"HDFC-{rng.randint(1000, 9999)}",
                  "department": rng.choice(CATEGORIES)}
                 for i, a in enumerate(APPROVERS)]

    invoices: list[dict] = []
    pos: list[dict] = []
    grns: list[dict] = []
    lines: list[dict] = []
    truth: list[PlantedFraud] = []
    counter = {"inv": 0, "po": 0, "grn": 0}

    def new_invoice(vendor_id: str, when: date, amount: float, *,
                    po_id: str | None = None, hour: int | None = None,
                    number: str | None = None, paid_offset: int | None = 20,
                    status: str = "paid") -> dict:
        counter["inv"] += 1
        iid = f"INV-{3000 + counter['inv'] * 7}"
        tax = round(amount * 0.18 / 1.18, 2)
        h = hour if hour is not None else rng.randint(9, 19)
        rec = {
            "invoice_id": iid, "vendor_id": vendor_id, "po_id": po_id,
            "invoice_date": when.isoformat(),
            "submitted_at": f"{when.isoformat()}T{h:02d}:{rng.randint(0, 59):02d}:00",
            "amount": round(amount, 2), "tax_amount": tax, "currency": "INR",
            "gst_invoice_no": number or f"{vendor_id[-3:]}/{when.year}/{counter['inv']}",
            "status": status,
            "cost_centre": rng.choice(CATEGORIES),
            "approver_id": rng.choice(APPROVERS),
            "paid_at": (when + timedelta(days=paid_offset)).isoformat() if paid_offset else None,
        }
        invoices.append(rec)
        return rec

    def new_po(vendor_id: str, when: date, amount: float, *,
               approver: str | None = None, requisition: str | None = None,
               ordered: int = 100, received: int | None = None) -> dict:
        counter["po"] += 1
        pid = f"PO-{2000 + counter['po'] * 3}"
        pos.append({"po_id": pid, "vendor_id": vendor_id, "po_date": when.isoformat(),
                    "amount": round(amount, 2),
                    "approver_id": approver or rng.choice(APPROVERS),
                    "requisition_by": requisition or rng.choice(REQUISITIONERS),
                    "ordered_qty": ordered})
        counter["grn"] += 1
        grns.append({"grn_id": f"GRN-{5000 + counter['grn']}", "po_id": pid,
                     "grn_date": (when + timedelta(days=rng.randint(3, 20))).isoformat(),
                     "ordered_qty": ordered,
                     "received_qty": received if received is not None else ordered})
        return pos[-1]

    def add_lines(invoice_id: str, vendor_id: str, when: date,
                  item_idx: int | None = None, qty: int | None = None,
                  unit_price: float | None = None,
                  variant_index: int | None = None) -> None:
        idx = item_idx if item_idx is not None else rng.randrange(len(ITEMS))
        canonical, unit, hsn, base, variants = ITEMS[idx]
        lines.append({
            "invoice_id": invoice_id, "vendor_id": vendor_id,
            "raw_description": (variants[variant_index] if variant_index is not None
                                else rng.choice(variants)),
            "qty": qty or rng.randint(5, 200), "unit": unit,
            # a tight clean spread: ±3% is ordinary market variation, and wider
            # noise trips the 10% peer-median rule on genuinely clean lines
            "unit_price": round(unit_price if unit_price is not None
                                else base * rng.uniform(0.97, 1.03), 2),
            "hsn": hsn, "tax_rate": 0.18, "invoice_date": when.isoformat(),
        })

    # ── clean baseline ────────────────────────────────────────────────────
    for _ in range(n_invoices):
        v = rng.choice(vendors)["vendor_id"]
        when = rdate()
        amount = round(rng.uniform(4_000, 6_00_000), 2)
        po = new_po(v, when - timedelta(days=rng.randint(3, 25)), amount)
        rec = new_invoice(v, when, amount, po_id=po["po_id"])
        add_lines(rec["invoice_id"], v, when)

    # ── planted frauds ────────────────────────────────────────────────────
    fid = 0

    def next_id(kind: str) -> str:
        nonlocal fid
        fid += 1
        return f"F{fid:03d}-{kind}"

    plan = {
        "duplicate_resend": 26, "transposed_number": 14, "exact_duplicate": 10,
        "cross_alias_duplicate": 8, "po_splitting": 16, "price_gouging": 18,
        "price_creep": 8, "vendor_ring": 6, "vendor_employee": 4,
        "three_way_mismatch": 14, "msme_breach": 12, "duplicate_gst_no": 6,
        "self_approval": 6, "off_hours": 2,
    }
    # trim or pad to hit the target exactly
    while sum(plan.values()) > target_frauds:
        k = max(plan, key=lambda x: plan[x])
        plan[k] -= 1
    while sum(plan.values()) < target_frauds:
        plan["duplicate_resend"] += 1

    # 1. duplicate re-send: same amount, new number, days later
    for _ in range(plan["duplicate_resend"]):
        v = rng.choice(vendors)["vendor_id"]
        when = rdate()
        amount = round(rng.uniform(20_000, 3_00_000), 2)
        a = new_invoice(v, when, amount)
        b = new_invoice(v, when + timedelta(days=rng.randint(2, 6)), amount)
        add_lines(a["invoice_id"], v, when)
        add_lines(b["invoice_id"], v, when)
        truth.append(PlantedFraud(next_id("dup"), "duplicate_resend",
                                  FRAUD_RULES["duplicate_resend"],
                                  invoice_ids=[a["invoice_id"], b["invoice_id"]],
                                  vendor_ids=[v], note="same amount, new number, days apart"))

    # 2. transposed invoice number
    for _ in range(plan["transposed_number"]):
        v = rng.choice(vendors)["vendor_id"]
        when = rdate()
        amount = round(rng.uniform(20_000, 2_00_000), 2)
        # the number must contain a 1 to transpose, or replace() is a no-op and
        # the "transposed" pair is really an exact duplicate
        base_no = f"INV-1{rng.randint(100, 999)}"
        a = new_invoice(v, when, amount, number=base_no)
        b = new_invoice(v, when + timedelta(days=rng.randint(20, 90)), amount,
                        number=base_no.replace("1", "I", 1))
        add_lines(a["invoice_id"], v, when)
        add_lines(b["invoice_id"], v, when)
        truth.append(PlantedFraud(next_id("trn"), "transposed_number",
                                  FRAUD_RULES["transposed_number"],
                                  invoice_ids=[a["invoice_id"], b["invoice_id"]],
                                  vendor_ids=[v], note="one-character keying slip"))

    # 3. exact duplicate
    for _ in range(plan["exact_duplicate"]):
        v = rng.choice(vendors)["vendor_id"]
        when = rdate()
        amount = round(rng.uniform(15_000, 1_50_000), 2)
        no = f"EX-{rng.randint(10000, 99999)}"
        a = new_invoice(v, when, amount, number=no)
        b = new_invoice(v, when + timedelta(days=1), amount, number=no)
        add_lines(a["invoice_id"], v, when)
        add_lines(b["invoice_id"], v, when)
        truth.append(PlantedFraud(next_id("exd"), "exact_duplicate",
                                  FRAUD_RULES["exact_duplicate"],
                                  invoice_ids=[a["invoice_id"], b["invoice_id"]],
                                  vendor_ids=[v], note="identical number and amount"))

    # 4. cross-alias duplicate — needs an alias pair to exist
    alias_pairs: list[tuple[str, str]] = []
    for i in range(plan["cross_alias_duplicate"]):
        base = vendors[(i * 7) % len(vendors)]
        alias_id = f"V-A{i + 1:02d}"
        vendors.append({**base, "vendor_id": alias_id,
                        "name": f"M/s {base['name']} Pvt Ltd"})
        alias_pairs.append((base["vendor_id"], alias_id))
        when = rdate()
        amount = round(rng.uniform(30_000, 2_50_000), 2)
        a = new_invoice(base["vendor_id"], when, amount)
        b = new_invoice(alias_id, when + timedelta(days=rng.randint(2, 10)), amount)
        add_lines(a["invoice_id"], base["vendor_id"], when)
        add_lines(b["invoice_id"], alias_id, when)
        truth.append(PlantedFraud(next_id("alias"), "cross_alias_duplicate",
                                  FRAUD_RULES["cross_alias_duplicate"],
                                  invoice_ids=[a["invoice_id"], b["invoice_id"]],
                                  vendor_ids=[base["vendor_id"], alias_id],
                                  note="same bill under two trading names"))

    # 5. PO splitting under the ₹50,000 threshold
    for _ in range(plan["po_splitting"]):
        v = rng.choice(vendors)["vendor_id"]
        when = rdate()
        n = rng.randint(3, 5)
        made = [new_po(v, when + timedelta(days=i), rng.uniform(46_000, 49_800))
                for i in range(n)]
        truth.append(PlantedFraud(next_id("split"), "po_splitting",
                                  FRAUD_RULES["po_splitting"],
                                  po_ids=[p["po_id"] for p in made], vendor_ids=[v],
                                  note=f"{n} orders just under the threshold in one week"))

    # 6. price gouging on a resolved SKU
    for _ in range(plan["price_gouging"]):
        v = rng.choice(vendors)["vendor_id"]
        idx = rng.randrange(len(ITEMS))
        base = ITEMS[idx][3]
        when = rdate()
        amount = base * 1.5 * 60
        rec = new_invoice(v, when, amount)
        add_lines(rec["invoice_id"], v, when, item_idx=idx, qty=60,
                  unit_price=base * rng.uniform(1.35, 1.8))
        truth.append(PlantedFraud(next_id("price"), "price_gouging",
                                  FRAUD_RULES["price_gouging"],
                                  invoice_ids=[rec["invoice_id"]], vendor_ids=[v],
                                  note="unit price far above peer median"))

    # 7. price creep — a slow quarterly squeeze
    # Dedicated vendors: a creep planted onto a vendor that also has clean
    # invoices for the same item blurs the quarterly median, and the regression
    # then cannot see the trend it is supposed to find.
    for ci in range(plan["price_creep"]):
        v = f"V-C{ci:02d}"
        vendors.append({
            "vendor_id": v, "name": f"{FIRST[(ci * 11) % len(FIRST)]} Supply Co",
            "gstin": _gstin(rng, _pan(rng, f"C{ci}")), "pan": _pan(rng, f"C{ci}"),
            "bank_account": f"SBIN-{900000 + ci}",
            "address": f"{40 + ci}/2 Industrial Estate",
            "phone": f"+91 9{rng.randint(100000000, 999999999)}",
            "email_domain": f"creep{ci}.co.in", "onboarded_at": start.isoformat(),
            "msme_registered": False, "category": "Raw Materials",
        })
        idx = ci % len(ITEMS)
        base = ITEMS[idx][3]
        for q in range(6):
            # fixed offset: a random one collapsed quarters together and the
            # regression then had too few points to fit
            when = start + timedelta(days=q * 91 + 20)
            price = base * (1.06 ** q)
            rec = new_invoice(v, when, price * 40)
            # one fixed variant string, so all six resolve to the same SKU
            add_lines(rec["invoice_id"], v, when, item_idx=idx, qty=40,
                      unit_price=price, variant_index=0)
        truth.append(PlantedFraud(next_id("creep"), "price_creep",
                                  FRAUD_RULES["price_creep"], vendor_ids=[v],
                                  note="5% per quarter over six quarters"))

    # 8. vendor ring on a shared bank account
    for i in range(plan["vendor_ring"]):
        acct = f"HDFC-RING{i:02d}"
        members = []
        for k in range(3):
            vid = f"V-R{i}{k}"
            vendors.append({
                "vendor_id": vid, "name": f"{FIRST[(i * 3 + k) % len(FIRST)]} "
                                          f"{SUFFIX[(i + k) % len(SUFFIX)]}",
                "gstin": _gstin(rng, _pan(rng, f"R{i}{k}")), "pan": _pan(rng, f"R{i}{k}"),
                "bank_account": acct,
                "address": f"{17 + i}/3 Anna Nagar 4th Street",
                "phone": f"+91 9{rng.randint(100000000, 999999999)}",
                "email_domain": f"ring{i}.co.in",
                "onboarded_at": start.isoformat(), "msme_registered": False,
                "category": "Facilities",
            })
            members.append(vid)
            when = rdate()
            amt = rng.uniform(50_000, 4_00_000)
            rec = new_invoice(vid, when, amt)
            add_lines(rec["invoice_id"], vid, when)
        truth.append(PlantedFraud(next_id("ring"), "vendor_ring", FRAUD_RULES["vendor_ring"],
                                  vendor_ids=members,
                                  note=f"3 vendors on bank account {acct}"))

    # 9. vendor sharing an address with an employee
    for i in range(plan["vendor_employee"]):
        emp = employees[i % len(employees)]
        vid = f"V-E{i:02d}"
        vendors.append({
            "vendor_id": vid, "name": f"{FIRST[(i * 5) % len(FIRST)]} Services",
            "gstin": _gstin(rng, _pan(rng, f"E{i}")), "pan": _pan(rng, f"E{i}"),
            "bank_account": f"AXIS-{rng.randint(1000, 9999)}",
            "address": emp["address"],                      # the tell
            "phone": f"+91 9{rng.randint(100000000, 999999999)}",
            "email_domain": f"emp{i}.co.in", "onboarded_at": start.isoformat(),
            "msme_registered": False, "category": "Professional Services",
        })
        when = rdate()
        rec = new_invoice(vid, when, rng.uniform(80_000, 5_00_000))
        add_lines(rec["invoice_id"], vid, when)
        truth.append(PlantedFraud(next_id("vemp"), "vendor_employee",
                                  FRAUD_RULES["vendor_employee"], vendor_ids=[vid],
                                  note=f"shares address with {emp['employee_id']}"))

    # 10. three-way mismatch — short delivery, full billing
    for _ in range(plan["three_way_mismatch"]):
        v = rng.choice(vendors)["vendor_id"]
        when = rdate()
        amount = round(rng.uniform(80_000, 6_00_000), 2)
        po = new_po(v, when - timedelta(days=10), amount, ordered=200,
                    received=rng.randint(150, 185))
        rec = new_invoice(v, when, amount, po_id=po["po_id"])
        add_lines(rec["invoice_id"], v, when)
        truth.append(PlantedFraud(next_id("3way"), "three_way_mismatch",
                                  FRAUD_RULES["three_way_mismatch"],
                                  invoice_ids=[rec["invoice_id"]], po_ids=[po["po_id"]],
                                  vendor_ids=[v], note="GRN short of PO, invoice full"))

    # 11. MSME 45-day breach
    msme_vendors = [v["vendor_id"] for v in vendors if v.get("msme_registered")]
    for _ in range(plan["msme_breach"]):
        v = rng.choice(msme_vendors) if msme_vendors else rng.choice(vendors)["vendor_id"]
        when = rdate()
        rec = new_invoice(v, when, rng.uniform(50_000, 4_00_000),
                          paid_offset=rng.randint(60, 130))
        add_lines(rec["invoice_id"], v, when)
        truth.append(PlantedFraud(next_id("msme"), "msme_breach", FRAUD_RULES["msme_breach"],
                                  invoice_ids=[rec["invoice_id"]], vendor_ids=[v],
                                  note="paid beyond 45 days to an MSME vendor"))

    # 12. duplicate GST invoice number within one FY
    for _ in range(plan["duplicate_gst_no"]):
        v = rng.choice(vendors)["vendor_id"]
        when = date(2025, 6, rng.randint(1, 28))
        no = f"GST-{rng.randint(1000, 9999)}"
        a = new_invoice(v, when, rng.uniform(30_000, 2_00_000), number=no)
        b = new_invoice(v, when + timedelta(days=120), rng.uniform(30_000, 2_00_000), number=no)
        add_lines(a["invoice_id"], v, when)
        add_lines(b["invoice_id"], v, when)
        truth.append(PlantedFraud(next_id("gst"), "duplicate_gst_no",
                                  FRAUD_RULES["duplicate_gst_no"],
                                  invoice_ids=[a["invoice_id"], b["invoice_id"]],
                                  vendor_ids=[v], note="same number twice in one FY"))

    # 13. self-approval
    for _ in range(plan["self_approval"]):
        v = rng.choice(vendors)["vendor_id"]
        who = rng.choice(APPROVERS)
        when = rdate()
        po = new_po(v, when, rng.uniform(1_00_000, 8_00_000), approver=who, requisition=who)
        truth.append(PlantedFraud(next_id("sod"), "self_approval", FRAUD_RULES["self_approval"],
                                  po_ids=[po["po_id"]], vendor_ids=[v],
                                  note="same person raised and approved"))

    # 14. off-hours filing concentrated on one vendor
    for _ in range(plan["off_hours"]):
        v = rng.choice(vendors)["vendor_id"]
        ids = []
        for _ in range(14):
            when = rdate()
            rec = new_invoice(v, when, rng.uniform(20_000, 2_00_000),
                              hour=rng.choice([0, 1, 2, 3, 23]))
            add_lines(rec["invoice_id"], v, when)
            ids.append(rec["invoice_id"])
        truth.append(PlantedFraud(next_id("hours"), "off_hours", FRAUD_RULES["off_hours"],
                                  invoice_ids=ids, vendor_ids=[v],
                                  note="filings concentrated between 23:00 and 04:00"))

    return SyntheticCorpus(
        invoices=pd.DataFrame(invoices), pos=pd.DataFrame(pos),
        grns=pd.DataFrame(grns), vendors=pd.DataFrame(vendors),
        lines=pd.DataFrame(lines), employees=pd.DataFrame(employees),
        ground_truth=truth,
    )
