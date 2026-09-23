"""Reconcile and upload SF Harness V4 as audited Draft BOMs through the API.

The source workbook measures length in metres and solder in grams, while the
catalogue deliberately continues to stock these materials as Rolls.  Per the
approved business rule, this importer converts metres / 100 and grams / 500
to Roll requirements only on BOM lines.  It never changes inventory balances,
catalogue units, BOM activation status, demand, or stock ledger entries.
"""
from __future__ import annotations

from decimal import Decimal
import importlib.util
import sys
from pathlib import Path

from openpyxl import load_workbook


CLIENT_PATH = Path(r"D:\CSD Software\Store\api-client\store_client.py")
WORKBOOK_PATH = Path(r"D:\CSD Software\Store\BOMs\CM_SupplyChain\CM_SupplyChain\SF_CHS\MasterBOM_SF_CHS_V4.xlsx")
PROJECT_ID = "cmudq2v2x000cmf07n6tawetu"  # SF PMU / Power Nexus
SOURCE_NAME = "Source BOM — MasterBOM_SF_CHS_V4.xlsx"
FINAL_NAME = "SF Harness V4 Manufacturing BOM"
ROOT_SOURCE_KEY = "bom-source-root:v1:SF-HARNESS-V4-ASSEMBLY"


# These are intentional separate central Items, not aliases of similarly named
# TJL/ZKP catalogue entries.  Each is a different source connector suffix or
# required lead-length combination reviewed by the user.
NEW_ITEMS = {
    1: {"title": "J30J-100TJ-2000mm", "mpn": "J30J-100TJ-2000mm", "unit": "pcs", "category": "Connectors"},
    2: {"title": "J30J-100ZK-300mm", "mpn": "J30J-100ZK-300mm", "unit": "pcs", "category": "Connectors"},
    3: {"title": "J30J-100TJ-300mm", "mpn": "J30J-100TJ-300mm", "unit": "pcs", "category": "Connectors"},
    4: {"title": "J30J-100ZK-1300mm", "mpn": "J30J-100ZK-1300mm", "unit": "pcs", "category": "Connectors"},
    7: {"title": "J30J-66TJ-600mm", "mpn": "J30J-66TJ-600mm", "unit": "pcs", "category": "Connectors"},
    17: {"title": "J30J-15ZKP-600mm", "mpn": "J30J-15ZKP-600mm", "unit": "pcs", "category": "Connectors"},
    19: {"title": "J24H-19TK-600mm", "mpn": "J24H-19TK-600mm", "unit": "pcs", "category": "Connectors"},
    20: {"title": "J24H-09TK-600mm", "mpn": "J24H-09TK-600mm", "unit": "pcs", "category": "Connectors"},
    33: {"title": "Braided Sleeve", "specification": "22mm", "unit": "Roll", "category": "Auxiliary & Harness Supplies"},
}


