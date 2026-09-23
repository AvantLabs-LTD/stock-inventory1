"""Create the executable TMD V1.3 Draft BOM through the portal API.

Only the TMD V1.3 Master BOM and Comm Card V1.3 BOM are combined.  Older TMD
revisions are deliberately excluded so no cross-version requirements can leak
into this manufacturing definition.
"""
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path


CLIENT_PATH = Path(r"D:\CSD Software\Store\api-client\store_client.py")
MASTER_ID = "cmudq3efz003smf07te427cn4"
COMM_CARD_ID = "cmudq36sh0024mf079q5z1r2u"
COMM_CARD_CODE = "IMP-48DD723457CD"
CONSOLIDATED_NAME = "TMD V1.3 Manufacturing BOM"
REVISION = "V1.3-CONSOLIDATED-1"
EXPECTED_MASTER_LINES = 15
EXPECTED_COMM_CARD_LINES = 23


def load_client():
    spec = importlib.util.spec_from_file_location("store_client", CLIENT_PATH)
    if not spec or not spec.loader:
        raise RuntimeError("Could not load the approved store API client")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module.StoreClient(module.ClientConfig.load(CLIENT_PATH.with_name(".env.local")))


def request_line(line: dict, *, source_key: str, parent_key: str | None = None) -> dict:
    return {
        "sourceLineKey": source_key,
        "parentSourceLineKey": parent_key,
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
    master = client.request("GET", f"/api/v1/manufacturing/boms/{MASTER_ID}")["bom"]
    comm_card = client.request("GET", f"/api/v1/manufacturing/boms/{COMM_CARD_ID}")["bom"]
    master_version = master["versions"][0]
    card_version = comm_card["versions"][0]
    if master_version["status"] != "DRAFT" or card_version["status"] != "DRAFT":
        raise RuntimeError("Source BOM revisions must remain Draft before consolidation")
    if len(master_version["lines"]) != EXPECTED_MASTER_LINES or len(card_version["lines"]) != EXPECTED_COMM_CARD_LINES:
        raise RuntimeError("Unexpected source line count; stopping without creating a BOM")
    card_line = next((line for line in master_version["lines"] if line["item"]["code"] == COMM_CARD_CODE), None)
    if not card_line:
        raise RuntimeError("The TMD V1.3 Master BOM no longer contains its V1.3 Comm Card")

    parent_key = f"MASTER:{card_line['sourceLineKey']}"
    lines = [request_line(line, source_key=f"MASTER:{line['sourceLineKey']}") for line in master_version["lines"]]
    lines.extend(
        request_line(line, source_key=f"COMM-CARD:{line['sourceLineKey']}", parent_key=parent_key)
        for line in card_version["lines"]
    )
    result = client.request(
        "POST",
        "/api/v1/manufacturing/boms",
        body={
            "itemId": master["item"]["id"],
            "projectTagId": master["projectTag"]["id"],
            "name": CONSOLIDATED_NAME,
            "revision": REVISION,
            "lines": lines,
        },
        idempotency_key="tmd-v1-3-consolidated-bom:v1",
    )
    created = client.request("GET", f"/api/v1/manufacturing/boms/{result['bom']['id']}")["bom"]
    version = created["versions"][0]
    if version["status"] != "DRAFT" or len(version["lines"]) != EXPECTED_MASTER_LINES + EXPECTED_COMM_CARD_LINES:
        raise RuntimeError("Consolidated BOM response failed its postcondition check")
    print(f"Created {CONSOLIDATED_NAME} as Draft with {len(version['lines'])} hierarchical lines.")


if __name__ == "__main__":
    main()
