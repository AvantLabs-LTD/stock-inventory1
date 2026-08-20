# Store Management and Purchase Portal — Project Instructions

## 1. Authority and scope

This file is the authoritative product and engineering contract for the entire repository. It applies to every file unless a more specific `AGENTS.md` exists deeper in the tree.

When existing code, legacy schema, comments, UI labels, or tests conflict with this file, treat this file as the intended target behaviour. Do not silently preserve an incorrect legacy rule. Migrate toward this contract safely, using explicit Prisma migrations and compatibility handling where required.

Keep development focused on the store-management, project manufacturing-cycle, reservation, purchasing, and receiving workflows described here. Do not add adjacent ERP features unless the user explicitly expands the scope.

## 2. Product purpose

The system is a central, project-independent component store and a purchase-request portal. It must support:

- A central component catalogue shared by all projects and departments.
- Issues to projects or directly to departments without projects.
- Versioned hierarchical project BOMs.
- Multiple independent manufacturing cycles for the same project and BOM.
- Reservation requests, reconciliation, allocation, repeated partial issues, and returns.
- Deficit and blocker visibility with per-cycle attribution.
- Purchase requests linked to the reservation lines they cover.
- Partial goods receipts and supporting attachments.
- Role-enforced UI and versioned APIs for people and approved automation clients.

PostgreSQL is the production source of truth. The application is deployed as the self-contained Docker Compose stack in this repository.

## 3. Core terminology

Use these terms consistently in code, schema, API responses, UI, and tests.

### Component

A project-independent store item. A component may be a standard purchased item, a manufactured item, or a subcomponent of a manufactured item. Project usage never creates a separate inventory master record.

### Project BOM version

An accepted, immutable manufacturing definition for a project. Its lines reference central components and form a hierarchy through project-line associations. A later accepted upload supersedes the version for new cycles but must not rewrite existing cycles.

### Manufacturing cycle

A project-targeted canonical reservation. Each cycle is one independent manufacturing run against one accepted project BOM version and an explicit number of sets. A project may have any number of cycles against the same BOM version.

Department reservations that do not target a project are ordinary reservations, not manufacturing cycles.

### Reservation request

A user's submitted request before inventory-manager reconciliation and conversion. It does not allocate stock or change inventory.

### Reservation line

One component requirement within a reservation or manufacturing cycle. It is the unit of allocation, issue, cancellation, deficit attribution, and purchase linkage.

### Allocation

A protected quantity of on-hand stock assigned to a reservation line. Allocation changes availability but not on-hand stock.

### Issue

An immutable stock movement that transfers some allocated quantity to a reservation line's destination. Issues may be repeated and partial.

### Deficit

Outstanding physical demand not covered by stock assigned or safely assignable to that demand. Keep physical stock deficit distinct from the remaining unprocured deficit after active purchase coverage.

### Purchase coverage

The quantity on a purchase-request line explicitly linked to a reservation line. A purchase line may include extra, unlinked replenishment stock.

## 4. Central component catalogue

Components are independent of projects and departments. Store one canonical record per real component wherever practical.

The component master supports:

- Code
- Title
- Discipline/category: `MECHANICAL` or `ELECTRONICS`
- Description
- Optional function
- Optional link
- Optional option selection
- Optional remarks
- Unit
- Record status

All authenticated users may view the catalogue. Only `INVENTORY_MANAGER` and `SUPER_ADMIN` may create, reconcile, edit, archive, or otherwise manage component records.

Do not create project-specific copies of central components. Project-specific fields belong on project BOM associations, reservation lines, or immutable transaction records.

## 5. Project BOM rules

### 5.1 Structure

A project BOM line is a project association with its own stable ID. It references a central component after reconciliation and stores the submitted manufacturing description snapshot.

Each line contains:

- Project and BOM-version association
- Central component association after reconciliation
- Optional parent project-line ID
- Source line key from the workbook
- Component description fields
- Quantity per set
- Sort order and reconciliation audit data

A line with no parent is required directly by the project. A line with a parent is required to manufacture that parent component.

The hierarchy must be acyclic. Reject missing parents, duplicate source keys, cross-project parents, cross-version parents, and cycles.

### 5.2 Upload and acceptance

