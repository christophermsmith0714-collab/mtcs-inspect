import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { checklistAnswerClass } from "@/components/checklist-style";
import { quarterlySections } from "@shared/quarterly-stormwater";
import type { OperationalRecord } from "@shared/operational-records";

type Check = OperationalRecord["checks"][number];
export function QuarterlyChecks({ checks, disabled, onChange }: {
  checks: Check[]; disabled: boolean; onChange: (index: number, patch: Partial<Check>) => void;
}) {
  return <>{quarterlySections.map(section => <Card key={section.title}><CardContent className="p-4">
    <h2 className="text-base font-semibold mb-3">{section.title}</h2>
    <div className="divide-y divide-border">{section.checks.map(question => {
      const index = question.number - 1;
      const check = checks[index];
      const prefix = `quarterly-check-${question.number}`;
      return <fieldset key={question.number} className="py-4">
        <legend className="text-sm font-medium pt-3">{question.number}. {question.text}</legend>
        <div className="flex flex-wrap items-center gap-2 my-3">
          {(["yes", "no", "n/a"] as const).map(answer => <Button key={answer} type="button" variant="outline"
            disabled={disabled} aria-pressed={check.answer === answer}
            className={check.answer === answer ? checklistAnswerClass(answer) : ""}
            onClick={() => onChange(index, { answer: check.answer === answer ? "" : answer })}>{answer.toUpperCase()}</Button>)}
          <span className="text-xs text-muted-foreground">{!check.answer ? "Skipped / unanswered" : ""}</span>
        </div>
        {(check.answer === "no" || check.deficiency || check.correctiveAction || check.closeoutDate) && <div className="grid sm:grid-cols-2 gap-4">
          <div><label htmlFor={`${prefix}-deficiency`} className="text-sm font-medium">Deficiency found{check.answer === "no" && " *"}</label>
            <Textarea id={`${prefix}-deficiency`} value={check.deficiency || ""} disabled={disabled} maxLength={2000} rows={2} className="mt-1"
              onChange={event => onChange(index, { deficiency: event.target.value })} /></div>
          <div><label htmlFor={`${prefix}-action`} className="text-sm font-medium">Corrective action{check.answer === "no" && " *"}</label>
            <Textarea id={`${prefix}-action`} value={check.correctiveAction || ""} disabled={disabled} maxLength={2000} rows={2} className="mt-1"
              onChange={event => onChange(index, { correctiveAction: event.target.value })} /></div>
          <div><label htmlFor={`${prefix}-closeout`} className="text-sm font-medium">Closeout date</label>
            <Input id={`${prefix}-closeout`} type="date" value={check.closeoutDate || ""} disabled={disabled} className="mt-1"
              onChange={event => onChange(index, { closeoutDate: event.target.value })} />
            <p className="text-xs text-muted-foreground mt-1">Leave blank until the corrective action is completed.</p></div>
        </div>}
        <details className="mt-3" open={check.comments ? true : undefined}>
          <summary className="cursor-pointer text-sm text-muted-foreground">Comments / supporting details</summary>
          <label htmlFor={`${prefix}-comments`} className="sr-only">Comments for check {question.number}</label>
          <Textarea id={`${prefix}-comments`} value={check.comments} disabled={disabled} maxLength={2000} rows={2} className="mt-2"
            onChange={event => onChange(index, { comments: event.target.value })} />
        </details>
      </fieldset>;
    })}</div>
  </CardContent></Card>)}</>;
}
