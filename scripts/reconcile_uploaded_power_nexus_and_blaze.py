"""Correct Draft BOM scope and build the tag-preserving consolidated Blaze BOM.

This is deliberately an API-only, re-runnable data operation.  It corrects only
Draft definitions, never activates a BOM, never creates a manufacturing cycle,
and never posts inventory.  The source uploads remain as immutable evidence.

The Blaze matrix is a combined PMU Main / Controller / Rectifier procurement
matrix.  Its aggregate line quantity is retained on the BOM line while the
per-product values are retained as BomLineApplicability facts.  The three PCB
component BOMs are nested below their respective board parent lines.
"""
from __future__ import annotations

from decimal import Decimal
import importlib.util
import sys
from pathlib import Path

from openpyxl import load_workbook


CLIENT_PATH = Path(r"D:\CSD Software\Store\api-client\store_client.py")
MATRIX_PATH = Path(r"D:\CSD Software\Store\BOMs\CM_SupplyChain\CM_SupplyChain\Blaze_PMU_Rect\Master_BOM_Blaze_PMU_Rect.xlsx")

POWER_NEXUS_PROJECT_ID = "cmudq2v2x000cmf07n6tawetu"
BLAZE_PROJECT_ID = "cmudq2sqp0000mf07sgvhbg2c"

SF_XT_SOURCE_ID = "cmudq3ca0003amf0736gzibv4"
BLAZE_CHS_SOURCE_ID = "cmudq3bku0034mf07epd2sc5m"
BLAZE_CHS_FINAL_ID = "cmudu1w8e000xmv07cgpu9n3l"

BLAZE_MASTER_ID = "cmudq3d1v003gmf07bceqbc1e"
PMU_BOARD_ID = "cmudq33ro001gmf07klb9zqvg"
CONTROLLER_BOARD_ID = "cmudq37kn002amf07msj16wai"
RECTIFIER_BOARD_ID = "cmudq34pb001mmf07wsyi3bfy"

BLAZE_NAME = "Blaze PMU / Controller / Rectifier Manufacturing BOM"
BLAZE_REVISION = "PMU-V2.4-CONTROLLER-V1.3-RECTIFIER-V2.4-CONSOLIDATED-1"
TAGS = (("PMU_MAIN", 6), ("PMU_CONTROLLER", 7), ("RECTIFIER", 8))


def load_client():
    spec = importlib.util.spec_from_file_location("store_client", CLIENT_PATH)
    if not spec or not spec.loader:
        raise RuntimeError("Could not load the approved store API client")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module.StoreClient(module.ClientConfig.load(CLIENT_PATH.with_name(".env.local")))


def draft_version(bom: dict) -> dict:
    if len(bom["versions"]) != 1 or bom["versions"][0]["status"] != "DRAFT":
        raise RuntimeError(f"{bom['name']} must have exactly one Draft revision")
    return bom["versions"][0]


def matrix_values() -> dict[int, dict[str, Decimal]]:
    workbook = load_workbook(MATRIX_PATH, data_only=True, read_only=True)
    sheet = workbook["Blaze_Master_BOM"]
    result: dict[int, dict[str, Decimal]] = {}
    for row in range(4, 64):
        values: dict[str, Decimal] = {}
        for tag, column in TAGS:
            raw = sheet.cell(row, column).value
            if raw is not None and str(raw).strip() != "":
                amount = Decimal(str(raw))
                if amount > 0:
                    values[tag] = amount
        result[row] = values
    workbook.close()
    return result


def decimal_text(value: Decimal | str | int | float) -> str:
    return format(Decimal(str(value)).normalize(), "f")


def source_row(source_key: str) -> int:
    prefix = source_key.split("-", 1)[0]
    if not prefix.startswith("R") or not prefix[1:].isdigit():
        raise RuntimeError(f"Cannot find source row in key {source_key!r}")
    return int(prefix[1:])


def line_payload(line: dict, *, source_key: str, parent_key: str | None = None, applicability: dict[str, Decimal] | None = None, quantity: Decimal | None = None, notes_suffix: str | None = None, sort_order: int | None = None) -> dict:
    notes = line.get("notes")
    if notes_suffix:
        notes = f"{notes}\n{notes_suffix}" if notes else notes_suffix
    return {
        "sourceLineKey": source_key,
        "parentSourceLineKey": parent_key,
        "itemId": line["item"]["id"],
        "quantity": decimal_text(quantity if quantity is not None else line["quantity"]),
        "unit": line.get("unit"),
        "scrapAllowance": str(line["scrapAllowance"]) if line.get("scrapAllowance") is not None else None,
        "consumptionRouteStepId": line.get("consumptionRouteStepId"),
        "notes": notes,
        "sortOrder": line["sortOrder"] if sort_order is None else sort_order,
        "applicability": [
            {"tag": tag, "quantity": decimal_text(amount)}
            for tag, amount in sorted((applicability or {}).items())
        ],
    }


