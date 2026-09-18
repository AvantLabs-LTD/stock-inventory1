# Cargo integration contract

Cargo is the logistics module of Flux. It uses Flux authentication, permission groups, navigation, PostgreSQL, and audit conventions. The standalone PakLogix deployment remains operational until a validated cutover. This document records the implementation boundary and the migration checks before live data is moved.

## Ownership and workflow

- A **shipment** is always the journey/financial/document identity. Creating a package creates a one-package shipment unless the user deliberately adds it to an existing immature shipment. Several cartons sharing transport, tracking, and invoices are several packages in one shipment.
- A **package** is one physical carton. It owns its vendor/source (`Vendor`, shared with Flux), packing-list lines, contents and carton images, physical dimensions, measured/verified weights, and its own print summary.
- The **shipment** owns route (direct courier or forwarder), forwarder and source warehouse where applicable, journey milestones, carrier/tracking legs, transport and customs costs, shared invoices/receipts, and an aggregate print summary. A shipment print/gallery can include all member packages; a package view can toggle between individual and whole-shipment material.
- `Forwarder` owns one or more source warehouses. If exactly one active warehouse is available, the UI selects it automatically. A direct-courier shipment has no forwarder or source warehouse.
- Package reassignment is allowed only before the first user-posted journey or tracking update. The initial `AT_VENDOR` creation event does not lock it. The service must reject reassignment once a subsequent milestone or tracking leg exists; no UI-only guard is sufficient. Package-linked invoices/documents and posted charges must also block reassignment, since moving them would misattribute financial history.
- Cargo never posts Vault stock movements. Explicit cross-module links can be added where a genuine demand/package connection is known; it must not infer fulfilment from a package arrival.

### Journey milestones

Store immutable milestone events on the shipment and derive the displayed stage from them. Proposed canonical sequence: `AT_VENDOR` → `TO_SOURCE_WAREHOUSE` → `AT_SOURCE_WAREHOUSE` → `IN_INTERNATIONAL_TRANSIT` → `ARRIVED_IN_COUNTRY` → `CUSTOMS_PENDING` → `CUSTOMS_CLEARED` → `OUT_FOR_DELIVERY` → `RECEIVED`. Direct-courier routes move from `AT_VENDOR` directly to `IN_INTERNATIONAL_TRANSIT`, bypassing source-warehouse stages. Exceptions such as a customs hold belong in a separate issue/exception record, not more mutually exclusive journey statuses. Preserve every original PakLogix status string as migration evidence.

Tracking is a stream of shipment legs (source-country inland, international, customs, destination inland), each with optional courier, tracking reference, dates, remarks, and costs. The direct route may have only an international carrier plus clearance/delivery steps. A leg need not be invented merely to fill a template.

### Money and documents

Every charge stores a `Decimal` amount, ISO currency code, cost category, optional journey leg and optional invoice. For RMB or USD charges, a user may enter a manual PKR equivalent with a note explaining its basis; it is a comparison value, not an exchange-rate conversion or a second charge. An invoice has its own editable face total and currency, independent of charge lines. Show derived charge totals separately and flag any discrepancy without forcing the two totals to match or double-counting them. A posted correction creates an audited revision.

Invoices, receipts, and shipping documents belong to the shipment. A document added from a package can additionally carry that package ID. Package content/carton photos remain package-owned. All protected file bytes live in PostgreSQL, selected only by a single-file endpoint; never embed bytes in list responses.

## Initial permissions

Scoped permissions cover viewing Cargo, managing reference data, creating/editing shipments and packages, posting milestones/tracking, managing costs/invoices, and managing documents. Cargo Admin, Cargo Operator, and Cargo Viewer groups are seeded. Existing Flux Admin receives every Cargo permission, and the global Viewer group receives Cargo read permissions. Cargo Operator can manage operational, cost, and document records, but not forwarders/warehouses/couriers. Do not infer Cargo access from the legacy `User.role` field.

