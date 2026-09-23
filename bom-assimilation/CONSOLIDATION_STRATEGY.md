# BOM Consolidation Strategy

## Scope and rule of evidence

This is a consolidation and review procedure, not an import procedure.  The
workbooks remain source evidence.  A released application BOM is created only
after every source row has an explicit disposition and a reviewer has accepted
the proposed hierarchy and quantities.

The current reconciliation mapping is a catalogue mapping: it says which
central Item a source occurrence refers to.  It does **not** by itself say
whether two occurrences represent the same required quantity.  Quantity and
functional context must be resolved at BOM-line level.

## Findings from the reviewed source set

The current source ledger contains 805 occurrences across 19 workbook/sheet
sources.  They reconcile to 447 canonical identities: 319 existing catalogue
Items, 110 newly created catalogue Items, and 18 source-only excluded
identities.  The source occurrence count must remain the control total for the
consolidation process; no row may silently disappear.

The workbook layouts fall into distinct functional classes:

| Class | Evidence | Consolidation role |
| --- | --- | --- |
| ECAD/component BOM | `Comment`, manufacturer part number, LCSC number, package and usually designators | Authoritative material definition for one PCB or electronic subassembly.  Its rows become children of that subassembly. |
| Master/assembly BOM | `Qty/Set`, category, item/specification and often link | Authoritative assembly, mechanical, harness, packaging and process-material definition.  It supplies the product root and non-ECAD branches. |
| Auxiliary/procurement sheet | Total-run quantity, connector details, price, or reference links | Evidence/cross-check only until a reviewer decides it introduces a requirement absent from the master BOM.  Never add it on top of an equivalent master requirement automatically. |
| Tooling/reference bundle | `Components Set`, `SMD Components`, stencil, programming and similar entries | Retain as source evidence, but classify as a consumed product material, run consumable, reusable tooling, or reference placeholder before it is allowed into a product BOM. |

### Product/version dossiers

| Dossier | Sources and conclusion |
| --- | --- |
| Blaze PMU/Rect | Three ECAD BOMs are separate boards: PMU V2.4, Rectifier V2.4 and Controller Board V1.3.  They share many MPNs, but their different designators and quantities prove that those uses are additive across three branches, not duplicates.  The Blaze master BOM is complementary (zero reconciled item overlap with any of the three ECAD files) and provides assembly/mechanical/process material. |
| ECU V1.3 | The Mini ECU ECAD BOM and master BOM are complementary (zero reconciled overlap).  The Auxiliary and J30J connector sheets overlap master-BOM requirements and are therefore validation/procurement evidence unless a row is confirmed to be an additional requirement. |
| FireConsole V2.1 | The ECAD BOM and `BOM_New` master list have zero reconciled overlap.  Treat the ECAD file as the Main PCB branch and the master list as the rest of the assembly.  The `Components Set` placeholder is not an additional material line. |
| SF PMU V3 | The electronic BOM and Power Nexus master BOM are complementary (zero reconciled overlap).  The ECAD rows form the PCB branch; the master BOM supplies the assembly branch. |
| TMD V1.1, V1.2 and V1.3 | These are separate revisions, not quantities to roll together.  V1.2 and V1.3 each have a detailed COMM_CARD BOM plus a complementary master BOM; V1.1 currently has only the detailed card BOM. |
| Blaze CHS and SF CHS/XTCable | Each currently has one master BOM.  Do not attach either to a PMU product merely because of its name; their parent-product relationship needs explicit confirmation. |

## Safe consolidation model

For a complete product, create one root manufactured Item and one project-bound
BillOfMaterial revision.  Its line hierarchy represents functional use:

```text
Finished product
├── PCB / electronic subassembly
│   ├── ECAD component lines (each source row is initially distinct)
│   └── ...
├── mechanical / harness / connector subassemblies
├── direct assembly materials
├── packaging materials
└── production support (only when confirmed as per-unit consumption)
```

The same catalogue Item is allowed to occur in several branches.  It is only
rolled up for inventory demand after the hierarchy has been accepted.  It is
never removed simply because an identical Item code exists elsewhere in the
project.

### Row dispositions

Every source row receives one of these dispositions in the import review
ledger:

- `PRIMARY_REQUIREMENT` — creates a project BOM line or contributes to a
  deliberate aggregate line.
