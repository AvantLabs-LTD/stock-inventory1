# PakLogix historical import

The importer is a one-shot Compose profile, not an application startup job. It reads a frozen `custom.db` plus `uploads/`, and writes only to the selected Flux PostgreSQL database. It can be rerun against the same snapshot: every source row has a hash and a source-to-target record. Changed source rows or previously imported photo bytes stop the run instead of overwriting history.

## Operator prerequisites

- Copy the *entire* `logix-snapshot-sept-18` directory to the server, including `custom.db`, `uploads/`, and `missing-photos.csv`. Keep it outside the Git checkout and mount it read-only.
- Stop writes to the old Logix app, or deliberately take a new final snapshot and re-audit it. Do not apply an older snapshot as though it were final.
- Take a fresh PostgreSQL logical backup immediately before a production import. Keep the previously backed-up runtime secrets as well.
- Use an active Flux administrator email as `IMPORT_ACTOR_EMAIL` for attribution.
- Apply `20260918180000_cargo_import_audit` through the normal `migrate` service before running the importer.

First rehearse against a **new disposable database restored from the current production backup**, not the production database. Run `--dry-run`, then `--apply`, then `--apply` again to prove idempotency. Verify the target counts: 57 package shipments, 16 tracking-only shipments, 57 packages, 103 packing items, 58 photos, and 216 historical events for the audited snapshot. Sixteen photos remain review records, as do sixteen tracking charges with unknown currency, one invoice without a reliable shipment link, and 24 unreferenced files (18 legacy BOM spreadsheets and 6 images). No ambiguous tracking-number grouping is applied.

The command form is:

```sh
sudo CARGO_IMPORT_DATABASE_NAME="$target_db" IMPORT_ACTOR_EMAIL='admin@avantlabstech.com' \
  docker compose --profile import run --rm --build --no-deps -T \
  -v "$snapshot_abs:/import/source:ro" import-cargo \
  --dry-run --confirm-database="$target_db" --defer-missing-photos
```

Replace `--dry-run` with `--apply` only after inspecting the preview. The importer exits nonzero on source preflight failure, source drift, identifier collision, or final count mismatch. It commits small, resumable transactions, so an interrupted rehearsal can be rerun. The production import is the same command with `target_db=store_management`, after a fresh backup and successful rehearsal.

The importer does not infer currencies, attach the orphan invoice, merge repeated tracking references, or fabricate missing images. The review queue is in `cargo_import_records` (`reviewReason IS NOT NULL`), with original facts preserved in `sourceFacts`. If the missing photos are recovered, add them to the same snapshot and rerun the importer; already imported rows remain unchanged.

Do not use `docker compose down -v`. Restoring code alone does not reverse an imported database; restore a compatible PostgreSQL backup if a full rollback is required.
