# Orders API v1

Orders are generic supplier orders. `source` is free text, such as `Taobao`,
`LCSC`, `Direct vendor`, or an agent name. Preserve marketplace-specific status
in `sourceStatus`; it is not a Vault receipt or Cargo journey status.

## Read endpoints

| Endpoint | Purpose | Permission |
| --- | --- | --- |
| `GET /api/v1/orders?view=orders&page=1&limit=50` | Paginated order register | `orders.view` |
| `GET /api/v1/orders?view=orders&q=...&status=PAID&source=Taobao&vendorId=...` | Filtered register | `orders.view` |
| `GET /api/v1/orders?view=detail&id=...` | Header and ordered line items | `orders.view` |
| `GET /api/v1/orders?view=capabilities` | Actions available to the credential | `orders.view` |

`limit` is 1–100. Statuses are `DRAFT`, `PLACED`, `PAID`,
`SUPPLIER_SHIPPED`, `CLOSED`, and `CANCELLED`.

## Write actions

POST `/api/v1/orders` with `{ "action": "...", "data": { ... } }`.

| Action | Required data | Permission |
| --- | --- | --- |
| `order.create` | source, orderNo, supplierName, currency, and one or more lines | `orders.manage` |
| `order.update` | id, status, supplierName, currency; optional payment/tracking fields | `orders.manage` |
| `order.archive` | id, archived boolean | `orders.manage` |
| `order.delete` | id; only allowed for a draft | `orders.manage` |
| `line.create` | orderId, description, positive quantity | `orders.manage` |
| `line.update` | id, description, positive quantity | `orders.manage` |
| `line.remove` | id | `orders.manage` |

Amounts and quantities may be supplied as decimal strings. `orderNo` is stored
as text so 19-digit marketplace identifiers retain every digit. The unique
identity is `(source, orderNo)`.

## Taobao import mapping

Map the exported header values to `source = "Taobao"`, `orderNo`,
`submittedAt`, `sourceStatus`, `supplierName`, `paidAmount`, `shippingAmount`,
`courierName`, and `trackingNumber`. Map each grouped product row to a line:
`description`, `productUrl`, `variant`, `quantity`, and `unitPrice`.

Do not map `Transaction Completed` to stock receipt or Cargo received. It is
only a Taobao platform state.

## Importing an exported Taobao workbook

Use the API-only importer from the Store repository. It reads the workbook,
groups its product rows under their order reference, and preserves the
marketplace status separately from the Flux order status:

```sh
python scripts/import-taobao-orders.py ../logix/orders/taobao-orders-translated-en.xlsx
python scripts/import-taobao-orders.py ../logix/orders/taobao-orders-translated-en.xlsx --apply
```

The first command is a dry run. The apply command uses the configured local
API client session and skips existing `Taobao` order references, so it is safe
to re-run after an interrupted import. It never creates Vault stock movements,
Cargo shipments, or goods receipts.
