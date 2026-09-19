#!/usr/bin/env python3
"""Import a Taobao order export through the local Flux API client."""

from __future__ import annotations

import argparse
import math
import sys
from pathlib import Path

import pandas as pd

CLIENT_DIR = Path(__file__).resolve().parents[2] / "api-client"
sys.path.insert(0, str(CLIENT_DIR))
from store_client import ClientConfig, PortalError, StoreClient  # noqa: E402


STATUS_MAP = {
    "Buyer Paid": "PAID",
    "Seller Shipped": "SUPPLIER_SHIPPED",
    "Transaction Completed": "CLOSED",
    "Transaction Closed": "CANCELLED",
}


def clean(value: object) -> str | None:
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return None
    text = str(value).strip()
    return text or None


def cny(value: object) -> str | None:
    text = clean(value)
    return text.replace("￥", "").replace(",", "") if text else None


def load_orders(path: Path) -> list[dict]:
    frame = pd.read_excel(path, dtype=str)
    order_column = "Order No."
    header_columns = [
        "Order No.", "Order Submission Time", "Order Status", "Store Name", "Amount Paid", "Shipping Fee",
        "Courier (currently only available for incomplete orders)",
        "Tracking No. (currently only available for incomplete orders)",
    ]
    grouped = frame[order_column].notna().cumsum()
    orders: list[dict] = []
    for _, rows in frame.groupby(grouped, sort=False):
        first = rows.iloc[0]
        order_no = clean(first[order_column])
        if not order_no:
            continue
        raw_status = clean(first["Order Status"]) or ""
        if raw_status not in STATUS_MAP:
            raise ValueError(f"Unsupported Taobao order status {raw_status!r} for order {order_no}")
        lines = []
        for _, row in rows.iterrows():
            description = clean(row["Product Name"])
            qty = clean(row["Quantity"])
            if not description or not qty:
                raise ValueError(f"Missing product description or quantity in order {order_no}")
            lines.append({
                "description": description,
                "productUrl": clean(row["Product Link"]),
                "variant": clean(row["Model / Variant"]),
                "quantity": qty,
                "unitPrice": cny(row["Item Amount"]),
            })
        orders.append({
            "source": "Taobao",
            "orderNo": order_no,
            "status": STATUS_MAP[raw_status],
            "sourceStatus": raw_status,
            "supplierName": clean(first["Store Name"]) or "Taobao seller",
            "submittedAt": clean(first["Order Submission Time"]),
            "currency": "CNY",
            "paidAmount": cny(first["Amount Paid"]),
            "shippingAmount": cny(first["Shipping Fee"]),
            "courierName": clean(first["Courier (currently only available for incomplete orders)"]),
            "trackingNumber": clean(first["Tracking No. (currently only available for incomplete orders)"]),
            "sourceFileName": path.name,
            "lines": lines,
        })
    return orders


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("file", type=Path)
    parser.add_argument("--apply", action="store_true", help="Write through the configured Flux API client")
    args = parser.parse_args()
    orders = load_orders(args.file)
    print({"mode": "apply" if args.apply else "dry-run", "orders": len(orders), "lines": sum(len(order["lines"]) for order in orders), "statuses": {status: sum(order["status"] == status for order in orders) for status in STATUS_MAP.values()}})
    if not args.apply:
        return 0
    client = StoreClient(ClientConfig.load(CLIENT_DIR / ".env.local"))
    existing = client.request("GET", "/api/v1/orders", query=[("view", "orders"), ("limit", "100"), ("source", "Taobao")])
    existing_keys = {row["orderNo"] for row in existing.get("orders", [])}
    created, skipped = [], []
    for order in orders:
        if order["orderNo"] in existing_keys:
            skipped.append(order["orderNo"])
            continue
        response = client.request("POST", "/api/v1/orders", body={"action": "order.create", "data": order})
        created.append(response["result"]["orderNo"])
    print({"created": len(created), "skippedExisting": len(skipped), "createdOrderNos": created, "skippedOrderNos": skipped})
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (PortalError, ValueError) as error:
        print(f"Error: {error}", file=sys.stderr)
        raise SystemExit(1)
