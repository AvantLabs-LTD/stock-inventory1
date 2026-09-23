# BOM assimilation decision registry

`review-decisions.json` is the versioned source-level reconciliation layer for
the reviewed external BOM workbooks. It records an approved mapping only; it
does not create catalogue components or import a project BOM.

The read-only builder at `scripts/build_bom_assimilation_data.py` consumes this
registry together with the operator-reviewed workbooks under `docs/` and the
external source workbook directory. Its output remains ignored because it is a
generated review artifact. Keep the registry whenever a future reviewed import
turns source occurrences into immutable Project BOM lines, so the resulting
line can retain its source provenance and reviewed decision identifier.
