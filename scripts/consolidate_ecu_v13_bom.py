"""Create the audited, executable ECU V1.3 Draft BOM through the portal API.

The Master BOM is the authority for ECU-level materials.  The Mini ECU BOM is
nested below the ECU V1P3 PCB line.  The separate 50x workbook is deliberately
not included: it is a batch/procurement reference with duplicate lines and two
unresolved variants.
"""
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path


CLIENT_PATH = Path(r"D:\CSD Software\Store\api-client\store_client.py")
MASTER_ID = "cmudq3ax8002ymf077jvkex7j"
PCB_ID = "cmudq39in002mmf07t8i9zvt5"
PCB_CODE = "IMP-2359D0FB6B43"
CONSOLIDATED_NAME = "ECU V1.3 Manufacturing BOM"
REVISION = "V1.3-CONSOLIDATED-1"


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
    pcb = client.request("GET", f"/api/v1/manufacturing/boms/{PCB_ID}")["bom"]
    master_version = master["versions"][0]
    pcb_version = pcb["versions"][0]
    if master_version["status"] != "DRAFT" or pcb_version["status"] != "DRAFT":
        raise RuntimeError("Source BOM revisions must remain Draft before consolidation")

    board_line = next((line for line in master_version["lines"] if line["item"]["code"] == PCB_CODE), None)
    if not board_line:
        raise RuntimeError("The Master BOM no longer contains the ECU V1P3 PCB line")
    if len(master_version["lines"]) != 28 or len(pcb_version["lines"]) != 57:
        raise RuntimeError("Unexpected source line count; stopping without creating a BOM")

    board_parent_key = f"MASTER:{board_line['sourceLineKey']}"
    lines = [request_line(line, source_key=f"MASTER:{line['sourceLineKey']}") for line in master_version["lines"]]
    lines.extend(
        request_line(line, source_key=f"PCB:{line['sourceLineKey']}", parent_key=board_parent_key)
        for line in pcb_version["lines"]
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
        idempotency_key="ecu-v1-3-consolidated-bom:v1",
    )
    created = client.request("GET", f"/api/v1/manufacturing/boms/{result['bom']['id']}")["bom"]
    version = created["versions"][0]
    if version["status"] != "DRAFT" or len(version["lines"]) != 85:
        raise RuntimeError("Consolidated BOM response failed its postcondition check")
    print(f"Created {CONSOLIDATED_NAME} as Draft with 85 hierarchical lines.")


if __name__ == "__main__":
    main()
