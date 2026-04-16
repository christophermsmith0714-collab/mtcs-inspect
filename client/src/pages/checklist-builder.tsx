import { useState, useEffect } from "react";
import { useHashLocation } from "wouter/use-hash-location";
import Layout from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useStore } from "@/lib/store";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { type Template, type Question } from "@/lib/data";
import {
  Plus, Pencil, Trash2, ChevronDown, ChevronUp,
  ArrowLeft, Save, Loader2, ClipboardList, GripVertical, X
} from "lucide-react";

type QuestionDraft = {
  id?: number;          // undefined = new (not yet saved)
  section: string;
  questionText: string;
  recommendResponse: string;
  order: number;
  dirty?: boolean;
};

export default function ChecklistBuilderPage({ templateId }: { templateId: number }) {
  const [, navigate] = useHashLocation();
  const { toast } = useToast();
  const { loadTemplates } = useStore();

  const [template, setTemplate] = useState<Template | null>(null);
  const [questions, setQuestions] = useState<QuestionDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingTemplate, setSavingTemplate] = useState(false);

  // Template edit form
  const [tmplName, setTmplName] = useState("");
  const [tmplDesc, setTmplDesc] = useState("");
  const [tmplType, setTmplType] = useState("custom");
  const [editingTmpl, setEditingTmpl] = useState(false);

  // Add-question form
  const [showAddQuestion, setShowAddQuestion] = useState(false);
  const [addSection, setAddSection] = useState("");
  const [addText, setAddText] = useState("");
  const [addRecommend, setAddRecommend] = useState("");
  const [addSaving, setAddSaving] = useState(false);

  // Inline editing
  const [editingQId, setEditingQId] = useState<number | null>(null);
  const [editSection, setEditSection] = useState("");
  const [editText, setEditText] = useState("");
  const [editRecommend, setEditRecommend] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  // Section collapse state
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

  // Confirm delete
  const [confirmDeleteQ, setConfirmDeleteQ] = useState<number | null>(null);
  const [deletingQ, setDeletingQ] = useState(false);
  const [showDeleteTemplate, setShowDeleteTemplate] = useState(false);

  const sections = [...new Set(questions.map(q => q.section))];

  useEffect(() => {
    setLoading(true);
    Promise.all([
      apiRequest("GET", `/api/templates`).then(r => r.json()),
      apiRequest("GET", `/api/templates/${templateId}/questions`).then(r => r.json()),
    ]).then(([tmpls, qs]) => {
      const t = tmpls.find((x: Template) => x.id === templateId);
      if (t) {
        setTemplate(t);
        setTmplName(t.name);
        setTmplDesc(t.description || "");
        setTmplType(t.type || "custom");
      }
      setQuestions((qs as Question[]).map(q => ({ ...q, dirty: false })));
    }).catch(() => {
      toast({ title: "Failed to load template", variant: "destructive" });
    }).finally(() => setLoading(false));
  }, [templateId]);

  const handleSaveTemplate = async () => {
    if (!tmplName.trim()) { toast({ title: "Name is required", variant: "destructive" }); return; }
    setSavingTemplate(true);
    try {
      const res = await apiRequest("PATCH", `/api/templates/${templateId}`, {
        name: tmplName.trim(),
        type: tmplType.trim(),
        description: tmplDesc.trim(),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Update failed");
      const updated = await res.json();
      setTemplate(updated);
      setEditingTmpl(false);
      await loadTemplates();
      toast({ title: "Checklist updated" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSavingTemplate(false);
    }
  };

  const handleAddQuestion = async () => {
    if (!addSection.trim() || !addText.trim()) {
      toast({ title: "Section and question text are required", variant: "destructive" });
      return;
    }
    setAddSaving(true);
    try {
      const res = await apiRequest("POST", `/api/templates/${templateId}/questions`, {
        section: addSection.trim(),
        questionText: addText.trim(),
        recommendResponse: addRecommend.trim(),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed to add question");
      const q = await res.json();
      setQuestions(prev => [...prev, { ...q, dirty: false }]);
      setAddText("");
      setAddRecommend("");
      // Keep section for quick multi-add
      toast({ title: "Question added" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setAddSaving(false);
    }
  };

  const startEditQuestion = (q: QuestionDraft) => {
    setEditingQId(q.id!);
    setEditSection(q.section);
    setEditText(q.questionText);
    setEditRecommend(q.recommendResponse || "");
  };

  const handleSaveQuestion = async (id: number) => {
    if (!editSection.trim() || !editText.trim()) {
      toast({ title: "Section and question text are required", variant: "destructive" });
      return;
    }
    setEditSaving(true);
    try {
      const res = await apiRequest("PATCH", `/api/questions/${id}`, {
        section: editSection.trim(),
        questionText: editText.trim(),
        recommendResponse: editRecommend.trim(),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Update failed");
      const updated = await res.json();
      setQuestions(prev => prev.map(q => q.id === id ? { ...updated, dirty: false } : q));
      setEditingQId(null);
      toast({ title: "Question saved" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setEditSaving(false);
    }
  };

  const handleDeleteQuestion = async (id: number) => {
    setDeletingQ(true);
    try {
      const res = await apiRequest("DELETE", `/api/questions/${id}`);
      if (!res.ok) throw new Error("Delete failed");
      setQuestions(prev => prev.filter(q => q.id !== id));
      setConfirmDeleteQ(null);
      toast({ title: "Question removed" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setDeletingQ(false);
    }
  };

  const handleDeleteTemplate = async () => {
    try {
      const res = await apiRequest("DELETE", `/api/templates/${templateId}`);
      if (!res.ok) throw new Error("Delete failed");
      await loadTemplates();
      toast({ title: "Checklist deleted" });
      navigate("/admin");
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const toggleSection = (s: string) => {
    setCollapsedSections(prev => { const n = new Set(prev); n.has(s) ? n.delete(s) : n.add(s); return n; });
  };

  if (loading) {
    return (
      <Layout title="Loading...">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-primary mr-2" />
          <span className="text-muted-foreground">Loading checklist...</span>
        </div>
      </Layout>
    );
  }

  if (!template) {
    return (
      <Layout title="Not Found">
        <p className="text-muted-foreground">Checklist not found.</p>
        <Button onClick={() => navigate("/admin")} className="mt-4">Back to Admin</Button>
      </Layout>
    );
  }

  return (
    <Layout title="Checklist Builder">
      {/* Back */}
      <Button variant="ghost" size="sm" onClick={() => navigate("/admin")} className="gap-1.5 -ml-2 mb-4">
        <ArrowLeft className="w-3.5 h-3.5" /> Back to Admin
      </Button>

      {/* Template header card */}
      <Card className="shadow-sm mb-5">
        <CardContent className="pt-4 pb-4 px-5">
          {editingTmpl ? (
            <div className="space-y-3">
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <Label>Checklist Name *</Label>
                  <Input value={tmplName} onChange={e => setTmplName(e.target.value)} className="mt-1" placeholder="e.g. SPCC Monthly Inspection" />
                </div>
                <div>
                  <Label>Type</Label>
                  <Input value={tmplType} onChange={e => setTmplType(e.target.value)} className="mt-1" placeholder="spcc / stormwater / custom" />
                </div>
              </div>
              <div>
                <Label>Description</Label>
                <Input value={tmplDesc} onChange={e => setTmplDesc(e.target.value)} className="mt-1" placeholder="Brief description of this checklist" />
              </div>
              <div className="flex gap-2 pt-1">
                <Button onClick={handleSaveTemplate} disabled={savingTemplate} className="gap-1.5">
                  {savingTemplate ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Save
                </Button>
                <Button variant="outline" onClick={() => { setEditingTmpl(false); setTmplName(template.name); setTmplDesc(template.description || ""); setTmplType(template.type); }}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <ClipboardList className="w-5 h-5 text-primary flex-shrink-0" />
                  <h2 className="text-base font-bold">{template.name}</h2>
                  <Badge variant="outline" className="text-xs capitalize">{template.type}</Badge>
                </div>
                {template.description && <p className="text-sm text-muted-foreground mt-1">{template.description}</p>}
                <p className="text-xs text-muted-foreground mt-1">{questions.length} question{questions.length !== 1 ? "s" : ""} across {sections.length} section{sections.length !== 1 ? "s" : ""}</p>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <Button variant="outline" size="sm" onClick={() => setEditingTmpl(true)} className="gap-1.5">
                  <Pencil className="w-3.5 h-3.5" /> Edit Name
                </Button>
                <Button variant="outline" size="sm" className="gap-1.5 text-destructive hover:text-destructive" onClick={() => setShowDeleteTemplate(true)}>
                  <Trash2 className="w-3.5 h-3.5" /> Delete
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add question panel */}
      <Card className="shadow-sm mb-5 border-dashed border-2 border-primary/30">
        <CardContent className="pt-4 pb-4 px-5">
          {!showAddQuestion ? (
            <button
              type="button"
              onClick={() => setShowAddQuestion(true)}
              className="w-full flex items-center justify-center gap-2 py-2 text-sm text-primary font-medium hover:text-primary/80 transition-colors"
            >
              <Plus className="w-4 h-4" /> Add Question
            </button>
          ) : (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold">Add New Question</h3>
              <div>
                <Label className="text-xs">Section *</Label>
                <Input
                  value={addSection}
                  onChange={e => setAddSection(e.target.value)}
                  placeholder="e.g. Bulk Storage Containers"
                  className="mt-1 text-sm"
                  list="section-suggestions"
                />
                {/* Datalist for section autocomplete */}
                <datalist id="section-suggestions">
                  {sections.map(s => <option key={s} value={s} />)}
                </datalist>
              </div>
              <div>
                <Label className="text-xs">Question Text *</Label>
                <Textarea
                  value={addText}
                  onChange={e => setAddText(e.target.value)}
                  placeholder="Enter the inspection question..."
                  className="mt-1 text-sm resize-none"
                  rows={2}
                />
              </div>
              <div>
                <Label className="text-xs">Recommendation if answered NO</Label>
                <Textarea
                  value={addRecommend}
                  onChange={e => setAddRecommend(e.target.value)}
                  placeholder="What should be done to correct this item?"
                  className="mt-1 text-sm resize-none"
                  rows={2}
                />
              </div>
              <div className="flex gap-2 pt-1">
                <Button onClick={handleAddQuestion} disabled={addSaving} className="gap-1.5">
                  {addSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  Add Question
                </Button>
                <Button variant="outline" onClick={() => { setShowAddQuestion(false); setAddSection(""); setAddText(""); setAddRecommend(""); }}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Questions by section */}
      {questions.length === 0 ? (
        <Card className="shadow-sm">
          <CardContent className="py-12 text-center">
            <ClipboardList className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <div className="font-medium">No questions yet</div>
            <div className="text-sm text-muted-foreground mt-1">Click "Add Question" above to get started.</div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3 pb-8">
          {sections.map(section => {
            const sectionQs = questions.filter(q => q.section === section);
            const collapsed = collapsedSections.has(section);
            return (
              <Card key={section} className="shadow-sm overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleSection(section)}
                  className="w-full flex items-center justify-between px-4 py-3 bg-muted/60 hover:bg-muted transition-colors border-b border-border"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm">{section}</span>
                    <Badge variant="outline" className="text-xs">{sectionQs.length}</Badge>
                  </div>
                  {collapsed ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronUp className="w-4 h-4 text-muted-foreground" />}
                </button>

                {!collapsed && (
                  <div className="divide-y divide-border">
                    {sectionQs.map((q, idx) => (
                      <div key={q.id} className="p-4">
                        {editingQId === q.id ? (
                          /* ── Inline edit form ── */
                          <div className="space-y-2">
                            <div>
                              <Label className="text-xs">Section</Label>
                              <Input value={editSection} onChange={e => setEditSection(e.target.value)} className="mt-1 text-sm" list="section-suggestions-edit" />
                              <datalist id="section-suggestions-edit">
                                {sections.map(s => <option key={s} value={s} />)}
                              </datalist>
                            </div>
                            <div>
                              <Label className="text-xs">Question Text</Label>
                              <Textarea value={editText} onChange={e => setEditText(e.target.value)} className="mt-1 text-sm resize-none" rows={2} />
                            </div>
                            <div>
                              <Label className="text-xs">Recommendation if NO</Label>
                              <Textarea value={editRecommend} onChange={e => setEditRecommend(e.target.value)} className="mt-1 text-sm resize-none" rows={2} placeholder="Leave blank if not needed" />
                            </div>
                            <div className="flex gap-2 pt-1">
                              <Button size="sm" onClick={() => handleSaveQuestion(q.id!)} disabled={editSaving} className="gap-1.5 h-8 text-xs">
                                {editSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                                Save
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => setEditingQId(null)} className="h-8 text-xs">Cancel</Button>
                            </div>
                          </div>
                        ) : (
                          /* ── Read view ── */
                          <div className="flex items-start gap-2">
                            <GripVertical className="w-4 h-4 text-muted-foreground/40 mt-0.5 flex-shrink-0" />
                            <span className="text-xs font-bold text-muted-foreground bg-muted rounded px-1.5 py-0.5 mt-0.5 flex-shrink-0">{idx + 1}</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm leading-relaxed">{q.questionText}</p>
                              {q.recommendResponse && (
                                <p className="text-xs text-muted-foreground mt-1 italic">
                                  <span className="font-medium not-italic text-orange-600 dark:text-orange-400">If No:</span> {q.recommendResponse}
                                </p>
                              )}
                            </div>
                            <div className="flex gap-1 flex-shrink-0 ml-2">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="w-7 h-7 text-muted-foreground hover:text-foreground"
                                onClick={() => startEditQuestion(q)}
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="w-7 h-7 text-muted-foreground hover:text-destructive"
                                onClick={() => setConfirmDeleteQ(q.id!)}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Delete question confirm */}
      {confirmDeleteQ !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
          <div className="bg-background rounded-xl shadow-2xl w-full max-w-sm border border-border p-6">
            <h2 className="font-semibold text-base mb-2">Remove this question?</h2>
            <p className="text-sm text-muted-foreground mb-5">This will permanently remove the question from the checklist.</p>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setConfirmDeleteQ(null)}>Cancel</Button>
              <Button
                className="flex-1 bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={deletingQ}
                onClick={() => handleDeleteQuestion(confirmDeleteQ)}
              >
                {deletingQ ? <Loader2 className="w-4 h-4 animate-spin" /> : "Remove"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete template confirm */}
      {showDeleteTemplate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
          <div className="bg-background rounded-xl shadow-2xl w-full max-w-sm border border-border p-6">
            <h2 className="font-semibold text-base mb-2">Delete this checklist?</h2>
            <p className="text-sm text-muted-foreground mb-5">
              This will permanently delete <strong>{template.name}</strong> and all {questions.length} questions. Existing inspection reports using this checklist will be unaffected.
            </p>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setShowDeleteTemplate(false)}>Cancel</Button>
              <Button className="flex-1 bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={handleDeleteTemplate}>
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
