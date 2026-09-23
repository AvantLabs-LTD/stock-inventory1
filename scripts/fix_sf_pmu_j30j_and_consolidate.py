"""Audited correction of the Power Nexus V3 connector mapping and BOM shape.

The script makes no stock movement. It corrects only Draft BOM links, retains
the source Draft BOMs as evidence, and creates one consolidated Draft assembly
BOM whose source keys make MASTER and PCB rows distinguishable.
"""
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path


CLIENT_PATH = Path(r"D:\CSD Software\Store\api-client\store_client.py")
MASTER_NAME = "Source BOM — Master_BOM_SF_PMU_V3.xlsx"
PCB_NAME = "Source BOM — SF_PMU_V3.xlsx"
CONSOLIDATED_NAME = "Power Nexus V3 Manufacturing BOM"
PCB_CODE = "IMP-3BD8E28781C1"
CONNECTORS = {
    "R0009-STORE:IMP-C687CA6A3410": "J30J-51ZKWP7-J",
    "R0010-STORE:IMP-C687CA6A3410": "J30J-37ZKWP7-J",
    "R0011-STORE:IMP-C687CA6A3410": "J30J-15ZKWP7-J",
}


def load_client():
    spec = importlib.util.spec_from_file_location("store_client", CLIENT_PATH)
    if not spec or not spec.loader:
        raise RuntimeError("Could not load the approved store API client")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module.StoreClient(module.ClientConfig.load(CLIENT_PATH.with_name(".env.local")))


def all_items(client):
    result, page = [], 1
    while True:
        response = client.request("GET", "/api/v1/items", query=[("page", str(page)), ("pageSize", "200")])
        result.extend(response["items"])
        if page >= response["pagination"]["totalPages"]:
            return result
        page += 1


def request_line(line, *, source_key=None, parent_key=None, item_id=None):
    return {
        "sourceLineKey": source_key or line["sourceLineKey"],
        "parentSourceLineKey": parent_key if parent_key is not None else (line.get("parentLine") or {}).get("sourceLineKey"),
        "itemId": item_id or line["item"]["id"],
        "quantity": str(line["quantity"]),
        "unit": line.get("unit"),
        "scrapAllowance": str(line["scrapAllowance"]) if line.get("scrapAllowance") is not None else None,
        "consumptionRouteStepId": line.get("consumptionRouteStepId"),
        "notes": line.get("notes"),
        "sortOrder": line["sortOrder"],
    }


def main():
    client = load_client()
    definitions = client.request("GET", "/api/v1/manufacturing/definitions")["boms"]
    master_summary = next(row for row in definitions if row["name"] == MASTER_NAME)
    pcb_summary = next(row for row in definitions if row["name"] == PCB_NAME)
    master = client.request("GET", f"/api/v1/manufacturing/boms/{master_summary['id']}")["bom"]
    pcb = client.request("GET", f"/api/v1/manufacturing/boms/{pcb_summary['id']}")["bom"]
    master_version, pcb_version = master["versions"][0], pcb["versions"][0]
    if master_version["status"] != "DRAFT" or pcb_version["status"] != "DRAFT":
        raise RuntimeError("The source BOMs must still be Draft to apply this correction")

    by_title = {item["title"]: item for item in all_items(client)}
    if not all(title in by_title for title in CONNECTORS.values()):
        raise RuntimeError("One or more distinct J30J catalogue Items is missing")

    # Correct catalogue metadata only; physical balances stay on their existing
    # Item records (51: 0, 37: 18, 15: 0 at the time of this correction).
    for title, item in by_title.items():
        if title not in CONNECTORS.values():
            continue
        desired = {"specification": title}
        if title == "J30J-51ZKWP7-J":
            desired["remarks"] = "Reconciled as the J30J-51ZKWP7-J variant; no longer represents the 37- or 15-pin variants."
        client.request("PATCH", f"/api/v1/items/{item['id']}", body=desired, idempotency_key=f"j30j-catalogue-reconcile:{item['code']}")

    corrected_master = []
    for line in master_version["lines"]:
        target_title = CONNECTORS.get(line["sourceLineKey"])
        corrected_master.append(request_line(line, item_id=by_title[target_title]["id"] if target_title else None))
    client.request("PUT", f"/api/v1/manufacturing/bom-versions/{master_version['id']}", body={"lines": corrected_master}, idempotency_key="sf-pmu-master-j30j-draft-correction:v1")

    # The only active-candidate definition is the combined assembly BOM. The
    # two imported source BOMs remain Draft source evidence.
    master_after = client.request("GET", f"/api/v1/manufacturing/boms/{master_summary['id']}")["bom"]["versions"][0]
    board_line = next(line for line in master_after["lines"] if line["item"]["code"] == PCB_CODE)
    consolidated_lines = [request_line(line, source_key=f"MASTER:{line['sourceLineKey']}", parent_key=None) for line in master_after["lines"]]
    consolidated_lines.extend(request_line(line, source_key=f"PCB:{line['sourceLineKey']}", parent_key=f"MASTER:{board_line['sourceLineKey']}") for line in pcb_version["lines"])
    client.request("POST", "/api/v1/manufacturing/boms", body={
        "itemId": master_after["bom"]["item"]["id"] if "bom" in master_after else master["item"]["id"],
        "projectTagId": master["projectTag"]["id"],
        "name": CONSOLIDATED_NAME,
        "revision": "V3-CONSOLIDATED-1",
        "lines": consolidated_lines,
    }, idempotency_key="power-nexus-v3-consolidated-bom:v1")
    print("Corrected three J30J links and created the Power Nexus V3 consolidated Draft BOM.")


if __name__ == "__main__":
    main()
