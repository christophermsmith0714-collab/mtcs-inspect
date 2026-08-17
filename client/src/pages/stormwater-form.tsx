import { useState } from "react";
import Layout from "@/components/layout";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Loader2, Plus, Trash2, Download } from "lucide-react";

interface ControlMeasureRow {
  id: number;
  structural: string;
  location: string;
  operating: "yes" | "no" | "";
  needMaintenance: boolean;
  needRepair: boolean;
  needReplacement: boolean;
  notes: string;
}

interface IndustrialAreaRow {
  id: number;
  area: string;
  inspected: "yes" | "no" | "na" | "";
  controlsAdequate: "yes" | "no" | "";
  notes: string;
  fixed: boolean; // pre-filled rows from the form
}

const FIXED_INDUSTRIAL_AREAS = [
  "Material loading/unloading and storage areas",
  "Equipment operations and maintenance areas",
  "Fueling areas",
  "Outdoor vehicle and equipment washing areas",
  "Waste handling and disposal areas",
  "Erodible areas",
  "Processing areas",
  "(other) industrial activity",
  "(other) industrial activity",
];

const WEATHER_OPTIONS = ["Clear", "Cloudy", "Rain", "High Winds"];

export default function StormwaterFormPage() {
  const { toast } = useToast();
  const [generating, setGenerating] = useState(false);

  // Header fields
  const [facilityName, setFacilityName] = useState("");
  const [kansasPermitNo, setKansasPermitNo] = useState("");
  const [dateOfInspection, setDateOfInspection] = useState("");
  const [inspectorNames, setInspectorNames] = useState("");
  const [inspectorTitles, setInspectorTitles] = useState("");

  // Weather
  const [weather, setWeather] = useState<string[]>([]);
  const [temp, setTemp] = useState("");
  const [weatherOther, setWeatherOther] = useState("");

  // Discharge questions
  const [dischargeOccurring, setDischargeOccurring] = useState<"yes" | "no" | "">("");
  const [dischargeDescribe, setDischargeDescribe] = useState("");
  const [pollutantEvidence, setPollutantEvidence] = useState<"yes" | "no" | "">("");
  const [pollutantDescribe, setPollutantDescribe] = useState("");

  // Control measures table
  const [controlRows, setControlRows] = useState<ControlMeasureRow[]>(
    Array.from({ length: 5 }, (_, i) => ({
      id: i,
      structural: "",
      location: "",
      operating: "",
      needMaintenance: false,
      needRepair: false,
      needReplacement: false,
      notes: "",
    }))
  );

  // Industrial areas table
  const [industrialRows, setIndustrialRows] = useState<IndustrialAreaRow[]>(
    FIXED_INDUSTRIAL_AREAS.map((area, i) => ({
      id: i,
      area,
      inspected: "",
      controlsAdequate: "",
      notes: "",
      fixed: true,
    }))
  );

  // Free text
  const [nonComplianceNotes, setNonComplianceNotes] = useState("");
  const [additionalNotes, setAdditionalNotes] = useState("");

  // Certification
  const [printNameTitle, setPrintNameTitle] = useState("");
  const [signatureDate, setSignatureDate] = useState("");

  function toggleWeather(w: string) {
    setWeather(prev => prev.includes(w) ? prev.filter(x => x !== w) : [...prev, w]);
  }

  function addControlRow() {
    setControlRows(prev => [...prev, {
      id: Date.now(),
      structural: "",
      location: "",
      operating: "",
      needMaintenance: false,
      needRepair: false,
      needReplacement: false,
      notes: "",
    }]);
  }

  function removeControlRow(id: number) {
    setControlRows(prev => prev.filter(r => r.id !== id));
  }

  function updateControlRow(id: number, field: keyof ControlMeasureRow, value: any) {
    setControlRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
  }

  function updateIndustrialRow(id: number, field: keyof IndustrialAreaRow, value: any) {
    setIndustrialRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
  }

  async function handleGenerate() {
    if (!facilityName.trim()) {
      toast({ title: "Facility name required", variant: "destructive" });
      return;
    }
    setGenerating(true);
    try {
      const payload = {
        facilityName, kansasPermitNo, dateOfInspection,
        inspectorNames, inspectorTitles,
        weather, temp, weatherOther,
        dischargeOccurring, dischargeDescribe,
        pollutantEvidence, pollutantDescribe,
        controlRows, industrialRows,
        nonComplianceNotes, additionalNotes,
        printNameTitle, signatureDate,
      };
      const res = await apiRequest("POST", "/api/stormwater-pdf", payload);
      const data = await res.json();
      if (data.pdf) {
        const bytes = Uint8Array.from(atob(data.pdf), c => c.charCodeAt(0));
        const blob = new Blob([bytes], { type: "application/pdf" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        const safeName = facilityName.replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_]/g, "");
        const dateStr = dateOfInspection || new Date().toISOString().slice(0, 10);
        a.download = `Stormwater_Evaluation_${safeName}_${dateStr}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
        toast({ title: "PDF downloaded successfully" });
      } else {
        toast({ title: "Failed to generate PDF", description: data.error || "Unknown error", variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  }

  const inputCls = "w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400";
  const labelCls = "block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide";

  return (
    <Layout title="Stormwater Evaluation">
      <div className="max-w-4xl mx-auto p-4 pb-24">
        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-xl font-bold text-gray-900">Stormwater Comprehensive Site Compliance Evaluation</h1>
          <p className="text-sm text-gray-500 mt-1">Covering the period of July 1 to June 30. Submission due to KDHE by October 1 annually.</p>
        </div>

        {/* Facility Info */}
        <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4 space-y-3">
          <div>
            <label className={labelCls}>Facility Name</label>
            <input className={inputCls} value={facilityName} onChange={e => setFacilityName(e.target.value)} placeholder="Enter facility name" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Kansas Permit No.</label>
              <input className={inputCls} value={kansasPermitNo} onChange={e => setKansasPermitNo(e.target.value)} placeholder="e.g. KS-R08-####" />
            </div>
            <div>
              <label className={labelCls}>Date of Inspection</label>
              <input type="date" className={inputCls} value={dateOfInspection} onChange={e => setDateOfInspection(e.target.value)} />
            </div>
          </div>
          <div>
            <label className={labelCls}>Inspector's Name(s)</label>
            <input className={inputCls} value={inspectorNames} onChange={e => setInspectorNames(e.target.value)} placeholder="Full name(s)" />
          </div>
          <div>
            <label className={labelCls}>Inspector's Title(s)</label>
            <input className={inputCls} value={inspectorTitles} onChange={e => setInspectorTitles(e.target.value)} placeholder="Title(s)" />
          </div>
        </div>

        {/* Weather */}
        <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Weather Information at Time of Inspection</h2>
          <div className="flex flex-wrap gap-4 mb-3">
            {WEATHER_OPTIONS.map(w => (
              <label key={w} className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={weather.includes(w)} onChange={() => toggleWeather(w)}
                  className="w-4 h-4 rounded border-gray-300" />
                {w}
              </label>
            ))}
            <div className="flex items-center gap-2 text-sm">
              <span className="text-gray-600">Temp:</span>
              <input className="border border-gray-300 rounded px-2 py-1 text-sm w-24 focus:outline-none focus:ring-2 focus:ring-blue-400"
                value={temp} onChange={e => setTemp(e.target.value)} placeholder="°F" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">Other:</span>
            <input className={inputCls} value={weatherOther} onChange={e => setWeatherOther(e.target.value)} placeholder="Describe other conditions" />
          </div>
        </div>

        {/* Discharge Questions */}
        <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4 space-y-4">
          <div>
            <div className="flex items-start justify-between gap-4">
              <p className="text-sm text-gray-800">Are there any discharges occurring at the time of inspection?</p>
              <div className="flex gap-3 shrink-0">
                {(["yes", "no"] as const).map(v => (
                  <label key={v} className="flex items-center gap-1.5 text-sm cursor-pointer">
                    <input type="radio" name="discharge" checked={dischargeOccurring === v} onChange={() => setDischargeOccurring(v)} className="w-4 h-4" />
                    {v === "yes" ? "Yes" : "No"}
                  </label>
                ))}
              </div>
            </div>
            {dischargeOccurring === "yes" && (
              <div className="mt-2">
                <label className={labelCls}>If yes, describe:</label>
                <input className={inputCls} value={dischargeDescribe} onChange={e => setDischargeDescribe(e.target.value)} />
              </div>
            )}
          </div>
          <div>
            <div className="flex items-start justify-between gap-4">
              <p className="text-sm text-gray-800">Is there any evidence of pollutants, in any outfall, entering the drainage system since the last inspection?</p>
              <div className="flex gap-3 shrink-0">
                {(["yes", "no"] as const).map(v => (
                  <label key={v} className="flex items-center gap-1.5 text-sm cursor-pointer">
                    <input type="radio" name="pollutant" checked={pollutantEvidence === v} onChange={() => setPollutantEvidence(v)} className="w-4 h-4" />
                    {v === "yes" ? "Yes" : "No"}
                  </label>
                ))}
              </div>
            </div>
            {pollutantEvidence === "yes" && (
              <div className="mt-2">
                <label className={labelCls}>If yes, describe:</label>
                <input className={inputCls} value={pollutantDescribe} onChange={e => setPollutantDescribe(e.target.value)} />
              </div>
            )}
          </div>
        </div>

        {/* Control Measures Table */}
        <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-gray-800 uppercase tracking-wide">Control Measures</h2>
            <Button size="sm" variant="outline" onClick={addControlRow} className="text-xs gap-1">
              <Plus className="w-3 h-3" /> Add Row
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border border-gray-300 px-2 py-2 text-left font-semibold w-1/5">Structural Control Measure<br/><span className="font-normal text-gray-500">(e.g. diversion swale, hay bales, silt fence)</span></th>
                  <th className="border border-gray-300 px-2 py-2 text-left font-semibold w-1/6">Location</th>
                  <th className="border border-gray-300 px-2 py-2 text-center font-semibold w-24">Control Measure Operating Effectively?</th>
                  <th className="border border-gray-300 px-2 py-2 text-center font-semibold w-32">If No, In Need of Maintenance, Repair, or Replacement?</th>
                  <th className="border border-gray-300 px-2 py-2 text-left font-semibold">Maintenance or Corrective Action Needed and Notes</th>
                  <th className="border border-gray-300 px-2 py-2 w-8"></th>
                </tr>
              </thead>
              <tbody>
                {controlRows.map((row, idx) => (
                  <tr key={row.id} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                    <td className="border border-gray-300 px-2 py-1">
                      <input className="w-full text-xs focus:outline-none bg-transparent" value={row.structural}
                        onChange={e => updateControlRow(row.id, "structural", e.target.value)} placeholder="Type of control..." />
                    </td>
                    <td className="border border-gray-300 px-2 py-1">
                      <input className="w-full text-xs focus:outline-none bg-transparent" value={row.location}
                        onChange={e => updateControlRow(row.id, "location", e.target.value)} placeholder="Location..." />
                    </td>
                    <td className="border border-gray-300 px-2 py-2 text-center">
                      <div className="flex justify-center gap-3">
                        {(["yes", "no"] as const).map(v => (
                          <label key={v} className="flex items-center gap-1 cursor-pointer">
                            <input type="radio" name={`operating-${row.id}`} checked={row.operating === v}
                              onChange={() => updateControlRow(row.id, "operating", v)} className="w-3 h-3" />
                            <span>{v === "yes" ? "Yes" : "No"}</span>
                          </label>
                        ))}
                      </div>
                    </td>
                    <td className="border border-gray-300 px-2 py-2">
                      <div className="space-y-1">
                        {(["needMaintenance", "needRepair", "needReplacement"] as const).map(field => (
                          <label key={field} className="flex items-center gap-1 cursor-pointer">
                            <input type="checkbox" checked={row[field]} onChange={e => updateControlRow(row.id, field, e.target.checked)} className="w-3 h-3" />
                            <span>{field === "needMaintenance" ? "Maintenance" : field === "needRepair" ? "Repair" : "Replacement"}</span>
                          </label>
                        ))}
                      </div>
                    </td>
                    <td className="border border-gray-300 px-2 py-1">
                      <textarea className="w-full text-xs focus:outline-none bg-transparent resize-none" rows={2} value={row.notes}
                        onChange={e => updateControlRow(row.id, "notes", e.target.value)} placeholder="Notes..." />
                    </td>
                    <td className="border border-gray-300 px-1 py-1 text-center">
                      {controlRows.length > 1 && (
                        <button onClick={() => removeControlRow(row.id)} className="text-red-400 hover:text-red-600">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Industrial Areas Table */}
        <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4">
          <h2 className="text-sm font-bold text-gray-800 uppercase tracking-wide mb-3">Areas of Industrial Materials or Activities Exposed to Stormwater</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border border-gray-300 px-2 py-2 text-left font-semibold">Area/Activity</th>
                  <th className="border border-gray-300 px-2 py-2 text-center font-semibold w-32">Inspected?</th>
                  <th className="border border-gray-300 px-2 py-2 text-center font-semibold w-32">Controls Adequate?</th>
                  <th className="border border-gray-300 px-2 py-2 text-left font-semibold">Maintenance or Corrective Action Needed and Notes</th>
                </tr>
              </thead>
              <tbody>
                {industrialRows.map((row, idx) => (
                  <tr key={row.id} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                    <td className="border border-gray-300 px-2 py-2 text-sm">{row.area}</td>
                    <td className="border border-gray-300 px-2 py-2">
                      <div className="flex justify-center gap-2">
                        {(["yes", "no", "na"] as const).map(v => (
                          <label key={v} className="flex items-center gap-0.5 cursor-pointer">
                            <input type="radio" name={`inspected-${row.id}`} checked={row.inspected === v}
                              onChange={() => updateIndustrialRow(row.id, "inspected", v)} className="w-3 h-3" />
                            <span>{v === "na" ? "N/A" : v.charAt(0).toUpperCase() + v.slice(1)}</span>
                          </label>
                        ))}
                      </div>
                    </td>
                    <td className="border border-gray-300 px-2 py-2">
                      <div className="flex justify-center gap-3">
                        {(["yes", "no"] as const).map(v => (
                          <label key={v} className="flex items-center gap-1 cursor-pointer">
                            <input type="radio" name={`adequate-${row.id}`} checked={row.controlsAdequate === v}
                              onChange={() => updateIndustrialRow(row.id, "controlsAdequate", v)} className="w-3 h-3" />
                            <span>{v === "yes" ? "Yes" : "No"}</span>
                          </label>
                        ))}
                      </div>
                    </td>
                    <td className="border border-gray-300 px-2 py-1">
                      <textarea className="w-full text-xs focus:outline-none bg-transparent resize-none" rows={2} value={row.notes}
                        onChange={e => updateIndustrialRow(row.id, "notes", e.target.value)} placeholder="Notes..." />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Notes */}
        <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4 space-y-4">
          <div>
            <label className={labelCls}>Describe any incidents of non-compliance observed and not described above:</label>
            <textarea className={`${inputCls} resize-none`} rows={4} value={nonComplianceNotes}
              onChange={e => setNonComplianceNotes(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Additional notes or observations from this inspection:</label>
            <textarea className={`${inputCls} resize-none`} rows={4} value={additionalNotes}
              onChange={e => setAdditionalNotes(e.target.value)} />
          </div>
        </div>

        {/* Certification */}
        <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4">
          <h2 className="text-sm font-bold text-center text-gray-800 uppercase mb-3">Certification Statement</h2>
          <p className="text-xs text-gray-600 mb-4 leading-relaxed">
            "I certify under penalty of law that this document and all attachments were prepared under my direction or supervision in accordance with a system designed to assure that qualified personnel properly gathered and evaluated the information submitted. Based on my inquiry of the person or persons who manage the system, or those persons directly responsible for gathering the information, the information submitted is, to the best of my knowledge and belief, true, accurate, and complete. I am aware that there are significant penalties for submitting false information, including the possibility of fine and imprisonment for knowing violations."
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Print Name and Title</label>
              <input className={inputCls} value={printNameTitle} onChange={e => setPrintNameTitle(e.target.value)} placeholder="Name and title" />
            </div>
            <div>
              <label className={labelCls}>Date</label>
              <input type="date" className={inputCls} value={signatureDate} onChange={e => setSignatureDate(e.target.value)} />
            </div>
          </div>
        </div>

        {/* Fixed bottom action bar */}
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-3 flex justify-end gap-3 z-40 sm:left-64">
          <Button onClick={handleGenerate} disabled={generating} className="gap-2" style={{ background: "#1e2d5e" }}>
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            {generating ? "Generating PDF..." : "Download PDF"}
          </Button>
        </div>
      </div>
    </Layout>
  );
}
