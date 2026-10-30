import { QuarterlyChecks } from "@/components/quarterly-checks";
import { quarterlyGuidance } from "@shared/quarterly-stormwater";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { format } from "date-fns";
import Layout from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { ChecklistHeading, checklistAnswerClass } from "@/components/checklist-style";
import { useStore } from "@/lib/store";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  blankRecord, blankRow, dispositionColumns, recordCompletionErrors, recordSections,
  recordTemplates, recordCategory, recordFacilityName, quarterlySummary, transferChecks, transferColumns, ullageGuidance,
  type OperationalRecord, type RecordField, type RecordType,
} from "@shared/operational-records";

function Field({ field, value, onChange, disabled, prefix }: {
  field: RecordField; value: string; onChange: (value: string) => void; disabled: boolean; prefix: string;
}) {
  const id = `${prefix}-${field.key}`;
  return <div className={field.type === "textarea" ? "sm:col-span-2" : ""}>
    <label id={`${id}-label`} htmlFor={id} className="text-sm font-medium">{field.label}{field.required && " *"}</label>
    {field.type === "yesno" ? <div role="group" aria-labelledby={`${id}-label`} className="flex gap-2 mt-2">
      {(["yes", "no"] as const).map(answer => <Button key={answer} type="button" variant="outline" disabled={disabled}
        aria-pressed={value === answer} className={value === answer ? checklistAnswerClass(answer, true) : ""}
        onClick={() => onChange(value === answer ? "" : answer)}>{answer.toUpperCase()}</Button>)}
    </div> : field.type === "textarea" ? <Textarea id={id} value={value} maxLength={2000} rows={2} disabled={disabled}
      onChange={event => onChange(event.target.value)} className="mt-1" /> :
      <Input id={id} type={field.type || "text"} value={value} disabled={disabled} maxLength={field.type === "number" ? 30 : 2000}
        min={field.type === "number" && !field.signed ? 0 : undefined} step={field.type === "number" ? "any" : undefined}
        onChange={event => onChange(event.target.value)} className="mt-1" />}
  </div>;
}