Use the fixed `.xlsx` template.

1. Upload creates a pending BOM version.
2. Pending uploads do not affect active requirements or existing cycles.
3. An inventory manager reconciles every line to an existing component or creates a central component.
4. Only a fully reconciled upload may be accepted.
5. Acceptance supersedes the previously active version for new cycles.
6. Existing cycles remain bound to their original BOM version.

Adding components and accepting BOMs are elevated actions. Enforce this in server-side authorization, not only in the UI.

### 5.3 Manufacturing requirement derivation

Do not store manually adjusted roll-up requirements.

For a root line:

```text
gross required = BOM quantity per set × cycle set count
```

For a child line:

```text
gross child required = uncovered parent manufacturing quantity × child quantity per parent
```

If a cycle needs 10 units of A, 4 finished units of A are assigned from store stock, and each remaining A requires 2 units of B, the derived manufacturing requirement for B is 12.

With multiple open cycles, the same on-hand finished units must never cover more than one cycle. Stock coverage must be represented through canonical allocations or a documented deterministic assignment calculation that consumes shared availability once. Never subtract the full global on-hand balance independently for every cycle.

Derived requirements must respond automatically to allocations, issues, returns, cancellations, cycle set count, and BOM hierarchy. Do not write adjustment jobs that mutate stored requirement totals.

### 5.4 Blockers

A deficient descendant component is a blocker for the manufactured ancestor that depends on it. Project and cycle views must expose:

- The blocked component
- Each blocking descendant
- Required, covered, and uncovered quantities
- The hierarchy path or enough parent context to understand the dependency

## 6. Reservation-request workflow

A user submits a reservation request to exactly one destination:

- A project, or
- A department without a project

Regular users may submit for their own department and its projects. Inventory managers and super administrators may act across departments.

A request line may reference:

- An existing central component
- An accepted project BOM line
- A free-text component description needing reconciliation

Submitting a request must not reserve stock, create ledger movements, or create a purchase request.

An inventory manager then:

1. Reviews each line.
2. Reconciles it to a central component.
3. Creates a central component when no suitable record exists.
4. For a project request, selects and binds the accepted BOM version and cycle set count.
5. Converts the request into a canonical reservation/manufacturing cycle.

Conversion is mandatory before allocation or issue.

## 7. Multiple manufacturing cycles

Every project reservation represents a separate manufacturing cycle.

- A project may have multiple open or closed cycles against the same BOM version.
- Each cycle has its own number, set count, requester, dates, lines, allocations, issues, purchase links, deficits, and derived progress.
- Never merge cycles because they reference the same project, BOM, or components.
- The project page must list every cycle and allow users to inspect it independently.
- Deficit views must show which cycles and reservation lines contribute each quantity.

Store the BOM-version binding and cycle set count as fundamental cycle inputs. Do not infer an existing cycle's BOM from whichever version is active today.

## 8. Stored facts versus derived state

### 8.1 General rule

Store business inputs, associations, explicit decisions, and immutable events once. Derive quantities, balances, coverage, progress, and operational statuses from those facts.

Do not introduce a second independently editable source of truth. A stored aggregate is permitted only as a transactional cache that can be rebuilt and audited from authoritative records.

Use `Decimal` database values for quantities. Never use floating-point arithmetic for inventory or purchasing quantities.

### 8.2 Fundamental stored reservation data

Store only facts such as:

- Reservation/cycle identity and destination
- Project and bound BOM version, where applicable
- Cycle set count
- Requester, converter, timestamps, and remarks
- Reservation-line component and project-line associations
- Direct requested quantity for non-BOM requests
- Explicit cancellation decisions or cancellation quantities
- Immutable allocation/release/consume entries
- Immutable issue and return lines

Do not store independently editable issued, remaining, deficit, ordered, shipped, received, or progress totals on reservation lines.

### 8.3 Fundamental stored purchasing data

Store:

- Purchase-request identity and current workflow state
- Purchase-request line component, type, and ordered quantity
- Reservation-link quantity
- Provider, tracking number, box number, and remarks
- Immutable goods-receipt lines
- Attachments and audit information

Do not copy purchase workflow totals or statuses onto reservation lines.

### 8.4 Derived reservation quantities