- `SUPPLEMENTARY_REQUIREMENT` — adds a requirement omitted by the primary
  source and is separately justified.
- `ALTERNATE_VIEW` — validates an existing line but adds no quantity.
- `PROCUREMENT_REFERENCE` — preserves pricing/link/vendor evidence but adds no
  product quantity.
- `RUN_CONSUMABLE` or `REUSABLE_TOOLING` — retained outside the per-unit
  product roll-up until the production policy is set.
- `REFERENCE_PLACEHOLDER` — such as "Components Set"; linked to the detailed
  branch but adds no direct quantity.
- `EXCLUDED_WITH_REASON` — only for a documented non-requirement or invalid
  source row.

The 19 currently excluded source occurrences (sets/placeholders, stencils,
programming entry, and one unclassified acrylic entry) must be reclassified
through this list before the relevant project BOM can be accepted.  They must
not remain invisible merely because they were intentionally omitted from the
catalogue reconciliation.

### Duplicate decision rule

Two occurrences may merge only if all of the following are true:

1. They belong to the same product revision and the same functional branch.
2. They refer to the same central Item.
3. Their source purpose is both material requirement, rather than an
   alternate/procurement/support view.
4. The reviewer can explain why they represent one physical requirement rather
   than separate uses.
5. Both original rows remain linked to the resulting BOM line.

Otherwise retain two lines.  A roll-up query may sum their requirements by
Item for purchasing, but the source-level history remains visible.

This rule deliberately keeps examples such as the same 0.1 uF capacitor used
on Blaze's PMU, Rectifier and Controller boards as three additive uses.  It
also keeps same-Item rows such as ECU top/bottom acrylic plates distinct until
their physical identity and consumption rule are confirmed.

## Required application changes before loading a project BOM

The existing `BillOfMaterial`, `BomVersion` and hierarchical `BomLine` models
already provide the correct core: a manufactured output Item, optional project
scope, immutable revisions, decimal quantity per parent, source-line key, and
acyclic parent/child lines.  Do not replace them with a second generic project
BOM model.

They need a small source-review layer before using these workbooks:

1. **BOM source document** — workbook name, checksum, stored upload, sheet,
   source revision label, project, classification and capture metadata.
2. **Many-to-one BOM-line source mapping** — document/sheet/row plus an
   immutable raw-row snapshot and reviewed disposition.  Raw JSON is suitable
   only as archival evidence for the variable original columns; operational
   quantities and relationships stay in typed BOM-line fields.
3. **BOM-line reconciliation snapshot** — submitted description,
   specification/reference and reviewer decision so later catalogue edits do
   not rewrite the historical BOM meaning.
4. **Pending review workflow** — source rows may be uploaded/reconciled and
   previewed, but only a fully classified version can become `ACTIVE`.
5. **Read/review UX** — dossier view, hierarchy preview, per-Item roll-up,
   unresolved/overlap queue, and a source-to-line trace panel.  The existing
   create-and-activate API is suitable for finalized definitions, not raw
   workbook ingestion.

The source file bytes should be retained with the accepted upload (subject to
the existing upload security/size policy), so a future user can reproduce an
accepted BOM without relying on a workstation folder.

## Review and migration sequence

1. Freeze the current source ledger and record a checksum for each workbook.
2. Create a dossier for each product/version above; do not merge versions or
   unconfirmed assemblies.
3. Select a primary source for every functional branch: ECAD for PCB contents,
   master BOM for assembly contents, and auxiliary sheets as evidence by
   default.
4. Build a line proposal with every source occurrence linked to one disposition.
   Reconcile quantities using only explicit per-set columns; total-run columns
   are validation fields, not a substitute for a per-set quantity.
5. Review the overlap queue and the support/tooling queue with manufacturing.
6. Preview the BOM hierarchy and Item roll-up, compare it to each primary
   source's control totals, and resolve every variance.
7. Create a `DRAFT` BOM revision, attach its source mappings, and obtain review.
8. Activate only after the source-ledger completeness check is zero and the
   project/product relationship is confirmed.  Existing production orders stay
   bound to the revision snapshot selected at release.

No existing stock, ledger, catalogue Item, production plan, or production order
is changed by this procedure.

