# Flux Manufacturing current-state audit

Date: 2026-09-22  
Scope: repository-wide audit against the **Flux Manufacturing Module — Audit, Design & Upgrade Guide** and the repository `AGENTS.md` contract.  
Audit type: static code, schema, migration, API, service, test, and UI review. No schema or application code was changed.

## 1. Executive decision

Flux has a suitable foundation for Manufacturing, but it is not yet manufacturing-ready.

The foundations worth preserving are:

- `Item` as the single catalogue for purchased, internally manufactured, intermediate, and finished tangible items;
- PostgreSQL and Prisma Decimal columns for inventory and purchasing quantities;
- immutable stock-changing source records plus `InventoryLedgerEntry`;
- `ItemBalance` as a transactional cache rather than an independent stock source;
- serializable domain transactions for current stock-changing services;
- AccessGroup/Permission authorization, including bounded service-token scopes;
- versioned `/api/v1` routes;
- audit entries written in the same transaction as consequential business changes;
- existing item picker, confirmation, activity, upload, import, responsive shell, and dedicated detail-page conventions.

The main conclusion is **extend, do not fork**. Manufacturing should become a new Flux module that reuses `Item`, `ProjectTag`, `DepartmentTag`, `Vendor`, `User`, the permission system, the audit log, and the inventory ledger. It should add versioned manufacturing definitions, planning, event-based execution, traceability, quality, and delivery facts.

Significant implementation should not start until a small cross-cutting hardening slice is complete:

1. define a reusable canonical ledger-posting helper and location semantics;
2. standardize idempotency and payload-conflict behavior;
3. remove JavaScript-number arithmetic from domain quantity paths;
4. add parent-aware structured audit support;
5. decide whether `ProjectTag` is deliberately the long-term project identity or needs additive project metadata;
6. define the boundary between legacy `PurchaseRequest` and the newer `ProcurementOrder` before subcontracting integration.

## 2. Repository and ERP map

| Area | Current state | Manufacturing relevance |
| --- | --- | --- |
| Flux shell | Live Next.js shell with URL-backed client navigation | Add Manufacturing as a first-class module and dedicated detail routes |
| Vault catalogue | Live canonical `Item` and hierarchical `ItemCategory` | Reuse directly; add optional manufacturing profile |
| Vault inventory | Live global on-hand/reserved balance and immutable ledger | Extend with locations/lots/serials; do not create a manufacturing ledger |
| Vault demand | Live demand approval, allocation, issue, return, cancellation, purchase coverage | Reuse concepts and services where useful; do not treat a demand as a production order |
| Legacy purchasing | Live `PurchaseRequest`, links, receipts, attachments | Existing stock receipt path; compatibility domain |
| Orders | Live supplier/marketplace `ProcurementOrder` foundation | Potential long-term procurement link, but it currently does not receive stock |
| Cargo | Live shipment/package journey, costs, documents, imports | Reusable idempotency/action-validation and upload UX patterns only |
| People | Planned placeholder | Manufacturing operators currently reference `User` directly |
| Ledger/Finance | Planned placeholder | No costing or finance integration should be added in this manufacturing release |
| Manufacturing | Absent | New module required |
| Quality | Absent | New bounded module required |
| Delivery/dispatch | Absent | Minimal new delivery domain required |

## 3. Current-state audit

### 3.1 Prisma and shared identities

`Item` is already the canonical physical-item record (`prisma/schema.prisma:323`). It contains code, title, discipline, category, technical/supplier identity, unit, lifecycle status, balance, demand, ledger, purchasing, receipt, order, and adjustment relations. This is the correct aggregate root for manufacturing configuration. A separate manufactured-product catalogue would be a regression.

`ProjectTag` (`prisma/schema.prisma:266`) and `DepartmentTag` (`prisma/schema.prisma:251`) are stable reference records, but they are intentionally thin. `ProjectTag` currently only relates to demand lines. It has no customer, department owner, lifecycle, production targets, deliveries, or BOM relations. The manufacturing design can reuse its ID, but project-level authorization and reporting cannot be inferred from the present schema.

`Vendor` (`prisma/schema.prisma:302`) is shared across legacy purchasing, Cargo packages, and Orders. It is sufficient as the subcontractor identity. Do not create a manufacturing vendor table.

`User` (`prisma/schema.prisma:142`) is sufficient for creator, approver, inspector, and operator references. There is no employee skill, work-center assignment, or department membership model; these are not required for the initial release unless project/department scoping is enforced.

All current inventory and purchase quantities use `Decimal`, mainly `Decimal(18,6)`. Cargo and Orders use domain-specific scales. Manufacturing should use `Decimal(18,6)` for general quantities and explicit smaller scales only for measurements where justified.

### 3.2 Inventory transaction architecture

The current stock design has three layers:

1. immutable business sources (`DemandIssueLine`, `DemandReturnLine`, `GoodsReceiptLine`, `InventoryAdjustmentLine`);
2. immutable `InventoryLedgerEntry` rows with signed quantity, source identity, actor, and resulting balance (`prisma/schema.prisma:569`);
3. `ItemBalance` with `onHand`, `reserved`, and an optimistic version (`prisma/schema.prisma:365`).

The unique ledger key `(sourceType, sourceLineId)` is a good retry barrier. Demand issue, return, adjustment, and purchase receipt services update the source record, balance cache, ledger, and audit inside serializable Prisma transactions (`src/lib/inventory-service.ts`, `src/lib/purchase-service.ts`). This is the correct integration point for manufacturing material movements and finished-goods receipt.