# Approved, explicit existing-item reconciliation.  A source row appearing
# here is never selected by text similarity at upload time.
EXISTING_CODES = {
    5: "IMP-FD45E6B933F9", 6: "CMP-METAL-COVER-FOR-74TJL", 8: "IMP-692652093C97",
    9: "IMP-72A0ED75D766", 10: "IMP-C7DB6DB77FE1", 11: "IMP-40ECCF1A8CD4",
    12: "CMP-J30J-25ZKP-750MM", 13: "IMP-AC19D4063005", 14: "IMP-22EC2E0863EC",
    15: "IMP-8CB69726619A", 16: "CMP-J30J-15TJL-900MM", 18: "IMP-F2FB6913999E",
    21: "IMP-9779A93BBE79", 22: "IMP-DA79556B0B26", 23: "IMP-02CF37D585DA",
    24: "IMP-7470724BF4B5", 25: "IMP-927084B6A27A", 26: "IMP-067ACE2A1753",
    27: "IMP-1E201F1EDFDF", 28: "IMP-45F06CDB27F6", 29: "IMP-338D53427529",
    30: "IMP-2D7FD044B907", 31: "IMP-D3FEF4109C02", 32: "IMP-3F89F0C7D1CD",
    34: "IMP-6D79FF9BC2D2", 35: "IMP-141E7D1F66D6", 36: "IMP-3C25BD1880A2",
    37: "IMP-2025D69D1985", 38: "IMP-49BF5E56E5FC", 39: "IMP-AD2EF5192776",
    40: "IMP-A5FAD1DB26CF", 41: "IMP-67DAA1552E4A", 42: "IMP-709ECFDD998C",
    43: "IMP-146BA587D527", 44: "IMP-2ABAC0AAA13E", 45: "IMP-50B7E38439A3",
    46: "IMP-056D5AA15A14", 47: "IMP-27F48989A135", 48: "IMP-0B790153309B",
    49: "IMP-E4785423E417", 50: "IMP-0A6A502E1F7B", 51: "IMP-B42674202D29",
    52: "IMP-62830CE3D65F", 53: "IMP-2E110B6BCC8D", 54: "IMP-1D493893E298",
    55: "IMP-5B79F1A1E956", 56: "IMP-E759EA899D80", 57: "IMP-C2A5594BEC24",
    58: "CMP-PAPER-TAPE-1-INCH",
}


def load_client():
    spec = importlib.util.spec_from_file_location("store_client", CLIENT_PATH)
    if not spec or not spec.loader:
        raise RuntimeError("Could not load the approved store API client")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module.StoreClient(module.ClientConfig.load(CLIENT_PATH.with_name(".env.local")))


def text(value: object) -> str:
    return str(value or "").strip()


def decimal_text(value: Decimal) -> str:
    return format(value.normalize(), "f")


def list_items(client) -> list[dict]:
    rows: list[dict] = []
    page = 1
    while True:
        result = client.request("GET", "/api/v1/items", query=[("page", str(page)), ("pageSize", "200")])
        rows.extend(result["items"])
        if page >= result["pagination"]["totalPages"]:
            return rows
        page += 1


def read_source_rows() -> list[dict]:
    workbook = load_workbook(WORKBOOK_PATH, data_only=True, read_only=True)
    sheet = workbook["SF_KZ_V4"]
    rows: list[dict] = []
    for excel_row in range(3, 61):
        source_row = excel_row - 2
        part_number = text(sheet.cell(excel_row, 3).value)
        if not part_number:
            raise RuntimeError(f"Missing Part No. at workbook row {excel_row}")
        quantity = Decimal(text(sheet.cell(excel_row, 6).value))
        if quantity <= 0:
            raise RuntimeError(f"Invalid Qty/Set at workbook row {excel_row}")
        rows.append({
            "sourceRow": source_row,
            "category": text(sheet.cell(excel_row, 2).value),
            "partNumber": part_number,
            "specification": text(sheet.cell(excel_row, 4).value),
            "sourceUnit": text(sheet.cell(excel_row, 5).value),
            "sourceQuantity": quantity,
            "link": text(sheet.cell(excel_row, 8).value),
        })
    workbook.close()
    if len(rows) != 58 or {row["sourceRow"] for row in rows} != set(range(1, 59)):
        raise RuntimeError("SF Harness V4 source rows changed; stop for review")
    return rows