At minimum derive:

```text
required quantity = direct request quantity
```

or for a project cycle:

```text
required quantity = recursively derived BOM requirement for the cycle
```

```text
allocated quantity = signed sum of allocation entries
```

```text
net issued quantity = issue quantity minus applicable returned quantity
```

```text
remaining to issue = max(required - cancelled - net issued, 0)
```

Do not subtract the same coverage twice. Issued quantities have already consumed their allocations.

### 8.5 Physical deficit and procurement gap

Keep these separate:

```text
physical stock deficit = outstanding demand not covered by allocated or assignable physical stock
```

```text
unprocured deficit = max(physical stock deficit - active linked purchase coverage, 0)
```

Received goods are physical stock after their receipt is posted to the canonical ledger. They must no longer be counted as in-transit purchase coverage.

Global free stock is shared. Aggregate calculations must distribute it once across reservation lines using explicit allocations or a stable documented ordering; never show the same free units as covering every line simultaneously.

### 8.6 Derived procurement quantities

Group reservation-link quantities by the related purchase request's current state:

```text
backlog quantity          = sum of links on BACKLOG requests
pending approval quantity = sum of links on PENDING_ORDER_APPROVAL requests
ordered quantity          = sum of links on ORDERED requests
shipped quantity          = sum of links on SHIPPED requests
```

A linked quantity belongs to one stage at a time. Moving a purchase request changes the derived bucket; it does not duplicate the quantity.

The total purchase line and the portion attributed to a reservation are different facts:

```text
unlinked replenishment quantity = purchase line quantity - sum(reservation link quantities)
```

Validate that the total active link quantity does not exceed the purchase line quantity. When creating or editing a link, prevent avoidable over-coverage of the reservation's outstanding need. If later issues or cancellations create excess coverage, display it explicitly and let an authorized manager relink or treat it as replenishment stock.

Exact receipt attribution to a reservation must not be guessed. A goods receipt belongs to a purchase line. Once received stock is allocated to a reservation, the canonical allocation provides exact reservation-level attribution. If exact pre-allocation receipt attribution becomes a requirement, add an explicit receipt-to-reservation allocation record rather than relying on an ambiguous formula.

## 9. Reservation and line statuses

Statuses that can be calculated must be derived. A database status column may be maintained as a transactional cache, but it is not an independent user-editable fact.

### 9.1 Reservation/manufacturing-cycle header

The entire request/cycle has a fulfilment status:

- `PENDING`: no active line has any net issued quantity.
- `IN_PROGRESS`: at least one active line has a net issued quantity and at least one active requirement remains unfulfilled.
- `CLOSED`: every non-cancelled line is fully issued.
- `CANCELLED`: the whole request/cycle was explicitly cancelled.

Allocation, ordering, shipping, and receiving do not make the header `IN_PROGRESS`. The first actual issue does.

Existing names such as `PENDING_STOCK`, `PARTIALLY_AVAILABLE`, `AVAILABLE`, or `PARTIALLY_ISSUED` may remain temporarily for compatibility, but new work must present and migrate toward the header semantics above.

### 9.2 Reservation-line fulfilment

Derive a fulfilment facet for each line:

- `PENDING`: no net issue and the remaining requirement is not fully allocated.
- `AVAILABLE`: no net issue and the remaining requirement is fully allocated.
- `PARTIALLY_ISSUED`: net issued is greater than zero but below the active requirement.
- `ISSUED`: net issued meets the non-cancelled requirement.
- `CANCELLED`: the line was explicitly cancelled.

### 9.3 Reservation-line procurement

Do not force procurement and fulfilment into one lossy enum. A line may be partially issued while its remaining quantity is ordered or shipped.

Expose a separate derived procurement facet, or the individual quantities by procurement stage. The UI should be able to show simultaneously:

- Required
- Allocated
- Issued
- Remaining
- Backlog
- Pending approval
- Ordered
- Shipped
- Related receipts or current physical availability
- Physical deficit
- Unprocured deficit

For example, a line may correctly display `PARTIALLY_ISSUED`, `3 issued`, and `7 ordered` at the same time.

## 10. Allocation, issue, and return rules

