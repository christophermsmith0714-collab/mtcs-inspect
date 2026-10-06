# Tank inspection checklist

The **Tank Inspection - Integrity Report Companion** template contains the 32 YES/NO questions in the seven sections supplied by MTCS. It uses the existing inspection name, facility, inspector, date, comments and photo fields.

Select it under **Dashboard > Start New Inspection**. Admins can edit questions under **Checklists** and assign the template to clients through existing client template assignments.

The PDF follows the supplied two-page findings tables: gray section headers, black grid lines, narrow YES/NO columns, green YES cells and red NO cells. Headings and the company footer use the integrity report's blue (#548DD4). The first page has Administrative Requirements, Tank Foundation/Supports, and Tank Shells, Heads and Roof. The remaining four sections start on the second page. Rows wrap and edited sections paginate with repeated headers.

Unanswered items have blank answer cells and the PDF is marked DRAFT. A checklist is complete when every question has a YES or NO answer; comments and photos are optional. Supporting notes and photos are appended only when entered. There are no additional tank-detail forms or corrective-action fields.

## Data and deployment

Startup creates the tank template in a transaction if no tank template exists. No tank-specific database columns are added. Existing templates, inspections and client assignments are retained; subsequent starts preserve administrator edits.

Tank PDFs use a dedicated renderer. Other templates retain the existing PDF layout. Form routes retain their identity during saves and wait for inspections to load before restoring edit screens. Save failures propagate to the UI.

## Validation

Use Node 20 (as specified in .node-version), then:

```sh
npm ci
npm run check
npm test -- tests/tank.test.ts
npm run build
```

The isolated tank tests use a temporary SQLite database and Express app. They cover preserved existing records, repeatable seeding, administrator edits, YES/NO persistence, optional notes, access restrictions, draft/completed state, and tank/existing PDF endpoints. They send no email. The older api.test.ts suite targets an external server on port 5000 and is separate.

Browser checks: start a tank inspection with only the existing header fields, record YES/NO answers, save, reopen and refresh the edit URL, then export a draft. Visually review both PDF pages plus optional long notes and photos.
