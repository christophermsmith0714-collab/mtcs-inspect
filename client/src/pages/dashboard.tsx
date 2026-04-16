import { useState } from "react";
import { Link } from "wouter";
import Layout from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useStore } from "@/lib/store";
import { getTemplate } from "@/lib/data";
import { ClipboardCheck, Droplets, ShieldCheck, ChevronRight, Calendar, Trash2, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function DashboardPage() {
  const { currentUser, inspections, deleteInspection, templates } = useStore();
  const { toast } = useToast();
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  if (!currentUser) return null;

  const visibleTemplates = currentUser.role === "admin"
    ? templates
    : templates.filter(t => (currentUser.assignedTemplates ?? []).includes(t.id));

  const myInspections = currentUser.role === "admin"
    ? inspections
    : inspections.filter(i => i.userId === currentUser.id);

  const completed = myInspections.filter(i => i.status === "completed").length;
  const inProgress = myInspections.filter(i => i.status === "in_progress").length;
  const thisMonth = myInspections.filter(i => new Date(i.createdAt).getMonth() === new Date().getMonth()).length;

  const formatDate = (d: string) => new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  const handleDelete = async (id: number) => {
    await deleteInspection(id);
    setConfirmDeleteId(null);
    toast({ title: "Inspection deleted" });
  };

  const inspToDelete = confirmDeleteId ? myInspections.find(i => i.id === confirmDeleteId) : null;

  return (
    <Layout title="Dashboard">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[
          { label: "Total", value: myInspections.length, icon: ClipboardCheck, color: "text-primary" },
          { label: "Completed", value: completed, icon: ShieldCheck, color: "text-green-600 dark:text-green-400" },
          { label: "In Progress", value: inProgress, icon: ClipboardCheck, color: "text-yellow-600 dark:text-yellow-400" },
          { label: "This Month", value: thisMonth, icon: Calendar, color: "text-blue-600 dark:text-blue-400" },
        ].map(({ label, value, icon: Icon, color }) => (
          <Card key={label} className="shadow-sm">
            <CardContent className="pt-4 pb-3">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-2xl font-bold">{value}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
                </div>
                <Icon className={`w-5 h-5 ${color} mt-0.5`} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Start new inspection */}
      <div className="mb-6">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Start New Inspection</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          {visibleTemplates.map(t => (
            <Link key={t.id} href={`/inspection/new/${t.id}`}>
              <a className="block group" data-testid={`card-template-${t.id}`}>
                <Card className="border-2 border-transparent hover:border-primary transition-all cursor-pointer hover:shadow-md">
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-start gap-3">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        t.type === "spcc" ? "bg-primary/10" : "bg-blue-100 dark:bg-blue-900/30"
                      }`}>
                        {t.type === "spcc"
                          ? <ShieldCheck className="w-5 h-5 text-primary" />
                          : <Droplets className="w-5 h-5 text-blue-600 dark:text-blue-400" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-sm">{t.name}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">{t.description}</div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors mt-1" />
                    </div>
                  </CardContent>
                </Card>
              </a>
            </Link>
          ))}
          {visibleTemplates.length === 0 && (
            <div className="col-span-2 text-sm text-muted-foreground py-6 text-center">
              No checklists assigned. Contact Midwest Training and Consulting Services.
            </div>
          )}
        </div>
      </div>

      {/* Inspections list */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          {currentUser.role === "admin" ? "All Inspections" : "My Inspections"}
        </h2>
        {myInspections.length === 0 ? (
          <Card className="shadow-sm">
            <CardContent className="py-12 text-center">
              <ClipboardCheck className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <div className="font-medium">No inspections yet</div>
              <div className="text-sm text-muted-foreground mt-1">Start a new inspection above.</div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {[...myInspections].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).map(insp => {
              const template = getTemplate(insp.templateId);
              return (
                <Card key={insp.id} className="shadow-sm hover:shadow-md transition-shadow" data-testid={`row-inspection-${insp.id}`}>
                  <CardContent className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        template?.type === "spcc" ? "bg-primary/10" : "bg-blue-100 dark:bg-blue-900/30"
                      }`}>
                        {template?.type === "spcc"
                          ? <ShieldCheck className="w-4 h-4 text-primary" />
                          : <Droplets className="w-4 h-4 text-blue-600 dark:text-blue-400" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">{insp.facilityName}</span>
                          <Badge variant="outline" className={`text-xs ${insp.status === "completed" ? "status-completed" : "status-in_progress"}`}>
                            {insp.status === "completed" ? "Completed" : "In Progress"}
                          </Badge>
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5 flex flex-wrap gap-2">
                          <span>{template?.name}</span>
                          <span>·</span>
                          <span>{formatDate(insp.inspectionDate)}</span>
                          <span>·</span>
                          <span>{insp.inspectorName}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <Link href={`/inspection/${insp.id}`}>
                          <a><Button variant="ghost" size="sm" className="text-xs h-7 px-2">View</Button></a>
                        </Link>
                        <Link href={`/inspection/${insp.id}/edit`}>
                          <a><Button variant="ghost" size="sm" className="text-xs h-7 px-2">Edit</Button></a>
                        </Link>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="w-7 h-7 text-muted-foreground hover:text-destructive"
                          onClick={() => setConfirmDeleteId(insp.id)}
                          data-testid={`button-delete-${insp.id}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Inline delete confirmation (no portal — works in iframe) */}
      {confirmDeleteId && inspToDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
          onClick={e => { if (e.target === e.currentTarget) setConfirmDeleteId(null); }}
        >
          <div className="bg-background rounded-xl shadow-2xl w-full max-w-sm border border-border p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
              <h2 className="font-semibold text-base">Delete inspection?</h2>
            </div>
            <p className="text-sm text-muted-foreground mb-5">
              This will permanently delete the inspection for <strong>{inspToDelete.facilityName}</strong>. This cannot be undone.
            </p>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setConfirmDeleteId(null)}>Cancel</Button>
              <Button
                className="flex-1 bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => handleDelete(confirmDeleteId)}
              >
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