Current limitations:

- inventory is global per item; there is no location, lot, or inventory serial identity;
- `onHandAfter` only describes the global cache, so a location-to-location transfer has no representation;
- stock posting logic is duplicated across issue, return, adjustment, receipt, and import reconciliation;
- balance rows are not consistently locked explicitly before calculation; serializable isolation protects correctness but retry/error handling is inconsistent;
- receipt code loads purchase lines and prior receipts without a row lock before over-receipt validation;
- return code checks prior returns without locking the original issue line;
- `apiError` does not map Prisma serialization conflict `P2034` to a stable retryable conflict;
- the integration suite has no concurrent stock-posting test despite the repository contract requiring it.

Decision: keep `InventoryLedgerEntry` authoritative, add location/lot/serial context to it, and centralize balance locking/posting before Manufacturing posts stock.

### 3.3 Demand, reservation, and project-cycle functionality

The current Demand domain is mature for direct store demand:

- initial requested quantity is stored;
- manager approval stores an explicit total split between stock and procurement;
- approval revisions, issues, returns, and cancellations are immutable facts;
- allocation and fulfilment facets are derived through database views;
- purchase coverage is explicit through `DemandPurchaseLink`;
- issue and return actions are partial and idempotent.

However, there is no reservation-request pre-conversion type, accepted project BOM, BOM hierarchy, cycle number, BOM version binding, cycle set count, recursively derived child demand, blocker calculation, or multiple project manufacturing cycles. A project is only an optional tag on an individual demand line.

The manufacturing guide's Production Order must therefore be a separate planning/execution aggregate. It should not be implemented as another mutable status on `Demand`. Where a production order requires store material, use explicit production-material reservation/link records that post through the same inventory service.

### 3.4 Purchasing and subcontracting boundary

The repository contains two procurement concepts:

- `PurchaseRequest`: backlog-to-received workflow, demand coverage links, receipts, attachments, and physical stock posting;
- `ProcurementOrder`: supplier/marketplace order record, package links, and catalogue reconciliation, but no stock receipt or demand coverage.

This split is documented as transitional. Manufacturing must not deepen the duplication. For the first Manufacturing release:

- reuse `Vendor` for subcontracted operations;
- store subcontract execution facts on the operation run/posting;
- do not silently create either purchase model for subcontracting;
- add an explicit optional procurement link only after the Orders/Vault purchasing ownership decision is made.

### 3.5 Authorization and automation

Access control is group-derived (`Permission`, `AccessGroup`, join tables) and server routes call `hasPermission`. The legacy role enum is explicitly a compatibility projection. This is the right foundation for manufacturing capabilities and avoids hard-coded job titles.

Service tokens are scoped to permissions that the backing user's live groups still grant. This supports approved automation clients.

Gaps:

- there are no `manufacturing.*`, `quality.*`, or `delivery.*` permissions;
- `User` has no department membership, so “own department/projects” cannot currently be enforced;
- there is no assignment model for “my production”; initial UX must either show all authorized work-center work or add explicit operator assignment;
- some services accept actor data passed by their route; routes currently obtain it from the session, which is correct and must remain mandatory.

### 3.6 Idempotency

There are two patterns:

- Inventory/purchasing uses per-header unique `idempotencyKey` fields. Most operations compare replay payloads, but `adjustInventory` returns an existing record without verifying the new payload.
- Cargo uses `CargoRequestKey` with actor, action, canonical request hash, and saved response. It validates key format and detects payload conflicts.

Manufacturing has many high-frequency consequential endpoints. The Cargo request-key behavior is the stronger model, but the Cargo-specific table should not be reused by name. Add a generic idempotency record or extract the logic into a shared service with actor, module/action, key, request hash, response, and retention policy.

### 3.7 Audit architecture

`AuditLog` records actor, action, direct entity type/ID, stringified details, IP address, and date (`prisma/schema.prisma:732`). Services generally write audits transactionally.

The UI `ActivityTimeline` queries only exact `entityType` and `entityId` and does not render structured detail. This cannot produce the required Production Order timeline when the actual event belongs to a WIP lot, posting, operation run, inspection, serial, or delivery.

Add parent/root correlation fields (for example `rootEntityType` and `rootEntityId`) and structured `metadata Json?`, keeping existing columns for compatibility. Every child manufacturing event should point to its production order root. The audit API should support root aggregation and pagination.

### 3.8 API architecture

Canonical routes are under `/api/v1`. Authentication and permission checks are server-side. Newer Cargo and Orders routes use action maps, Zod validation, domain services, stable error codes, and bounded pagination. Vault routes are more fragmented and several contain business logic directly.

For Manufacturing, use thin route handlers and module services. Reuse the Cargo conventions for:

- action-to-permission mapping;
- canonical request hashing;
- stable domain errors;
- conflict mapping;
- bounded filters and pagination;
- transactional audit.

Do not copy Cargo's single multi-action endpoint mechanically. Manufacturing benefits from explicit resource/posting endpoints because release, advance, hold, scrap, serialization, inspection, and delivery have materially different invariants.

### 3.9 UI architecture and reusable components

Reusable pieces already present:

