"""Create the executable FireConsole V2.1 Draft BOM through the portal API.

The assembly BOM is the parent definition and contains one Main PCB.  The PCB
component BOM is nested beneath that line.  Both source definitions stay Draft
as auditable evidence and this script never activates a version or posts stock.
"""
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path


CLIENT_PATH = Path(r"D:\CSD Software\Store\api-client\store_client.py")
ASSEMBLY_ID = "cmudq328m0014mf0702mvr4w8"
PCB_ID = "cmudq38iw002gmf07ylp42u1u"
PCB_CODE = "CMP-FIRECONSOLE-V2-1-MAIN-PCB"
CONSOLIDATED_NAME = "FireConsole V2.1 Manufacturing BOM"
REVISION = "V2.1-CONSOLIDATED-1"
EXPECTED_ASSEMBLY_LINES = 54
EXPECTED_PCB_LINES = 79


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
    assembly = client.request("GET", f"/api/v1/manufacturing/boms/{ASSEMBLY_ID}")["bom"]
    pcb = client.request("GET", f"/api/v1/manufacturing/boms/{PCB_ID}")["bom"]
    assembly_version = assembly["versions"][0]
    pcb_version = pcb["versions"][0]
    if assembly_version["status"] != "DRAFT" or pcb_version["status"] != "DRAFT":
        raise RuntimeError("Source BOM revisions must remain Draft before consolidation")
    if len(assembly_version["lines"]) != EXPECTED_ASSEMBLY_LINES or len(pcb_version["lines"]) != EXPECTED_PCB_LINES:
        raise RuntimeError("Unexpected source line count; stopping without creating a BOM")

    pcb_line = next((line for line in assembly_version["lines"] if line["item"]["code"] == PCB_CODE), None)
    if not pcb_line:
        raise RuntimeError("The assembly BOM no longer contains the FireConsole Main PCB line")

    parent_key = f"ASSEMBLY:{pcb_line['sourceLineKey']}"
    lines = [request_line(line, source_key=f"ASSEMBLY:{line['sourceLineKey']}") for line in assembly_version["lines"]]
    lines.extend(
        request_line(line, source_key=f"PCB:{line['sourceLineKey']}", parent_key=parent_key)
        for line in pcb_version["lines"]
    )
    result = client.request(
        "POST",
        "/api/v1/manufacturing/boms",
        body={
            "itemId": assembly["item"]["id"],
            "projectTagId": assembly["projectTag"]["id"],
            "name": CONSOLIDATED_NAME,
            "revision": REVISION,
            "lines": lines,
        },
        idempotency_key="fireconsole-v2-1-consolidated-bom:v1",
    )
    created = client.request("GET", f"/api/v1/manufacturing/boms/{result['bom']['id']}")["bom"]
    version = created["versions"][0]
    if version["status"] != "DRAFT" or len(version["lines"]) != EXPECTED_ASSEMBLY_LINES + EXPECTED_PCB_LINES:
        raise RuntimeError("Consolidated BOM response failed its postcondition check")
    print(f"Created {CONSOLIDATED_NAME} as Draft with {len(version['lines'])} hierarchical lines.")


if __name__ == "__main__":
    main()