def ensure_new_items(client, items: list[dict], categories: dict[str, dict]) -> dict[int, dict]:
    by_source = {text(item.get("importSourceKey")): item for item in items if text(item.get("importSourceKey"))}
    created: dict[int, dict] = {}
    for source_row, definition in NEW_ITEMS.items():
        source_key = f"sf-harness-v4:v1:row-{source_row:02d}"
        item = by_source.get(source_key)
        if not item:
            category = categories.get(definition["category"])
            if not category or category["discipline"] != "ELECTRONICS":
                raise RuntimeError(f"Required Electronics category is unavailable: {definition['category']}")
            payload = {
                "title": definition["title"], "discipline": "ELECTRONICS", "categoryId": category["id"],
                "catalogueState": "COMPLETE", "unit": definition["unit"],
                "specification": definition.get("specification"), "manufacturerPartNumber": definition.get("mpn"),
                "remarks": f"Created from approved SF Harness V4 reconciliation; source workbook row {source_row}.",
                "importSourceKey": source_key,
            }
            item = client.request("POST", "/api/v1/items", body=payload, idempotency_key=f"sf-harness-v4-item:{source_row}")["item"]
            items.append(item)
            by_source[source_key] = item
        created[source_row] = item
    return created


def ensure_root_item(client, items: list[dict], categories: dict[str, dict]) -> dict:
    item = next((row for row in items if text(row.get("importSourceKey")) == ROOT_SOURCE_KEY), None)
    if item:
        return item
    category = categories.get("Locally Manufactured Mechanical Parts")
    if not category or category["discipline"] != "MECHANICAL":
        raise RuntimeError("Locally Manufactured Mechanical Parts category is unavailable")
    result = client.request(
        "POST", "/api/v1/items",
        body={
            "title": "SF Harness V4 Assembly", "discipline": "MECHANICAL", "categoryId": category["id"],
            "catalogueState": "COMPLETE", "unit": "pcs",
            "description": "Manufactured output Item for the SF Harness V4 Power Nexus BOM.",
            "remarks": "Created as the canonical output Item for the reviewed SF Harness V4 manufacturing definition.",
            "importSourceKey": ROOT_SOURCE_KEY,
        },
        idempotency_key="sf-harness-v4-root-item:v1",
    )
    item = result["item"]
    items.append(item)
    return item


def converted_requirement(row: dict, item: dict) -> tuple[Decimal, str, str]:
    source_unit = row["sourceUnit"].lower()
    quantity = row["sourceQuantity"]
    if source_unit == "mtr":
        if item.get("unit") != "Roll":
            raise RuntimeError(f"Metre source row {row['sourceRow']} must resolve to a Roll catalogue item")
        return quantity / Decimal(100), "Roll", "100 mtr per Roll"
    if source_unit == "grams":
        if item.get("unit") != "Roll":
            raise RuntimeError(f"Gram source row {row['sourceRow']} must resolve to a Roll catalogue item")
        return quantity / Decimal(500), "Roll", "500 grm per Roll"
    if source_unit == "no":
        return quantity, item["unit"], f"Source unit No normalized to catalogue unit {item['unit']}"
    raise RuntimeError(f"Unsupported source unit {row['sourceUnit']!r} at row {row['sourceRow']}")


def build_lines(source_rows: list[dict], by_code: dict[str, dict], new_items: dict[int, dict]) -> list[dict]:
    lines: list[dict] = []
    for row in source_rows:
        item = new_items.get(row["sourceRow"]) or by_code.get(EXISTING_CODES.get(row["sourceRow"], ""))
        if not item:
            raise RuntimeError(f"No approved central Item mapped to SF Harness V4 row {row['sourceRow']}")
        quantity, unit, conversion = converted_requirement(row, item)
        raw_label = " — ".join(part for part in [row["partNumber"], row["specification"]] if part)
        notes = (
            f"Source MasterBOM_SF_CHS_V4.xlsx, SF_KZ_V4 row {row['sourceRow']}: {raw_label}. "
            f"Original requirement: {decimal_text(row['sourceQuantity'])} {row['sourceUnit']}. "
            f"BOM conversion: {conversion}; stored requirement: {decimal_text(quantity)} {unit}."
        )
        lines.append({
            "sourceLineKey": f"R{row['sourceRow']:04d}", "parentSourceLineKey": None,
            "itemId": item["id"], "quantity": decimal_text(quantity), "unit": unit,
            "notes": notes, "sortOrder": row["sourceRow"],
        })
    if len(lines) != 58 or len({line["sourceLineKey"] for line in lines}) != 58:
        raise RuntimeError("SF Harness V4 line generation failed its uniqueness check")
    return lines