- `PageHeader` for module and detail headers;
- `ItemPicker` for searchable, categorized catalogue selection;
- `ConfirmActionDialog` for consequence-first final confirmation;
- `ActivityTimeline`, once extended to parent-aware events;
- Radix/shadcn dialog, sheet, drawer, tabs, command, popover, table, tooltip, select, input, and responsive sidebar primitives;
- Cargo identifier suggestions and datalist behavior as a starting point for client-serial suggestions;
- Cargo clipboard file paste and 5 MB validation;
- demand XLSX template/import patterns;
- dedicated Orders detail routes and wide workspace detail behavior;
- mobile sidebar and responsive grid/table utilities.

Limitations:

- no reusable virtualized or server-search data table abstraction;
- no generic multi-row spreadsheet paste grid;
- no barcode/QR abstraction;
- no drag-sort route builder despite `@dnd-kit` dependencies being installed;
- no numeric Decimal input/parser shared between UI and API;
- some current UI totals use `Number`, including stock free quantity and receipt arithmetic;
- several very large single-file page components should not be extended with Manufacturing.

Manufacturing should have its own feature directory with page-level components and bounded dialogs, while continuing to use the shared shell and primitives.

### 3.10 Uploads and documents

The existing upload limit is centralized at 5 MB. Purchase attachments are PostgreSQL `bytea`; Cargo files add SHA-256, byte-length checks, and file-signature validation. Cargo is the stronger reusable implementation.

BOM XLSX upload should use the same hard limit, safe filename handling, content-type and signature checks, preview-before-commit, and audit approach. QTR should be generated from structured facts; generated output can be streamed or stored as an immutable document snapshot if business retention requires it.

### 3.11 Deployment and operations

The repository uses PostgreSQL, committed Prisma migrations, one-shot `prisma migrate deploy`, an internal-only database, persistent database/secrets volumes, a health endpoint, and an unprivileged app container. This satisfies the deployment baseline.

Every manufacturing phase must remain additive and deployable through `compose.yml`. Back up before each migration-bearing release. No destructive cleanup belongs in early phases.

### 3.12 Tests

Current automated coverage includes demand approval/issue/return, adjustments, partial receipts, Cargo workflows, service-token scope/revocation, item import parsing, and item search/code generation.

Missing prerequisite coverage includes:

- concurrent issue/receipt/adjustment against one balance;
- retry behavior for Prisma serialization conflicts;
- ledger/cache rebuild equivalence;
- permission matrix coverage for all current roles/groups;
- attachment boundary and signature cases across both attachment implementations;
- Decimal precision across API serialization and UI-derived values.

Manufacturing will require the full domain suite in section 15 below.

### 3.13 Historical/stale implementation evidence

`worklog.md` mentions a former `ProjectBomItem` and project BOM API. Neither exists in the current Prisma schema, migrations, routes, or components. It is not a reusable current abstraction and must not be treated as migrated manufacturing history. If an older deployed database contains those tables, they need an explicit pre-migration discovery query and preservation decision.

## 4. Target-concept decision table

| Target concept | Existing equivalent | Status | Decision |
| --- | --- | --- | --- |
| ManufacturingProfile | None | Missing | Add optional 1:1 profile on `Item` |
| SupplyMode / TrackingMode | Procurement type is unrelated | Missing | Add manufacturing enums |
| BillOfMaterial | No current model | Missing | Add item-owned BOM with optional project applicability |
| BOM revision | None | Missing | Add immutable released version |
| Hierarchical BOM line | No current model | Missing | Add self-parent relation to satisfy project BOM contract and nested make items |
| ManufacturingOperation | None | Missing | Add reusable operation definition |
| WorkCenter | DepartmentTag is an organizational tag, not a capability | Missing | Add separate work-center model |
| ProductionResource | No asset/resource model | Missing | Add minimal resource identity/status |
| ManufacturingRoute | Cargo route is logistics-specific | Missing | Add manufacturing route and versions |
| RouteStep requirement | No equivalent | Missing | Add typed requirement definitions and typed captured values |
| ProductionPlan | No equivalent | Missing | Add project plan and lines |
| ProductionOrder | Demand and ProcurementOrder are different concepts | Missing | Add separate execution document |
| Released definition snapshot | No equivalent | Missing | Add order components and operations |
| WIP lot/batch | CargoPackage is physical shipping, not WIP | Missing | Add manufacturing WIP identity |
| Production posting | Ledger is stock movement, not stage movement | Missing | Add immutable production postings |
| OperationRun | No equivalent | Missing | Add run records for operator/resource/vendor context |
| Manufacturing adjustment | InventoryAdjustment changes stock only | Missing | Use production posting `ADJUST` plus approval permission/reason |
| Serial rule/sequence/reservation | No equivalent | Missing | Add transaction-safe serial subsystem |
| ProductionUnit | Inventory Item is a catalogue definition, not a unit | Missing | Add serialized manufactured unit |
| Component genealogy | No equivalent | Missing | Add production-unit component links |
| Inventory lot | None | Missing | Add canonical inventory lot |
| Inventory serial | None | Missing | Add purchased/inventory serial record, distinct from ProductionUnit |
| Inventory location | None | Missing | Add location and location balance projection; extend ledger |
| Quality template/inspection | None | Missing | Add structured quality domain |
| QTR | No equivalent | Missing | Generate from quality/production facts |
| Delivery/dispatch | Cargo inbound journey is not project delivery | Missing | Add minimal delivery, lines, and unit links |
| Permission infrastructure | AccessGroup/Permission | Existing | Extend with module permissions/groups |
| Audit activity | AuditLog | Partially existing | Extend for structured parent-aware activity |
| Idempotency | Per-domain patterns | Partially existing | Standardize generic request-key service |
| Attachments | Purchase Attachment and CargoFile | Partially existing | Reuse rules; converge shared document service later |
| Item search | ItemPicker and item APIs | Existing | Reuse, with server search for large lists |
| Client serial suggestion | Cargo identifier suggestion only | Partially existing | Reuse UX pattern, implement scoped sequence query |
| Multi-row import/paste | Demand XLSX import, no generic grid paste | Partially existing | Add manufacturing-specific batch grid/paste component |

