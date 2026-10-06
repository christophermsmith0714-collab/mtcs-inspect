import { Switch, Route, Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { StoreProvider, useStore } from "@/lib/store";
import LoginPage from "@/pages/login";
import DashboardPage from "@/pages/dashboard";
import InspectionFormPage from "@/pages/inspection-form";
import InspectionDetailPage from "@/pages/inspection-detail";
import AdminPage from "@/pages/admin";
import ChecklistsPage from "@/pages/checklists";
import ChecklistBuilderPage from "@/pages/checklist-builder";
import SettingsPage from "@/pages/settings";
import StormwaterFormPage from "@/pages/stormwater-form";
import { Loader2 } from "lucide-react";

export type AppUser = {
  id: number;
  name: string;
  email: string;
  company?: string;
  role: string;
  subscriptionStatus: string;
};

// Stable route components preserve the form when saving updates the store.
function NewInspectionRoute({ params }: { params: { templateId: string } }) {
  return <InspectionFormPage key={params.templateId} templateId={Number(params.templateId)} inspectionId={null} />;
}
function EditInspectionRoute({ params }: { params: { id: string } }) {
  return <InspectionFormPage key={params.id} templateId={null} inspectionId={Number(params.id)} />;
}
function InspectionDetailRoute({ params }: { params: { id: string } }) {
  return <InspectionDetailPage key={params.id} inspectionId={Number(params.id)} />;
}
function ChecklistRoute({ params }: { params: { id: string } }) {
  return <ChecklistBuilderPage key={params.id} templateId={Number(params.id)} />;
}

function AppRoutes() {
  const { currentUser, authReady, inspectionsReady } = useStore();

  // Still checking if the stored token is valid — don't flash login page
  if (!authReady || (currentUser && !inspectionsReady)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!currentUser) {
    return <LoginPage />;
  }

  return (
    <Switch>
      <Route path="/" component={DashboardPage} />
      <Route path="/dashboard" component={DashboardPage} />
      <Route path="/inspection/new/:templateId" component={NewInspectionRoute} />
      <Route path="/inspection/:id/edit" component={EditInspectionRoute} />
      <Route path="/inspection/:id" component={InspectionDetailRoute} />
      <Route path="/admin" component={() => <AdminPage />} />
      <Route path="/checklists" component={() => <ChecklistsPage />} />
      <Route path="/settings" component={() => <SettingsPage />} />
      <Route path="/stormwater" component={() => <StormwaterFormPage />} />
      <Route path="/checklists/:id" component={ChecklistRoute} />
      <Route component={() => <DashboardPage />} />
    </Switch>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <StoreProvider>
        <Router hook={useHashLocation}>
          <AppRoutes />
        </Router>
        <Toaster />
      </StoreProvider>
    </QueryClientProvider>
  );
}