export default function OperationalRecordPage({ templateId, inspectionId, kind, readOnly = false }: {
  templateId: number; inspectionId: number | null; kind: RecordType; readOnly?: boolean;
}) {
  const { currentUser, getInspection, addInspection, updateInspection } = useStore();
  const existing = inspectionId ? getInspection(inspectionId) : undefined;
  const [record, setRecord] = useState<OperationalRecord>(() => existing?.recordData ?? blankRecord(kind));
  const [recordId, setRecordId] = useState(inspectionId);
  const [name, setName] = useState(existing?.inspectionName || "");
  const [inspector, setInspector] = useState(existing?.inspectorName || currentUser?.name || "");
  const [date, setDate] = useState(existing?.inspectionDate || format(new Date(), "yyyy-MM-dd"));
  const [status, setStatus] = useState(existing?.status || "in_progress");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [, navigate] = useLocation();
  const { toast } = useToast();
  // Navigation can render the detail view before the store's save update commits.
  // Refresh its read-only snapshot when that saved record arrives.
  useEffect(() => {
    if (!readOnly || !existing?.recordData) return;
    setRecord(existing.recordData); setName(existing.inspectionName || "");
    setInspector(existing.inspectorName); setDate(existing.inspectionDate); setStatus(existing.status);
  }, [readOnly, existing]);
  const title = recordTemplates.find(template => template.type === kind)!.name;
  const disabled = readOnly || busy;
  const quarterly = kind === "american_concrete_quarterly";
  const summary = quarterlySummary(record);
  const updateField = (key: string, value: string) => setRecord(previous => ({ ...previous, fields: { ...previous.fields, [key]: value } }));

  async function persist(complete = false) {
    const missing = [!inspector.trim() ? "Completed by" : "", !date ? "Date" : "", ...(complete ? recordCompletionErrors(record) : [])].filter(Boolean);
    if (missing.length) { setErrors(missing); throw new Error("Review the required fields listed above the form."); }
    const payload = {
      userId: currentUser!.id, templateId, facilityName: recordFacilityName(kind), facilityAddress: "", inspectorName: inspector.trim(),
      inspectionDate: date, inspectionName: name.trim() || title, generalComments: "", recordData: record,
      status: complete ? "completed" as const : "in_progress" as const,
    };
    let id = recordId;
    if (id) await updateInspection(id, payload);
    else { const saved = await addInspection(payload); id = saved.id; setRecordId(id); }
    setStatus(payload.status); setErrors([]);
    return id;
  }

  async function action(mode: "save" | "complete" | "pdf") {
    if (busy) return;
    setBusy(true);
    try {
      const id = readOnly ? recordId! : await persist(mode === "complete");
      if (mode === "pdf") {
        const response = await apiRequest("GET", `/api/inspections/${id}/record-pdf`);
        if (!response.ok) throw new Error("Could not generate the PDF.");
        const url = URL.createObjectURL(await response.blob());
        const anchor = document.createElement("a");
        anchor.href = url; anchor.download = `${kind}_${date}.pdf`;
        document.body.appendChild(anchor); anchor.click(); anchor.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        toast({ title: "PDF downloaded" });
      } else toast({ title: mode === "complete" ? "Record completed" : "Draft saved" });
      if (mode === "complete") navigate(`/inspection/${id}`);
      if (mode === "save" && !inspectionId) navigate(`/inspection/${id}/edit`);
    } catch (error) {
      toast({ title: "Unable to finish", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
    } finally { setBusy(false); }
  }

  const section = (index: number) => {
    const item = recordSections[kind][index];
    return <Card key={item.title}><CardContent className="p-4">
      <h2 className="text-base font-semibold mb-3">{item.title}</h2>
      <>{item.description && <p className="text-sm text-muted-foreground mb-4">{item.description}</p>}</>
      <div className="grid sm:grid-cols-2 gap-4">{item.fields.map(field => <Field key={field.key} field={field} prefix={kind}
        value={record.fields[field.key] || ""} disabled={disabled} onChange={value => updateField(field.key, value)} />)}</div>
    </CardContent></Card>;
  };

  const rowEditor = (columns: RecordField[], label: string) => <Card><CardContent className="p-4 space-y-4">
    <h2 className="font-semibold">{label}</h2>
    {record.rows.length === 0 && <p className="text-sm text-muted-foreground">No entries recorded.</p>}
    {record.rows.map((row, index) => <fieldset key={index} className="border border-border rounded-lg p-4">
      <legend className="px-2 text-sm font-semibold">Entry {index + 1}</legend>
      <div className="grid sm:grid-cols-2 gap-4">{columns.map(field => <Field key={field.key} field={field} prefix={`row-${index}`}
        disabled={disabled} value={row[field.key] || ""} onChange={value => setRecord(previous => ({ ...previous,
          rows: previous.rows.map((entry, i) => i === index ? { ...entry, [field.key]: value } : entry),
        }))} />)}</div>
      {!readOnly && <Button variant="ghost" className="mt-3" disabled={busy} aria-label={`Remove entry ${index + 1}`}
        onClick={() => setRecord(previous => ({ ...previous, rows: previous.rows.filter((_, i) => i !== index) }))}>Remove entry</Button>}
    </fieldset>)}
    {!readOnly && <Button variant="outline" disabled={busy || record.rows.length >= 100}
      onClick={() => setRecord(previous => ({ ...previous, rows: [...previous.rows, blankRow(columns)] }))}>Add entry</Button>}
  </CardContent></Card>;

  return <Layout title={title}>
    <div className="max-w-4xl mx-auto space-y-4 pb-28">
      <p className="text-sm text-muted-foreground">{recordCategory(kind)} / {title}</p>
      <div className="flex flex-wrap items-center justify-between gap-2"><h1 className="text-xl font-bold">{title}</h1>
        <span className="text-sm font-medium">{status === "completed" ? "Completed" : "Draft"}</span></div>
      {!readOnly && <p className="text-sm text-muted-foreground">{quarterly ? "Save a draft at any time. Skip questions that do not apply, or choose N/A. Fields marked * are needed to complete the record; closeout dates may remain blank for open deficiencies." : "Save a draft at any time. Fields marked * and all checklist responses are needed to complete the record."}</p>}
      {errors.length > 0 && <div role="alert" className="border border-red-300 rounded-lg p-4 text-sm">
        <p className="font-semibold">Complete these fields:</p><ul className="list-disc pl-5">{errors.map(error => <li key={error}>{error}</li>)}</ul>
      </div>}
      <Card><CardContent className="p-4">
        <ChecklistHeading number={1}>Record details</ChecklistHeading>
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2"><label htmlFor="record-name" className="text-sm font-medium">Record name</label>
            <Input id="record-name" value={name} placeholder={title} maxLength={300} disabled={disabled} onChange={event => setName(event.target.value)} className="mt-1" /></div>
          <div><label htmlFor="record-inspector" className="text-sm font-medium">{kind === "controlled_drainage" ? "Completed by" : "Inspector"} *</label>
            <Input id="record-inspector" value={inspector} maxLength={100} disabled={disabled} onChange={event => setInspector(event.target.value)} className="mt-1" /></div>
          <div><label htmlFor="record-date" className="text-sm font-medium">{kind === "controlled_drainage" ? "Discharge date" : "Date"} *</label>
            <Input id="record-date" type="date" value={date} disabled={disabled} onChange={event => setDate(event.target.value)} className="mt-1" /></div>
        </div>
      </CardContent></Card>
      {quarterly && <>
        <p className="rounded-lg bg-blue-50 dark:bg-blue-950/30 p-4 text-sm leading-relaxed">{quarterlyGuidance}</p>
        <QuarterlyChecks checks={record.checks} disabled={disabled} onChange={(index, patch) => setRecord(previous => ({ ...previous,
          checks: previous.checks.map((check, i) => i === index ? { ...check, ...patch } : check),
        }))} />
        <Card><CardContent className="p-4 space-y-2 text-sm">
          <h2 className="font-semibold">Quarterly closeout summary</h2>
          <p>Deficiencies (NO items): {summary.count}</p>
          <p>{summary.count === 0 ? "No deficiencies recorded." : summary.allClosed ? "All deficiencies have a corrective action and closeout date." : `Still open: checks ${summary.openNumbers.join(", ")}`}</p>
          <p className="text-muted-foreground">{record.checks.filter(check => check.answer === "n/a").length} marked N/A · {record.checks.filter(check => !check.answer).length} skipped / unanswered</p>
        </CardContent></Card>
        {section(0)}{section(1)}{section(2)}
      </>}
      {kind === "transfer_log" && <><p className="rounded-lg bg-blue-50 dark:bg-blue-950/30 p-4 text-sm leading-relaxed">{ullageGuidance}</p>{rowEditor(transferColumns, "Transfer entries")}</>}
      {kind === "transfer_checklist" && <>
        {section(0)}
        <Card><CardContent className="p-4"><ChecklistHeading number={2}>Transfer procedure checks</ChecklistHeading>
          <div className="divide-y divide-border">{transferChecks.map((question, index) => <fieldset key={question} className="py-4">
            <legend className="text-sm font-medium pt-3">{index + 1}. {question}</legend>
            <div className="flex flex-wrap gap-2 my-3">{(["yes", "no", "n/a"] as const).map(answer => <Button key={answer} type="button" variant="outline"
              disabled={disabled} aria-pressed={record.checks[index].answer === answer} className={record.checks[index].answer === answer ? checklistAnswerClass(answer) : ""}
              onClick={() => setRecord(previous => ({ ...previous, checks: previous.checks.map((check, i) => i === index ? { ...check, answer: check.answer === answer ? "" : answer } : check) }))}>{answer.toUpperCase()}</Button>)}</div>
            <label htmlFor={`check-${index}-comment`} className="text-xs font-medium">Comments / correction</label>
            <Textarea id={`check-${index}-comment`} value={record.checks[index].comments} disabled={disabled} maxLength={2000} rows={2} className="mt-1"
              onChange={event => setRecord(previous => ({ ...previous, checks: previous.checks.map((check, i) => i === index ? { ...check, comments: event.target.value } : check) }))} />
          </fieldset>)}</div>
        </CardContent></Card>
        {section(1)}
      </>}
      {kind === "controlled_drainage" && <>{section(0)}{section(1)}{rowEditor(dispositionColumns, "Contaminated water disposition")}{section(2)}{section(3)}</>}
    </div>
    <div className="fixed bottom-0 left-0 right-0 md:left-64 bg-card border-t border-border p-3 flex flex-wrap justify-center gap-2 z-40">
      <Button variant="ghost" disabled={busy} onClick={() => navigate("/dashboard")}>Back</Button>
      {readOnly ? <Button variant="outline" disabled={busy} onClick={() => navigate(`/inspection/${recordId}/edit`)}>Edit record</Button> :
        <Button variant="outline" disabled={busy} onClick={() => action("save")}>Save draft</Button>}
      <Button variant="outline" disabled={busy} onClick={() => action("pdf")}>Download PDF</Button>
      {!readOnly && <Button disabled={busy} onClick={() => action("complete")}>{busy ? "Saving..." : "Complete record"}</Button>}
    </div>
  </Layout>;
}
