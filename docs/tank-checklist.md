# Tank inspection checklist

The **Tank Inspection - Integrity Report Companion** template contains 32 YES/NO inspection points selected by MTCS, with independently rewritten prompts and section names. It uses the existing inspection name, facility, inspector, date, comments and photo fields.

Select it under **Dashboard > Start New Inspection**. Admins can edit questions under **Checklists** and assign the template to clients through existing client template assignments.

The PDF uses a distinct MTCS design: a blue brand rule, left-aligned title, numbered section bands, fine row separators and a single RESULT column with labeled YES/NO badges. Headings use the integrity report's blue (#548DD4). Green and red badges also include text so the response remains clear in grayscale. The default checklist occupies two pages; edited questions wrap and sections paginate with repeated headings.

PDFs include only answered questions. Unanswered questions, their supporting notes/photos, and sections with no answered questions are omitted. Question numbers remain tied to the saved checklist. Tank exports with incomplete answers are still marked DRAFT; a checklist is complete when every question has a YES or NO answer. Comments and photos are optional. There are no additional tank-detail forms or corrective-action fields.

## Data and deployment

Startup creates the tank template in a transaction if no tank template exists. For an existing tank template, an exact-match upgrade rewrites only the original, unedited prompts and section names. Question IDs, answers, order and recommendations are preserved. Administrator customizations are retained. No tank-specific database columns are added, and client assignments stay unchanged.

All checklist screens and PDFs now share the approved MTCS blue style, including SPCC, monthly stormwater, custom templates and the comprehensive annual stormwater evaluation. The checklist builder and saved inspection view use the same numbered section headers and response badges. Form routes retain their identity during saves and wait for inspections to load before restoring edit screens. Save failures propagate to the UI.

`server/mtcs-pdf.ts` owns the shared page layout, wrapping, section headers, result badges and numbered footer. `server/checklist-pdf.ts` renders tank and monthly/custom checklists using YES/NO-only export selection. Monthly/custom reports retain corrective-action recommendations; notes and photos for included questions appear in the supporting appendix. Tank completion rules are unchanged. The annual stormwater renderer includes answered discharge, control and industrial-area questions (including explicit N/A responses), entered weather/notes, and the certification statement with a blank signature line. Factual discharge and inspected responses use neutral blue badges; these are not compliance ratings. Omission affects the PDF only, not saved questions or answers.

Railway's Nixpacks install step explicitly includes development dependencies so tsx and Vite are available when NODE_ENV is production. The runtime start command remains unchanged.

## Validation

Use Node 20 (as specified in .node-version), then:

```sh
npm ci
npm run check
npm test -- tests/tank.test.ts
npm run build
```

The isolated tank tests use a temporary SQLite database and Express app. They cover preserved existing records, repeatable seeding, administrator edits, YES/NO persistence, optional notes, access restrictions, draft/completed state, all four checklist PDF types, and authenticated annual stormwater export with long notes. They send no email. The older api.test.ts suite targets an external server on port 5000 and is separate.

Browser checks: start an inspection, record YES/NO answers, save, reopen and refresh the edit URL, then export. Review the builder, saved inspection view and annual stormwater form on desktop and mobile. For PDF QA, render representative SPCC (82 questions), monthly stormwater (18), tank (32), custom and annual reports. Check every page, question text, notes, photo count, recommendation content, certification text, page numbering and footer clearance, including text longer than a page.
