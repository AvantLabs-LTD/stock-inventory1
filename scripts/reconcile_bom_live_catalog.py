"""Read-only BOM-to-live-catalog recommendation generator."""
from __future__ import annotations

import json
import re
import sys
from collections import defaultdict
from difflib import SequenceMatcher
from pathlib import Path

from openpyxl import load_workbook

sys.path.insert(0, r"D:\CSD Software\Store\api-client")
from store_client import ClientConfig, StoreClient  # noqa: E402

ROOT = Path(r"D:\CSD Software\Store\BOMs")
OUTPUT = Path("docs/bom-live-match-results.json")


def norm(value: object) -> str:
    return re.sub(r"[^a-z0-9]+", " ", str(value or "").lower()).strip()


def first_index(headers: list[str], names: set[str]) -> int:
    return next((index for index, header in enumerate(headers) if header in names), -1)


def source_rows() -> list[dict[str, object]]:
    rows: list[dict[str, object]] = []
    for file in ROOT.rglob("*.xlsx"):
        book = load_workbook(file, read_only=True, data_only=True)
        for sheet in book.worksheets:
            values = list(sheet.values)
            header_at = next((i for i, row in enumerate(values) if any(re.search(r"comment|item name|part no|part name|connector|^item$", str(cell or ""), re.I) for cell in row)), None)
            if header_at is None:
                continue
            headers = [norm(cell) for cell in values[header_at]]
            name_i = first_index(headers, {"comment", "item name", "part no", "part name", "connector", "item"})
            if name_i < 0:
                continue
            spec_i = first_index(headers, {"specs", "specification", "description", "details"})
            mpn_i = first_index(headers, {"manufacturer part number"})
            supplier_i = first_index(headers, {"lcsc part no"})
            for source_row, row in enumerate(values[header_at + 1 :], header_at + 2):
                title = str(row[name_i] or "").strip()
                if not title:
                    continue
                spec = str(row[spec_i] or "").strip() if spec_i >= 0 else ""
                mpn = str(row[mpn_i] or "").strip() if mpn_i >= 0 else ""
                supplier = str(row[supplier_i] or "").strip() if supplier_i >= 0 else ""
                key = f"MPN:{norm(mpn)}" if mpn else f"SUP:{norm(supplier)}" if supplier else f"TXT:{norm(title)}|{norm(spec)}"
                rows.append({"key": key, "title": title, "spec": spec, "mpn": mpn, "supplier": supplier, "file": str(file.relative_to(ROOT)), "sheet": sheet.title, "row": source_row})
    return rows


def index_items(items: list[dict[str, object]]) -> tuple[dict[str, list[dict]], dict[str, list[dict]], dict[str, list[dict]], dict[str, list[dict]]]:
    mpn, supplier, title_spec, title = defaultdict(list), defaultdict(list), defaultdict(list), defaultdict(list)
    for item in items:
        if item.get("manufacturerPartNumber"):
            mpn[norm(item["manufacturerPartNumber"])].append(item)
        if item.get("supplierPartNumber"):
            supplier[norm(item["supplierPartNumber"])].append(item)
        title_spec[f"{norm(item.get('title'))}|{norm(item.get('specification'))}"].append(item)
        title[norm(item.get("title"))].append(item)
    return mpn, supplier, title_spec, title


def recommend(source: dict, indexes: tuple[dict, dict, dict, dict], items: list[dict]) -> dict:
    mpn, supplier, title_spec, title = indexes
    strong_mpn = mpn.get(norm(source["mpn"]), []) if source["mpn"] else []
    strong_supplier = supplier.get(norm(source["supplier"]), []) if source["supplier"] else []
    strong = {item["id"]: item for item in strong_mpn + strong_supplier}
    if len(strong) == 1:
        item = next(iter(strong.values()))
        basis = "BOTH" if strong_mpn and strong_supplier else "MPN" if strong_mpn else "SUPPLIER"
        return {"code": item["code"], "title": item["title"], "strength": "STRONG", "basis": basis, "reason": "Exact MPN and/or supplier part number"}
    if len(strong) > 1:
        return {"code": "", "title": "", "strength": "AMBIGUOUS", "basis": "", "reason": "MPN/supplier identifiers point to multiple store items"}
    exact = title_spec.get(f"{norm(source['title'])}|{norm(source['spec'])}", []) or title.get(norm(source["title"]), [])
    if len(exact) == 1:
        item = exact[0]
        return {"code": item["code"], "title": item["title"], "strength": "EXACT_TEXT", "basis": "", "reason": "Unique normalized title/specification match"}
    query = f"{norm(source['title'])} {norm(source['spec'])}".strip()
    scored = sorted(((SequenceMatcher(None, query, f"{norm(item.get('title'))} {norm(item.get('specification'))}".strip()).ratio(), item) for item in items), reverse=True, key=lambda pair: pair[0])
    if scored and scored[0][0] >= 0.62:
        score, item = scored[0]
        return {"code": item["code"], "title": item["title"], "strength": "WEAK", "basis": "", "reason": f"Text similarity suggestion ({score:.0%}); reviewer confirmation required"}
    return {"code": "", "title": "", "strength": "NONE", "basis": "", "reason": "No safe recommendation"}


def main() -> None:
    client = StoreClient(ClientConfig.load(Path(r"D:\CSD Software\Store\api-client\.env.local")))
    items: list[dict] = []
    page = 1
    while True:
        response = client.request("GET", "/api/v1/items", query=[("page", str(page)), ("pageSize", "200")])
        items.extend(response["items"])
        if page >= response["pagination"]["totalPages"]:
            break
        page += 1
    groups: dict[str, dict] = {}
    for row in source_rows():
        groups.setdefault(row["key"], row)
    indexes = index_items(items)
    matches = {key: recommend(row, indexes, items) for key, row in groups.items()}
    OUTPUT.write_text(json.dumps({"catalogueItems": len(items), "uniqueComponents": len(groups), "matches": matches}, indent=2), encoding="utf-8")
    summary = defaultdict(int)
    for result in matches.values(): summary[result["strength"]] += 1
    print(json.dumps({"catalogueItems": len(items), "uniqueComponents": len(groups), "recommendations": dict(summary)}))


if __name__ == "__main__":
    main()
