import { useState, useRef } from "react";
import { useHashLocation } from "wouter/use-hash-location";
import { useQuery } from "@tanstack/react-query";
import Layout from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useStore } from "@/lib/store";
import { getTemplate, type Answer, type Question } from "@/lib/data";
import { Camera, X, CheckCircle, ChevronDown, ChevronUp, Share2, Save, ArrowLeft, FileDown, Loader2, Pencil } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

type AnswerState = { answer: "yes" | "no" | ""; comments: string; photos: string[] };

export default function InspectionFormPage({
  templateId,
  inspectionId,
}: {
  templateId: number | null;
  inspectionId: number | null;
}) {
  const [, navigate] = useHashLocation();
  const { toast } = useToast();
  const { currentUser, authReady, addInspection, updateInspection, saveAnswers, getInspection } = useStore();

  // Load existing if editing
  const existing = inspectionId ? getInspection(inspectionId) : null;
  const resolvedTemplateId = templateId ?? existing?.templateId ?? 1;
  const template = getTemplate(resolvedTemplateId);

  // Fetch questions from API — wait for authReady so token is guaranteed set
  const { data: questions = [], isLoading: questionsLoading, error: questionsError } = useQuery<Question[]>({
    queryKey: [`/api/templates/${resolvedTemplateId}/questions`],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/templates/${resolvedTemplateId}/questions`);
      if (!res.ok) throw new Error(`${res.status}`);
      return res.json();
    },
    staleTime: 0,
    retry: 1,
    enabled: !!currentUser && authReady,
  });
  const sections = [...new Set(questions.map((q: Question) => q.section))];

  // Form state
  const [facility, setFacility] = useState(existing?.facilityName ?? "");
  const [address, setAddress] = useState(existing?.facilityAddress ?? "");
  const [inspector, setInspector] = useState(existing?.inspectorName ?? (currentUser?.name ?? ""));
  const [date, setDate] = useState(existing?.inspectionDate ?? new Date().toISOString().split("T")[0]);
  const [generalComments, setGeneralComments] = useState(existing?.generalComments ?? "");
  const [inspectionName, setInspectionName] = useState((existing as any)?.inspectionName ?? "");
  const [headerDone, setHeaderDone] = useState(!!existing);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reportReady, setReportReady] = useState(false);
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [pdfFilename, setPdfFilename] = useState("");
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [emailTo, setEmailTo] = useState("");
  const [emailMessage, setEmailMessage] = useState("");
  const [sendingEmail, setSendingEmail] = useState(false);
  const [lastPayload, setLastPayload] = useState<any>(null);
  const [inspId, setInspId] = useState<number | null>(inspectionId);
  const fileInputRefs = useRef<Record<number, HTMLInputElement | null>>({});

  // Edit details modal state
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [tmpName, setTmpName] = useState("");
  const [tmpFacility, setTmpFacility] = useState("");
  const [tmpAddress, setTmpAddress] = useState("");
  const [tmpInspector, setTmpInspector] = useState("");
  const [tmpDate, setTmpDate] = useState("");
  const openDetailsModal = () => { setTmpName(inspectionName); setTmpFacility(facility); setTmpAddress(address); setTmpInspector(inspector); setTmpDate(date); setDetailsOpen(true); };
  const saveDetails = () => { setInspectionName(tmpName); setFacility(tmpFacility); setAddress(tmpAddress); setInspector(tmpInspector); setDate(tmpDate); setDetailsOpen(false); };

  // Answers state
  const initAnswers: Record<number, AnswerState> = {};
  if (existing?.answers) {
    existing.answers.forEach(a => {
      initAnswers[a.questionId] = { answer: a.answer as any, comments: a.comments, photos: a.photos };
    });
  }
  const [answers, setAnswers] = useState<Record<number, AnswerState>>(initAnswers);

  const setAnswer = (qId: number, field: keyof AnswerState, value: any) => {
    setAnswers(prev => ({ ...prev, [qId]: { ...(prev[qId] || { answer: "", comments: "", photos: [] }), [field]: value } }));
  };

  const resizePhoto = (file: File): Promise<string> =>
    new Promise(resolve => {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);
      img.onload = () => {
        const MAX = 600; // smaller max dimension
        let { width, height } = img;
        if (width > MAX || height > MAX) {
          if (width > height) { height = Math.round(height * MAX / width); width = MAX; }
          else { width = Math.round(width * MAX / height); height = MAX; }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width; canvas.height = height;
        canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);
        URL.revokeObjectURL(objectUrl);
        resolve(canvas.toDataURL("image/jpeg", 0.55)); // 55% quality — ~20-30KB per photo
      };
      img.src = objectUrl;
    });

  const handlePhoto = (qId: number, e: React.ChangeEvent<HTMLInputElement>) => {
    Array.from(e.target.files || []).forEach(async file => {
      const resized = await resizePhoto(file);
      setAnswers(prev => {
        const cur = prev[qId] || { answer: "", comments: "", photos: [] };
        return { ...prev, [qId]: { ...cur, photos: [...cur.photos, resized] } };
      });
    });
    e.target.value = "";
  };

  const removePhoto = (qId: number, idx: number) => {
    setAnswers(prev => {
      const cur = prev[qId] || { answer: "", comments: "", photos: [] };
      return { ...prev, [qId]: { ...cur, photos: cur.photos.filter((_, i) => i !== idx) } };
    });
  };

  const toggleSection = (s: string) => {
    setCollapsedSections(prev => { const n = new Set(prev); n.has(s) ? n.delete(s) : n.add(s); return n; });
  };

  const buildAnswerArray = (): Answer[] =>
    questions.map(q => {
      const a = answers[q.id] || { answer: "", comments: "", photos: [] };
      return { questionId: q.id, answer: a.answer, comments: a.comments, photos: a.photos };
    });

  // Returns the DB inspection ID (creates or updates in DB)
  const ensureInspection = async (): Promise<number> => {
    if (inspId) {
      await updateInspection(inspId, {
        facilityName: facility,
        facilityAddress: address,
        inspectorName: inspector,
        inspectionDate: date,
        generalComments,
        inspectionName: inspectionName.trim() || undefined,
      } as any);
      return inspId;
    }
    const insp = await addInspection({
      userId: currentUser!.id,
      templateId: resolvedTemplateId,
      facilityName: facility,
      facilityAddress: address,
      inspectorName: inspector,
      inspectionDate: date,
      status: "in_progress",
      generalComments,
      inspectionName: inspectionName.trim() || undefined,
    } as any);
    setInspId(insp.id);
    return insp.id;
  };

  const handleSave = async () => {
    if (!facility.trim()) { toast({ title: "Facility name required", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const id = await ensureInspection();
      await saveAnswers(id, buildAnswerArray());
      toast({ title: "Progress saved" });
    } catch (err) {
      toast({ title: "Save failed", description: "Could not save to server", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleGenerateReport = async () => {
    if (!facility.trim()) { toast({ title: "Facility name required", variant: "destructive" }); return; }
    setGeneratingPdf(true);
    try {
      const id = await ensureInspection();
      const allAnswers = buildAnswerArray();
      await saveAnswers(id, allAnswers);
      await updateInspection(id, { status: "completed", completedAt: new Date().toISOString() });

      const payload = {
        facility, address, inspector, date, generalComments,
        inspectionName: inspectionName.trim() || template?.name || "Inspection Report",
        templateName: template?.name ?? "Inspection Report",
        templateType: template?.type ?? "spcc",
        questions: questions.map(q => ({ id: q.id, questionText: q.questionText, section: q.section, recommendResponse: q.recommendResponse ?? "" })),
        answers: questions.map(q => ({
          questionId: q.id,
          answer: answers[q.id]?.answer ?? "",
          comments: answers[q.id]?.comments ?? "",
          photos: answers[q.id]?.photos ?? [], // include photos for PDF embedding
        })),
        clientName: currentUser?.name ?? "",
        clientEmail: currentUser?.email ?? "",
        sendToEmail: "",
        completedAt: new Date().toISOString(),
        mtcsContact: "info@midwest-training.com",
      };

      // Use AbortController with 3-minute timeout for large reports with many photos
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 180000);
      let result: any;
      try {
        const token = sessionStorage.getItem("mtcs_auth_token");
        const r = await fetch("/api/generate-pdf", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        result = await r.json();
      } finally {
        clearTimeout(timer);
      }

      if (result.pdf) {
        const bytes = Uint8Array.from(atob(result.pdf), c => c.charCodeAt(0));
        const blob = new Blob([bytes], { type: "application/pdf" });
        const filename = `InspectionReport_${facility.replace(/\s+/g, "_")}_${date}.pdf`;

        // Set state first so modal renders
        setPdfBlob(blob);
        setPdfFilename(filename);
        setLastPayload(payload);
        setReportReady(true);

        // Auto-download after a short delay so state updates first
        setTimeout(() => {
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url; a.download = filename;
          document.body.appendChild(a); a.click();
          document.body.removeChild(a);
          setTimeout(() => URL.revokeObjectURL(url), 5000);
        }, 100);
      }
    } catch (err) {
      console.error("PDF generation failed:", err);
      toast({ title: "Could not generate report", description: "Please try again.", variant: "destructive" });
    } finally {
      setGeneratingPdf(false);
    }
  };

  const handleShare = async () => {
    if (!pdfBlob) return;
    const file = new File([pdfBlob], pdfFilename, { type: "application/pdf" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: pdfFilename }); } catch {}
    } else {
      // Fallback: re-download
      const url = URL.createObjectURL(pdfBlob);
      const a = document.createElement("a");
      a.href = url; a.download = pdfFilename;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a); URL.revokeObjectURL(url);
    }
  };

  const handleSendEmail = async () => {
    if (!emailTo.trim() || !lastPayload) return;
    setSendingEmail(true);
    try {
      const token = sessionStorage.getItem("mtcs_auth_token");
      const r = await fetch("/api/generate-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ ...lastPayload, sendToEmail: emailTo.trim(), emailMessage: emailMessage.trim() }),
      });
      const result = await r.json();
      if (result.emailSent) {
        toast({ title: "Email sent", description: `Report sent to ${emailTo}` });
        setEmailModalOpen(false);
        setEmailTo(""); setEmailMessage("");
      } else {
        toast({ title: "Email failed", description: result.emailError || "Try again", variant: "destructive" });
      }
    } catch {
      toast({ title: "Email failed", variant: "destructive" });
    } finally {
      setSendingEmail(false);
    }
  };

  const handlePreviewPdf = () => {
    if (!pdfBlob) return;
    const url = URL.createObjectURL(pdfBlob);
    window.open(url, "_blank");
  };

  const answeredCount = questions.filter(q => answers[q.id]?.answer).length;
  const skippedCount = questions.length - answeredCount;
  const progress = questions.length > 0 ? Math.round((answeredCount / questions.length) * 100) : 0;

  // ── Loading / error states ──────────────────────────────────────────────────────

  // Wait for auth restore (sessionStorage) + token validation + questions fetch
  if (!authReady || !currentUser || questionsLoading) {
    return (
      <Layout title="Loading...">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-primary mr-2" />
          <span className="text-muted-foreground">Loading inspection questions...</span>
        </div>
      </Layout>
    );
  }

  // Only show the empty/error state after loading has fully finished (not during)
  if (!questionsLoading && (questionsError || questions.length === 0)) {
    return (
      <Layout title="Error">
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <p className="text-muted-foreground">
            {questionsError ? "Could not load inspection questions. Please try again." : "No questions found for this template. Please contact your administrator."}
          </p>
          <Button onClick={() => navigate("/dashboard")}>Back to Dashboard</Button>
        </div>
      </Layout>
    );
  }

  // ── Header form (step 1) ──────────────────────────────────────────────────
  if (!headerDone) {
    return (
      <Layout title={template?.name ?? "New Inspection"}>
        <div className="max-w-lg mx-auto">
          <Card className="shadow-sm">
            <CardContent className="pt-6 pb-6 space-y-4">
              <div>
                <h2 className="text-base font-semibold mb-1">Inspection Details</h2>
                <p className="text-sm text-muted-foreground">Fill in the facility information before starting.</p>
              </div>
              <div>
                <Label htmlFor="inspectionName">Inspection Name *</Label>
                <Input id="inspectionName" placeholder="e.g. KCAC Monthly SPCC - May 2026" value={inspectionName}
                  onChange={e => setInspectionName(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label htmlFor="facility">Facility Name *</Label>
                <Input id="facility" data-testid="input-facility" placeholder="Acme Ready Mix, LLC" value={facility}
                  onChange={e => setFacility(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label htmlFor="address">Facility Address</Label>
                <Input id="address" placeholder="123 Industrial Dr, City, State" value={address}
                  onChange={e => setAddress(e.target.value)} className="mt-1" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="inspector">Inspector Name *</Label>
                  <Input id="inspector" value={inspector} onChange={e => setInspector(e.target.value)} className="mt-1" />
                </div>
                <div>
                  <Label htmlFor="date">Inspection Date *</Label>
                  <Input id="date" type="date" value={date} onChange={e => setDate(e.target.value)} className="mt-1" />
                </div>
              </div>
              <div>
                <Label htmlFor="comments">General Comments</Label>
                <Textarea id="comments" placeholder="Overall site condition, weather, notes..." value={generalComments}
                  onChange={e => setGeneralComments(e.target.value)} className="mt-1 resize-none" rows={3} />
              </div>
              <Button
                className="w-full"
                data-testid="button-start"
                disabled={!inspectionName.trim() || !facility.trim() || !inspector.trim() || !date}
                onClick={() => setHeaderDone(true)}
              >
                Start Inspection
              </Button>
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  // ── Questions ─────────────────────────────────────────────────────────────
  return (
    <Layout title={template?.name ?? "Inspection"}>
      {/* Progress bar */}
      <div className="mb-4">
        <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
          <span>{answeredCount} of {questions.length} answered{skippedCount > 0 ? ` · ${skippedCount} skipped` : ""}</span>
          <span>{progress}%</span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {/* Facility info summary */}
      <Card className="shadow-sm mb-4">
        <CardContent className="py-3 px-4">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm min-w-0">
              <span className="font-medium">{inspectionName || facility || "Inspection"}</span>
              {facility && inspectionName && <span className="text-muted-foreground ml-1.5 text-xs">· {facility}</span>}
              {address && <span className="text-muted-foreground ml-1.5 text-xs hidden sm:inline">· {address}</span>}
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground flex-shrink-0">
              <span className="hidden sm:inline">{inspector}</span>
              <span className="hidden sm:inline">·</span>
              <span>{new Date(date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
              <button onClick={openDetailsModal} className="flex items-center gap-1 text-primary hover:text-primary/80 font-medium ml-1">
                <Pencil className="w-3 h-3" /> Edit
              </button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Edit details modal */}
      {detailsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.5)" }} onClick={e => { if (e.target === e.currentTarget) setDetailsOpen(false); }}>
          <div className="bg-background rounded-xl shadow-2xl w-full max-w-sm border border-border p-5">
            <h2 className="font-semibold text-base mb-4">Edit Inspection Details</h2>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Inspection Name</label>
                <input type="text" value={tmpName} onChange={e => setTmpName(e.target.value)} placeholder="e.g. KCAC Monthly SPCC - June 2026" className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Facility / Location</label>
                <input type="text" value={tmpFacility} onChange={e => setTmpFacility(e.target.value)} placeholder="Facility name" className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Address</label>
                <input type="text" value={tmpAddress} onChange={e => setTmpAddress(e.target.value)} placeholder="123 Main St, City, KS" className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Inspector</label>
                <input type="text" value={tmpInspector} onChange={e => setTmpInspector(e.target.value)} placeholder="Inspector name" className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Date</label>
                <input type="date" value={tmpDate} onChange={e => setTmpDate(e.target.value)} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <Button variant="outline" className="flex-1" onClick={() => setDetailsOpen(false)}>Cancel</Button>
              <Button className="flex-1" onClick={saveDetails}>Save</Button>
            </div>
          </div>
        </div>
      )}

      {/* Sections */}
      <div className="space-y-3 pb-24">
        {sections.map(section => {
          const sectionQs = questions.filter(q => q.section === section);
          const collapsed = collapsedSections.has(section);
          const sectionAnswered = sectionQs.filter(q => answers[q.id]?.answer).length;
          const allDone = sectionAnswered === sectionQs.length;

          return (
            <Card key={section} className="shadow-sm overflow-hidden">
              <button type="button" onClick={() => toggleSection(section)}
                className="w-full flex items-center justify-between px-4 py-3 bg-muted/60 hover:bg-muted transition-colors border-b border-border">
                <div className="flex items-center gap-2">
                  {allDone && <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400 flex-shrink-0" />}
                  <span className="font-semibold text-sm">{section}</span>
                  <Badge variant="outline" className="text-xs">{sectionAnswered}/{sectionQs.length}</Badge>
                </div>
                {collapsed ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronUp className="w-4 h-4 text-muted-foreground" />}
              </button>

              {!collapsed && (
                <div className="divide-y divide-border">
                  {sectionQs.map((q, idx) => {
                    const a = answers[q.id] || { answer: "", comments: "", photos: [] };
                    return (
                      <div key={q.id} className="p-4" data-testid={`question-${q.id}`}>
                        <div className="flex items-start gap-2 mb-3">
                          <span className="text-xs font-bold text-muted-foreground bg-muted rounded px-1.5 py-0.5 mt-0.5 flex-shrink-0">{idx + 1}</span>
                          <p className="text-sm leading-relaxed">{q.questionText}</p>
                        </div>

                        {/* Yes / No */}
                        <div className="flex gap-2 ml-6 mb-3">
                          {(["yes", "no"] as const).map(opt => (
                            <button key={opt} type="button"
                              data-testid={`answer-${q.id}-${opt}`}
                              onClick={() => setAnswer(q.id, "answer", answers[q.id]?.answer === opt ? "" : opt)}
                              className={`px-4 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all border ${
                                a.answer === opt
                                  ? opt === "yes" ? "bg-green-600 text-white border-green-600"
                                  : "bg-red-600 text-white border-red-600"
                                  : "bg-background text-muted-foreground border-border hover:border-primary hover:text-primary"
                              }`}>
                              {opt}
                            </button>
                          ))}
                        </div>

                        {/* Comments + Photos */}
                        <div className="ml-6 space-y-2">
                          <Textarea
                            data-testid={`comments-${q.id}`}
                            placeholder="Add comments..."
                            value={a.comments}
                            onChange={e => setAnswer(q.id, "comments", e.target.value)}
                            className="text-sm resize-none"
                            rows={2}
                          />
                          <div className="flex items-center gap-2 flex-wrap">
                            {a.photos.map((photo, pi) => (
                              <div key={pi} className="relative w-14 h-14 rounded-lg overflow-hidden border border-border group">
                                <img src={photo} alt="" className="w-full h-full object-cover" />
                                <button type="button" onClick={() => removePhoto(q.id, pi)}
                                  className="absolute top-0.5 right-0.5 w-4 h-4 bg-black/60 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                  <X className="w-2.5 h-2.5 text-white" />
                                </button>
                              </div>
                            ))}
                            <button type="button" onClick={() => fileInputRefs.current[q.id]?.click()}
                              className="w-14 h-14 rounded-lg border-2 border-dashed border-border flex flex-col items-center justify-center hover:border-primary hover:bg-accent/30 transition-colors text-muted-foreground hover:text-primary">
                              <Camera className="w-4 h-4 mb-0.5" />
                              <span className="text-xs">Photo</span>
                            </button>
                            <input ref={el => fileInputRefs.current[q.id] = el} type="file" accept="image/*" multiple className="hidden" onChange={e => handlePhoto(q.id, e)} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {/* Report ready modal */}
      {reportReady && !emailModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-card rounded-xl shadow-2xl w-full max-w-sm border border-border">
            <div className="p-6">
              <div className="flex flex-col items-center text-center mb-5">
                <div className="w-14 h-14 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-3">
                  <CheckCircle className="w-7 h-7 text-green-600" />
                </div>
                <h2 className="font-semibold text-base">Report Generated!</h2>
                <p className="text-sm text-muted-foreground mt-1">PDF downloaded to your device.</p>
              </div>
              <div className="space-y-2">
                <Button className="w-full gap-2" onClick={handlePreviewPdf}>
                  <FileDown className="w-4 h-4" /> Preview PDF
                </Button>
                <Button variant="outline" className="w-full gap-2" onClick={() => setEmailModalOpen(true)}>
                  <Share2 className="w-4 h-4" /> Email Report
                </Button>
                <Button variant="outline" className="w-full gap-2" onClick={() => {
                  if (pdfBlob) {
                    const url = URL.createObjectURL(pdfBlob);
                    const a = document.createElement("a");
                    a.href = url; a.download = pdfFilename;
                    document.body.appendChild(a); a.click();
                    document.body.removeChild(a); URL.revokeObjectURL(url);
                  }
                }}>
                  <FileDown className="w-4 h-4" /> Download Again
                </Button>
                <Button variant="ghost" className="w-full" onClick={() => { setReportReady(false); navigate("/dashboard"); }}>
                  Done — Go to Dashboard
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Email modal */}
      {emailModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={e => { if (e.target === e.currentTarget) setEmailModalOpen(false); }}>
          <div className="bg-background rounded-xl shadow-2xl w-full max-w-sm border border-border p-5">
            <h2 className="font-semibold text-base mb-4">Email Report</h2>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Send To *</label>
                <input
                  type="email"
                  value={emailTo}
                  onChange={e => setEmailTo(e.target.value)}
                  placeholder="client@company.com"
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Message (optional)</label>
                <textarea
                  value={emailMessage}
                  onChange={e => setEmailMessage(e.target.value)}
                  placeholder="Please find attached your inspection report..."
                  rows={4}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                />
              </div>
              <button
                onClick={handlePreviewPdf}
                className="w-full text-sm text-primary hover:underline text-left flex items-center gap-1"
              >
                <FileDown className="w-3.5 h-3.5" /> Preview PDF before sending
              </button>
            </div>
            <div className="flex gap-3 mt-5">
              <Button variant="outline" className="flex-1" onClick={() => setEmailModalOpen(false)}>Back</Button>
              <Button className="flex-1" onClick={handleSendEmail} disabled={sendingEmail || !emailTo.trim()}>
                {sendingEmail ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Sending...</> : "Send"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Sticky action bar */}
      <div className="fixed bottom-0 left-0 right-0 md:left-64 bg-card border-t border-border px-4 py-3 flex gap-2 z-40">
        <Button variant="outline" onClick={() => navigate("/dashboard")} className="gap-2 flex-shrink-0">
          <ArrowLeft className="w-4 h-4" />
          <span className="hidden sm:inline">Back</span>
        </Button>
        <Button variant="outline" onClick={handleSave} className="gap-2 flex-shrink-0" disabled={saving} data-testid="button-save">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          <span className="hidden sm:inline">{saving ? "Saving..." : "Save"}</span>
        </Button>
        <Button onClick={handleGenerateReport} className="gap-2 flex-1" disabled={generatingPdf} data-testid="button-complete">
          {generatingPdf
            ? <><Loader2 className="w-4 h-4 animate-spin" />Generating...</>
            : <><FileDown className="w-4 h-4" />Generate Report</>
          }
        </Button>
      </div>
    </Layout>
  );
}
