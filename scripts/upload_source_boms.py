"""Create source-faithful Draft manufacturing BOMs through the approved API client.

This loader intentionally creates one BOM definition per workbook/sheet.  It
does not merge alternate views, project revisions, or repeated component uses.
Every posted line is linked to an existing central Item; the source row is
preserved by its stable key and the complete request is captured in AuditLog.

Use without --apply to produce a validation-only plan.  Live writes require
--apply and use deterministic idempotency keys.
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import re
import sys
from collections import defaultdict
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "docs" / "bom-assimilation-data.json"
CLIENT_PATH = Path(r"D:\CSD Software\Store\api-client\store_client.py")
SOURCE_PREFIX = "bom-assimilation:v1:"

PROJECTS = {
    "blaze": {"name": "Blaze PMU / Rectifier", "code": "BLAZE"},
    "blaze_chs": {"name": "Blaze CHS", "code": "BLAZE-CHS"},
    "ecu": {"name": "ECU", "code": "ECU"},
    "fireconsole": {"name": "FireConsole", "code": "FIRECONSOLE"},
    "sf_pmu": {"name": "SF PMU / Power Nexus", "code": "SF-PMU"},
    "sf_chs": {"name": "SF CHS", "code": "SF-CHS"},
    "tmd": {"name": "TMD", "code": "TMD"},
}

# Existing output Items are explicit store codes.  Missing finished/subassembly
# outputs are created once with a deterministic source key; these are BOM hosts,
# not copied project-specific component masters.
OUTPUTS: dict[str, dict[str, str]] = {
    "Bill of Materials-BL_PMU_V2P4.xlsx": {"project": "blaze", "code": "IMP-7D0D1BF0B8B4"},
    "Bill of Materials-Blaze_Rectifier_V2P4.xlsx": {"project": "blaze", "code": "IMP-C2DD8F1E7B3D"},
    "Bill of Materials-Controller_Board_V1P3.xlsx": {"project": "blaze", "code": "IMP-688CBD9B6044"},
    "Master_BOM_Blaze_PMU_Rect.xlsx": {"project": "blaze", "root": "BLAZE-PMU-RECT-ASSEMBLY"},
    "MasterBOM_BL_CHS_Issue6.xlsx": {"project": "blaze_chs", "root": "BLAZE-CHS-ISSUE6-ASSEMBLY"},
    "Bill of Materials-Mini_ECU_V1P3.xlsx": {"project": "ecu", "code": "IMP-2359D0FB6B43"},
    "Master BOM_ECU V1P3.xlsx": {"project": "ecu", "code": "IMP-C7F947B5DA93"},
    "ECU BOM 50x date 27th June.xlsx": {"project": "ecu", "code": "IMP-C7F947B5DA93"},
    "J30J-Connector.xlsx": {"project": "ecu", "code": "IMP-C7F947B5DA93"},
    "Bill of Materials-FC_V2P1_Qty65 (from lisa).xlsx": {"project": "fireconsole", "code": "CMP-FIRECONSOLE-V2-1-MAIN-PCB"},
    "BOM_New.xlsx": {"project": "fireconsole", "root": "FIRECONSOLE-V2P1-ASSEMBLY"},
    "SF_PMU_V3.xlsx": {"project": "sf_pmu", "code": "IMP-3BD8E28781C1"},
    "Master_BOM_SF_PMU_V3.xlsx": {"project": "sf_pmu", "root": "POWER-NEXUS-V3-ASSEMBLY"},
    "MasterBOM_SF_XTCable.xlsx": {"project": "sf_chs", "root": "SF-CHS-XT-CABLE-ASSEMBLY"},
    "Bill of Materials-COMM_CARD.xlsx": {"project": "tmd", "root": "TMD-COMM-CARD-V1P1"},
    "Bill of Materials-COMM_CARD_V1P2.xlsx": {"project": "tmd", "root": "TMD-COMM-CARD-V1P2"},
    "BOM_New.xlsx#TMD": {"project": "tmd", "root": "TMD-V1P2-ASSEMBLY"},
    "Bill of Materials-COMM_CARD_V1P3.xlsx": {"project": "tmd", "code": "IMP-48DD723457CD"},
    "Master_BOM_TMD_V1P3.xlsx": {"project": "tmd", "root": "TMD-HDGNSS-V1P3-ASSEMBLY"},
}

ROOT_ITEMS = {
    "BLAZE-PMU-RECT-ASSEMBLY": {"title": "Blaze PMU / Rectifier Assembly", "discipline": "MECHANICAL", "category": "Locally Manufactured Mechanical Parts"},
    "BLAZE-CHS-ISSUE6-ASSEMBLY": {"title": "Blaze CHS Issue 6 Assembly", "discipline": "MECHANICAL", "category": "Locally Manufactured Mechanical Parts"},
    "FIRECONSOLE-V2P1-ASSEMBLY": {"title": "FireConsole V2.1 Assembly", "discipline": "MECHANICAL", "category": "Locally Manufactured Mechanical Parts"},
    "POWER-NEXUS-V3-ASSEMBLY": {"title": "Power Nexus V3 Assembly", "discipline": "MECHANICAL", "category": "Locally Manufactured Mechanical Parts"},
    "SF-CHS-XT-CABLE-ASSEMBLY": {"title": "SF CHS XT Cable Assembly", "discipline": "MECHANICAL", "category": "Locally Manufactured Mechanical Parts"},
    "TMD-COMM-CARD-V1P1": {"title": "TMD COMM Card V1.1", "discipline": "ELECTRONICS", "category": "PCBs"},
    "TMD-COMM-CARD-V1P2": {"title": "TMD COMM Card V1.2", "discipline": "ELECTRONICS", "category": "PCBs"},
    "TMD-V1P2-ASSEMBLY": {"title": "TMD V1.2 Assembly", "discipline": "MECHANICAL", "category": "Locally Manufactured Mechanical Parts"},
    "TMD-HDGNSS-V1P3-ASSEMBLY": {"title": "TMD HDGNSS V1.3 Assembly", "discipline": "MECHANICAL", "category": "Locally Manufactured Mechanical Parts"},
}

# This workbook is a connector quotation/quantity sheet, not a per-unit BOM:
# its own "Qty-Req (Per set)" column contains a batch quantity of 300 while
# the ECU master BOM states one per set.  Posting it as a BOM would create a
# false 300x material requirement, so it remains an auditable source reference
# for the later alternate/procurement-linking phase.
REFERENCE_ONLY_SOURCES = {"J30J-Connector.xlsx"}


def load_client():
    spec = importlib.util.spec_from_file_location("store_client", CLIENT_PATH)
    if not spec or not spec.loader:
        raise RuntimeError("Could not load the approved store API client")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module.StoreClient(module.ClientConfig.load(CLIENT_PATH.with_name(".env.local")))


def clean(value: object) -> str:
    return str(value or "").strip()


def safe_key(value: str) -> str:
    return re.sub(r"[^A-Za-z0-9._:-]+", "-", value).strip("-")


def decimals(value: object) -> Decimal:
    try:
        result = Decimal(clean(value).replace(",", ""))
    except InvalidOperation as error:
        raise ValueError(f"Invalid quantity {value!r}") from error
    if result <= 0:
        raise ValueError(f"Quantity must be positive, received {value!r}")
    return result


def decimal_text(value: Decimal) -> str:
    return format(value.normalize(), "f")


def quantity_for(record: dict[str, Any]) -> Decimal:
    override = clean(record.get("quantityPerSetOverride"))
    if override:
        return decimals(override)
    fields = record["rawFields"]
    file_name = Path(record["file"]).name
    if file_name == "Bill of Materials-FC_V2P1_Qty65 (from lisa).xlsx":
        return decimals(fields["Qty"]) / Decimal(65)
    if file_name == "ECU BOM 50x date 27th June.xlsx":
        return decimals(fields["Total Qty For 50x"]) / Decimal(50)
    for key in ("Quantity (per set)", "Quantity", "Qty/Set", "Qty pet Set", "Qty/ Set", "Qty-Req (Per set)"):
        if clean(fields.get(key)):
            return decimals(fields[key])
    raise ValueError(f"No per-set quantity found for {file_name} row {record['row']}")


def source_id(record: dict[str, Any]) -> str:
    return f"{record['file']}|{record['sheet']}|{record['row']}|{record['canonicalKey']}"


def file_key(record: dict[str, Any]) -> str:
    name = Path(record["file"]).name
    # FireConsole and TMD both contain a BOM_New.xlsx, so their folder is part
    # of the source identity.
    if name == "BOM_New.xlsx" and "\\TMD\\" in record["file"]:
        return "BOM_New.xlsx#TMD"
    return name


def list_items(client) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    page = 1
    while True:
        result = client.request("GET", "/api/v1/items", query=[("page", str(page)), ("pageSize", "200")])
        rows.extend(result["items"])
        if page >= result["pagination"]["totalPages"]:
            return rows
        page += 1


def item_indexes(items: list[dict[str, Any]]) -> tuple[dict[str, dict[str, Any]], dict[str, dict[str, Any]]]:
    by_code = {row["code"]: row for row in items}
    by_assimilation_key: dict[str, dict[str, Any]] = {}
    for row in items:
        match = re.search(r"Imported from reviewed BOM assimilation \((NEW:[^)]+)\);", clean(row.get("remarks")))
        if match:
            by_assimilation_key[match.group(1)] = row
    return by_code, by_assimilation_key


def resolve_component(record: dict[str, Any], by_code: dict[str, Any], by_assimilation_key: dict[str, Any]) -> dict[str, Any]:
    key = record["canonicalKey"]
    if key.startswith("STORE:"):
        item = by_code.get(key[6:])
    elif key.startswith("NEW:"):
        item = by_assimilation_key.get(key)
    else:
        item = None
    if not item:
        raise RuntimeError(f"No portal Item for reconciled source component {key}")
    return item


def source_note(record: dict[str, Any]) -> str:
    raw = record["rawFields"]
    details = [f"Source {Path(record['file']).name}, sheet {record['sheet']}, row {record['row']}"]
    for key in ("Comment", "Item Name", "Item", "PART NAME", "Specs", "Details", "Manufacturer_Part_Number", "LCSC Part No", "Designator"):
        if clean(raw.get(key)):
            value = clean(raw[key]).replace("\n", " ")
            details.append(f"{key}: {value[:2400]}")
    if record.get("reviewDecisionId"):
        details.append(f"Reconciliation decision: {record['reviewDecisionId']}")
    return " | ".join(details)[:3900]


def prepare(data: dict[str, Any], items: list[dict[str, Any]]) -> tuple[dict[str, list[dict[str, Any]]], list[dict[str, Any]], list[dict[str, Any]]]:
    by_code, by_assimilation_key = item_indexes(items)
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    excluded: list[dict[str, Any]] = []
    references: list[dict[str, Any]] = []
    for record in data["sourceRecords"]:
        if record["disposition"] == "EXCLUDED":
            excluded.append(record)
            continue
        key = file_key(record)
        if key in REFERENCE_ONLY_SOURCES:
            references.append(record)
            continue
        if key not in OUTPUTS:
            raise RuntimeError(f"No output mapping for {record['file']}")
        item = resolve_component(record, by_code, by_assimilation_key)
        quantity = quantity_for(record)
        if quantity.as_tuple().exponent < -6:
            # Some legacy workbooks were exported through binary floating point
            # (for example 0.3 became 0.30000000000000004).  Accept only a
            # lossless-for-domain six-decimal normalization; genuine precision
            # beyond the database scale remains a hard failure.
            rounded = quantity.quantize(Decimal("0.000001"))
            if abs(quantity - rounded) > Decimal("0.0000005"):
                raise RuntimeError(f"Quantity has more than six decimals: {source_id(record)} = {quantity}")
            quantity = rounded
        grouped[key].append({
            "sourceLineKey": f"R{record['row']:04d}-{safe_key(record['canonicalKey'])[-24:]}",
            "parentSourceLineKey": None,
            "itemId": item["id"],
            "quantity": decimal_text(quantity),
            "unit": item.get("unit") or None,
            "notes": source_note(record),
            "sortOrder": record["row"],
        })
    return grouped, excluded, references


def create_project(client, definition: dict[str, str], existing: dict[str, dict[str, Any]], apply: bool) -> dict[str, Any]:
    normalized = re.sub(r"[^a-z0-9]+", "", definition["name"].lower())
    found = next((row for key, row in existing.items() if re.sub(r"[^a-z0-9]+", "", key.lower()) == normalized), None)
    if found:
        return found
    if not apply:
        return {"id": f"DRY-PROJECT-{definition['code']}", **definition}
    result = client.request("POST", "/api/v1/reference-data/projects", body={**definition, "description": "Created for source-faithful manufacturing BOM import."})
    return result["record"]


def create_root_item(client, key: str, items: list[dict[str, Any]], categories: list[dict[str, Any]], apply: bool) -> dict[str, Any]:
    source_key = f"bom-source-root:v1:{key}"
    definition = ROOT_ITEMS[key]
    match = next((row for row in items if row.get("importSourceKey") == source_key or source_key in clean(row.get("remarks"))), None)
    if match:
        return match
    if not apply:
        return {"id": f"DRY-ROOT-{key}", "code": key, **definition}
    category = next((row for row in categories if row["name"] == definition["category"] and row["discipline"] == definition["discipline"]), None)
    if not category:
        raise RuntimeError(f"Required category unavailable for {key}: {definition['category']}")
    payload = {
        "title": definition["title"], "discipline": definition["discipline"], "categoryId": category["id"],
        "catalogueState": "COMPLETE", "unit": "pcs", "description": "Manufactured output Item created to host reviewed source BOM definitions.",
        "remarks": f"Manufacturing BOM output root ({source_key}).", "importSourceKey": source_key,
    }
    return client.request("POST", "/api/v1/items", body=payload, idempotency_key=f"bom-root:{safe_key(key)}")["item"]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true", help="Create projects, missing BOM output Items, and Draft BOMs")
    args = parser.parse_args()
    data = json.loads(DATA.read_text(encoding="utf-8"))
    client = load_client()
    reference = client.request("GET", "/api/v1/reference-data")
    items = list_items(client)
    grouped, excluded, references = prepare(data, items)
    if len(grouped) != 18:
        raise RuntimeError(f"Expected 18 actual BOM definitions, found {len(grouped)}")
    print(json.dumps({"mode": "apply" if args.apply else "dry-run", "bomDefinitions": len(grouped), "linkedLines": sum(len(lines) for lines in grouped.values()), "excludedSourceRows": len(excluded), "referenceOnlyRows": len(references), "excludedRows": [source_id(row) for row in excluded], "referenceRows": [source_id(row) for row in references]}, indent=2))
    if not args.apply:
        for key, lines in sorted(grouped.items()):
            print(json.dumps({"source": key, "project": OUTPUTS[key]["project"], "lines": len(lines), "output": OUTPUTS[key]}))
        return
    projects_by_name = {row["name"]: row for row in reference["projects"]}
    project_records = {key: create_project(client, definition, projects_by_name, True) for key, definition in PROJECTS.items()}
    # Newly created roots must be added to the local Item index before BOM payloads are built.
    for key in sorted({entry["root"] for entry in OUTPUTS.values() if "root" in entry}):
        root = create_root_item(client, key, items, reference["itemCategories"], True)
        items.append(root)
    by_code, _ = item_indexes(items)
    for source, lines in sorted(grouped.items()):
        output = OUTPUTS[source]
        output_item = next((row for row in items if row.get("code") == output.get("code")), None)
        if "root" in output:
            root_key = output["root"]
            output_item = next((row for row in items if f"bom-source-root:v1:{root_key}" in clean(row.get("remarks"))), None)
        if not output_item:
            raise RuntimeError(f"Could not resolve output Item for {source}")
        project = project_records[output["project"]]
        body = {
            "itemId": output_item["id"], "projectTagId": project["id"],
            "name": f"Source BOM — {source.replace('#TMD', '')}", "revision": "SOURCE-1",
            "lines": lines,
        }
        key = f"bom-source:{safe_key(source)}"
        result = client.request("POST", "/api/v1/manufacturing/boms", body=body, idempotency_key=key)
        print(json.dumps({"source": source, "bomId": result["bom"]["id"], "lines": len(lines), "project": project["code"]}, ensure_ascii=False))


if __name__ == "__main__":
    main()
