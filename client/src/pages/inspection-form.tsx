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
import { Camera, X, CheckCircle, ChevronDown, ChevronUp, Send, Save, ArrowLeft, Mail, FileDown, Loader2 } from "lucide-react";
import { apiRequest, getQueryFn } from "@/lib/queryClient";

type AnswerState = { answer: "yes" | "no" | "n/a" | ""; comments: string; photos: string[] };

export default function InspectionFormPage({
  templateId,
  inspectionId,
}: {
  templateId: number | null;
  inspectionId: number | null;
}) {
  const [, navigate] = useHashLocation();
  const { toast } = useToast();
  const { currentUser, addInspection, updateInspection, saveAnswers, getInspection } = useStore();

  // Load existing if editing
  const existing = inspectionId ? getInspection(inspectionId) : null;
  const resolvedTemplateId = templateId ?? existing?.templateId ?? 1;
  const template = getTemplate(resolvedTemplateId);

  // Fetch questions from API — only once logged in (token is available)
  const { data: questions = [], isLoading: questionsLoading, error: questionsError } = useQuery<Question[]>({
    queryKey: [`/api/templates/${resolvedTemplateId}/questions`],
    queryFn: getQueryFn({ on401: "returnNull" }),
    staleTime: 0,
    retry: 2,
    enabled: !!currentUser,
  });
  const sections = [...new Set(questions.map((q: Question) => q.section))];

  // Form state
  const [facility, setFacility] = useState(existing?.facilityName ?? "");
  const [address, setAddress] = useState(existing?.facilityAddress ?? "");
  const [inspector, setInspector] = useState(existing?.inspectorName ?? (currentUser?.name ?? ""));
  const [date, setDate] = useState(existing?.inspectionDate ?? new Date().toISOString().split("T")[0]);
  const [generalComments, setGeneralComments] = useState(existing?.generalComments ?? "");
  const [headerDone, setHeaderDone] = useState(!!existing);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [sendToEmail, setSendToEmail] = useState("");
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reportReady, setReportReady] = useState<{ emailSent: boolean; pdfDownloaded: boolean; emailError?: string } | null>(null);
  const [inspId, setInspId] = useState<number | null>(inspectionId);
  const fileInputRefs = useRef<Record<number, HTMLInputElement | null>>({});

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

  const handlePhoto = (qId: number, e: React.ChangeEvent<HTMLInputElement>) => {
    Array.from(e.target.files || []).forEach(file => {
      const reader = new FileReader();
      reader.onload = ev => {
        setAnswers(prev => {
          const cur = prev[qId] || { answer: "", comments: "", photos: [] };
          return { ...prev, [qId]: { ...cur, photos: [...cur.photos, ev.target?.result as string] } };
        });
      };
      reader.readAsDataURL(file);
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
      });
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
    });
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

  const handleComplete = () => {
    if (!facility.trim()) { toast({ title: "Facility name required", variant: "destructive" }); return; }
    const unanswered = questions.filter(q => !answers[q.id]?.answer);
    if (unanswered.length > 0) {
      toast({
        title: `${unanswered.length} question${unanswered.length > 1 ? "s" : ""} unanswered`,
        description: "Please answer all questions before completing.",
        variant: "destructive"
      });
      return;
    }
    setShowEmailModal(true);
  };

  const handleSendReport = async () => {
    if (!sendToEmail.trim()) {
      toast({ title: "Email address required", variant: "destructive" }); return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(sendToEmail.trim())) {
      toast({ title: "Invalid email address", variant: "destructive" }); return;
    }

    setGeneratingPdf(true);

    try {
      // Save inspection + answers to DB, mark completed
      const id = await ensureInspection();
      const allAnswers = buildAnswerArray();
      await saveAnswers(id, allAnswers);
      await updateInspection(id, { status: "completed", completedAt: new Date().toISOString() });

      const completedAt = new Date().toISOString();

      // Generate PDF via backend
      const payload = {
        facility, address, inspector, date, generalComments,
        templateName: template?.name ?? "Inspection Report",
        templateType: template?.type ?? "spcc",
        questions: questions.map(q => ({ id: q.id, questionText: q.questionText, section: q.section, recommendResponse: q.recommendResponse ?? "" })),
        answers: questions.map(q => ({
          questionId: q.id,
          answer: answers[q.id]?.answer ?? "",
          comments: answers[q.id]?.comments ?? "",
          photos: answers[q.id]?.photos ?? [],
        })),
        clientName: currentUser?.name ?? "",
        clientEmail: currentUser?.email ?? "",
        sendToEmail: sendToEmail.trim(),
        completedAt,
        mtcsContact: "info@midwest-training.com",
      };

      const result = await apiRequest("POST", "/api/generate-pdf", payload).then(r => r.json());
      let pdfDownloaded = false;

      if (result.pdf) {
        const bytes = Uint8Array.from(atob(result.pdf), c => c.charCodeAt(0));
        const blob = new Blob([bytes], { type: "application/pdf" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `InspectionReport_${facility.replace(/\s+/g, "_")}_${date}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        pdfDownloaded = true;
      }

      setGeneratingPdf(false);
      setReportReady({ emailSent: result.emailSent, pdfDownloaded, emailError: result.emailError });
    } catch (err) {
      console.error("PDF/email failed:", err);
      setGeneratingPdf(false);
      setReportReady({ emailSent: false, pdfDownloaded: false, emailError: "Could not reach server" });
    }
  };

  const answeredCount = questions.filter(q => answers[q.id]?.answer).length;
  const progress = questions.length > 0 ? Math.round((answeredCount / questions.length) * 100) : 0;

  // ── Loading / error states ──────────────────────────────────────────────────────

  // Wait for auth + questions
  if (!currentUser || questionsLoading) {
    return (
      <Layout title="Loading...">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-primary mr-2" />
          <span className="text-muted-foreground">Loading inspection questions...</span>
        </div>
      </Layout>
    );
  }

  if (questionsError || questions.length === 0) {
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
                disabled={!facility.trim() || !inspector.trim() || !date}
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
          <span>{answeredCount} of {questions.length} answered</span>
          <span>{progress}%</span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {/* Facility info summary */}
      <Card className="shadow-sm mb-4">
        <CardContent className="py-3 px-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="text-sm">
              <span className="font-medium">{facility}</span>
              {address && <span className="text-muted-foreground ml-2">· {address}</span>}
            </div>
            <div className="text-xs text-muted-foreground flex gap-3">
              <span>{inspector}</span>
              <span>·</span>
              <span>{new Date(date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
            </div>
          </div>
        </CardContent>
      </Card>

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

                        {/* Yes / No / N/A */}
                        <div className="flex gap-2 ml-6 mb-3">
                          {(["yes", "no", "n/a"] as const).map(opt => (
                            <button key={opt} type="button"
                              data-testid={`answer-${q.id}-${opt}`}
                              onClick={() => setAnswer(q.id, "answer", opt)}
                              className={`px-4 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all border ${
                                a.answer === opt
                                  ? opt === "yes" ? "bg-green-600 text-white border-green-600"
                                    : opt === "no" ? "bg-red-600 text-white border-red-600"
                                    : "bg-gray-500 text-white border-gray-500"
                                  : "bg-background text-muted-foreground border-border hover:border-primary hover:text-primary"
                              }`}>
                              {opt === "n/a" ? "N/A" : opt}
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
                            <input ref={el => fileInputRefs.current[q.id] = el} type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={e => handlePhoto(q.id, e)} />
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

      {/* Email + PDF modal */}
      {showEmailModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-card rounded-xl shadow-2xl w-full max-w-md border border-border">
            <div className="p-6">

              {/* ── Success state ── */}
              {reportReady ? (
                <>
                  <div className="flex items-center gap-3 mb-5">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                      reportReady.emailSent ? "bg-green-100 dark:bg-green-900/30" : "bg-yellow-100 dark:bg-yellow-900/30"
                    }`}>
                      <CheckCircle className={`w-5 h-5 ${reportReady.emailSent ? "text-green-600" : "text-yellow-600"}`} />
                    </div>
                    <div>
                      <h2 className="font-semibold text-base">Inspection Complete!</h2>
                      {reportReady.emailSent
                        ? <p className="text-sm text-muted-foreground">Report emailed to <span className="font-medium text-foreground">{sendToEmail}</span></p>
                        : <p className="text-sm text-yellow-700 dark:text-yellow-400">{reportReady.emailError || "Email could not be sent"}</p>
                      }
                    </div>
                  </div>

                  <div className="space-y-2 mb-5">
                    {reportReady.emailSent && (
                      <div className="flex items-center gap-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg px-3 py-2.5 text-sm text-green-800 dark:text-green-300">
                        <Mail className="w-4 h-4 flex-shrink-0" />
                        <span>Email with PDF attachment sent to <strong>{sendToEmail}</strong></span>
                      </div>
                    )}
                    {reportReady.pdfDownloaded && (
                      <div className="flex items-center gap-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg px-3 py-2.5 text-sm text-green-800 dark:text-green-300">
                        <FileDown className="w-4 h-4 flex-shrink-0" />
                        <span>PDF saved to your device</span>
                      </div>
                    )}
                  </div>

                  <Button className="w-full" onClick={() => { setShowEmailModal(false); setReportReady(null); navigate("/dashboard"); }}>
                    Done — Go to Dashboard
                  </Button>
                </>
              ) : (
                /* ── Email input state ── */
                <>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Mail className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <h2 className="font-semibold text-base">Send Inspection Report</h2>
                      <p className="text-sm text-muted-foreground">A PDF report with cover letter will be generated.</p>
                    </div>
                  </div>

                  <div className="mb-4">
                    <Label htmlFor="send-to-email" className="text-sm font-medium">Send report to</Label>
                    <Input
                      id="send-to-email"
                      data-testid="input-send-to-email"
                      type="email"
                      placeholder="client@example.com"
                      value={sendToEmail}
                      onChange={e => setSendToEmail(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") handleSendReport(); }}
                      className="mt-1.5"
                      autoFocus
                    />
                  </div>

                  <div className="bg-muted/60 rounded-lg p-3 mb-5 text-xs text-muted-foreground space-y-1">
                    <div className="flex items-center gap-1.5"><FileDown className="w-3.5 h-3.5 flex-shrink-0" /><span>PDF report will download to your device</span></div>
                    <div className="flex items-center gap-1.5"><Mail className="w-3.5 h-3.5 flex-shrink-0" /><span>Email with PDF attachment will be sent</span></div>
                  </div>

                  <div className="flex gap-3">
                    <Button variant="outline" onClick={() => setShowEmailModal(false)} className="flex-1" disabled={generatingPdf}>
                      Cancel
                    </Button>
                    <Button onClick={handleSendReport} className="flex-1 gap-2" disabled={generatingPdf} data-testid="button-send-report">
                      {generatingPdf ? (
                        <><Loader2 className="w-4 h-4 animate-spin" />Generating PDF...</>
                      ) : (
                        <><Send className="w-4 h-4" />Generate &amp; Send</>
                      )}
                    </Button>
                  </div>
                </>
              )}
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
        <Button onClick={handleComplete} className="gap-2 flex-1" data-testid="button-complete">
          <Send className="w-4 h-4" />
          Complete &amp; Send Report {progress < 100 ? `(${progress}%)` : ""}
        </Button>
      </div>
    </Layout>
  );
}
