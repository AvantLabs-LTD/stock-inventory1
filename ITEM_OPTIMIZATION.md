# Component alternatives and duplicate correction

Store → Item simplification finds potential duplicate catalogue entries. Manufacturing → BOM optimization manages alternative groups and standardizes selected BOM occurrences.

Similarity is a browser-only discovery aid: choose a reference component, minimum score, and name-only or name-and-specification comparison. Membership is always explicit. No threshold or inferred relationship is stored. Candidates must share discipline and unit; matching names do not establish engineering interchangeability.

Alternative groups support audited creation, membership editing and deletion. BOM detail rows expand to show active alternatives. Removing a group removes only its membership mappings, not components or BOMs.

## BOM standardization

Select a group, common replacement, exact source lines and reason. Review the preview before confirming. Each selected source revision produces a new Draft. All unselected component references, quantities, source keys, hierarchy, applicability, notes, route-step associations, ordering and effectivity are preserved. New revision/line IDs, creator and timestamps identify the new draft; acceptance metadata is intentionally not copied. Existing accepted versions, manufacturing runs and default-profile bindings are not changed. Activate the reviewed draft separately.

## Merge safety

Choose the source to archive and the survivor; quantities and references are separate explicit choices. The preview lists moved and retained records. Confirmation requires typing the source code.

- Stock transfers use paired signed canonical adjustment ledger entries, not deletion or editing of existing movements.
- Eligible demands have no issue history. Only backlog purchase lines without receipts can move. Purchase coverage links must move together with their demands, or the operation is rejected.
- Allocation transfer is derived from the moved lines' approved-from-stock quantity plus signed approval revisions. Remaining source stock and resulting target stock must cover their allocations.
- Historical issues, returns, receipts, completed/ordered purchases and other ineligible references remain on the original source.
- BOM changes create drafts, even during a merge. No accepted BOM is edited in place.
- Canonical supplier links can be copied; source links remain intact and existing target URLs are never overwritten. Purchase history is not treated as supplier metadata.
- Unselected stock/references remain on the archived source. Review these retained records before confirming.

All writes enforce server permissions. Group writes require catalogue management; standardization requires manufacturing-definition management. Merge options additionally require their stock, demand, purchasing or manufacturing permission. Mutations and audits commit together in serializable transactions. Stock balance rows are locked in deterministic order. Preview fingerprints bind the reviewed inputs and source state; stale previews are rejected. Merge and standardization commits require an idempotency key, reused for retrying the same request.

Existing migration `20260925110000_item_alternatives_and_merges` provides the group, membership and merge records. Use the normal backed-up migration deployment process; these changes do not deploy automatically.

## Validation

`tests/unit/item-similarity.test.ts` covers discovery behavior. `tests/integration/item-optimization.test.ts` covers draft preservation, hierarchy remapping, idempotency, stale-preview rollback, paired Decimal stock movements, supplier-link preservation, allocated-stock rejection and competing merges. Run integration tests against an isolated migrated PostgreSQL database, never production.
