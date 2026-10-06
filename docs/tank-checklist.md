# Tank inspection checklist

The **Tank Inspection - Integrity Report Companion** template records one tank's visual inspection alongside an existing integrity testing report. It contains 42 editable questions in eight sections, plus tank identification, report reference, inspection basis, limitations, comments, photos and a corrective-action log.

After deployment, select it under **Dashboard > Start New Inspection**. Admins can edit its questions under **Checklists** and assign it to clients through the existing client template assignments. Existing client assignments are preserved.

Use YES for satisfactory/verified items, NO for findings, and N/A with an explanation for inapplicable items. Each NO can record an action, responsible person, target date and verified completion date. Photos and corrective actions reference the same item numbers in the PDF. Draft PDFs include unanswered items as NOT CHECKED. A completed checklist requires a tank ID, report reference, every response, and comments for NO/N/A. Completion describes the record's completeness, not suitability for service or closure of corrective actions.

The companion does not calculate tank categories, thickness acceptance limits, alarm setpoints, remaining life or inspection intervals. Enter dates and the inspection basis from the applicable records and standard. It does not merge or amend the original integrity report; export its PDF to include with that report. This is an original MTCS checklist, not an official STI form or a substitute for the applicable standard.

The approach to inspection frequency is consistent with [EPA's inspection schedule guidance](https://www.epa.gov/oil-spills-prevention-and-preparedness-regulations/spcc-rule-schedules-inspections-tests-and). See also [STI/SPFA's explanation of the role of its inspection checklist](https://stispfa.org/resource/sti-sp001-monthly-inspection-checklist/).

## Data and deployment

Startup adds a nullable `tank_details` JSON column to `inspections` and creates the tank template in a transaction if no `tank` template exists. Existing inspections and templates are retained. Subsequent starts preserve checklist edits. Use the deployment's normal database backup procedure before rolling out the additive schema change.

Tank details and corrective actions are stored with the inspection. The new PDF renderer handles tank reports; other templates retain their renderer. Form routes now keep their component identity during saves, and wait for stored inspections before restoring an edit screen. Save failures propagate to the UI.

## Validation

Use Node 20 (as specified in `.node-version`), then:

```sh
npm ci
npm run check
npm test -- tests/tank.test.ts
npm run build
```

The tank suite creates its own temporary SQLite database and Express app. It covers legacy migration, repeatable seeding, customization preservation, round-trip metadata/actions, validation, ownership, completion state, N/A persistence, and tank/legacy PDF endpoints. It sends no email. The older `api.test.ts` suite targets an external server on port 5000 and is separate from these isolated tests.

Browser checks: start a tank inspection; record a NO, observation, corrective action and N/A explanation; save without leaving the form; reopen and refresh the edit URL; export a draft and verify the inspection remains in progress. Review the PDF's full checklist, action references and photo pages, including long comments and page breaks.
