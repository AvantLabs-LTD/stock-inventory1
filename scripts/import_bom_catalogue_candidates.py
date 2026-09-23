"""Guarded importer for the approved BOM assimilation candidates.

Defaults to dry-run. `--apply` creates only the reviewed NEW_COMPONENT_CANDIDATE
records and adds specific source product URLs as ItemSupplierLink records. The
canonical source key is persisted in Item.importSourceKey, making retries safe.
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import re
import sys
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "docs" / "bom-assimilation-data.json"
CLIENT_PATH = Path(r"D:\CSD Software\Store\api-client\store_client.py")
SOURCE_PREFIX = "bom-assimilation:v1:"


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


def normalized(value: object) -> str:
    return re.sub(r"[^a-z0-9]+", "", clean(value).lower())


def source_values(candidate: dict, keys: set[str]) -> list[str]:
    values: list[str] = []
    for record in candidate["sourceRecords"]:
        for key, value in record["rawFields"].items():
            if key.lower().replace(" ", "") in keys and clean(value) and clean(value) not in values:
                values.append(clean(value))
    return values


def chosen_unit(candidate: dict) -> str:
    raw_units = source_values(candidate, {"a/u", "au", "unit", "uom"})
    joined = " ".join(raw_units).lower()
    if "ltr" in joined or "liter" in joined or "litre" in joined:
        return "ltr"
    if "mtr" in joined or "meter" in joined or "metre" in joined:
        return "mtr"
    return "pcs"


def category_name(candidate: dict) -> tuple[str, str]:
    title = candidate["suggestedName"].lower()
    mpn = " ".join(candidate["mpns"]).upper()
    if any(token in title for token in ("main pcb", "lcd pcb")):
        return "ELECTRONICS", "PCBs"
    if "3d print" in title:
        return "MECHANICAL", "3D Body"
    if title == "base frame" or title.startswith("y11x-"):
        return "MECHANICAL", "Locally Manufactured Mechanical Parts"
    if "clinch nut" in title:
        return "MECHANICAL", "Inserts"
    if " nut" in title or title.startswith("m2 nut"):
        return "MECHANICAL", "Regular Nuts"
    if title.startswith("screw"):
        return "MECHANICAL", "Screw"
    if title.startswith("thimble"):
        return "MECHANICAL", "Thimble"
    if any(token in mpn for token in ("YSPIT",)):
        return "ELECTRONICS", "Inductors"
    if any(token in mpn for token in ("BNX",)):
        return "ELECTRONICS", "EMI Filters"
    if any(token in mpn for token in ("BSS", "XR40N05")):
        return "ELECTRONICS", "MOSFETS"
    if any(token in mpn for token in ("1N", "DFLS", "CDSOT", "TISP", "TBU")):
        return "ELECTRONICS", "DIODES"
    if any(token in mpn for token in ("HF49", "T92")):
        return "ELECTRONICS", "Relay"
    if any(token in mpn for token in ("TEN ", "TEN_", "TMB")):
        return "ELECTRONICS", "TRANSFORMER"
    if any(token in mpn for token in ("GRM", "GCM", "CC060", "CGA", "CL21")):
        return "ELECTRONICS", "Ceramic Capacitors"
    if any(token in mpn for token in ("TAJC", "RVT")):
        return "ELECTRONICS", "Polar Capacitors"
    if any(token in mpn for token in ("RC", "AC", "AT", "RT", "MMA", "352", "PA2512", "TD03")):
        return "ELECTRONICS", "Resistors"
    if any(token in mpn for token in ("B10B", "B7B", "CON2", "FPC", "WJ", "XH", "XT")):
        return "ELECTRONICS", "Connectors"
    if mpn:
        return "ELECTRONICS", "PCB Components"
    return "ELECTRONICS", "Auxiliary & Harness Supplies"


def specific_product_url(value: str) -> bool:
    parsed = urlparse(value)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        return False
    host = parsed.netloc.lower().removeprefix("www.")
    if host == "evselectro.com":
        return False
    query = parse_qs(parsed.query)
    return bool(query.get("id")) or len(parsed.path.strip("/")) > 3


def source_urls(candidate: dict) -> list[str]:
    urls: list[str] = []
    for record in candidate["sourceRecords"]:
        for value in record["rawFields"].values():
            value = clean(value)
            if value not in urls and specific_product_url(value):
                urls.append(value)
    return urls


def specifications(candidate: dict) -> str | None:
    values = source_values(candidate, {"specs", "details", "package"})
    return " | ".join(values)[:2000] or None


def manufacturer(candidate: dict) -> str | None:
    values = source_values(candidate, {"manufacturer_name", "manufacturername"})
    return values[0][:250] if values else None


def category_ids(client) -> dict[str, dict]:
    rows = client.request("GET", "/api/v1/reference-data")["itemCategories"]
    return {row["name"]: row for row in rows}


def live_item_indexes(client) -> tuple[dict[str, dict], dict[str, list[dict]], dict[str, list[dict]]]:
    items: list[dict] = []
    page = 1
    while True:
        result = client.request("GET", "/api/v1/items", query=(("page", str(page)), ("pageSize", "200")))
        items.extend(result["items"])
        if page >= result["pagination"]["totalPages"]:
            break
        page += 1
    by_source = {clean(item.get("importSourceKey")): item for item in items if clean(item.get("importSourceKey"))}
    by_mpn: dict[str, list[dict]] = {}
    by_title: dict[str, list[dict]] = {}
    for item in items:
        if normalized(item.get("manufacturerPartNumber")):
            by_mpn.setdefault(normalized(item["manufacturerPartNumber"]), []).append(item)
        if normalized(item.get("title")):
            by_title.setdefault(normalized(item["title"]), []).append(item)
    return by_source, by_mpn, by_title


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true", help="Create records and attach supplier URLs")
    args = parser.parse_args()
    data = json.loads(DATA.read_text(encoding="utf-8"))
    candidates = sorted((row for row in data["canonical"] if row["disposition"] == "NEW_COMPONENT_CANDIDATE"), key=lambda row: row["canonicalKey"])
    if len(candidates) != 110:
        raise RuntimeError(f"Expected exactly 110 approved candidates, found {len(candidates)}")
    client = load_client()
    categories = category_ids(client)
    plan = []
    for candidate in candidates:
        discipline, category = category_name(candidate)
        category_row = categories.get(category)
        if not category_row or category_row["discipline"] != discipline:
            raise RuntimeError(f"No compatible category for {candidate['canonicalKey']}: {discipline} / {category}")
        plan.append({
            "canonicalKey": candidate["canonicalKey"], "title": candidate["suggestedName"], "discipline": discipline,
            "categoryId": category_row["id"], "category": category, "unit": chosen_unit(candidate),
            "specification": specifications(candidate), "manufacturerName": manufacturer(candidate),
            "manufacturerPartNumber": candidate["mpns"][0] if len(candidate["mpns"]) == 1 else None,
            "supplierPartNumber": candidate["supplierParts"][0] if len(candidate["supplierParts"]) == 1 else None,
            "supplierUrls": source_urls(candidate), "sourceOccurrences": candidate["sourceOccurrenceCount"],
        })
    summary: dict[str, int] = {}
    for row in plan:
        summary[row["category"]] = summary.get(row["category"], 0) + 1
    print(json.dumps({"mode": "apply" if args.apply else "dry-run", "count": len(plan), "byCategory": summary, "supplierUrls": sum(len(row["supplierUrls"]) for row in plan)}, indent=2))
    if not args.apply:
        return
    by_source, by_mpn, by_title = live_item_indexes(client)
    for index, row in enumerate(plan, 1):
        source_key = f"{SOURCE_PREFIX}{row['canonicalKey']}"
        payload = {
            "title": row["title"], "discipline": row["discipline"], "categoryId": row["categoryId"], "catalogueState": "COMPLETE",
            "specification": row["specification"], "manufacturerName": row["manufacturerName"],
            "manufacturerPartNumber": row["manufacturerPartNumber"], "supplierPartNumber": row["supplierPartNumber"],
            "remarks": f"Imported from reviewed BOM assimilation ({row['canonicalKey']}); {row['sourceOccurrences']} source occurrence(s).",
            "unit": row["unit"], "importSourceKey": source_key,
        }
        item = by_source.get(source_key)
        created = False
        if not item and row["manufacturerPartNumber"]:
            matches = by_mpn.get(normalized(row["manufacturerPartNumber"]), [])
            if len(matches) == 1:
                item = matches[0]
        if not item and not row["manufacturerPartNumber"]:
            matches = by_title.get(normalized(row["title"]), [])
            if len(matches) == 1:
                item = matches[0]
        if not item:
            result = client.request("POST", "/api/v1/items", body=payload)
            item = result["item"]
            created = True
            by_source[source_key] = item
            if row["manufacturerPartNumber"]:
                by_mpn.setdefault(normalized(row["manufacturerPartNumber"]), []).append(item)
            by_title.setdefault(normalized(row["title"]), []).append(item)
        existing_urls = {
            link["url"] for link in client.request("GET", f"/api/v1/items/{item['id']}/supplier-links")["links"]
        }
        for url in row["supplierUrls"]:
            if url in existing_urls:
                continue
            try:
                client.request("POST", f"/api/v1/items/{item['id']}/supplier-links", body={"url": url, "notes": "Imported from reviewed BOM source."})
            except Exception as error:
                current_urls = {
                    link["url"] for link in client.request("GET", f"/api/v1/items/{item['id']}/supplier-links")["links"]
                }
                if url not in current_urls:
                    raise error
        print(json.dumps({"index": index, "canonicalKey": row["canonicalKey"], "code": item["code"], "created": created, "supplierUrls": len(row["supplierUrls"])}))


if __name__ == "__main__":
    main()