## Current code boundary

The new `/api/v1/cargo` API and Cargo UI operate only on the new `cargo_*` tables. The API validates actions against group permissions and records elevated changes in `audit_logs`. Shipment stage is the latest immutable milestone; tracking, packing items, invoice totals, charges, and optional PKR comparisons remain independent facts. Historical PakLogix rows are **not** imported by the Prisma migration. Invoices and charges are editable with before/after audit details; the original source documents remain immutable file records. The first version's reports are operational stage and currency totals, not accounting postings.

Cargo integration tests require PostgreSQL. The Compose `test` profile refuses to use any database whose name does not start with `flux_test_`. Rehearse the schema migration on a restored disposable database, run tests there, and only then migrate production. The normal `app` service depends on `migrate`, so `docker compose up -d --build` would itself run the production migration; do not issue that command before backup and migration approval.

## Legacy data findings (2026-09-15 snapshot)

The handover has 28 packages, 51 package items, 58 active package-photo references, 113 timeline entries, 11 standalone courier-tracking rows, one invoice, and zero shipments/forwarders. Historical package weights are in kilograms and dimensions in centimeters. All 28 packages say `GLOBAL` for warehouse; no active photo record is typed `receipt`. There are six distinct package tracking-number strings across 28 packages, with four strings repeated. None of the courier-tracking rows matches a package by exact package ID or tracking number. These facts do **not** prove which cartons belong to a combined shipment.

The owner confirmed that the legacy `RECEIVED_BY_TAYYAB` label means the company received the package, so map its 21 snapshot rows to Cargo `RECEIVED`. The four `Reached in Global` rows and three case/spelling variants of `Reached in warehouse` all mean arrival at the forwarder's source warehouse, so map those seven rows to `AT_SOURCE_WAREHOUSE`. Retain the exact original strings and all 113 timeline events as migration evidence. The package's final status agrees with its latest timeline status for all 28 snapshot packages; use the latest matching timeline date as the canonical imported milestone date, rather than inventing a delivery date (none of the 28 packages has `deliveredDate`). These counts and agreement checks must be rerun against the fresh cutover snapshot.

All 58 referenced package-photo files in the handover exist and are below Cargo's 5 MB per-file limit. Eight exceed 1 MB, which is acceptable under the new 5 MB rule. The 11 standalone courier-tracking rows have no verified package link; ten are DHL and one FedEx, and all have an amount but no explicit currency. Do not silently label those amounts PKR or create charge records until their currency is reviewed. The single invoice has no tracking association or receipt file and stays in the review queue.

Migration therefore starts with one shipment per legacy package and one shipment per standalone courier-tracking record, preserving source IDs and raw values. Any proposed grouping by common tracking reference is a review queue, never an automatic merge. The invoice with no resolvable shipment reference and unreferenced files remain in a restricted review queue. `GLOBAL` is a candidate for the Global forwarder/source warehouse mapping, not an unquestioned identity match. Do not import the stale PakLogix inventory/stock tables or its password hashes into Flux.

## Delivery sequence

1. Add namespaced Cargo schema and action permissions; no legacy import yet. The first additive migration covers shipments, packages, packing items, forwarders, source warehouses, couriers, milestone events, tracking legs, costs, invoices, and documents.
2. Implement shipment/package, reference, journey, charge, document, and print views against the new schema, with PostgreSQL integration tests. This code is present locally but must pass the server-side PostgreSQL rehearsal before production activation.
3. Build an idempotent import that reports source-to-target IDs, row counts, original statuses, file hashes, unresolved identity matches, and grouping candidates. Rehearse against a disposable database and copied files.
4. Review mapping exceptions, freeze standalone Logix writes, take a final SQLite/upload backup, perform and validate the import, then enable Cargo to users. Retain the old app read-only during the rollback window.

No live Cargo route should imply the historical migration has completed until its reconciliation report passes.
