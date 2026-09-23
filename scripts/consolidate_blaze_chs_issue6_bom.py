"""Create the source-faithful Blaze CHS Issue 6 Draft BOM through the portal API.

This source is a flat harness-material BOM.  It has no referenced manufacturable
subassembly, so the final production definition preserves its 61 lines directly.
"""
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path


CLIENT_PATH = Path(r"D:\CSD Software\Store\api-client\store_client.py")
SOURCE_ID = "cmudq3bku0034mf07epd2sc5m"
CONSOLIDATED_NAME = "Blaze CHS Issue 6 Manufacturing BOM"
REVISION = "ISSUE-6-CONSOLIDATED-1"
EXPECTED_LINES = 61


def load_client():
    spec = importlib.util.spec_from_file_location("store_client", CLIENT_PATH)
    if not spec or not spec.loader:
        raise RuntimeError("Could not load the approved store API client")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module.StoreClient(module.ClientConfig.load(CLIENT_PATH.with_name(".env.local")))


def request_line(line: dict) -> dict:
    return {
        "sourceLineKey": f"SOURCE:{line['sourceLineKey']}",
        "parentSourceLineKey": None,
        "itemId": line["item"]["id"],
        "quantity": str(line["quantity"]),
        "unit": line.get("unit"),
        "scrapAllowance": str(line["scrapAllowance"]) if line.get("scrapAllowance") is not None else None,
        "consumptionRouteStepId": line.get("consumptionRouteStepId"),
        "notes": line.get("notes"),
        "sortOrder": line["sortOrder"],
    }


def main() -> None:
    client = load_client()
    source = client.request("GET", f"/api/v1/manufacturing/boms/{SOURCE_ID}")["bom"]
    source_version = source["versions"][0]
    if source_version["status"] != "DRAFT":
        raise RuntimeError("The source BOM revision must remain Draft before consolidation")
    if len(source_version["lines"]) != EXPECTED_LINES:
        raise RuntimeError("Unexpected source line count; stopping without creating a BOM")
    if any(line.get("parentLine") for line in source_version["lines"]):
        raise RuntimeError("The source is no longer flat; manual hierarchy review is required")

    result = client.request(
        "POST",
        "/api/v1/manufacturing/boms",
        body={
            "itemId": source["item"]["id"],
            "projectTagId": source["projectTag"]["id"],
            "name": CONSOLIDATED_NAME,
            "revision": REVISION,
            "lines": [request_line(line) for line in source_version["lines"]],
        },
        idempotency_key="blaze-chs-issue6-consolidated-bom:v1",
    )
    created = client.request("GET", f"/api/v1/manufacturing/boms/{result['bom']['id']}")["bom"]
    version = created["versions"][0]
    if version["status"] != "DRAFT" or len(version["lines"]) != EXPECTED_LINES or any(line.get("parentLine") for line in version["lines"]):
        raise RuntimeError("Consolidated BOM response failed its postcondition check")
    print(f"Created {CONSOLIDATED_NAME} as Draft with {len(version['lines'])} direct lines.")


if __name__ == "__main__":
    main()
