import { Switch, Route, Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { Toaster } from "@/components/ui/toaster";
import { StoreProvider, useStore } from "@/lib/store";
import LoginPage from "@/pages/login";
import DashboardPage from "@/pages/dashboard";
import InspectionFormPage from "@/pages/inspection-form";
import InspectionDetailPage from "@/pages/inspection-detail";
import AdminPage from "@/pages/admin";

export type AppUser = {
  id: number;
  name: string;
  email: string;
  company?: string;
  role: string;
  subscriptionStatus: string;
};

function AppRoutes() {
  const { currentUser, logout } = useStore();

  if (!currentUser) {
    return <LoginPage />;
  }

  return (
    <Switch>
      <Route path="/" component={() => <DashboardPage />} />
      <Route path="/dashboard" component={() => <DashboardPage />} />
      <Route path="/inspection/new/:templateId" component={({ params }) => (
        <InspectionFormPage templateId={parseInt(params.templateId)} inspectionId={null} />
      )} />
      <Route path="/inspection/:id/edit" component={({ params }) => (
        <InspectionFormPage templateId={null} inspectionId={parseInt(params.id)} />
      )} />
      <Route path="/inspection/:id" component={({ params }) => (
        <InspectionDetailPage inspectionId={parseInt(params.id)} />
      )} />
      <Route path="/admin" component={() => <AdminPage />} />
      <Route component={() => <DashboardPage />} />
    </Switch>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <Router hook={useHashLocation}>
        <AppRoutes />
      </Router>
      <Toaster />
    </StoreProvider>
  );
}
