import { Link } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useStore } from "@/lib/store";
import { LayoutDashboard, ClipboardCheck, LogOut, Users, Menu, X, ClipboardList, Settings } from "lucide-react";
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
    { href: "/settings", label: "Settings", icon: Settings },
  ];

  const SidebarContent = () => (
    <aside className="flex flex-col h-full w-64" style={{ background: '#1e2d5e' }}>
      {/* Logo */}
      <div className="px-4 py-4 flex items-center gap-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
        <img src="/mtcs-logo.jpeg" alt="MTCS" className="w-10 h-10 rounded-lg object-contain" style={{ background: 'white', padding: '3px' }} />
        <div>
          <div className="font-bold text-xs leading-tight" style={{ color: '#ffffff' }}>Midwest Training &</div>
          <div className="font-bold text-xs" style={{ color: '#4a90d9' }}>Consulting Services</div>
          <div className="text-xs" style={{ color: 'rgba(255,255,255,0.45)', fontSize: '9px', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Compliance Made Easy</div>
        </div>
      </div>

      {/* User info */}
      <div className="px-4 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <div className="text-xs" style={{ color: 'rgba(255,255,255,0.45)' }}>Signed in as</div>
        <div className="font-semibold text-sm truncate" style={{ color: '#ffffff' }}>{currentUser.name}</div>
        {currentUser.company && <div className="text-xs truncate" style={{ color: '#4a90d9' }}>{currentUser.company}</div>}
        {currentUser.role === "admin" && <span className="inline-block mt-1 text-xs px-2 py-0.5 rounded" style={{ background: 'rgba(74,144,217,0.2)', color: '#4a90d9', fontWeight: 600 }}>Admin</span>}
      </div>

      {/* Nav */}
      <nav className="flex-1 py-2">
        {nav.map(({ href, label, icon: Icon }) => {
          const active = location === href || (location === "/" && href === "/dashboard") || (href !== "/dashboard" && location.startsWith(href));
          return (
            <Link key={href} href={href}>
              <a onClick={() => setMobileOpen(false)}
                className="flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors"
                style={active
                  ? { background: '#4a90d9', color: '#ffffff' }
                  : { color: 'rgba(255,255,255,0.65)' }
                }
                onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.07)'; }}
                onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                {label}
              </a>
            </Link>
          );
        })}
      </nav>

      {/* Subscription */}
      <div className="px-4 py-3 mx-3 mb-2 rounded-lg text-xs" style={{ background: 'rgba(74,144,217,0.12)', border: '1px solid rgba(74,144,217,0.25)' }}>
        <div className="flex items-center justify-between">
          <span style={{ color: 'rgba(255,255,255,0.55)' }}>Subscription</span>
          <span className="font-semibold" style={{ color: currentUser.subscriptionStatus === "active" ? '#4ade80' : '#f87171' }}>
            {currentUser.subscriptionStatus === "active" ? "Active" : "Inactive"}
          </span>
        </div>
      </div>

      {/* Logout */}
      <div className="px-3 pb-4">
        <button className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors" style={{ color: 'rgba(255,255,255,0.5)' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.9)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.5)'; }}
          onClick={logout}>
          <LogOut className="w-4 h-4" /> Sign Out
        </button>
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
      <div className="md:hidden fixed top-0 left-0 right-0 z-50 mobile-header-safe flex items-center px-4 gap-3" style={{ background: '#1e2d5e' }}>
        <img src="/mtcs-logo.jpeg" alt="MTCS" className="w-7 h-7 rounded object-contain" style={{ background: 'white', padding: '2px' }} />
        <span className="font-semibold text-sm flex-1" style={{ color: '#ffffff' }}>Midwest Training & Consulting</span>
        <Button variant="ghost" size="icon" onClick={() => setMobileOpen(true)} style={{ color: 'rgba(255,255,255,0.8)' }}>
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
