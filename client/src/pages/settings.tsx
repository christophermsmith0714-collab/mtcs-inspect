import { useState } from "react";
import Layout from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useStore } from "@/lib/store";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { KeyRound, Loader2, Eye, EyeOff } from "lucide-react";

export default function SettingsPage() {
  const { currentUser } = useStore();
  const { toast } = useToast();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword]         = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving]                   = useState(false);
  const [showCurrent, setShowCurrent]         = useState(false);
  const [showNew, setShowNew]                 = useState(false);
  const [showConfirm, setShowConfirm]         = useState(false);

  const handleChangePassword = async () => {
    if (!currentPassword.trim()) { toast({ title: "Enter your current password", variant: "destructive" }); return; }
    if (newPassword.length < 6)  { toast({ title: "New password must be at least 6 characters", variant: "destructive" }); return; }
    if (newPassword !== confirmPassword) { toast({ title: "Passwords don't match", variant: "destructive" }); return; }

    setSaving(true);
    try {
      const res = await apiRequest("POST", "/api/auth/change-password", {
        currentPassword: currentPassword.trim(),
        newPassword: newPassword.trim(),
      });
      if (res.status === 401) { toast({ title: "Current password is incorrect", variant: "destructive" }); return; }
      if (!res.ok) throw new Error((await res.json()).error || "Failed");
      toast({ title: "Password updated successfully" });
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
    } catch (err: any) {
      toast({ title: "Failed to update password", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const PasswordInput = ({ value, onChange, placeholder, show, onToggle }: any) => (
    <div className="relative mt-1">
      <input
        type={show ? "text" : "password"}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-md border border-input bg-background px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      />
      <button
        type="button"
        onClick={onToggle}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
      >
        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  );

  return (
    <Layout title="Settings">
      <div className="max-w-md">
        {/* User info */}
        <Card className="shadow-sm mb-5">
          <CardContent className="py-4 px-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <span className="text-sm font-bold text-primary">{currentUser?.name?.charAt(0).toUpperCase()}</span>
              </div>
              <div>
                <div className="font-medium text-sm">{currentUser?.name}</div>
                <div className="text-xs text-muted-foreground">{currentUser?.email}</div>
                {currentUser?.company && <div className="text-xs text-muted-foreground">{currentUser.company}</div>}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Change Password */}
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Change Password</h2>
        <Card className="shadow-sm">
          <CardContent className="py-4 px-4">
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Current Password</label>
                <PasswordInput
                  value={currentPassword}
                  onChange={setCurrentPassword}
                  placeholder="Your current password"
                  show={showCurrent}
                  onToggle={() => setShowCurrent(v => !v)}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">New Password</label>
                <PasswordInput
                  value={newPassword}
                  onChange={setNewPassword}
                  placeholder="At least 6 characters"
                  show={showNew}
                  onToggle={() => setShowNew(v => !v)}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Confirm New Password</label>
                <PasswordInput
                  value={confirmPassword}
                  onChange={setConfirmPassword}
                  placeholder="Re-enter new password"
                  show={showConfirm}
                  onToggle={() => setShowConfirm(v => !v)}
                />
              </div>
            </div>
            <Button className="w-full mt-4 gap-2" onClick={handleChangePassword} disabled={saving}>
              {saving
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</>
                : <><KeyRound className="w-4 h-4" /> Update Password</>}
            </Button>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
