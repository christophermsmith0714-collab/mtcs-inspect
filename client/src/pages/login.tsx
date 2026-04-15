import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useStore } from "@/lib/store";
import { ClipboardCheck, Droplets, ShieldCheck } from "lucide-react";

export default function LoginPage() {
  const { login } = useStore();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ email: "", password: "" });
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(form.email, form.password);
    } catch (err: any) {
      toast({ title: "Sign in failed", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex">
      {/* Left panel */}
      <div className="hidden lg:flex flex-col w-[420px] bg-primary text-primary-foreground p-12 justify-between">
        <div>
          <div className="flex items-center gap-3 mb-12">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
              <ClipboardCheck className="w-6 h-6" />
            </div>
            <span className="font-bold text-xl">Midwest Training and Consulting Services</span>
          </div>
          <h2 className="text-3xl font-bold mb-4 leading-tight">Environmental Compliance Made Simple</h2>
          <p className="text-primary-foreground/80 text-base leading-relaxed">
            Monthly SPCC and stormwater inspections, documented digitally. Yes/No questions, comments, and photo evidence — all in one place.
          </p>
        </div>
        <div className="space-y-4">
          {[
            { icon: ShieldCheck, title: "SPCC Inspections", desc: "40 CFR Part 112 compliant monthly checklists" },
            { icon: Droplets, title: "Stormwater Inspections", desc: "MSGP/SWPPP monthly inspection documentation" },
            { icon: ClipboardCheck, title: "Photo Evidence", desc: "Capture and attach photos directly to findings" },
          ].map(({ icon: Icon, title, desc }) => (
            <div key={title} className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-white/15 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Icon className="w-4 h-4" />
              </div>
              <div>
                <div className="font-semibold text-sm">{title}</div>
                <div className="text-xs text-primary-foreground/70">{desc}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="text-xs text-primary-foreground/50">$15/month per client · Cancel anytime</div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex items-center gap-2 mb-8">
            <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center">
              <ClipboardCheck className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="font-bold text-lg">Midwest Training and Consulting Services</span>
          </div>

          <Card className="shadow-lg">
            <CardHeader className="pb-4">
              <CardTitle className="text-xl">Welcome back</CardTitle>
              <CardDescription>Sign in to access your inspections</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" data-testid="input-email" type="email" placeholder="you@company.com" value={form.email}
                    onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required className="mt-1" />
                </div>
                <div>
                  <Label htmlFor="password">Password</Label>
                  <Input id="password" data-testid="input-password" type="password" placeholder="••••••••" value={form.password}
                    onChange={e => setForm(f => ({ ...f, password: e.target.value }))} required className="mt-1" />
                </div>
                <Button type="submit" className="w-full" disabled={loading} data-testid="button-submit">
                  {loading ? "Please wait..." : "Sign In"}
                </Button>
                <div className="text-center text-xs text-muted-foreground border-t border-border pt-3">
                  Don't have an account? Contact{" "}
                  <a href="mailto:info@midwest-training.com" className="text-primary font-medium hover:underline">
                    info@midwest-training.com
                  </a>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
