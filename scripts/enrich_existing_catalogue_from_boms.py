"""Conservatively enrich reconciled existing catalogue items from BOM evidence.

Dry-run is the default. Existing non-empty catalogue fields are never
overwritten; conflicting evidence is reported for review. `--apply` performs
only the proposed blank-field patches and adds specific source product URLs.
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import re
import sys
from collections import Counter
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "docs" / "bom-assimilation-data.json"
CLIENT_PATH = Path(r"D:\CSD Software\Store\api-client\store_client.py")


def clean(value: object) -> str:
    return str(value or "").strip()


def normalized(value: object) -> str:
    return re.sub(r"[^a-z0-9]+", "", clean(value).lower())


def load_client():
    spec = importlib.util.spec_from_file_location("store_client", CLIENT_PATH)
    if not spec or not spec.loader:
        raise RuntimeError("Could not load the approved store API client")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module.StoreClient(module.ClientConfig.load(CLIENT_PATH.with_name(".env.local")))


def source_values(candidate: dict, keys: set[str]) -> list[str]:
    values: list[str] = []
    for record in candidate["sourceRecords"]:
        for key, value in record["rawFields"].items():
            if key.lower().replace(" ", "") in keys and clean(value) and clean(value) not in values:
                values.append(clean(value))
    return values


def specification(candidate: dict) -> str | None:
    values = source_values(candidate, {"specs", "details", "package"})
    return " | ".join(values)[:2000] or None


def manufacturer(candidate: dict) -> str | None:
    values = source_values(candidate, {"manufacturer_name", "manufacturername"})
    return values[0][:250] if values else None


def specific_product_url(value: str) -> bool:
    parsed = urlparse(value)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        return False
    if parsed.netloc.lower().removeprefix("www.") == "evselectro.com":
        return False
    return bool(parse_qs(parsed.query).get("id")) or len(parsed.path.strip("/")) > 3


def source_urls(candidate: dict) -> list[str]:
    urls: list[str] = []
    for record in candidate["sourceRecords"]:
        for value in record["rawFields"].values():
            value = clean(value)
            if value not in urls and specific_product_url(value):
                urls.append(value)
    return urls


def all_items(client) -> dict[str, dict]:
    items: dict[str, dict] = {}
    page = 1
    while True:
        result = client.request("GET", "/api/v1/items", query=(("page", str(page)), ("pageSize", "200")))
        items.update({item["code"]: item for item in result["items"]})
        if page >= result["pagination"]["totalPages"]:
            return items
        page += 1


def field_proposals(candidate: dict, item: dict) -> tuple[dict[str, str], list[dict]]:
    proposed = {
        "manufacturerPartNumber": candidate["mpns"][0] if len(candidate["mpns"]) == 1 else None,
        "supplierPartNumber": candidate["supplierParts"][0] if len(candidate["supplierParts"]) == 1 else None,
        "manufacturerName": manufacturer(candidate),
        "specification": specification(candidate),
    }
    updates: dict[str, str] = {}
    conflicts: list[dict] = []
    for field, value in proposed.items():
        if not value:
            continue
        current = clean(item.get(field))
        if not current:
            updates[field] = value
        elif normalized(current) != normalized(value):
            conflicts.append({"field": field, "catalogue": current, "bom": value})
    return updates, conflicts


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    client = load_client()
    items = all_items(client)
    data = json.loads(DATA.read_text(encoding="utf-8"))
    candidates = [row for row in data["canonical"] if row["disposition"] == "EXISTING_STORE_ITEM"]
    plan: list[dict] = []
    missing_codes: list[str] = []
    for candidate in candidates:
        code = candidate["storeItemCode"]
        item = items.get(code)
        if not item:
            missing_codes.append(code)
            continue
        updates, conflicts = field_proposals(candidate, item)
        urls = source_urls(candidate)
        if updates or conflicts or urls:
            plan.append({"code": code, "item": item, "updates": updates, "conflicts": conflicts, "urls": urls, "canonicalKey": candidate["canonicalKey"]})
    summary = {
        "mode": "apply" if args.apply else "dry-run", "existingCandidates": len(candidates), "missingMappedCodes": missing_codes,
        "itemsWithBlankFieldUpdates": sum(bool(row["updates"]) for row in plan), "fieldUpdates": dict(Counter(field for row in plan for field in row["updates"])),
        "itemsWithConflicts": sum(bool(row["conflicts"]) for row in plan), "conflicts": sum(len(row["conflicts"]) for row in plan),
        "itemsWithSpecificUrls": sum(bool(row["urls"]) for row in plan), "specificUrls": sum(len(row["urls"]) for row in plan),
    }
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    if not args.apply:
        for row in plan:
            if row["conflicts"]:
                print(json.dumps({"code": row["code"], "conflicts": row["conflicts"]}, ensure_ascii=False))
        return
    for row in plan:
        if row["updates"]:
            client.request("PATCH", f"/api/v1/items/{row['item']['id']}", body=row["updates"])
        if row["urls"]:
            existing = {link["url"] for link in client.request("GET", f"/api/v1/items/{row['item']['id']}/supplier-links")["links"]}
            for url in row["urls"]:
                if url in existing:
                    continue
                try:
                    client.request("POST", f"/api/v1/items/{row['item']['id']}/supplier-links", body={"url": url, "notes": "Imported from reviewed BOM source."})
                except Exception:
                    current = {link["url"] for link in client.request("GET", f"/api/v1/items/{row['item']['id']}/supplier-links")["links"]}
                    if url not in current:
                        raise
        if row["updates"] or row["urls"]:
            print(json.dumps({"code": row["code"], "patched": sorted(row["updates"]), "specificUrls": len(row["urls"])}))


if __name__ == "__main__":
    main()