- Allocation is an explicit inventory-manager action after conversion.
- Allocation may be partial.
- Allocated stock cannot be allocated to another reservation.
- An issue must consume allocation and on-hand stock atomically.
- A reservation may receive any number of partial issues.
- An issue may contain only a subset of reservation lines.
- A line may be issued in any positive quantity up to its active allocation and remaining requirement.
- Never require a full reservation or full line to be issued at once.
- Prevent negative on-hand balances, negative allocations, over-allocation, and over-issue.
- Returns reference original issue lines, cannot exceed the net issued quantity, and post an immutable return movement.
- Because fulfilment is derived, a valid return may move a formerly closed cycle back to `IN_PROGRESS` unless there is a separate explicit business closure that forbids it.

## 11. Deficit and blocker views

Deficit views must support both aggregate purchasing decisions and traceability.

For each component show:

- Aggregate physical requirement across open lines
- Aggregate allocated and net issued quantities
- Shared free stock considered once
- Physical stock deficit
- Active purchase coverage by workflow stage
- Unprocured deficit
- Purchase quantities not linked to reservations

Under each component show every contributing reservation line with:

- Project or department
- Manufacturing-cycle/reservation number
- Request number
- BOM version where applicable
- Required, allocated, issued, remaining, and cancelled quantities
- Purchase-link quantities and related request statuses
- Fulfilment and procurement facets
- Blocking descendants where applicable

Do not expose only an unexplained aggregate deficit.

## 12. Purchase-request workflow

Each purchase-request line has exactly one type:

- `FOREIGN_STANDARD`
- `FOREIGN_MANUFACTURED`
- `LOCAL_STANDARD`
- `LOCAL_MANUFACTURED`

Lifecycle:

```text
BACKLOG
  -> PENDING_ORDER_APPROVAL
  -> ORDERED
  -> SHIPPED
  -> RECEIVED_IN_STORE
```

Rules:

- Inventory managers create and edit backlog requests.
- Adding a deficient component proposes links to outstanding reservation lines for that component.
- Link quantities are explicit and editable while business rules permit.
- Inventory managers may reduce or remove any proposed link, including all links.
- A purchase quantity may exceed linked demand; the remainder is store replenishment.
- Inventory managers submit requests for order approval.
- Only `PURCHASE_APPROVER` and `SUPER_ADMIN` may move `PENDING_ORDER_APPROVAL` to `ORDERED`.
- Inventory managers cannot perform the order-approval transition.
- Inventory managers may add optional provider, tracking number, box number, shipping details, and remarks.
- Enforce valid forward transitions on the server.
- Cancellation, reopening, or backward transitions require an explicit defined workflow; do not add them casually.

Reservation details must show all related purchase requests and their current states.

## 13. Goods receipts

- A receipt is a separate immutable domain record linked to a purchase request where applicable.
- Only `ORDERED` or `SHIPPED` requests may be received.
- Receipts may be partial and repeated.
- Every receipt line must match its purchase line's component.
- Total received quantity must not exceed the purchase line quantity.
- Every posted receipt creates canonical ledger movements in the same transaction.
- A purchase request becomes `RECEIVED_IN_STORE` only when every line is fully received.
- Receiving increases physical stock but does not silently allocate it to reservations.
- After receipt, inventory managers can see which reservation lines are ready for allocation.

## 14. Attachments and uploads

Attachments may be associated with purchase requests or goods receipts and may represent receipts, invoices, quotations, shipping documents, or other supporting files.

- Store application-managed attachments in PostgreSQL `bytea` unless a future storage decision is explicitly approved.
- Enforce a hard 5 MB limit per uploaded file on both server and UI.
- Validate allowed formats, content type, and file signature where feasible.
- Sanitize filenames and serve downloads with safe content-disposition headers.
- Never execute uploaded content.
- Apply authorization to listing, upload, download, and deletion.

Project BOM uploads must use the fixed `.xlsx` format and the same 5 MB hard limit.

## 15. Roles and authorization

Canonical roles:

### `SUPER_ADMIN`

May perform every action.

### `INVENTORY_MANAGER`

May manage components, reconcile and accept BOMs, convert requests, allocate, issue, return, adjust, create and manage purchase requests, manage shipping details, and receive goods. Cannot approve the transition to `ORDERED` unless also acting as `SUPER_ADMIN`.

