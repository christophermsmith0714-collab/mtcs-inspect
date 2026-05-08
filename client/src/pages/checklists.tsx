import { useState, useEffect, useRef } from "react";
import { useHashLocation } from "wouter/use-hash-location";
import Layout from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useStore } from "@/lib/store";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Plus, ClipboardList, ChevronRight, Loader2, Upload, FileSpreadsheet, CheckCircle2, AlertCircle } from "lucide-react";
import * as XLSX from "xlsx";

export default function ChecklistsPage() {
  const [, navigate] = useHashLocation();
  const { currentUser, authReady, templates, loadTemplates } = useStore();
  const { toast } = useToast();

  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState("custom");
  const [newDesc, setNewDesc] = useState("");
  const [creating, setCreating] = useState(false);

  // Excel import state
  const [showImport, setShowImport] = useState(false);
  const [importStep, setImportStep] = useState<"upload" | "map" | "confirm" | "done">("upload");
  const [importRows, setImportRows] = useState<any[]>([]);
  const [importHeaders, setImportHeaders] = useState<string[]>([]);
  const [colSection, setColSection] = useState("");
  const [colQuestion, setColQuestion] = useState("");
  const [colRecommend, setColRecommend] = useState("");
  const [importTargetId, setImportTargetId] = useState<string>("");
  const [importReplace, setImportReplace] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ imported: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const resetImport = () => {
    setImportStep("upload"); setImportRows([]); setImportHeaders([]);
    setColSection(""); setColQuestion(""); setColRecommend("");
    setImportTargetId(""); setImportReplace(false); setImporting(false); setImportResult(null);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const data = new Uint8Array(evt.target!.result as ArrayBuffer);
      const wb = XLSX.read(data, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: any[] = XLSX.utils.sheet_to_json(ws, { defval: "" });
      if (rows.length === 0) { toast({ title: "Empty sheet", variant: "destructive" }); return; }
      const headers = Object.keys(rows[0]);
      setImportHeaders(headers);
      setImportRows(rows);
      // Auto-detect columns by common names
      const find = (keywords: string[]) => headers.find(h => keywords.some(k => h.toLowerCase().includes(k))) || "";
      setColSection(find(["section", "category", "group"]));
      setColQuestion(find(["question", "subcategory", "item", "text"]));
      setColRecommend(find(["recommend", "response", "action", "remedy"]));
      setImportStep("map");
    };
    reader.readAsArrayBuffer(file);
  };

  const handleImport = async () => {
    if (!importTargetId) { toast({ title: "Select a checklist", variant: "destructive" }); return; }
    if (!colSection || !colQuestion) { toast({ title: "Map Section and Question columns", variant: "destructive" }); return; }
    const questions = importRows
      .map(row => ({
        section: String(row[colSection] || "").trim(),
        questionText: String(row[colQuestion] || "").trim(),
        recommendResponse: colRecommend ? String(row[colRecommend] || "").trim() : "",
      }))
      .filter(q => q.section && q.questionText);
    if (questions.length === 0) { toast({ title: "No valid rows found", variant: "destructive" }); return; }
    setImporting(true);
    try {
      const res = await apiRequest("POST", `/api/templates/${importTargetId}/questions/bulk`, { questions, replace: importReplace });
      if (!res.ok) throw new Error((await res.json()).error || "Import failed");
      const result = await res.json();
      setImportResult(result);
      setImportStep("done");
      await loadTemplates();
    } catch (err: any) {
      toast({ title: "Import failed", description: err.message, variant: "destructive" });
    } finally {
      setImporting(false);
    }
  };

  // Only fetch if store is empty (first load) — don’t re-fetch on every mount
  useEffect(() => {
    if (templates.length === 0) loadTemplates();
  }, []);

  // Redirect non-admins only after auth is confirmed
  useEffect(() => {
    if (authReady && currentUser?.role !== "admin") {
      navigate("/dashboard");
    }
  }, [authReady, currentUser?.role]);

  const handleCreate = async () => {
    if (!newName.trim()) { toast({ title: "Name is required", variant: "destructive" }); return; }
    setCreating(true);
    try {
      const res = await apiRequest("POST", "/api/templates", {
        name: newName.trim(),
        type: newType.trim() || "custom",
        description: newDesc.trim(),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Create failed");
      const tmpl = await res.json();
      await loadTemplates();
      toast({ title: "Checklist created" });
      setShowNew(false);
      setNewName(""); setNewType("custom"); setNewDesc("");
      // Navigate straight to the builder
      navigate(`/checklists/${tmpl.id}`);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  return (
    <Layout title="Checklists">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">All Checklists</h2>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => { resetImport(); setShowImport(true); }}>
            <FileSpreadsheet className="w-4 h-4 mr-1.5" /> Import from Excel
          </Button>
          <Button size="sm" onClick={() => setShowNew(true)}>
            <Plus className="w-4 h-4 mr-1.5" /> New Checklist
          </Button>
        </div>
      </div>

      {templates.length === 0 ? (
        <Card className="shadow-sm">
          <CardContent className="py-12 text-center">
            <ClipboardList className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <div className="font-medium">No checklists yet</div>
            <div className="text-sm text-muted-foreground mt-1">Click "New Checklist" to create your first one.</div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2 mb-6">
          {templates.map(t => (
            <Card
              key={t.id}
              className="shadow-sm hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => navigate(`/checklists/${t.id}`)}
            >
              <CardContent className="py-3 px-4">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <ClipboardList className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{t.name}</span>
                      <Badge variant="outline" className="text-xs capitalize">{t.type}</Badge>
                    </div>
                    {t.description && (
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">{t.description}</p>
                    )}
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Excel Import Modal */}
      {showImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
          onClick={e => { if (e.target === e.currentTarget) { setShowImport(false); resetImport(); } }}>
          <div className="bg-background rounded-xl shadow-2xl w-full max-w-lg border border-border">
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-border">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-primary" />
                <h2 className="text-base font-semibold">Import from Excel</h2>
              </div>
              <button onClick={() => { setShowImport(false); resetImport(); }} className="w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted">✕</button>
            </div>

            <div className="px-6 py-5 space-y-5">

              {/* STEP 1: Upload */}
              {importStep === "upload" && (
                <div>
                  <p className="text-sm text-muted-foreground mb-4">
                    Upload an Excel file (.xlsx). The first sheet will be used. Each row becomes a question.
                    Columns needed: <strong>Section</strong>, <strong>Question</strong>, and optionally <strong>Recommendation</strong>.
                  </p>
                  <div
                    className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:border-primary transition-colors"
                    onClick={() => fileRef.current?.click()}
                  >
                    <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                    <div className="font-medium text-sm">Click to choose file</div>
                    <div className="text-xs text-muted-foreground mt-1">.xlsx files only</div>
                  </div>
                  <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFileChange} />
                </div>
              )}

              {/* STEP 2: Map columns */}
              {importStep === "map" && (
                <div className="space-y-4">
                  <div className="text-sm text-muted-foreground">
                    Found <strong>{importRows.length} rows</strong> and <strong>{importHeaders.length} columns</strong>. Map each column below.
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Section column <span className="text-red-500">*</span></Label>
                      <select value={colSection} onChange={e => setColSection(e.target.value)}
                        className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                        <option value="">-- select --</option>
                        {importHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>
                    <div>
                      <Label>Question column <span className="text-red-500">*</span></Label>
                      <select value={colQuestion} onChange={e => setColQuestion(e.target.value)}
                        className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                        <option value="">-- select --</option>
                        {importHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>
                    <div className="col-span-2">
                      <Label>Recommendation column <span className="text-muted-foreground">(optional)</span></Label>
                      <select value={colRecommend} onChange={e => setColRecommend(e.target.value)}
                        className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                        <option value="">-- none --</option>
                        {importHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>
                  </div>

                  <div>
                    <Label>Add to checklist <span className="text-red-500">*</span></Label>
                    <select value={importTargetId} onChange={e => setImportTargetId(e.target.value)}
                      className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                      <option value="">-- select checklist --</option>
                      {templates.map(t => <option key={t.id} value={String(t.id)}>{t.name}</option>)}
                    </select>
                  </div>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={importReplace} onChange={e => setImportReplace(e.target.checked)} className="rounded" />
                    <span className="text-sm text-muted-foreground">Replace existing questions in this checklist</span>
                  </label>

                  {/* Preview table */}
                  {colSection && colQuestion && (
                    <div className="border border-border rounded-lg overflow-hidden">
                      <div className="bg-muted px-3 py-2 text-xs font-semibold text-muted-foreground">Preview (first 3 rows)</div>
                      <div className="divide-y divide-border">
                        {importRows.slice(0, 3).map((row, i) => (
                          <div key={i} className="px-3 py-2 text-xs">
                            <span className="font-semibold text-primary">{row[colSection]}</span>
                            <span className="mx-1 text-muted-foreground">/</span>
                            <span>{row[colQuestion]}</span>
                            {colRecommend && row[colRecommend] && <div className="text-muted-foreground mt-0.5 italic">→ {String(row[colRecommend]).substring(0, 80)}</div>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* STEP 3: Done */}
              {importStep === "done" && importResult && (
                <div className="text-center py-4">
                  <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-3" />
                  <div className="font-semibold text-lg">Import Complete</div>
                  <div className="text-sm text-muted-foreground mt-1">
                    <strong>{importResult.imported}</strong> questions imported successfully.
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 px-6 pb-5">
              {importStep === "upload" && (
                <Button variant="outline" onClick={() => { setShowImport(false); resetImport(); }}>Cancel</Button>
              )}
              {importStep === "map" && (
                <>
                  <Button variant="outline" onClick={() => setImportStep("upload")}>Back</Button>
                  <Button onClick={handleImport} disabled={importing || !importTargetId || !colSection || !colQuestion}>
                    {importing ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Importing...</> : `Import ${importRows.filter(r => r[colSection] && r[colQuestion]).length} Questions`}
                  </Button>
                </>
              )}
              {importStep === "done" && (
                <>
                  <Button variant="outline" onClick={() => { resetImport(); }}>Import Another File</Button>
                  <Button onClick={() => {
                    setShowImport(false); resetImport();
                    if (importTargetId) navigate(`/checklists/${importTargetId}`);
                  }}>View Checklist</Button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* New checklist modal */}
      {showNew && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
          onClick={e => { if (e.target === e.currentTarget) setShowNew(false); }}
        >
          <div className="bg-background rounded-xl shadow-2xl w-full max-w-md border border-border">
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-border">
              <h2 className="text-base font-semibold">New Checklist</h2>
              <button onClick={() => setShowNew(false)} className="w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted">✕</button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <Label>Checklist Name *</Label>
                <Input
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="e.g. SPCC Monthly Inspection"
                  className="mt-1"
                  autoFocus
                  onKeyDown={e => { if (e.key === "Enter") handleCreate(); }}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Type</Label>
                  <Input
                    value={newType}
                    onChange={e => setNewType(e.target.value)}
                    placeholder="spcc / stormwater / custom"
                    className="mt-1"
                  />
                </div>
              </div>
              <div>
                <Label>Description</Label>
                <Input
                  value={newDesc}
                  onChange={e => setNewDesc(e.target.value)}
                  placeholder="Brief description (optional)"
                  className="mt-1"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 px-6 pb-5">
              <Button variant="outline" onClick={() => setShowNew(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={creating}>
                {creating ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Creating...</> : "Create & Add Questions"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
