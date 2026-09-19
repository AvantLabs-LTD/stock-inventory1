# Cargo API for approved clients

Base path: /api/v1/cargo. Responses are JSON except file downloads. A browser session cookie or Authorization: Bearer flux_... authenticates requests. Permissions come from the actor's current groups; a service token further limits them to its own scopes. An inactive user, expired token, or revoked token cannot authenticate.

## Service credentials

An interactive administrator with flux.users.manage can POST /api/v1/service-tokens with a JSON body containing userId, name, scopes (permission-key array), and expiresInDays (1–90). The response contains the plaintext token once. Store it outside source control. Use a dedicated least-privileged user. GET /api/v1/service-tokens lists metadata only; DELETE /api/v1/service-tokens?id=... revokes immediately. Service tokens cannot create or revoke tokens.

## Reads

| Request | Result | Permission |
| --- | --- | --- |
| GET /api/v1/cargo?view=shipments&limit=50 | shipments array and nextCursor | cargo.view |
| GET /api/v1/cargo?view=shipments&limit=50&cursor=... | Next page | cargo.view |
| GET /api/v1/cargo?view=packages&limit=50&cursor=... | Package register with shipment context and nextCursor | cargo.view |
| GET /api/v1/cargo?view=shipments&page=1&limit=15&route=DIRECT | Filtered page with total and pageCount | cargo.view |
| GET /api/v1/cargo?view=package&id=... | Package detail with its shipment context | cargo.view |
| GET /api/v1/cargo?view=shipment&id=... | shipment detail | cargo.view |
| GET /api/v1/cargo?view=suggestions&kind=package&q=AL-2026- | Latest matching identifiers | cargo.view |
| GET /api/v1/cargo?view=references | Forwarders, couriers, vendors | cargo.view |
| GET /api/v1/cargo?view=report | Stage, route, and charge totals | cargo.view; charges need cargo.costs.view |
| GET /api/v1/cargo?view=capabilities | Actions allowed by this credential and idempotency-key rules | cargo.view |
| GET /api/v1/cargo/files/{id} | PDF or image bytes | cargo.documents.view |

Limit must be 1–100. Lists support page plus q, stage, route, forwarderId, sourceWarehouseId, vendorId, and status filters. Cursor pagination remains available to automation clients; follow nextCursor until null. Invalid limits, filters, and cursors return HTTP 400. Shipment detail omits invoices/charges without cargo.costs.view and file metadata without cargo.documents.view.

## Writes

POST /api/v1/cargo accepts a JSON object with action and data fields and returns a result object. Supply a unique Idempotency-Key header (8–120 ASCII letters/digits or ._:-) for each agent write. Repeating the same action and data with the same key returns the original result; reusing a key for different input returns HTTP 409 with IDEMPOTENCY_KEY_CONFLICT. Browser calls without a key remain supported but must not be retried blindly.

| Action | Required and notable data fields | Permission |
| --- | --- | --- |
| reference.create | kind (forwarder, warehouse, courier), name; warehouse needs forwarderId | cargo.reference.manage |
| reference.update | kind, id, name, status; optional notes | cargo.reference.manage |
| shipment.create | route and optional shipmentNo; forwarded needs forwarderId and possibly sourceWarehouseId | cargo.shipments.manage |
| shipment.update | id, optional shipmentNo, forwarderId, sourceWarehouseId, notes; route/source lock after journey starts | cargo.shipments.manage |
| shipment.merge | targetShipmentId, sourceShipmentIds, trackingNumber; consolidates shipments only when route, source, stage, and the sole tracking leg agree | cargo.shipments.manage |
| shipment.archive | id and archived boolean | cargo.shipments.manage |
| shipment.delete | id; allowed only before packages or operational history exist | cargo.shipments.manage |
| package.create | Optional packageNo; existing shipmentId, or route plus optional shipmentNo and forwarder/warehouse for a new shipment | cargo.packages.manage |
| package.update | id; optional packageNo, vendorId, weight, verifiedWeight, dimensions, notes | cargo.packages.manage |
| package.reassign | id, destination shipmentId; only while both shipments are immature | cargo.packages.manage |
| package.archive | id and archived boolean | cargo.packages.manage |
| package.delete | id; allowed only before contents, documents, costs, or imported history exist | cargo.packages.manage |
| item.save | packageId, description, positive quantity; optional id to edit | cargo.packages.manage |
| item.remove | id | cargo.packages.manage |
| milestone.post | shipmentId, next valid stage, ISO occurredAt; optional location/remarks | cargo.milestones.post |
| tracking.save | shipmentId, kind; optional id to edit, courier/tracking/dates/remarks | cargo.tracking.manage |
| tracking.delete | id; allowed only when no invoice or charge still references the leg | cargo.tracking.manage |
| invoice.save | shipmentId, uppercase three-letter currency; optional id, package/leg, total/date/issuer | cargo.costs.manage |
| invoice.delete | id; allowed only when no charge or file still references the invoice | cargo.costs.manage |
| charge.save | shipmentId, category, positive amount, uppercase currency; optional id, package/leg/invoice, PKR comparison/note | cargo.costs.manage |
| charge.delete | id | cargo.costs.manage |
| file.delete | id | cargo.documents.manage |

Shipment and package names are optional; omitted names receive generated identifiers. Supplied names are unique case-insensitively. Send quantities and money as decimal strings. Packing quantities support 3 decimal places, weights 3, dimensions 2, and money 4. pkrEquivalent requires pkrNote. The server enforces transitions, route rules, shipment ownership, and permissions.

`shipment.merge` is an auditable consolidation operation for shipments that were incorrectly split despite sharing one journey. The target shipment survives; source packages, package contents, photos/documents, costs, and legacy events are moved to it. Duplicate source tracking legs and shipment milestones are collapsed into the target journey, and the empty source shipment records are removed in the same serializable transaction. Use one idempotency key per merge group.

POST /api/v1/cargo/files uses multipart fields file, shipmentId, kind, and optional packageId/invoiceId. It accepts signed PDF, PNG, or JPEG bytes up to 5 MB. Use an Idempotency-Key. Content and carton photos require a package.

Errors use JSON fields code and error with the appropriate HTTP status. Common codes: UNAUTHORIZED, FORBIDDEN, INVALID_INPUT, INVALID_STAGE, JOURNEY_LOCKED, NOT_FOUND, CONFLICT, IDEMPOTENCY_KEY_CONFLICT. Never log token plaintext or attachment bytes.

The Python client in api-client/store_client.py provides cargo-shipments --all, cargo-shipment, cargo-report, cargo-references, cargo-capabilities, cargo-action, cargo-upload, and cargo-download. Writes require --confirm-write and an explicit idempotency key.