### `PURCHASE_APPROVER`

May view relevant data and work the pending-order-approval queue. May move an eligible request from `PENDING_ORDER_APPROVAL` to `ORDERED`. Does not receive general inventory-manager edit rights.

### `USER`

May view the central catalogue, projects, cycles, deficits, blockers, reservations, and purchase progress allowed by product policy. May submit reservation requests for the user's department and its projects. Cannot reconcile, allocate, issue, create components, accept BOMs, or approve orders.

Authorization rules must be enforced in services or API routes. Hiding a button is not authorization. Every write must use the authenticated actor from the session or approved client credential; never accept an arbitrary actor ID from an untrusted request body.

## 16. Canonical inventory ledger

All stock-changing workflows use one immutable ledger and balance model:

- Opening stock
- Receipt
- Issue
- Return
- Adjustment in/out
- Assembly consumption/receipt when manufacturing posting is implemented

Ledger entries store:

- Component
- Signed quantity
- Movement type
- Source type, source record, and source line
- Actor
- Timestamp
- Resulting balance or sufficient audit metadata

Requirements:

- Never update on-hand stock through a legacy route or independent counter.
- Never delete or edit posted ledger entries. Reverse mistakes with explicit compensating transactions.
- Use idempotency/source uniqueness so retries cannot double-post.
- Lock balance rows and use database transactions for every stock-changing operation.
- Update any balance cache in the same transaction as the ledger entry.
- Keep allocation entries immutable and signed (`ALLOCATE`, `RELEASE`, `CONSUME`).
- The ledger and allocation entries must be sufficient to audit or rebuild cached balances.

## 17. Database and Prisma rules

- PostgreSQL is required for production and multi-user deployments.
- Prisma schema changes require committed migrations.
- Never use `prisma db push --accept-data-loss` as a deployment workflow.
- Prefer additive migrations followed by controlled backfills and later cleanup.
- Add database constraints for quantities, destination exclusivity, hierarchy integrity, and workflow invariants where practical.
- Use foreign keys and deliberate deletion behaviour. Do not cascade-delete posted financial or inventory history.
- Use serializable transactions or appropriate row locking for concurrent stock allocation and posting.
- Avoid N+1 status calculations on list pages; use set-based queries, views, or deliberate cached projections without creating another source of truth.
- Any cached status or balance must have one implementation path for refresh and an audit/rebuild strategy.

## 18. Legacy-code policy

This repository still contains legacy product, stock, request, reservation, and SQLite-era concepts.

- Do not add new business behaviour to legacy inventory models or unversioned stock-changing routes.
- New canonical behaviour belongs in the canonical component, BOM, reservation, ledger, purchase, and receipt domains.
- Prefer `/api/v1/...` for canonical APIs.
- When replacing a legacy UI path, point it to canonical services rather than synchronizing two models.
- Do not dual-write canonical and legacy stock.
- Remove legacy schema or routes only through a reviewed migration after confirming no required data or consumers remain.
- Treat old local SQLite data as migration input, not an ongoing source of truth.

## 19. API rules

- Expose core operations through versioned APIs suitable for the web UI and approved Python clients.
- Keep route handlers thin: authenticate, authorize, validate, call a domain service, and map domain errors to HTTP responses.
- Put stock, reservation, BOM, and purchase invariants in reusable server-side domain services.
- Validate request bodies, query parameters, multipart uploads, IDs, enums, and positive decimal quantities.
- Return stable machine-readable error codes for automation clients in addition to human-readable messages where possible.
- Use pagination and bounded limits on list endpoints.
- Do not bypass authorization for automation. Add an explicit approved service-authentication mechanism when required; never embed a shared administrative password in a client.
- Make posting endpoints idempotent or accept a client-supplied idempotency key where retries are expected.
- Never expose credential material, attachment bytes in list responses, password hashes, or internal secrets.

## 20. UI requirements

The UI is an operational view of canonical data, not a separate workflow engine.

