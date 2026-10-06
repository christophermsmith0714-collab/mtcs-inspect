import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { tankFields, TANK_SCOPE, type TankDetails, type CorrectiveAction } from "@shared/tank";

export function TankDetailsForm({ value, onChange }: { value: TankDetails; onChange: (value: TankDetails) => void }) {
  return <section className="space-y-4 rounded-lg border border-border p-4" aria-label="Tank identification">
    <div><h3 className="font-semibold">Tank identification & report reference</h3><p className="text-sm text-muted-foreground mt-1">{TANK_SCOPE}</p></div>
    <div className="grid sm:grid-cols-2 gap-4">
      {tankFields.map(([key, label, placeholder]) => <div key={key}>
        <Label htmlFor={`tank-${key}`}>{label}{["tankId", "reportReference"].includes(key) ? " *" : ""}</Label>
        <Input id={`tank-${key}`} value={value[key]} placeholder={placeholder}
          type={key.endsWith("Date") ? "date" : "text"} maxLength={key === "tankId" ? 100 : key === "yearBuilt" ? 40 : key === "capacity" ? 100 : ["product", "designStandard"].includes(key) ? 150 : ["construction", "manufacturerSerial"].includes(key) ? 200 : 300}
          onChange={e => onChange({ ...value, [key]: e.target.value })} className="mt-1" />
      </div>)}
    </div>
    <div><Label htmlFor="tank-limitations">Access limitations / areas not inspected</Label>
      <Textarea id="tank-limitations" value={value.limitations} maxLength={2000} rows={3} className="mt-1"
        placeholder="Describe inaccessible surfaces, missing records and follow-up needed. Enter None if fully accessible."
        onChange={e => onChange({ ...value, limitations: e.target.value })} />
    </div>
  </section>;
}

export function TankDetailsSummary({ value }: { value: TankDetails }) {
  return <section className="mb-5 rounded-lg border border-border p-4">
    <h3 className="font-semibold mb-3">Tank identification & report reference</h3>
    <dl className="grid sm:grid-cols-2 gap-3 text-sm">{tankFields.map(([key, label]) => <div key={key}><dt className="text-muted-foreground">{label}</dt><dd className="break-words">{value[key] || "Not recorded"}</dd></div>)}</dl>
    <p className="text-sm mt-3 whitespace-pre-wrap">Limitations: {value.limitations || "Not recorded"}</p>
  </section>;
}

export function CorrectiveActionForm({ id, value, onChange }: { id: number; value?: CorrectiveAction; onChange: (value: CorrectiveAction) => void }) {
  const action = value ?? { action: "", owner: "", dueDate: "", completedDate: "" };
  return <div className="space-y-3 rounded-md border border-red-200 bg-red-50/40 dark:bg-red-950/10 p-3">
    <Label htmlFor={`action-${id}`}>Corrective action planned / taken</Label>
    <Textarea id={`action-${id}`} value={action.action} maxLength={2000} rows={2} onChange={e => onChange({ ...action, action: e.target.value })} />
    <div className="grid sm:grid-cols-3 gap-3">{([['owner', 'Responsible person'], ['dueDate', 'Target date'], ['completedDate', 'Verified complete date']] as const).map(([key, label]) => <div key={key}>
      <Label htmlFor={`action-${id}-${key}`}>{label}</Label><Input id={`action-${id}-${key}`} className="mt-1" type={key === "owner" ? "text" : "date"} maxLength={150} value={action[key]} onChange={e => onChange({ ...action, [key]: e.target.value })} />
    </div>)}</div>
  </div>;
}