def existing_bom(client, *, name: str, project_id: str) -> dict | None:
    boms = client.request("GET", "/api/v1/manufacturing/definitions")["boms"]
    return next((bom for bom in boms if bom["name"] == name and bom.get("projectTag", {}).get("id") == project_id), None)


def move_draft_bom(client, bom_id: str, project_id: str, key: str) -> None:
    bom = client.request("GET", f"/api/v1/manufacturing/boms/{bom_id}")["bom"]
    if bom.get("projectTag", {}).get("id") == project_id:
        return
    client.request(
        "POST",
        f"/api/v1/manufacturing/boms/{bom_id}/project",
        body={"projectTagId": project_id},
        idempotency_key=key,
    )


def create_xt_final(client) -> None:
    present = existing_bom(client, name="SF XT Cable Manufacturing BOM", project_id=POWER_NEXUS_PROJECT_ID)
    if present:
        return
    source = client.request("GET", f"/api/v1/manufacturing/boms/{SF_XT_SOURCE_ID}")["bom"]
    version = draft_version(source)
    if len(version["lines"]) != 21 or any(line.get("parentLine") for line in version["lines"]):
        raise RuntimeError("SF XT Cable source no longer has its audited 21 flat lines")
    lines = [line_payload(line, source_key=f"SOURCE:{line['sourceLineKey']}") for line in version["lines"]]
    client.request(
        "POST",
        "/api/v1/manufacturing/boms",
        body={
            "itemId": source["item"]["id"],
            "projectTagId": POWER_NEXUS_PROJECT_ID,
            "name": "SF XT Cable Manufacturing BOM",
            "revision": "XT-CABLE-CONSOLIDATED-1",
            "lines": lines,
        },
        idempotency_key="sf-xt-cable-consolidated-bom:v1",
    )


