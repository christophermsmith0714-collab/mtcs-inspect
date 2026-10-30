# American Concrete quarterly inspection

Source: `American-Concrete-Quarterly-Inspection.docx`, supplied by the user. All 71 questions in sections A-N retain the original wording, outfall coordinates, photo/map references, equipment and street names, and Allen Beneke (or designee) review. This is a quarterly stormwater pollution-control inspection; Appendix J2 outfall visual examinations remain separate.

Choose **American Concrete Quarterly Inspection** from Dashboard > Start New Inspection. Administrators can assign this site-specific checklist to a client through the existing client template assignments; SPCC assignments do not automatically include it.

- YES, NO, N/A, or an unanswered/skipped question. Clicking a selected response clears it.
- Each NO has separate deficiency, corrective-action, and closeout-date fields. Optional supporting comments can record dates/details for any question.
- Drafts may be saved at any point. Completion requires inspector/reviewer sign-offs, a SWPPP decision (and explanation for YES), and a deficiency description/action for each NO. Closeout dates can stay blank while work is open.
- The closeout summary calculates the NO count and open check numbers. Completing the inspection does not claim that all deficiencies are closed.
- PDFs retain all 71 checks, distinguish N/A from SKIPPED, and include deficiencies, comments, closeout dates, summary, and sign-offs.

The template is seeded idempotently by the existing record-template startup process. Records use the existing JSON `record_data` column; existing SPCC records are unchanged.

Validation: TypeScript check, production build, operational-record and tank integration suites; local browser draft/reload/completion checks; rendered five-page PDF review. The legacy `tests/api.test.ts` suite expects a separate server on localhost:5000 and could not run without that server (connection refused).
