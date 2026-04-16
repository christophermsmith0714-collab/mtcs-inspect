import { useHashLocation } from "wouter/use-hash-location";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import Layout from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useStore } from "@/lib/store";
import { getTemplate, type Question } from "@/lib/data";
import { ArrowLeft, Edit, CheckCircle, XCircle, MinusCircle, Loader2 } from "lucide-react";
import { getQueryFn } from "@/lib/queryClient";

export default function InspectionDetailPage({ inspectionId }: { inspectionId: number }) {
  const [, navigate] = useHashLocation();
  const { getInspection } = useStore();
  const inspection = getInspection(inspectionId);

  const templateId = inspection?.templateId ?? 1;
  const { data: questions = [], isLoading: questionsLoading } = useQuery<Question[]>({
    queryKey: ["/api/templates", templateId, "questions"],
    queryFn: getQueryFn({ on401: "throw" }),
    staleTime: 0,
    enabled: !!inspection,
  });

  if (!inspection) return (
    <Layout title="Not Found">
      <p className="text-muted-foreground">Inspection not found.</p>
      <Button onClick={() => navigate("/dashboard")} className="mt-4">Back to Dashboard</Button>
    </Layout>
  );

  if (questionsLoading) return (
    <Layout title="Loading...">
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-primary mr-2" />
        <span className="text-muted-foreground">Loading...</span>
      </div>
    </Layout>
  );

  const template = getTemplate(inspection.templateId);
  const sections = [...new Set(questions.map((q: Question) => q.section))];
  const answerMap = new Map(inspection.answers.map(a => [a.questionId, a]));

  const yesCount = inspection.answers.filter(a => a.answer === "yes").length;
  const noCount  = inspection.answers.filter(a => a.answer === "no").length;
  const naCount  = inspection.answers.filter(a => a.answer === "n/a").length;

  return (
    <Layout title="Inspection Report">
      <div className="flex items-start justify-between gap-4 mb-5 flex-wrap">
        <div>
          <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard")} className="gap-1 -ml-2 mb-1">
            <ArrowLeft className="w-3.5 h-3.5" /> Back
          </Button>
          <h2 className="text-lg font-bold">{inspection.facilityName}</h2>
          {inspection.facilityAddress && <p className="text-sm text-muted-foreground">{inspection.facilityAddress}</p>}
          <div className="flex items-center gap-2 mt-1.5 flex-wrap text-sm text-muted-foreground">
            <span>{template?.name}</span>
            <span>·</span>
            <span>{new Date(inspection.inspectionDate + "T12:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</span>
            <span>·</span>
            <span>{inspection.inspectorName}</span>
            <Badge variant="outline" className={inspection.status === "completed" ? "status-completed" : "status-in_progress"}>
              {inspection.status === "completed" ? "Completed" : "In Progress"}
            </Badge>
          </div>
        </div>
        <div className="flex gap-2">
          <Link href={`/inspection/${inspectionId}/edit`}>
            <a><Button variant="outline" className="gap-2"><Edit className="w-4 h-4" /> Edit</Button></a>
          </Link>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        {[
          { label: "YES", value: yesCount, cls: "bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-400" },
          { label: "NO",  value: noCount,  cls: "bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-400" },
          { label: "N/A", value: naCount,  cls: "bg-muted text-muted-foreground" },
        ].map(({ label, value, cls }) => (
          <Card key={label} className={`shadow-sm ${cls}`}>
            <CardContent className="py-4 text-center">
              <div className="text-2xl font-bold">{value}</div>
              <div className="text-xs font-bold tracking-wider mt-0.5">{label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {noCount > 0 && (
        <div className="mb-5 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-800 dark:text-red-300">
          <strong>Action Required:</strong> {noCount} item{noCount > 1 ? "s" : ""} answered NO. Review and take corrective action.
        </div>
      )}

      {inspection.generalComments && (
        <Card className="mb-5 shadow-sm">
          <CardContent className="py-4">
            <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">General Comments</div>
            <p className="text-sm">{inspection.generalComments}</p>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {sections.map(section => {
          const sectionQs = questions.filter(q => q.section === section);
          return (
            <Card key={section} className="shadow-sm overflow-hidden">
              <div className="bg-muted/60 px-4 py-2.5 border-b border-border">
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{section}</span>
              </div>
              <div className="divide-y divide-border">
                {sectionQs.map((q, idx) => {
                  const a = answerMap.get(q.id);
                  return (
                    <div key={q.id} className="p-4">
                      <div className="flex items-start gap-2">
                        <span className="text-xs font-bold text-muted-foreground bg-muted rounded px-1.5 py-0.5 mt-0.5 flex-shrink-0">{idx + 1}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm leading-relaxed mb-2">{q.questionText}</p>
                          <div className="flex items-center gap-2 flex-wrap">
                            {a?.answer === "yes" && <span className="flex items-center gap-1 text-xs font-bold text-green-700 dark:text-green-400"><CheckCircle className="w-3.5 h-3.5" /> YES</span>}
                            {a?.answer === "no"  && <span className="flex items-center gap-1 text-xs font-bold text-red-600 dark:text-red-400"><XCircle className="w-3.5 h-3.5" /> NO</span>}
                            {a?.answer === "n/a" && <span className="flex items-center gap-1 text-xs font-bold text-muted-foreground"><MinusCircle className="w-3.5 h-3.5" /> N/A</span>}
                            {!a?.answer && <span className="text-xs text-muted-foreground italic">Not answered</span>}
                            {a?.comments && <span className="text-xs text-muted-foreground">— {a.comments}</span>}
                          </div>
                          {a?.photos && a.photos.length > 0 && (
                            <div className="flex gap-2 mt-2 flex-wrap">
                              {a.photos.map((p, pi) => (
                                <img key={pi} src={p} alt="" className="w-14 h-14 rounded-lg object-cover border border-border" />
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          );
        })}
      </div>
    </Layout>
  );
}