## 5. Gap analysis by requirement group

| Requirement group | Assessment | Notes |
| --- | --- | --- |
| Preserve Item/ledger/Decimal/API/permissions | Partially existing | Strong schema/service foundation; Decimal leaks and duplicated posting need refactor |
| Definition vs planning vs execution vs traceability | Missing | No manufacturing domain |
| In-house components as Items | Existing foundation | `Item` already supports it conceptually |
| BOM revision control and snapshots | Missing | Must support project applicability and hierarchy |
| Operations, work centers, resources | Missing | Department cannot substitute for work center |
| Route revision and typed requirements | Missing | Use relational typed capture, limited JSON only for resource metadata |
| Production plans/orders | Missing | ProjectTag can be referenced |
| Release transaction | Missing | New service with generic idempotency |
| WIP genealogy and event postings | Missing | New execution core |
| Hold/rework/scrap/adjustment | Missing | New explicit dispositions and authorized transitions |
| Operation runs | Missing | New run model |
| Serialization | Missing | New locked sequence and reservation models |
| Component genealogy | Missing | New selective trace links |
| Lots/serials/locations | Missing | Extend canonical inventory, not manufacturing-only stock |
| Material flow | Partially existing | Ledger posting exists; production sources and locations do not |
| Quality/QTR | Missing | New structured facts and report generation |
| Subcontracted operations | Partially existing | Vendor exists; execution/procurement link missing |
| Delivery | Missing | Cargo is inbound logistics and not a substitute |
| Dashboard/plan/order/shop-floor UX | Missing | Shared UI primitives exist |
| Activity aggregation | Requires refactor | Direct-entity audit query is insufficient |
| Server authorization | Existing foundation | Add granular permissions; project scoping unresolved |
| Concurrency/integrity tests | Requires refactor | Current suite lacks required concurrency coverage |
| Mobile/tablet shell | Partially existing | Responsive shell exists; manufacturing interactions need purpose-built layouts |

## 6. Proposed domain and schema changes

The following is a design proposal, not an instruction to apply all tables in one migration.

### 6.1 Definitions (Phase 1)

Add:

- `ManufacturingProfile(itemId unique, supplyMode, trackingMode, defaultBomVersionId?, defaultRouteVersionId?, serialNumberRuleId?, serializationRouteStepId?, traceInFinishedProduct, createdAt, updatedAt)`.
- `BillOfMaterial(id, itemId, name, projectTagId?, status, createdById, createdAt, updatedAt)`.
- `BomVersion(id, bomId, revision, status, effectiveFrom?, effectiveTo?, createdById, approvedById?, approvedAt?, createdAt)`.
- `BomLine(id, bomVersionId, itemId, parentLineId?, sourceLineKey?, quantity, unit?, scrapAllowance?, consumptionRouteStepId?, notes?, sortOrder)`.
- `ManufacturingOperation(id, code, name, description?, defaultWorkCenterId?, status, createdAt, updatedAt)`.
- `WorkCenter(id, code, name, description?, status)`.
- `ProductionResource(id, code, name, resourceType, workCenterId?, status, metadata?)`.
- `ManufacturingRoute(id, itemId?, name, description?, status)`.
- `RouteVersion(id, routeId, revision, status, effectiveFrom?, effectiveTo?, createdById, approvedById?, approvedAt?, createdAt)`.
- `RouteStep(id, routeVersionId, operationId, sequence, nameOverride?, workCenterId?, executionMode, qualityTemplateId?, isSerializationPoint, active)`.
- `RouteTransition(id, routeVersionId, fromStepId, toStepId, transitionType)`.
- `RouteStepRequirement(id, routeStepId, requirementType, key, label, requiredAt, required, allowMultiple, sequence, resourceTypeFilter?)`.

Important deviations/clarifications from the brief:

- BOM lines include `parentLineId` because the repository contract explicitly requires hierarchical project BOMs and blocker paths.
- `BillOfMaterial.itemId` identifies the output item; `projectTagId` narrows applicability without making project-specific catalogue items.
- definitions use lifecycle status rather than destructive deletion once referenced.
- normal forward transitions are generated from step sequence; only rework/alternative transitions require explicit rows.
- captured requirement values should be typed child rows on an `OperationRunRequirementValue`, with foreign keys for operator/resource/vendor/lot and scalar columns for text/number/date. Arbitrary JSON is not authoritative execution data.

Key constraints/indexes:

- unique BOM revision per BOM and route revision per route;
- unique source line key per BOM version when present;
- unique route-step sequence per version;
- unique operation/resource/work-center codes (case-insensitive indexes);
- checks for positive quantity, nonnegative scrap allowance, nonnegative sequence;
- service validation for parent same-version and acyclic hierarchy;
- partial unique index allowing one `ACTIVE` version per BOM applicability and route unless concurrent effectivity is explicitly enabled;
- released/active versions become immutable through service rules and preferably database triggers protecting definition rows.

### 6.2 Planning and release snapshots (Phase 2)

Add:

