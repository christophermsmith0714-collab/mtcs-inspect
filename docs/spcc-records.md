# SPCC transfer and drainage records

The Start New Inspection selector groups the following forms under **SPCC Inspections**:

- Tank Level and Fluid Transfer Log: repeatable entries, including receiving-container identification and signed gallons added/removed. The supplied ullage guidance is shown without calculating a safe fill limit.
- Transfer Procedure Checklist: all 14 supplied checks, YES/NO/N/A, comments/corrections, tank, representative, supplier, and typed inspector signature/date.
- Controlled Drainage Record: completed by/position, discharge date and times, release location and estimated quantity with units, water/drain checks, repeatable contaminated-water disposition entries, observations, authorization, and drain closure verification.

The new forms omit facility name, facility address, organization, and phone fields and all prefilled facility information from the reference documents. Existing inspection records and their facility fields are unchanged.

Clients assigned an SPCC template automatically see these related forms. Administrators can also assign them individually. They are structured record forms rather than customizable question lists; opening one from Checklists opens its form, and Excel question import excludes them.

Records support draft saving, reopening, editing, completion, and PDF download. Each added row must be filled before completion; the disposition list may be empty when no disposition is recorded. NO and N/A are recorded responses, not automatic assertions of safe operating conditions. Signature fields capture typed names. Editing a saved record returns it to draft unless it is explicitly completed again. Export includes unanswered checks as OPEN on draft PDFs.

## Persistence

Startup adds the nullable `inspections.record_data` JSON column and seeds missing templates by type. Repeated startup does not overwrite administrator template names or existing inspections. Saves validate the structured payload on the server, enforce its template type, and clear facility fields on these three forms. PDF download requires authentication and record ownership (or administrator role).

## Validation

Run `npm run check`, `npx vitest run tests/tank.test.ts tests/operational-records.test.ts`, and `npm run build` with Node 20.19 or later. The older `tests/api.test.ts` targets a separately running server and predates the app's bearer-token authentication; it is not the isolated integration suite.
