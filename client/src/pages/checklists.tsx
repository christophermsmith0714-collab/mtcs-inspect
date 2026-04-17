import { useState, useEffect } from "react";
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
import { Plus, ClipboardList, ChevronRight, Loader2 } from "lucide-react";

export default function ChecklistsPage() {
  const [, navigate] = useHashLocation();
  const { currentUser, authReady, templates, loadTemplates } = useStore();
  const { toast } = useToast();
  const [pageLoading, setPageLoading] = useState(templates.length === 0);

  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState("custom");
  const [newDesc, setNewDesc] = useState("");
  const [creating, setCreating] = useState(false);

  // Refresh template list when page mounts
  useEffect(() => {
    setPageLoading(true);
    loadTemplates().finally(() => setPageLoading(false));
  }, []);

  // Wait for auth before redirecting — avoids flash on re-render
  if (!authReady) return null;
  if (currentUser?.role !== "admin") {
    navigate("/dashboard");
    return null;
  }

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
        <Button size="sm" onClick={() => setShowNew(true)}>
          <Plus className="w-4 h-4 mr-1.5" /> New Checklist
        </Button>
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
