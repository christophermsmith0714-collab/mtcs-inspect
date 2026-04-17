import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { apiRequest, setAuthToken, saveUserToSession, loadUserFromSession } from "./queryClient";
import { setTemplateCache, type Answer, type Template } from "./data";

export type User = {
  id: number;
  name: string;
  email: string;
  company: string;
  role: "admin" | "client";
  subscriptionStatus: "active" | "inactive";
  assignedTemplates: number[];
};

export type Inspection = {
  id: number;
  userId: number;
  templateId: number;
  facilityName: string;
  facilityAddress: string;
  inspectorName: string;
  inspectionDate: string;
  status: "in_progress" | "completed";
  generalComments: string;
  completedAt?: string;
  createdAt: string;
  answers: Answer[];
};

type StoreType = {
  // Auth
  currentUser: User | null;
  authReady: boolean;         // true once we've attempted to restore session
  login: (email: string, password: string) => Promise<User | null>;
  logout: () => Promise<void>;

  // Templates (from DB)
  templates: Template[];
  loadTemplates: () => Promise<void>;

  // Users (admin)
  users: User[];
  setUsers: (users: User[]) => void;
  loadUsers: () => Promise<void>;

  // Inspections
  inspections: Inspection[];
  loadInspections: () => Promise<void>;
  addInspection: (insp: Omit<Inspection, "id" | "createdAt" | "answers">) => Promise<Inspection>;
  updateInspection: (id: number, data: Partial<Inspection>) => Promise<void>;
  saveAnswers: (inspectionId: number, answers: Answer[]) => Promise<void>;
  deleteInspection: (id: number) => Promise<void>;
  getInspection: (id: number) => Inspection | undefined;
};

const Store = createContext<StoreType>(null!);

export function StoreProvider({ children }: { children: ReactNode }) {
  // Restore user from sessionStorage immediately — no flicker to login page
  const [currentUser, setCurrentUser] = useState<User | null>(() => loadUserFromSession());
  const [authReady, setAuthReady] = useState(false);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [inspections, setInspections] = useState<Inspection[]>([]);

  // On mount: verify the stored token is still valid with the server
  useEffect(() => {
    const storedUser = loadUserFromSession();
    if (!storedUser) {
      setAuthReady(true);
      return;
    }
    // Ping /api/auth/me to confirm token still valid (8-hour expiry)
    apiRequest("GET", "/api/auth/me")
      .then(async res => {
        if (res.ok) {
          const user = await res.json();
          // Normalize assignedTemplates
          const normalized = {
            ...user,
            assignedTemplates: typeof user.assignedTemplates === "string"
              ? JSON.parse(user.assignedTemplates || "[]")
              : (user.assignedTemplates ?? []),
          };
          setCurrentUser(normalized);
          saveUserToSession(normalized);
        } else {
          // Token expired — clear everything
          setAuthToken(null);
          saveUserToSession(null);
          setCurrentUser(null);
        }
      })
      .catch(() => {
        // Network error — keep user logged in optimistically, will fail on next API call
      })
      .finally(() => setAuthReady(true));
  }, []);

  // Load users from DB (admin only)
  const loadUsers = async () => {
    try {
      const res = await apiRequest("GET", "/api/users");
      if (!res.ok) return;
      const data: any[] = await res.json();
      const parsed = data.map((u: any) => ({
        ...u,
        assignedTemplates: typeof u.assignedTemplates === "string"
          ? JSON.parse(u.assignedTemplates || "[]")
          : (u.assignedTemplates ?? []),
      }));
      setUsers(parsed);
    } catch (e) {
      console.error("Failed to load users:", e);
    }
  };

  // Load templates from DB and populate the cache used by data.ts
  const loadTemplates = async () => {
    try {
      const res = await apiRequest("GET", "/api/templates");
      if (!res.ok) return;
      const data: Template[] = await res.json();
      setTemplates(data);
      setTemplateCache(data);
    } catch (e) {
      console.error("Failed to load templates:", e);
    }
  };

  const login = async (email: string, password: string): Promise<User | null> => {
    const res = await apiRequest("POST", "/api/auth/login", { email, password });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Invalid credentials");
    }
    const { user, token } = await res.json();
    const normalized = {
      ...user,
      assignedTemplates: typeof user.assignedTemplates === "string"
        ? JSON.parse(user.assignedTemplates || "[]")
        : (user.assignedTemplates ?? []),
    };
    setAuthToken(token);
    saveUserToSession(normalized);
    setCurrentUser(normalized);
    return normalized;
  };

  const logout = async () => {
    try { await apiRequest("POST", "/api/auth/logout"); } catch {}
    setAuthToken(null);
    saveUserToSession(null);
    setCurrentUser(null);
    setInspections([]);
    setTemplates([]);
    setTemplateCache([]);
  };

  // Load inspections from DB — single batch endpoint, no N+1
  const loadInspections = async () => {
    if (!currentUser) return;
    try {
      const res = await apiRequest("GET", "/api/inspections?includeAnswers=true");
      if (!res.ok) return;
      const data: any[] = await res.json();
      const withAnswers = data.map(insp => ({
        ...insp,
        answers: Array.isArray(insp.answers) ? insp.answers : [],
        assignedTemplates: typeof insp.assignedTemplates === "string"
          ? JSON.parse(insp.assignedTemplates || "[]")
          : (insp.assignedTemplates ?? []),
      }));
      setInspections(withAnswers);
    } catch (e) {
      console.error("Failed to load inspections:", e);
    }
  };

  // Load all data whenever currentUser changes
  useEffect(() => {
    if (currentUser) {
      loadTemplates();
      loadInspections();
      if (currentUser.role === "admin") loadUsers();
    }
  }, [currentUser?.id]);

  const addInspection = async (data: Omit<Inspection, "id" | "createdAt" | "answers">): Promise<Inspection> => {
    const res = await apiRequest("POST", "/api/inspections", data);
    if (!res.ok) throw new Error("Failed to create inspection");
    const insp = await res.json();
    const withAnswers = { ...insp, answers: [] };
    setInspections(prev => [...prev, withAnswers]);
    return withAnswers;
  };

  const updateInspection = async (id: number, data: Partial<Inspection>) => {
    const res = await apiRequest("PATCH", `/api/inspections/${id}`, data);
    if (!res.ok) return;
    const updated = await res.json();
    setInspections(prev => prev.map(i => i.id === id ? { ...i, ...updated } : i));
  };

  const saveAnswers = async (inspectionId: number, answers: Answer[]) => {
    const res = await apiRequest("POST", `/api/inspections/${inspectionId}/answers`, { answers });
    if (!res.ok) return;
    setInspections(prev => prev.map(i => i.id === inspectionId ? { ...i, answers } : i));
  };

  const deleteInspection = async (id: number) => {
    await apiRequest("DELETE", `/api/inspections/${id}`);
    setInspections(prev => prev.filter(i => i.id !== id));
  };

  const getInspection = (id: number) => inspections.find(i => i.id === id);

  return (
    <Store.Provider value={{
      currentUser, authReady, login, logout,
      templates, loadTemplates,
      users, setUsers, loadUsers,
      inspections, loadInspections, addInspection, updateInspection, saveAnswers, deleteInspection, getInspection,
    }}>
      {children}
    </Store.Provider>
  );
}

export function useStore() {
  return useContext(Store);
}