- `ProductionPlan(id, projectTagId, name, status, notes?, createdById, createdAt, updatedAt)`.
- `ProductionPlanLine(id, productionPlanId, itemId, targetQty, requiredDate?, priority?, notes?, sortOrder)`.
- `ProductionOrder(id, orderNumber, projectTagId, productionPlanLineId?, itemId, plannedQty, bomVersionId, routeVersionId, status, plannedStart?, plannedEnd?, actualStart?, completedAt?, createdById, releasedById?, releasedAt?, cancelledById?, cancelledAt?, cancellationReason?)`.
- `ProductionOrderComponent(id, productionOrderId, sourceBomLineId?, parentComponentId?, itemId, requiredQty, unit, scrapAllowance?, consumptionProductionOperationId?, traceInFinishedProduct, snapshotDescription?)`.
- `ProductionOperation(id, productionOrderId, sourceRouteStepId?, operationId, sequence, name, workCenterId?, executionMode, qualityTemplateId?, isSerializationPoint)`.
- snapshot requirement and allowed-transition rows tied to `ProductionOperation`, so editing the master route cannot alter execution validation.

The order stores exact source version IDs and executable snapshots. Derived plan figures are views/queries, not editable counters.

Constraints/indexes include unique order number, positive planned/target quantities, unique operation sequence per order, indexes on project/status/date/work center, and immutability after release.

### 6.3 Execution (Phase 3)

Add:

- `WipLot(id, productionOrderId, code, parentWipLotId?, status, createdAt)`.
- `ProductionPosting(id, productionOrderId, sourceWipLotId?, sourceProductionOperationId?, performedById, performedAt, idempotencyRecordId, notes?)`.
- `ProductionPostingLine(id, productionPostingId, disposition, quantity, targetWipLotId?, targetProductionOperationId?, reasonCodeId?, sequence)`.
- `OperationRun(id, productionOperationId, wipLotId, startedQuantity, operatorId?, productionResourceId?, vendorId?, startedAt, endedAt?, status, notes?)`.
- typed operation-run requirement values.
- optional `ProductionReasonCode` for configured hold/rework/scrap reasons.

`WipLot.quantity` and current operation should not be independently editable facts. The recommended authoritative model is an immutable initial/release posting plus subsequent posting lines. A rebuildable projection may cache current lot quantity and operation for list performance.

All move/hold/rework/scrap/adjust actions lock the affected lot projection, validate legal snapshot transitions, conserve quantity, post immutable facts, refresh the projection, and create root-correlated audit in one serializable transaction.

### 6.4 Inventory extensions (Phase 4)

Add:

- `InventoryLocation(id, code, name, type, status)`.
- `ItemLocationBalance(itemId, locationId, onHand, reserved, version)` as a rebuildable transactional projection.
- `InventoryLot(id, itemId, lotNumber, vendorLotNumber?, receivedAt?, expiryAt?, status)`.
- `InventorySerial(id, itemId, serialNumber, inventoryLotId?, locationId?, status)`.
- `ProductionMaterialRequirement` or an order-component-to-demand/reservation association recording the explicit reservation decision.
- optional consumption lines linked to `ProductionOrderComponent`, `ProductionOperation`, `InventoryLot`, and `InventorySerial` where tracing is required.

Extend `InventoryLedgerEntry` with location and trace dimensions rather than creating another ledger. Before migration, define one consistent transfer representation. Recommended: add `fromLocationId?`, `toLocationId?`, `inventoryLotId?`, `inventorySerialId?`, and a `TRANSFER` type whose quantity does not change aggregate `ItemBalance` but atomically changes two `ItemLocationBalance` rows. Receipt/issue/consumption/finished receipt use the relevant single location and continue changing aggregate on-hand when physical ownership changes.

Initial WIP policy: WIP lots are operational identities, not a second inventory balance. Raw material remains inventory at a WIP location until consumed. Finished goods become inventory only through a finished-receipt ledger posting. This avoids double-counting.

### 6.5 Serialization and traceability (Phase 5)

Add:

- `SerialNumberRule(id, name, pattern, sequenceScope, padding, status)`.
- `SerialSequence(id, serialNumberRuleId, projectTagId?, itemId?, period?, lastValue)` with a unique scope key and locked increment.
- `SerialReservation(id, productionOrderId, serialNumber, status, reservedAt, activatedAt?, voidedAt?, productionUnitId?)`.
- `ProductionUnit(id, productionOrderId, itemId, sourceWipLotId?, internalSerial, clientSerial?, status, serializedAt, readyAt?, deliveredAt?)`.
- `ProductionUnitComponent(id, productionUnitId, componentItemId, inventorySerialId?, inventoryLotId?, componentProductionUnitId?, role?, quantity)`.

Use globally unique internal serials. Client serial uniqueness must be finalized with the business; default proposal is `(projectTagId, itemId, clientSerial)` because no Customer model exists. Do not invent a customer entity only for serial scope.

### 6.6 Quality (Phase 6)

Add the brief's `QualityTemplate`, `QualityParameter`, `QualityInspection`, and `QualityResult` records. A result row uses exactly one typed value appropriate to its parameter, enforced by service and checks. Numeric result outcome is derived from configured bounds; an authorized deviation should be a separate immutable disposition if later required.

QTR is a generated read/report model over ProductionOrder, ProductionUnit, definition snapshots, genealogy, inspections, operation runs, actors, resources, and dates. Do not add editable QTR totals.

### 6.7 Delivery (Phase 7)

