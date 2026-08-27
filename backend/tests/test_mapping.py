"""Column mapping regressions.

Every case here cost real detections when it broke, so each one names what it
took down.
"""
from __future__ import annotations

import pandas as pd
import pytest

from ledgerlens.config import AnalysisConfig
from ledgerlens.context import _empty_like
from ledgerlens.ingest.mapper import map_columns
from ledgerlens.ingest.schema import deterministic_match
from tests.conftest import ctx_with


def _map(headers: list[str], kind: str) -> dict[str, str]:
    df = pd.DataFrame({h: ["x"] for h in headers})
    return {m.source: m.target for m in map_columns(df, kind, use_llm=False).mappings}


def test_rate_is_the_unit_price_not_the_tax_rate():
    """Claiming 'rate' for tax_rate emptied unit_price and took the price
    pillar from 23 findings to 1."""
    assert deterministic_match("Rate") == "unit_price"
    assert _map(["Rate", "Qty", "Doc Ref"], "lines")["Rate"] == "unit_price"


def test_employee_file_maps_without_a_model():
    """The kind was missing from KIND_FIELDS entirely, so nothing could map,
    the LLM was never consulted, and VND-003 had no data to run on."""
    got = _map(["Emp Code", "Employee Name", "Residential Address",
                "Mobile", "Bank A/c", "Dept"], "employees")
    assert got == {
        "Emp Code": "employee_id", "Employee Name": "name",
        "Residential Address": "address", "Mobile": "phone",
        "Bank A/c": "bank_account", "Dept": "department",
    }


def test_supplier_name_is_the_vendors_own_name():
    """On a vendor master it is the record's name, not a reference to another
    vendor. Sending it to vendor_name left the frame with no name column and
    crashed both ring detectors."""
    assert _map(["Vendor Code", "Supplier Name"], "vendors")["Supplier Name"] == "name"


def test_dept_means_cost_centre_on_an_invoice_but_department_on_an_HR_file():
    assert _map(["Doc Ref", "Dept"], "invoices").get("Dept") == "cost_centre"
    assert _map(["Emp Code", "Dept"], "employees").get("Dept") == "department"


def test_common_erp_headers_need_no_model():
    got = _map(["Doc Ref", "Txn Dt", "Gross Val", "Tax Amt", "Payment Dt",
                "Booked Under", "Sanctioned By", "Party Code"], "invoices")
    assert got == {
        "Doc Ref": "invoice_id", "Txn Dt": "invoice_date", "Gross Val": "amount",
        "Tax Amt": "tax_amount", "Payment Dt": "paid_at",
        "Booked Under": "cost_centre", "Sanctioned By": "approver_id",
        "Party Code": "vendor_id",
    }


def test_vendor_name_degrades_instead_of_raising():
    """A missing optional column should change a finding's wording, never take
    the detector down."""
    ctx = ctx_with(vendors=pd.DataFrame({"vendor_id": ["V-1"]}))
    assert ctx.vendor_name("V-1") == "V-1"
    ctx2 = ctx_with(vendors=_empty_like("vendors"))
    assert ctx2.vendor_name("V-9") == "V-9"


def test_nothing_is_guessed_into_a_field_it_does_not_fit():
    got = _map(["Doc Ref", "Totally Unknown Column"], "invoices")
    assert "Totally Unknown Column" not in got
