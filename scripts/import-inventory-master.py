#!/usr/bin/env python3
"""Preview and import the consolidated inventory workbook through the portal API."""

from __future__ import annotations

import argparse
import getpass
import http.cookiejar
import json
import mimetypes
import os
import secrets
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

MAX_UPLOAD_BYTES = 5 * 1024 * 1024
DEFAULT_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/140.0.0.0 Safari/537.36"
)
DEFAULT_WORKBOOK = (
    Path(__file__).resolve().parents[1].parent
    / "stock-inventory-editor"
    / "Consolidated BOM_unified.xlsx"
)


class PortalError(RuntimeError):
    """An HTTP or API-level portal error."""


def request_json(opener: urllib.request.OpenerDirector, request: urllib.request.Request) -> dict[str, Any]:
    try:
        with opener.open(request, timeout=120) as response:
            payload = response.read().decode("utf-8")
    except urllib.error.HTTPError as error:
        payload = error.read().decode("utf-8", errors="replace")
        try:
            detail = json.loads(payload)
            message = detail.get("error") or payload
            code = detail.get("code")
            if code:
                message = f"{message} ({code})"
        except json.JSONDecodeError:
            message = payload or str(error)
        raise PortalError(f"Portal returned HTTP {error.code}: {message}") from error
    except urllib.error.URLError as error:
        raise PortalError(f"Could not reach the portal: {error.reason}") from error

    try:
        return json.loads(payload)
    except json.JSONDecodeError as error:
        raise PortalError("Portal returned a non-JSON response") from error


def login(
    opener: urllib.request.OpenerDirector,
    base_url: str,
    email: str,
    password: str,
) -> None:
    body = json.dumps({"email": email, "password": password}).encode("utf-8")
    request = urllib.request.Request(
        f"{base_url}/api/auth/login",
        data=body,
        headers={"Content-Type": "application/json", "Accept": "application/json"},
        method="POST",
    )
    result = request_json(opener, request)
    user = result.get("user") or {}
    print(f"Authenticated as {user.get('name', email)} ({user.get('role', 'role not returned')}).")


def multipart_body(workbook_path: Path, mode: str) -> tuple[bytes, str]:
    boundary = f"----store-inventory-{secrets.token_hex(16)}"
    file_bytes = workbook_path.read_bytes()
    content_type = mimetypes.guess_type(workbook_path.name)[0] or (
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )
    parts = [
        f"--{boundary}\r\n"
        'Content-Disposition: form-data; name="mode"\r\n\r\n'
        f"{mode}\r\n".encode("utf-8"),
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="file"; filename="{workbook_path.name}"\r\n'
        f"Content-Type: {content_type}\r\n\r\n".encode("utf-8")
        + file_bytes
        + b"\r\n",
        f"--{boundary}--\r\n".encode("utf-8"),
    ]
    return b"".join(parts), boundary


def upload(
    opener: urllib.request.OpenerDirector,
    base_url: str,
    workbook_path: Path,
    mode: str,
) -> dict[str, Any]:
    body, boundary = multipart_body(workbook_path, mode)
    request = urllib.request.Request(
        f"{base_url}/api/v1/items/import-master",
        data=body,
        headers={
            "Content-Type": f"multipart/form-data; boundary={boundary}",
            "Content-Length": str(len(body)),
            "Accept": "application/json",
        },
        method="POST",
    )
    return request_json(opener, request)


