# Flux foundation

Flux is the ERP shell. Vault is the existing Store workflow; Cargo, Orders, People, and Ledger have reserved module URLs but no live workflows yet. This release changes the application shell and access model without moving Store records or changing its canonical inventory ledger.

## Routes

| Area | URL | State |
| --- | --- | --- |
| Flux home | `/` | Live |
| Vault overview | `/vault` | Live |
| Vault inventory | `/vault/inventory` | Live |
| Vault stock movements | `/vault/movements` | Live |
| Vault demands | `/vault/demands` | Live |
| Vault purchasing | `/vault/legacy-purchasing` | Compatibility-only, not in navigation |
| Cargo | `/cargo` | Planned |
| Orders | `/orders` | Planned |
| People | `/people` | Planned |
| Ledger | `/ledger` | Planned |

The old purchasing tables and `/api/v1/purchase-requests` endpoints remain intact while Orders is designed. Do not delete them or migrate their data merely because the navigation is hidden. Existing Docker Compose service and volume names also remain unchanged to protect deployed data.

## Access control

Permission keys are stable action identifiers (`vault.demands.approve`, `vault.stock.adjust`, etc.). Access groups collect permissions, and a user can belong to multiple groups. The migration creates Flux Admin, Viewer, Vault Admin, Vault Manager, Purchase Approver, and Vault Requester, then maps every existing user from their legacy role. The legacy `User.role` field remains as a compatibility projection; new route authorization uses group-derived permissions. User management is at `/flux/admin/users`.

The Viewer group has read-only access to operational Vault data. Vault Manager deliberately does not have the purchase-approval permission. Flux Admin has all currently defined permissions. Future modules should add their own permission keys and groups rather than expanding legacy roles.

## Module boundaries

Vault owns components, stock ledger, demands, and its transitional purchase records. Future Orders will own procurement workflows; Cargo will own shipment/package journeys. Cross-module associations should reference stable record identities through explicit linking records when needed, without copying mutable statuses or quantities into another module. No Cargo or Orders business schema is introduced in this release.

Deploy this release with `prisma migrate deploy` before starting the app, after a logical PostgreSQL backup. The migration only adds access-control tables and memberships; it does not rewrite stock or demand history.