def ensure_supplier_links(client, source_rows: list[dict], by_code: dict[str, dict], new_items: dict[int, dict]) -> int:
    attached = 0
    for row in source_rows:
        if not row["link"]:
            continue
        item = new_items.get(row["sourceRow"]) or by_code[EXISTING_CODES[row["sourceRow"]]]
        existing = {link["url"] for link in client.request("GET", f"/api/v1/items/{item['id']}/supplier-links")["links"]}
        if row["link"] in existing:
            continue
        client.request(
            "POST", f"/api/v1/items/{item['id']}/supplier-links",
            body={"url": row["link"], "notes": "Imported from approved SF Harness V4 source workbook."},
        )
        attached += 1
    return attached


def find_bom(client, name: str) -> dict | None:
    definitions = client.request("GET", "/api/v1/manufacturing/definitions")["boms"]
    return next((bom for bom in definitions if bom["name"] == name and bom.get("projectTag", {}).get("id") == PROJECT_ID), None)


def ensure_boms(client, root: dict, lines: list[dict]) -> tuple[str, str]:
    source = find_bom(client, SOURCE_NAME)
    if not source:
        source = client.request(
            "POST", "/api/v1/manufacturing/boms",
            body={"itemId": root["id"], "projectTagId": PROJECT_ID, "name": SOURCE_NAME, "revision": "SOURCE-1", "lines": lines},
            idempotency_key="sf-harness-v4-source-bom:v1",
        )["bom"]
    final = find_bom(client, FINAL_NAME)
    if not final:
        final_lines = [{**line, "sourceLineKey": f"SOURCE:{line['sourceLineKey']}"} for line in lines]
        final = client.request(
            "POST", "/api/v1/manufacturing/boms",
            body={"itemId": root["id"], "projectTagId": PROJECT_ID, "name": FINAL_NAME, "revision": "V4-CONSOLIDATED-1", "lines": final_lines},
            idempotency_key="sf-harness-v4-final-bom:v1",
        )["bom"]
    for bom, expected_name in ((source, SOURCE_NAME), (final, FINAL_NAME)):
        detail = client.request("GET", f"/api/v1/manufacturing/boms/{bom['id']}")["bom"]
        version = detail["versions"][0]
        if detail["name"] != expected_name or version["status"] != "DRAFT" or len(version["lines"]) != 58:
            raise RuntimeError(f"{expected_name} failed its Draft/line-count verification")
    return source["id"], final["id"]


def main() -> None:
    client = load_client()
    reference = client.request("GET", "/api/v1/reference-data")
    categories = {row["name"]: row for row in reference["itemCategories"]}
    source_rows = read_source_rows()
    items = list_items(client)
    by_code = {item["code"]: item for item in items}
    if set(EXISTING_CODES) | set(NEW_ITEMS) != set(range(1, 59)) or set(EXISTING_CODES) & set(NEW_ITEMS):
        raise RuntimeError("The approved SF Harness V4 mapping must cover each source row exactly once")
    if any(code not in by_code for code in EXISTING_CODES.values()):
        raise RuntimeError("An approved existing catalogue code is unavailable; stop for review")
    new_items = ensure_new_items(client, items, categories)
    by_code = {item["code"]: item for item in items}
    lines = build_lines(source_rows, by_code, new_items)
    links_added = ensure_supplier_links(client, source_rows, by_code, new_items)
    root = ensure_root_item(client, items, categories)
    source_id, final_id = ensure_boms(client, root, lines)
    print(f"SF Harness V4 complete: 9 new Items, {links_added} supplier links added, source BOM {source_id}, final BOM {final_id}; both Draft.")


if __name__ == "__main__":
    main()