def create_blaze_final(client) -> None:
    present = existing_bom(client, name=BLAZE_NAME, project_id=BLAZE_PROJECT_ID)
    if present:
        return
    master = client.request("GET", f"/api/v1/manufacturing/boms/{BLAZE_MASTER_ID}")["bom"]
    pmu = client.request("GET", f"/api/v1/manufacturing/boms/{PMU_BOARD_ID}")["bom"]
    controller = client.request("GET", f"/api/v1/manufacturing/boms/{CONTROLLER_BOARD_ID}")["bom"]
    rectifier = client.request("GET", f"/api/v1/manufacturing/boms/{RECTIFIER_BOARD_ID}")["bom"]
    master_version = draft_version(master)
    pmu_version = draft_version(pmu)
    controller_version = draft_version(controller)
    rectifier_version = draft_version(rectifier)
    if len(master_version["lines"]) != 54 or len(pmu_version["lines"]) != 66 or len(controller_version["lines"]) != 42 or len(rectifier_version["lines"]) != 86:
        raise RuntimeError("A Blaze source BOM line count changed; stop for manual review")

    by_row: dict[int, list[dict]] = {}
    for line in master_version["lines"]:
        by_row.setdefault(source_row(line["sourceLineKey"]), []).append(line)
    values = matrix_values()
    lines: list[dict] = []
    pmu_parent_key: str | None = None
    for row, source_lines in sorted(by_row.items()):
        applies = values.get(row, {})
        for offset, line in enumerate(source_lines):
            key = f"MATRIX:R{row:04d}:{line['item']['code']}"
            # The source upload accidentally recorded R0058 as 1 although its
            # PMU+Rectifier matrix values total 2.  Rebuild from the matrix.
            expected = sum(applies.values(), Decimal("0"))
            quantity = expected if applies else Decimal(str(line["quantity"]))
            suffix = None if applies else "Matrix product quantities are blank; retained from the reconciled source BOM."
            lines.append(line_payload(line, source_key=key, applicability=applies, quantity=quantity, notes_suffix=suffix, sort_order=row * 10 + offset))
            if row == 6 and line["item"]["id"] == pmu["item"]["id"]:
                pmu_parent_key = key
    if not pmu_parent_key:
        raise RuntimeError("The Blaze matrix no longer contains the PMU Main PCB parent line")

    def add_board_children(prefix: str, board: dict, version: dict, tag: str, parent_key: str, base_sort: int) -> None:
        for index, line in enumerate(version["lines"]):
            lines.append(line_payload(
                line,
                source_key=f"{prefix}:R{index + 1:04d}:{line['item']['code']}",
                parent_key=parent_key,
                applicability={tag: Decimal(str(line["quantity"]))},
                sort_order=base_sort + index,
            ))

    # The original matrix has only the PMU PCB parent reconciled.  Add the two
    # missing parent boards, then preserve all three board component BOMs below
    # their own parent.  This creates a true hierarchy instead of a flat blend.
    controller_parent_key = "MATRIX:R0007:CONTROLLER_BOARD"
    rectifier_parent_key = "MATRIX:R0008:RECTIFIER_BOARD"
    lines.append({
        "sourceLineKey": controller_parent_key, "parentSourceLineKey": None,
        "itemId": controller["item"]["id"], "quantity": "1", "unit": controller["item"].get("unit"),
        "scrapAllowance": None, "consumptionRouteStepId": None,
        "notes": "Master_BOM_Blaze_PMU_Rect.xlsx · row 7 · PMU Controller board parent.",
        "sortOrder": 70, "applicability": [{"tag": "PMU_CONTROLLER", "quantity": "1"}],
    })
    lines.append({
        "sourceLineKey": rectifier_parent_key, "parentSourceLineKey": None,
        "itemId": rectifier["item"]["id"], "quantity": "1", "unit": rectifier["item"].get("unit"),
        "scrapAllowance": None, "consumptionRouteStepId": None,
        "notes": "Master_BOM_Blaze_PMU_Rect.xlsx · row 8 · Rectifier board parent.",
        "sortOrder": 80, "applicability": [{"tag": "RECTIFIER", "quantity": "1"}],
    })
    add_board_children("PMU-PCB", pmu, pmu_version, "PMU_MAIN", pmu_parent_key, 10_000)
    add_board_children("CONTROLLER-PCB", controller, controller_version, "PMU_CONTROLLER", controller_parent_key, 20_000)
    add_board_children("RECTIFIER-PCB", rectifier, rectifier_version, "RECTIFIER", rectifier_parent_key, 30_000)

    result = client.request(
        "POST", "/api/v1/manufacturing/boms",
        body={
            "itemId": master["item"]["id"], "projectTagId": BLAZE_PROJECT_ID,
            "name": BLAZE_NAME, "revision": BLAZE_REVISION, "lines": lines,
        },
        idempotency_key="blaze-pmu-controller-rectifier-consolidated-bom:v1",
    )
    created = client.request("GET", f"/api/v1/manufacturing/boms/{result['bom']['id']}")["bom"]
    version = draft_version(created)
    if len(version["lines"]) != len(lines):
        raise RuntimeError("Blaze consolidated BOM line count did not persist")


def name_blaze_project(client) -> None:
    reference = client.request("GET", "/api/v1/reference-data")
    project = next((entry for entry in reference["projects"] if entry["id"] == BLAZE_PROJECT_ID), None)
    if not project:
        raise RuntimeError("The shared Blaze project record no longer exists")
    if project["name"] == "Blaze" and project.get("code") == "BLAZE":
        return
    client.request(
        "PATCH",
        "/api/v1/reference-data/projects",
        body={"id": BLAZE_PROJECT_ID, "name": "Blaze", "code": "BLAZE"},
    )


def main() -> None:
    client = load_client()
    # The three project corrections are Draft-only and generate AuditLog facts.
    name_blaze_project(client)
    move_draft_bom(client, SF_XT_SOURCE_ID, POWER_NEXUS_PROJECT_ID, "bom-scope:sf-xt-source:v1")
    move_draft_bom(client, BLAZE_CHS_SOURCE_ID, BLAZE_PROJECT_ID, "bom-scope:blaze-chs-source:v1")
    move_draft_bom(client, BLAZE_CHS_FINAL_ID, BLAZE_PROJECT_ID, "bom-scope:blaze-chs-final:v1")
    create_xt_final(client)
    create_blaze_final(client)
    print("Draft scope corrections and consolidated Power Nexus/Blaze BOMs are complete; no version was activated.")


if __name__ == "__main__":
    main()
