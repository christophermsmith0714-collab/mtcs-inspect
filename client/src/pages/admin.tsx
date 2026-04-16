import { useState, useEffect } from "react";
import { useHashLocation } from "wouter/use-hash-location";
import Layout from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useStore, type User } from "@/lib/store";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { ClipboardCheck, Users, Plus, Pencil, UserX, UserCheck, Loader2 } from "lucide-react";

type ClientForm = {
  name: string;
  email: string;
  password: string;
  company: string;
  assignedTemplates: number[];
};

const emptyForm = (): ClientForm => ({ name: "", email: "", password: "", company: "", assignedTemplates: [] });

export default function AdminPage() {
  const { currentUser, users, setUsers, inspections, templates, loadTemplates } = useStore();
  const [, navigate] = useHashLocation();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<ClientForm>(emptyForm());
  const [saving, setSaving] = useState(false);

  const fetchClients = () => {
    setLoading(true);
    // Fetch clients and templates in parallel
    Promise.all([
      apiRequest("GET", "/api/users").then(r => r.json()),
      loadTemplates(),
    ])
      .then(([data]) => {
        const parsed = (data as any[]).map((u: any) => ({
          ...u,
          assignedTemplates: typeof u.assignedTemplates === "string"
            ? JSON.parse(u.assignedTemplates || "[]")
            : (u.assignedTemplates ?? []),
        }));
        setUsers(parsed);
      })
      .catch(err => console.error("Failed to load clients:", err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (currentUser?.role === "admin") fetchClients();
  }, []);

  if (currentUser?.role !== "admin") {
    navigate("/dashboard");
    return null;
  }

  const clients = users.filter(u => u.role === "client");
  const activeClients = clients.filter(u => u.subscriptionStatus === "active");
  const monthlyRevenue = activeClients.length * 15;

  const openNew = () => {
    setEditingId(null);
    setForm(emptyForm());
    setShowModal(true);
  };

  const openEdit = (userId: number) => {
    const client = users.find(u => u.id === userId);
    if (!client) return;
    setEditingId(userId);
    setForm({
      name: client.name,
      email: client.email,
      password: "",
      company: client.company,
      assignedTemplates: client.assignedTemplates ?? [],
    });
    setShowModal(true);
  };

  const toggleTemplate = (tid: number) => {
    setForm(f => ({
      ...f,
      assignedTemplates: f.assignedTemplates.includes(tid)
        ? f.assignedTemplates.filter(id => id !== tid)
        : [...f.assignedTemplates, tid],
    }));
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast({ title: "Name is required", variant: "destructive" }); return; }
    if (!form.email.trim()) { toast({ title: "Email is required", variant: "destructive" }); return; }
    if (!editingId && !form.password.trim()) { toast({ title: "Password is required", variant: "destructive" }); return; }
    if (form.assignedTemplates.length === 0) { toast({ title: "Assign at least one checklist", variant: "destructive" }); return; }

    setSaving(true);
    try {
      if (editingId) {
        const body: any = {
          name: form.name.trim(),
          email: form.email.trim(),
          company: form.company.trim(),
          assignedTemplates: form.assignedTemplates,
        };
        if (form.password.trim()) body.password = form.password.trim();
        const res = await apiRequest("PATCH", `/api/clients/${editingId}`, body);
        if (!res.ok) throw new Error((await res.json()).error || "Update failed");
        toast({ title: "Client updated" });
        setShowModal(false);
        fetchClients();
      } else {
        const res = await apiRequest("POST", "/api/clients", {
          name: form.name.trim(),
          email: form.email.trim(),
          password: form.password.trim(),
          company: form.company.trim(),
          assignedTemplates: form.assignedTemplates,
        });
        if (res.status === 409) { toast({ title: "Email already in use", variant: "destructive" }); setSaving(false); return; }
        if (!res.ok) throw new Error((await res.json()).error || "Create failed");
        toast({ title: "Client created", description: `Welcome email sent to ${form.email}.` });
        setShowModal(false);
        fetchClients();
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async (client: User) => {
    const newStatus = client.subscriptionStatus === "active" ? "inactive" : "active";
    try {
      const res = await apiRequest("PATCH", `/api/clients/${client.id}`, { subscriptionStatus: newStatus });
      if (!res.ok) throw new Error("Update failed");
      toast({ title: newStatus === "active" ? "Client activated" : "Client deactivated" });
      fetchClients();
    } catch {
      toast({ title: "Failed to update status", variant: "destructive" });
    }
  };

  return (
    <Layout title="Client Management">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: "Total Clients", value: clients.length },
          { label: "Active", value: activeClients.length },
          { label: "Monthly Revenue", value: `$${monthlyRevenue}` },
          { label: "Total Inspections", value: inspections.length },
        ].map(({ label, value }) => (
          <Card key={label} className="shadow-sm">
            <CardContent className="pt-4 pb-3">
              <div className="text-2xl font-bold">{value}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Header row */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Clients</h2>
        <Button size="sm" onClick={openNew} data-testid="button-new-client">
          <Plus className="w-4 h-4 mr-1.5" /> Add Client
        </Button>
      </div>

      {/* Client list */}
      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
          <Loader2 className="w-5 h-5 animate-spin" /> Loading clients...
        </div>
      ) : clients.length === 0 ? (
        <Card className="shadow-sm">
          <CardContent className="py-12 text-center">
            <Users className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <div className="font-medium">No clients yet</div>
            <div className="text-sm text-muted-foreground mt-1">Click "Add Client" to create the first account.</div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {clients.map(c => {
            const clientInspections = inspections.filter(i => i.userId === c.id);
            const completed = clientInspections.filter(i => i.status === "completed").length;
            const assignedNames = (c.assignedTemplates ?? [])
              .map(tid => templates.find(t => t.id === tid)?.name)
              .filter(Boolean);
            return (
              <Card key={c.id} className={`shadow-sm ${c.subscriptionStatus === "inactive" ? "opacity-60" : ""}`}>
                <CardContent className="py-3 px-4">
                  <div className="flex items-start gap-3 flex-wrap">
                    <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-sm font-bold text-primary">{c.name.charAt(0).toUpperCase()}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{c.name}</span>
                        <Badge variant="outline" className={`text-xs ${c.subscriptionStatus === "active" ? "status-completed" : "status-no"}`}>
                          {c.subscriptionStatus === "active" ? "Active · $15/mo" : "Inactive"}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5 flex gap-x-3 flex-wrap">
                        <span>{c.email}</span>
                        {c.company && <><span>·</span><span>{c.company}</span></>}
                        <span>·</span>
                        <span className="flex items-center gap-1">
                          <ClipboardCheck className="w-3 h-3" /> {clientInspections.length} inspections ({completed} completed)
                        </span>
                      </div>
                      {assignedNames.length > 0 && (
                        <div className="flex gap-1.5 mt-1.5 flex-wrap">
                          {assignedNames.map(n => (
                            <Badge key={n} variant="secondary" className="text-xs">{n}</Badge>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      <Button variant="outline" size="sm" className="text-xs" onClick={() => openEdit(c.id)}>
                        <Pencil className="w-3 h-3 mr-1" /> Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className={`text-xs ${c.subscriptionStatus === "active" ? "text-destructive hover:text-destructive" : "text-green-700 hover:text-green-700"}`}
                        onClick={() => handleToggleStatus(c)}
                      >
                        {c.subscriptionStatus === "active"
                          ? <><UserX className="w-3 h-3 mr-1" /> Deactivate</>
                          : <><UserCheck className="w-3 h-3 mr-1" /> Activate</>}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Add / Edit Client — inline panel (no portal, works in iframe) */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
          onClick={e => { if (e.target === e.currentTarget) setShowModal(false); }}
        >
          <div className="bg-background rounded-xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto border border-border">
            {/* Header */}
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-border">
              <h2 className="text-base font-semibold">{editingId ? "Edit Client" : "Add New Client"}</h2>
              <button
                onClick={() => setShowModal(false)}
                className="text-muted-foreground hover:text-foreground w-7 h-7 flex items-center justify-center rounded-md hover:bg-muted"
              >
                ✕
              </button>
            </div>

            {/* Body */}
            <div className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Label htmlFor="c-name">Full Name *</Label>
                  <Input id="c-name" placeholder="Jane Smith" value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="mt-1" />
                </div>
                <div className="col-span-2">
                  <Label htmlFor="c-company">Company / Facility</Label>
                  <Input id="c-company" placeholder="Acme Ready Mix, LLC" value={form.company}
                    onChange={e => setForm(f => ({ ...f, company: e.target.value }))} className="mt-1" />
                </div>
                <div>
                  <Label htmlFor="c-email">Email *</Label>
                  <Input id="c-email" type="email" placeholder="jane@company.com" value={form.email}
                    onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className="mt-1" />
                </div>
                <div>
                  <Label htmlFor="c-password">{editingId ? "New Password" : "Password *"}</Label>
                  <Input id="c-password" type="text" placeholder={editingId ? "Leave blank to keep" : "Set a password"} value={form.password}
                    onChange={e => setForm(f => ({ ...f, password: e.target.value }))} className="mt-1" />
                </div>
              </div>

              <div>
                <Label className="mb-2 block">Assigned Checklists *</Label>
                <div className="space-y-2">
                  {templates.map(t => (
                    <div key={t.id}
                      className="flex items-start gap-3 p-3 rounded-lg border border-border hover:bg-muted/50 cursor-pointer"
                      onClick={() => toggleTemplate(t.id)}
                    >
                      <Checkbox
                        id={`tpl-${t.id}`}
                        checked={form.assignedTemplates.includes(t.id)}
                        onCheckedChange={() => toggleTemplate(t.id)}
                        className="mt-0.5"
                      />
                      <div>
                        <div className="text-sm font-medium">{t.name}</div>
                        <div className="text-xs text-muted-foreground">{t.description}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-2 px-6 pb-5">
              <Button variant="outline" onClick={() => setShowModal(false)}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving} data-testid="button-save-client">
                {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving...</> : editingId ? "Save Changes" : "Create Client"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