- All authenticated users can discover the component, project, cycle, deficit, blocker, reservation, and purchasing information allowed by policy.
- Project pages list the active BOM, previous versions, and all independent manufacturing cycles.
- Cycle pages show line-level quantities and both fulfilment and procurement facets.
- Deficit pages show aggregate shortages and expandable per-cycle/request attribution.
- Purchase pages show linked reservation quantities separately from extra replenishment quantities.
- Managers can reconcile descriptions, convert requests, allocate, partially issue, manage links, and receive goods from focused views.
- Purchase approvers have a clear pending-order-approval queue.
- Disable or hide unauthorized actions for usability, while still enforcing authorization on the server.
- Do not display derived quantities as editable inputs.
- Clearly distinguish physical availability, allocation, purchase coverage, and issued quantities.
- Use explicit confirmation for irreversible posting actions, but do not add unnecessary confirmation to read-only navigation.

## 21. Security and configuration

- Never commit passwords, JWT secrets, database URLs with credentials, API keys, authentication state, or production data.
- Do not add default shared passwords to seeds, login pages, documentation, or tests.
- Sample-data seeding requires an explicitly supplied secure password and must not run automatically in production.
- Read deployment secrets from the Compose-managed secret files or approved environment configuration.
- Keep PostgreSQL unexposed on the host unless an explicit secured operational need is approved.
- Run the application as an unprivileged container user.
- Treat uploaded filenames and content as untrusted.
- Keep authentication and authorization checks server-side.
- Log security-relevant and elevated actions without logging secrets or attachment contents.
- Production internet exposure requires TLS and a reverse proxy; do not expose the application directly over public plain HTTP.

## 22. Testing requirements

Every stock-changing or workflow-state-changing feature requires integration coverage against PostgreSQL.

At minimum cover:

- Opening, receiving, issuing, returning, and positive/negative adjustment
- Allocation, release, and consume
- Repeated arbitrary partial issues
- Transaction rollback on over-allocation, over-issue, over-return, and over-receipt
- Concurrent attempts against the same component balance
- Hierarchical BOM validation and cycle detection
- Dynamic child demand when finished parent stock covers part of a cycle
- Multiple independent cycles against the same BOM without double-counting stock
- BOM replacement without changing existing cycles
- Request reconciliation and conversion
- Header and line derived-status edge cases
- Deficit attribution to multiple cycles and purchase links
- Purchase auto-linking, link removal/reduction, and extra replenishment quantity
- Role restriction on the `PENDING_ORDER_APPROVAL -> ORDERED` transition
- Partial and complete goods receipts
- Attachment authorization and the 5 MB boundary
- API authorization for regular users, inventory managers, purchase approvers, and super administrators

Tests must assert both posted records and resulting derived balances/statuses. A failed transaction must leave no partial header, line, ledger, allocation, or status changes.

Run, as appropriate:

```sh
npm run lint
npm run typecheck
npm run build
npm run test:integration
```

The self-contained validation path may use the Docker builder and Compose PostgreSQL when Node.js is unavailable on the host.

## 23. Deployment and operations

The supported deployment unit is `compose.yml`.

- The database volume and runtime-secret volume are persistent and must be backed up or deliberately recreated together.
- The one-shot migration service must complete successfully before the app starts.
- Use `prisma migrate deploy` for production migrations.
- Verify `/api/health`, service health, migration logs, and app logs after deployment.
- Create a logical PostgreSQL backup before every upgrade that includes migrations.
- Never run `docker compose down -v` unless permanent deletion is explicitly intended.
- Attachments stored in PostgreSQL are included in logical database backups.
- Code rollback does not automatically reverse migrations; restore a compatible backup when a database rollback is required.

## 24. Change discipline

Before implementing a feature:

1. Identify its canonical domain and authoritative stored facts.
2. List every derived value and its formula.
3. Check whether concurrent users can touch the same component or workflow record.
4. Define server-side role rules and valid transitions.
5. Define transaction, idempotency, audit, and rollback behaviour.
6. Confirm the feature does not extend a legacy source of truth.
7. Add proportionate integration tests.

Prefer the smallest coherent change that advances this contract. Do not combine unrelated refactors, visual redesigns, reports, notifications, or infrastructure changes with a domain fix unless they are necessary for correctness.

When a business rule is genuinely ambiguous and materially changes stored data or workflow behaviour, stop and ask. Do not resolve ambiguity by creating another mutable status or counter.