Add minimal `Delivery`, `DeliveryLine`, and `DeliveryUnit`. Reuse `ProjectTag`, `Item`, `ProductionUnit`, and `User`. Add a unique constraint preventing one production unit from appearing in more than one active delivery; if cancellations are supported, enforce this with a partial unique index or explicit immutable reversal facts.

Do not reuse Cargo: Cargo models inbound supplier logistics, not customer/project dispatch.

### 6.8 Cross-cutting modifications

- Add generic `IdempotencyRecord(actorId, key, action, requestHash, response, createdAt)` with `(actorId,key)` uniqueness.
- Extend `AuditLog` with root entity correlation and JSON metadata.
- Add Manufacturing/Quality/Delivery relations to `Item`, `ProjectTag`, `Vendor`, and `User`.
- Add permission keys and groups through data migrations.
- Replace domain quantity `Number(...)` arithmetic with Decimal-safe strings and helpers.
- Keep Prisma migrations additive and explicitly named; do not use `db push`.

## 7. Workflow specification

### Order creation

Create a DRAFT order for an Item with a manufacturing profile, project, planned quantity, exact draft BOM version, and route version. Creation has no stock or WIP effect.

### Release

Permission: `manufacturing.orders.release`. Legal source: DRAFT/PLANNED. In one serializable, idempotent transaction: lock order; validate item/profile, quantity, active/approved BOM and route, serialization configuration, and project applicability; snapshot BOM, route, requirements, and transitions; derive material requirements; reserve serial range if configured; create initial WIP through an explicit initialization fact if policy enables it; set RELEASED; audit. Replay returns the original response; a changed payload conflicts.

### Material reservation and issue

Permission: Inventory-specific manufacturing permissions. Reserve exact order requirement quantities against canonical inventory facts. Issue Main Store to Production/WIP through the ledger/location service. Validate item, order state, requirement, free stock, lot/serial policy, and no over-issue. Return unused material through a compensating transfer. Consumption is a separate fact and ledger effect where physical stock leaves inventory.

### Start operation

Permission: `manufacturing.execution.start`. Lock the WIP projection, verify quantity and operation, capture all START requirements, create `OperationRun`, and audit. Starting work does not itself move quantity.

### Advance / hold

Permission: `manufacturing.execution.post`. Legal source: active run/lot at the source operation. Validate `advance + hold + scrap <= available`, capture COMPLETE/TRANSITION requirements, create one posting with disposition lines, split/create target lots as needed, close or reduce the run, refresh projections, and audit. Remaining is derived.

### Rework

Only an explicitly snapshotted REWORK transition is legal. Post quantity from hold/failed operation to its configured target. History remains linked through source/target WIP genealogy.

### Scrap

Require reason and `manufacturing.scrap.post` (or a two-step approval permission if the business confirms it). Remove quantity from active WIP via immutable posting. If material/WIP inventory is represented physically, post the corresponding ledger movement to Scrap/consumption. Reversal is a new authorized compensating posting.

### WIP adjustment

Permission: `manufacturing.wip.adjust`. Require reason. Never overwrite a projection. Post `ADJUST` with before/after evidence; positive adjustments may require approval because they create production quantity. Audit prominently.

### Serialization/finalization

At the snapshotted serialization step, lock the serial sequence and WIP, bind reserved internal serials to physical units, validate unique client and component serials, create ProductionUnits/genealogy/inspection links, consume equivalent WIP quantity, and mark units IN_PRODUCTION or READY depending on quality completion. Batch request is atomic unless the UI explicitly supports independent row outcomes.

### Quality

Create inspection from the snapshotted template. Record typed results. Derive pass/fail. A failure may create quality hold/rework posting according to configured transition. Completion/Ready requires all mandatory final inspections and QTR data.

### Order completion/closure

COMPLETED is derived/validated only when the planned non-cancelled quantity is ready/scrapped as allowed and no unresolved active WIP or mandatory inspection remains. CLOSED is an explicit administrative finalization after reconciliation. Neither status may hide unresolved quantity.

### Delivery

Permission: `delivery.manage`. Create delivery and link specific READY ProductionUnits. Validate project/item, uniqueness, and readiness. Post immutable delivery facts, set unit delivery state, and audit against both delivery and production-order roots. Delivered plan quantity derives from these links.

## 8. API plan

Reused APIs/services:

- `/api/v1/items` and item search/picker;
- `/api/v1/reference-data` only for existing ProjectTag/Vendor/Department data;
- session/service-token authentication and AccessGroup permission checks;
- canonical inventory posting service after hardening;
- audit query after root correlation extension.

New resource APIs:

- `/api/v1/manufacturing/profiles`
- `/api/v1/manufacturing/boms` and `/boms/:id/versions`
- `/api/v1/manufacturing/routes` and `/routes/:id/versions`
- `/api/v1/manufacturing/operations`
- `/api/v1/manufacturing/work-centers`
- `/api/v1/manufacturing/resources`
- `/api/v1/manufacturing/plans` and `/plans/:id`
- `/api/v1/manufacturing/orders` and `/orders/:id`
- `/api/v1/manufacturing/orders/:id/release|cancel|complete|close`
- `/api/v1/manufacturing/orders/:id/materials/reserve|issue|return|consume`
- `/api/v1/manufacturing/wip/:id/start|advance|hold|rework|scrap|adjust`
- `/api/v1/manufacturing/operation-runs/:id/complete`
- `/api/v1/manufacturing/orders/:id/serialize`
- `/api/v1/manufacturing/client-serial-suggestions`
- `/api/v1/quality/templates` and `/quality/inspections`
- `/api/v1/deliveries`

