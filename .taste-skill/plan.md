# 新云提案工作台 UI

Taste Code app run · seed 877199236 · framed-sheet · light · existing brand and system font retained.

## Product inventory and jobs
- Sales prepares outdoor media proposals for Shanghai clients.
- One editable brief holds industry, brand, budget, media, dates and objectives.
- Imported briefs fill that form immediately; one overall confirmation follows optional editing.
- Real source inventory: 431 records; counts are derived from source rows.
- Historical audience reports: 26, from May 2023; never aggregate duplicate audience.
- Price, production, tax, availability dates and coordinates can be missing; missing remains missing.
- Inventory inspection uses search, filters, paging, detail dialogs and complete exports.
- Material search covers imported inventory, reports, files and research.
- Coverage ties historical source reports to inventory and verified client landmarks.
- Quote generation and export remain gated by valid source data and confirmed briefs.

## Screen questions
- Studio: what has been prepared, and what is still needed to make this proposal?
- Resources: which original inventory records match this search?
- Coverage: which historical evidence and verified locations support this selection?
- Proposal: is there an exportable quote, and what supports its composition?
- Data: where did the records come from, and how can missing inputs be supplied?

## Direction and anatomy
Light green-grey L-frame, white inset sheet, restrained Xinyun mark and green evidence statuses.
Signature: four readiness stages—customer brief, coverage evidence, inventory, quote conditions—computed from current state and linking to the relevant task.
Desktop arithmetic: 1440 = 228 sidebar + 8 outer inset + 1204 sheet; 1154 inner width = 320 brief + 24 gutter + 810 results (sheet border accounted separately).
At <=1200 the form and results stack; at <=1100 navigation moves above content; <=640 navigation sits at the bottom with safe-area padding.
Type: system sans with Chinese fallback, 24 title / 16 section / 14 body and cells / 12 meta; tabular numbers.
The dealt graph-builder pattern does not match a brief form and deterministic media calculator. Preserve real form + result flow within the dealt framed-sheet shell, without invented graph nodes.
User-requested compact pagination is retained even on the five-row overview.
No data, stores, locations, prices, charts or metrics are invented.

## Verification
Run existing data, server, import and browser regressions. Capture all five screens at 1440, 768, 390 and inspect clipping, typography and local table scrolling.
Run Taste Code source lint. Official CDP inspector currently exits immediately with default Chrome and forced Edge; use Playwright/Edge capture and computed-style checks if it remains unavailable.