def print_preview(result: dict[str, Any]) -> None:
    summary = result.get("summary") or {}
    print("\nImport preview")
    print("--------------")
    print(f"Components: {summary.get('total', 0)}")
    for sheet, count in (summary.get("bySheet") or {}).items():
        print(f"  {sheet}: {count}")
    print(f"Blank stock rows changed to zero: {summary.get('blankStockRows', 0)}")
    print(f"Negative stock rows changed to zero: {summary.get('negativeStockRows', 0)}")
    ignored = summary.get("ignoredSheets") or []
    print(f"Ignored sheets: {', '.join(ignored) if ignored else 'none'}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Authenticate to the Store portal and preview/commit the consolidated inventory workbook.",
    )
    parser.add_argument(
        "--base-url",
        default=os.environ.get("STORE_PORTAL_URL", "http://localhost:3000"),
        help="Portal base URL (default: STORE_PORTAL_URL or http://localhost:3000)",
    )
    parser.add_argument(
        "--file",
        type=Path,
        default=DEFAULT_WORKBOOK,
        help=f"Workbook path (default: {DEFAULT_WORKBOOK})",
    )
    parser.add_argument(
        "--email",
        default=os.environ.get("STORE_PORTAL_EMAIL", "admin@localhost"),
        help="Login email (default: STORE_PORTAL_EMAIL or admin@localhost)",
    )
    parser.add_argument(
        "--commit",
        action="store_true",
        help="Commit after a successful preview; otherwise the script is preview-only",
    )
    parser.add_argument(
        "--yes",
        action="store_true",
        help="Skip the interactive commit confirmation (requires --commit)",
    )
    parser.add_argument(
        "--allow-insecure-http",
        action="store_true",
        help="Allow credentials over plain HTTP to a non-local portal",
    )
    parser.add_argument(
        "--user-agent",
        default=os.environ.get("STORE_PORTAL_USER_AGENT", DEFAULT_USER_AGENT),
        help="HTTP User-Agent (default: a standard desktop browser signature)",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    workbook_path = args.file.expanduser().resolve()
    if not workbook_path.is_file():
        raise PortalError(f"Workbook not found: {workbook_path}")
    if workbook_path.suffix.lower() != ".xlsx":
        raise PortalError("The inventory master must be an .xlsx file")
    size = workbook_path.stat().st_size
    if size <= 0 or size > MAX_UPLOAD_BYTES:
        raise PortalError(f"Workbook size must be between 1 byte and {MAX_UPLOAD_BYTES} bytes")

    base_url = args.base_url.rstrip("/")
    parsed_url = urllib.parse.urlparse(base_url)
    if parsed_url.scheme not in {"http", "https"} or not parsed_url.netloc:
        raise PortalError("--base-url must be an absolute http:// or https:// URL")
    local_hosts = {"localhost", "127.0.0.1", "::1"}
    if parsed_url.scheme == "http" and parsed_url.hostname not in local_hosts and not args.allow_insecure_http:
        raise PortalError(
            "Refusing to send credentials over non-local plain HTTP. Use HTTPS or explicitly pass --allow-insecure-http."
        )
    if args.yes and not args.commit:
        raise PortalError("--yes is only valid together with --commit")

    password = os.environ.get("STORE_PORTAL_PASSWORD") or getpass.getpass(
        f"Password for {args.email}: "
    )
    if not password:
        raise PortalError("A portal password is required")

    cookie_jar = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cookie_jar))
    opener.addheaders = [
        ("User-Agent", args.user_agent),
        ("Accept-Language", "en-US,en;q=0.9"),
        ("Cache-Control", "no-cache"),
    ]
    login(opener, base_url, args.email, password)

    preview = upload(opener, base_url, workbook_path, "preview")
    print_preview(preview)
    if not args.commit:
        print("\nPreview only; no data was changed. Re-run with --commit to import.")
        return 0

    if not args.yes:
        answer = input("\nCommit this import? [y/N]: ").strip().lower()
        if answer not in {"y", "yes"}:
            print("Import cancelled; no data was changed.")
            return 0

    committed = upload(opener, base_url, workbook_path, "commit")
    result = committed.get("result") or {}
    print("\nImport completed")
    print("----------------")
    print(f"Components created: {result.get('created', 0)}")
    print(f"Existing imported components retained: {result.get('updated', 0)}")
    print(f"Opening ledger entries posted: {result.get('openingEntries', 0)}")
    print(f"Total opening quantity posted: {result.get('openingQuantity', '0')}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (PortalError, OSError) as error:
        print(f"Error: {error}", file=sys.stderr)
        raise SystemExit(1)