Every posting endpoint must require an `Idempotency-Key` header, validate a canonical request hash, use serializable transaction plus explicit row locks for contested records, write audit in that transaction, and return stable conflict/retry error codes. Do not accept actor IDs from request bodies.

Definition editing may use ordinary optimistic version checks. Release and postings require pessimistic locking/serializable retry handling.

## 9. Permission plan

Add granular keys rather than job titles:

- `manufacturing.view`
- `manufacturing.definitions.manage`
- `manufacturing.plans.manage`
- `manufacturing.orders.manage`
- `manufacturing.orders.release`
- `manufacturing.execution.view`
- `manufacturing.execution.start`
- `manufacturing.execution.post`
- `manufacturing.holds.manage`
- `manufacturing.rework.post`
- `manufacturing.scrap.post`
- `manufacturing.wip.adjust`
- `manufacturing.units.finalize`
- `manufacturing.materials.reserve`
- `manufacturing.materials.issue`
- `manufacturing.materials.return`
- `quality.templates.manage`
- `quality.inspect`
- `quality.holds.manage`
- `delivery.view`
- `delivery.manage`

Seed system groups such as Manufacturing Operator, Manufacturing HOD, Manufacturing Admin, Quality, and Manufacturing Inventory, while allowing custom group composition. Flux Admin receives all new permissions through the migration.

## 10. UI plan

New dedicated routes/screens:

- `/manufacturing` management dashboard;
- `/manufacturing/plans` and `/manufacturing/plans/:id`;
- `/manufacturing/orders` and `/manufacturing/orders/:id`;
- `/manufacturing/floor` tablet-first work queue;
- `/manufacturing/boms`, `/routes`, `/operations`, `/work-centers`, `/resources`, `/serial-rules`;
- `/quality/templates`, `/quality/inspections`;
- `/deliveries` and `/deliveries/:id`.

Production Order uses a dedicated page with Overview, Production, Materials, Units, Quality, and Activity tabs. Bounded consequential interactions use dialogs: Release, Start Operation, Move Units, Hold, Rework, Scrap, Adjust WIP, Issue/Return Material, Finalize Units, and Delivery.

Reuse `ItemPicker`, `PageHeader`, `ConfirmActionDialog`, tabs, command/popover selection, Cargo suggestion behavior, file paste, demand import, and responsive sidebar. Extend rather than copy ActivityTimeline.

Add purpose-built components:

- Decimal-safe quantity input with live conservation summary;
- route progress visualization;
- work-center task card;
- requirement-aware start/complete form;
- batch serial grid with TSV paste and duplicate validation;
- linear drag-sort route builder with separate rework configuration;
- BOM table/import preview;
- quality parameter renderer;
- exception cards.

Use `Batch`, `Stage`, `Move Units`, and `Machine / Equipment` in operator-facing UI. Keep WIP/posting/transition terms inside services and admin diagnostics.

## 11. Migration plan

1. Run preflight queries for unknown legacy production/BOM tables because `worklog.md` indicates removed historical functionality.
2. Back up PostgreSQL.
3. Add generic idempotency, audit root metadata, manufacturing permissions, and ledger hardening additively.
4. Add definition tables with no effect on current reads/writes.
5. Add planning/snapshot tables and new routes.
6. Add event execution tables and projections.
7. Add inventory locations/lots/serials. Create a `MAIN_STORE` location and backfill each existing `ItemBalance.onHand` to its location balance without creating fabricated historical movement. Record the backfill as migration provenance, not as fake receipts.
8. Switch current stock services to the centralized posting helper while preserving their source records and APIs.
9. Add serialization, quality, and delivery tables.
10. Add indexes concurrently where deployment practice permits; validate constraints after backfill.
11. Do not remove `ItemBalance`, legacy purchasing, role fields, or existing audit columns in the initial release.

Historical aggregate records remain aggregate. Never fabricate WIP genealogy, serials, operators, resources, or lots. Existing ledger entries may have null locations and mean legacy global stock; the migration must document that interpretation.

## 12. Reviewable implementation sequence

### Phase 0 — Cross-cutting readiness

- Decimal-safe API/UI helpers;
- canonical inventory posting/locking service;
- generic idempotency service;
- parent-aware structured audit;
- manufacturing permission migration;
- project identity and procurement-boundary decisions;
- concurrency tests for existing stock operations.

### Phase 1 — Definitions

- profile, work center, resource, operation;
- BOM/version/line and route/version/step/requirement/transition;
- definition services, permissions, APIs, admin UI;
- active-version and immutability tests.

### Phase 2 — Planning and release

- plan, plan line, production order;
- snapshot models;
- transactional idempotent release;
- order/plan detail and basic dashboard;
- snapshot immutability tests.

### Phase 3 — WIP execution

- WIP lots, postings, runs, projections;
- advance, hold, rework, scrap, adjustment;
- shop-floor UI;
- conservation, partial posting, race, replay, and rework tests.

### Phase 4 — Inventory integration

- locations/lots/serials;
- material requirement/reservation/issue/return/consumption;
- finished receipt;
- ledger reconciliation and no-double-count tests.

### Phase 5 — Serialization and genealogy

- serial rule/sequence/reservation;
- ProductionUnit and component genealogy;
- client-serial suggestion and batch finalization UI;
- allocation race and uniqueness tests.

### Phase 6 — Quality and QTR

