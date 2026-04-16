import { Link } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useStore } from "@/lib/store";
import { LayoutDashboard, ClipboardCheck, LogOut, Users, Menu, X, ClipboardList } from "lucide-react";
import { useState } from "react";

interface LayoutProps {
  children: React.ReactNode;
  title?: string;
}

export default function Layout({ children, title }: LayoutProps) {
  const { currentUser, logout } = useStore();
  const [location] = useHashLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  if (!currentUser) return null;

  const nav = [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    ...(currentUser.role === "admin" ? [
      { href: "/admin",       label: "Clients",    icon: Users },
      { href: "/checklists",  label: "Checklists", icon: ClipboardList },
    ] : []),
  ];

  const SidebarContent = () => (
    <aside className="flex flex-col h-full bg-card border-r border-border w-64">
      {/* Logo */}
      <div className="px-6 py-5 border-b border-border flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center flex-shrink-0">
          <svg viewBox="0 0 36 36" fill="none" className="w-5 h-5" aria-label="Midwest Training and Consulting Services">
            <rect x="4" y="8" width="20" height="22" rx="2" fill="white" opacity="0.9"/>
            <rect x="8" y="14" width="12" height="1.5" rx="0.75" fill="hsl(160 60% 25%)"/>
            <rect x="8" y="18" width="12" height="1.5" rx="0.75" fill="hsl(160 60% 25%)"/>
            <rect x="8" y="22" width="8" height="1.5" rx="0.75" fill="hsl(160 60% 25%)"/>
            <circle cx="27" cy="27" r="7" fill="hsl(160 60% 25%)"/>
            <path d="M23.5 27.2l2.2 2.2 4-4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <div>
          <div className="font-semibold text-sm leading-tight">Midwest Training and Consulting Services</div>
          <div className="text-xs text-muted-foreground">Compliance Manager</div>
        </div>
      </div>

      {/* User info */}
      <div className="px-4 py-3 mx-3 mt-3 rounded-lg bg-muted/60">
        <div className="text-xs text-muted-foreground">Signed in as</div>
        <div className="font-medium text-sm truncate">{currentUser.name}</div>
        {currentUser.company && <div className="text-xs text-muted-foreground truncate">{currentUser.company}</div>}
        {currentUser.role === "admin" && <Badge variant="secondary" className="mt-1 text-xs">Admin</Badge>}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {nav.map(({ href, label, icon: Icon }) => {
          const active = location === href || (location === "/" && href === "/dashboard") || (href !== "/dashboard" && location.startsWith(href));
          return (
            <Link key={href} href={href}>
              <a onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}>
                <Icon className="w-4 h-4 flex-shrink-0" />
                {label}
              </a>
            </Link>
          );
        })}
      </nav>

      {/* Subscription */}
      <div className="px-4 py-3 mx-3 mb-3 rounded-lg border border-border bg-accent/20 text-xs">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Subscription</span>
          <span className={`font-semibold ${currentUser.subscriptionStatus === "active" ? "text-green-600 dark:text-green-400" : "text-red-500"}`}>
            {currentUser.subscriptionStatus === "active" ? "Active" : "Inactive"}
          </span>
        </div>

      </div>

      {/* Logout */}
      <div className="px-3 pb-4">
        <Button variant="ghost" className="w-full justify-start gap-3 text-muted-foreground hover:text-foreground" onClick={logout}>
          <LogOut className="w-4 h-4" /> Sign Out
        </Button>
      </div>
    </aside>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Desktop sidebar */}
      <div className="hidden md:flex flex-col">
        <SidebarContent />
      </div>

      {/* Mobile header */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-50 bg-card border-b border-border mobile-header-safe flex items-center px-4 gap-3">
        <div className="w-7 h-7 rounded bg-primary flex items-center justify-center">
          <ClipboardCheck className="w-4 h-4 text-primary-foreground" />
        </div>
        <span className="font-semibold text-sm flex-1">Midwest Training and Consulting Services</span>
        <Button variant="ghost" size="icon" onClick={() => setMobileOpen(true)}>
          <Menu className="w-5 h-5" />
        </Button>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/40" onClick={() => setMobileOpen(false)} />
          <div className="w-72 h-full flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card">
              <span className="font-semibold">Menu</span>
              <Button variant="ghost" size="icon" onClick={() => setMobileOpen(false)}>
                <X className="w-4 h-4" />
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <SidebarContent />
            </div>
          </div>
        </div>
      )}

      {/* Main content */}
      <main className="flex-1 overflow-y-auto main-content-safe">
        {title && (
          <div className="px-6 py-5 border-b border-border bg-card/50">
            <h1 className="text-xl font-semibold">{title}</h1>
          </div>
        )}
        <div className="p-4 md:p-6">{children}</div>
      </main>
    </div>
  );
}
