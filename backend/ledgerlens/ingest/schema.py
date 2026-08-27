"""
The canonical schema, and the deterministic knowledge used to map real files
onto it. Deterministic matching runs first and handles the overwhelming
majority; the LLM is only asked about columns this could not place.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

# ── canonical fields ──────────────────────────────────────────────────────
INVOICE_FIELDS = [
    "invoice_id", "vendor_id", "vendor_name", "po_id", "invoice_date",
    "submitted_at", "amount", "tax_amount", "currency", "gst_invoice_no",
    "status", "cost_centre", "approver_id",
]
PO_FIELDS = ["po_id", "vendor_id", "vendor_name", "po_date", "amount",
             "approver_id", "requisition_by", "ordered_qty"]
GRN_FIELDS = ["grn_id", "po_id", "grn_date", "received_qty", "ordered_qty"]
VENDOR_FIELDS = ["vendor_id", "name", "gstin", "pan", "bank_account", "address",
                 "phone", "email_domain", "onboarded_at", "msme_registered", "category"]
LINE_FIELDS = ["invoice_id", "raw_description", "qty", "unit", "unit_price",
               "hsn", "tax_rate", "amount"]

REQUIRED: dict[str, list[str]] = {
    "invoices": ["invoice_id", "amount"],
    "pos": ["po_id", "amount"],
    "grns": ["grn_id"],
    "vendors": ["vendor_id"],
    "lines": ["invoice_id", "qty", "unit_price"],
}

# ── known column aliases, lowercased and stripped of separators ───────────
ALIASES: dict[str, set[str]] = {
    "invoice_id": {"invoiceid", "invoiceno", "invoicenumber", "invno", "billno",
                   "billnumber", "docno", "documentno", "voucherno", "invoice"},
    "gst_invoice_no": {"gstinvoiceno", "gstinvoicenumber", "taxinvoiceno",
                       "gstinvno", "taxinvoicenumber"},
    "vendor_id": {"vendorid", "supplierid", "vendorcode", "suppliercode",
                  "partycode", "vendorno", "sapvendor"},
    "vendor_name": {"vendorname", "suppliername", "vendor", "supplier",
                    "partyname", "party", "payee", "beneficiary"},
    "po_id": {"poid", "pono", "ponumber", "purchaseorder", "purchaseorderno",
              "ponum", "orderno"},
    "grn_id": {"grnid", "grnno", "grnnumber", "goodsreceiptno", "receiptno",
               "gr", "mrn", "mrnno"},
    "invoice_date": {"invoicedate", "billdate", "date", "docdate", "documentdate",
                     "postingdate", "trandate", "transactiondate"},
    "po_date": {"podate", "orderdate", "purchaseorderdate"},
    "grn_date": {"grndate", "receiptdate", "receiveddate", "goodsreceiptdate"},
    "submitted_at": {"submittedat", "submitteddate", "createdat", "createdon",
                     "entrydate", "uploadedat", "timestamp", "entrytime"},
    "paid_at": {"paidat", "paymentdate", "paiddate", "clearingdate", "settleddate"},
    "amount": {"amount", "totalamount", "invoiceamount", "grossamount", "value",
               "totalvalue", "netamount", "amt", "total", "grandtotal", "poamount"},
    "tax_amount": {"taxamount", "gstamount", "tax", "gst", "vat", "taxvalue",
                   "cgstsgstigst", "totaltax"},
    "tax_rate": {"taxrate", "gstrate", "gstpercent", "taxpercent", "rateoftax"},
    "currency": {"currency", "curr", "ccy", "currencycode"},
    "status": {"status", "invoicestatus", "paymentstatus", "state", "docstatus"},
    "cost_centre": {"costcentre", "costcenter", "cc", "department", "dept",
                    "businessunit", "profitcentre"},
    "approver_id": {"approverid", "approver", "approvedby", "authorisedby",
                    "authorizedby", "sanctionedby"},
    "requisition_by": {"requisitionby", "requestedby", "indentby", "raisedby",
                       "createdby", "initiator"},
    "name": {"name", "vendorname", "suppliername", "partyname", "legalname"},
    "gstin": {"gstin", "gstno", "gstnumber", "gstinno", "taxid"},
    "pan": {"pan", "panno", "pannumber", "incometaxpan"},
    "bank_account": {"bankaccount", "accountno", "accountnumber", "bankac",
                     "acno", "payeeaccount", "bankaccountnumber"},
    "address": {"address", "vendoraddress", "registeredaddress", "addressline1",
                "billingaddress", "location"},
    "phone": {"phone", "mobile", "contactno", "phoneno", "contactnumber", "telephone"},
    "email_domain": {"email", "emailid", "emailaddress", "emaildomain", "mail"},
    "onboarded_at": {"onboardedat", "createddate", "vendorsince", "registeredon",
                     "onboardingdate", "vendorcreationdate"},
    "msme_registered": {"msme", "msmeregistered", "msmeflag", "udyam", "udyamno",
                        "ssi", "msmestatus"},
    "category": {"category", "spendcategory", "vendorcategory", "commodity",
                 "materialgroup", "class"},
    "raw_description": {"description", "itemdescription", "particulars", "item",
                        "material", "materialdescription", "narration", "lineitem",
                        "product", "service"},
    "qty": {"qty", "quantity", "units", "nos", "count", "billedqty"},
    "unit": {"unit", "uom", "unitofmeasure", "measure"},
    "unit_price": {"unitprice", "rate", "priceperunit", "unitrate", "price",
                   "basicrate", "rateperunit", "rateunit", "unitcost", "rateinr"},
    "hsn": {"hsn", "hsncode", "hsnsac", "sac", "saccode"},
    "ordered_qty": {"orderedqty", "poqty", "orderquantity", "qtyordered"},
    "received_qty": {"receivedqty", "grnqty", "qtyreceived", "acceptedqty",
                     "receivedquantity"},
    "employee_id": {"employeeid", "empid", "empcode", "employeecode", "staffid"},
}

# ── value-shape probes: when the header is useless, the data is not ───────
GSTIN_RE = re.compile(r"^\d{2}[A-Z]{5}\d{4}[A-Z]\d[A-Z][A-Z0-9]$")
PAN_RE = re.compile(r"^[A-Z]{5}\d{4}[A-Z]$")
HSN_RE = re.compile(r"^\d{4}(\d{2})?(\d{2})?$")
PHONE_RE = re.compile(r"^(\+?91[\s-]?)?[6-9]\d{9}$")
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[a-z]{2,}$", re.I)


@dataclass(frozen=True)
class ValueProbe:
    field: str
    pattern: re.Pattern[str]
    min_hit_rate: float = 0.6


VALUE_PROBES = [
    ValueProbe("gstin", GSTIN_RE, 0.5),
    ValueProbe("pan", PAN_RE, 0.5),
    ValueProbe("phone", PHONE_RE, 0.5),
    ValueProbe("email_domain", EMAIL_RE, 0.5),
    ValueProbe("hsn", HSN_RE, 0.7),
]


def normalise_header(raw: str) -> str:
    """'Invoice No.' -> 'invoiceno' — so alias matching is not defeated by
    punctuation, case or spacing."""
    return re.sub(r"[^a-z0-9]", "", str(raw).strip().lower())


_ALIAS_INDEX: dict[str, str] = {}
for _canon, _alts in ALIASES.items():
    _ALIAS_INDEX[normalise_header(_canon)] = _canon
    for _a in _alts:
        _ALIAS_INDEX.setdefault(normalise_header(_a), _canon)


def deterministic_match(header: str) -> str | None:
    """Exact canonical name, then known alias. No fuzziness here on purpose —
    a wrong confident mapping is worse than an unmapped column."""
    return _ALIAS_INDEX.get(normalise_header(header))