- templates/parameters/inspections/results;
- quality holds and authorized disposition;
- generated QTR;
- bound evaluation and completion-gating tests.

### Phase 7 — Delivery

- delivery facts and serialized-unit linking;
- plan/dashboard delivered projections;
- duplicate-delivery tests.

### Phase 8 — Hardening

- full permission matrix;
- load/query-plan review and projection rebuild tooling;
- migration rehearsal from a production-like backup;
- tablet/shop-floor usability and accessibility;
- end-to-end success-scenario test.

## 13. Decisions that require business confirmation

These are the only material ambiguities that should block their respective phases:

1. Is `ProjectTag` the permanent project identity, and how are users restricted to their own department/projects?
2. Is client serial uniqueness scoped by Project + Item, or is a Customer identity required?
3. At order release, are serials always reserved, optionally reserved, or reserved only at finalization?
4. Does positive WIP adjustment require a second approver?
5. Which item classes keep raw/intermediate stock in WIP locations versus immediate consumption?
6. Which current procurement aggregate owns subcontract service orders: legacy PurchaseRequest, ProcurementOrder, or no procurement link in release one?
7. Does scrap move physical material to an inventory Scrap location, immediately consume it, or vary by item policy?

## 14. High-priority engineering findings

| Priority | Finding | Consequence | Required response |
| --- | --- | --- | --- |
| P0 | No manufacturing domain exists | End-to-end scenario is impossible | Implement in phased module, not schema dump |
| P0 | Inventory has no location/lot/serial semantics | Material flow and genealogy cannot be truthful | Extend canonical ledger and projections |
| P0 | No event-based WIP model | Quantity conservation/rework/history cannot be enforced | Add immutable postings and locked projections |
| P1 | ProjectTag has no ownership/customer scope | Authorization and client serial scope are ambiguous | Confirm project identity model before planning |
| P1 | Two procurement domains coexist | Subcontract integration could deepen duplication | Decide ownership before integration |
| P1 | Audit cannot aggregate child events | Required order timeline cannot be built | Add root correlation and structured metadata |
| P1 | Idempotency behavior is inconsistent | Replays can conflict or return wrong prior result | Standardize request hash/response records |
| P1 | Decimal values leak into JS Number arithmetic | Precision may be lost | Add Decimal-safe serialization/calculation helpers |
| P1 | Current concurrency tests are absent | Existing and future stock races are insufficiently proven | Add PostgreSQL race tests in Phase 0 |
| P2 | Large feature pages are monolithic | Manufacturing UI would become hard to review/maintain | Use feature directories and bounded components |
| P2 | Upload implementations are duplicated | Security behavior can diverge | Reuse Cargo's stronger validation in shared service |

## 15. Required manufacturing test matrix

At minimum:

- BOM same-version parent validation, duplicate source keys, cycle detection, active-version uniqueness, and released-version immutability;
- route sequence, generated normal transitions, configured rework transitions, and snapshot immutability;
- order release replay and conflicting replay;
- 100 = 80 advance + 10 hold + 10 remain conservation;
- repeated partial moves;
- two concurrent moves from one WIP lot;
- unauthorized transition and missing typed requirements;
- hold to configured rework and return to forward route;
- scrap removal from active WIP with retained history;
- positive/negative WIP adjustments and authorization;
- material reserve/issue/return/consume and finished receipt ledger facts;
- location transfer aggregate neutrality and location balance correctness;
- no WIP/inventory double-counting;
- lot/serial-required consumption;
- concurrent serial reservation/activation with no duplicates;
- voided serial non-reuse;
- batch finalization rollback on duplicate client/component serial;
- numeric quality auto-pass/fail and completion gating;
- quality hold/release authorization;
- QTR derives from immutable snapshots and structured results;
- delivery of READY unit, duplicate delivery prevention, and reversal policy;
- plan/dashboard target, released, WIP, ready, scrap, hold, and delivered derivations;
- root Production Order activity includes all child events;
- full permission matrix for operator, HOD, inventory, quality, admin, viewer, service token, and Flux Admin.

## 16. Validation performed and limitations

This audit inspected the current Prisma schema and all committed migrations, server libraries, `/api/v1` route inventory, permission/authentication infrastructure, UI shell and major feature components, documentation, and existing unit/integration tests.

Host validation commands could not run because `npm` is not installed on the host shell. The repository documents Docker-based validation, but running a full container build/integration database was not necessary for this read-only architecture audit. Before Phase 0 is merged, run:

```text
npm run lint
npm run typecheck
npm run build
npm run test:unit
npm run test:integration
```

The working tree already contained user changes in `src/components/layout/app-shell.tsx`, `src/components/streamlined/demand-purchase-pages.tsx`, `src/components/ui/sheet.tsx`, and `src/stores/app-store.ts`. They were inspected but not modified.

## 17. Final recommendation

Approve the domain direction with one adjustment: insert a **Phase 0 readiness slice** before the brief's Phase 1. Then implement the vertical path in reviewable increments:

1. one manufactured Item with one BOM and one linear route;
2. one plan/order and immutable release snapshot;
3. one quantity-conserving WIP flow with hold and configured rework;
4. one canonical material issue/return and finished receipt path;
5. finalization into serial units;
6. structured final inspection/QTR;
7. delivery of exact units;
8. derived dashboard and parent-aware activity.

This sequence reaches the stated success scenario without introducing a parallel catalogue, ledger, generic workflow engine, maintenance module, or speculative MES complexity.
