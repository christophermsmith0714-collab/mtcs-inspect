import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { apiRequest } from "./queryClient";
import type { Answer } from "./data";

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
  login: (email: string, password: string) => Promise<User | null>;
  logout: () => Promise<void>;

  // Users (admin)
  users: User[];
  setUsers: (users: User[]) => void;

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
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [inspections, setInspections] = useState<Inspection[]>([]);

  const login = async (email: string, password: string): Promise<User | null> => {
    const res = await apiRequest("POST", "/api/auth/login", { email, password });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Invalid credentials");
    }
    const { user } = await res.json();
    setCurrentUser(user);
    return user;
  };

  const logout = async () => {
    try { await apiRequest("POST", "/api/auth/logout"); } catch {}
    setCurrentUser(null);
    setInspections([]);
  };

  // Auto-logout if session expires (401 from any API call)
  const handleUnauthorized = () => {
    setCurrentUser(null);
    setInspections([]);
  };

  // Load inspections from DB
  const loadInspections = async () => {
    if (!currentUser) return;
    try {
      // Role is determined server-side from session — no params needed
      const res = await apiRequest("GET", `/api/inspections`);
      if (!res.ok) return;
      const data: any[] = await res.json();
      // For each inspection, load its answers
      const withAnswers = await Promise.all(data.map(async insp => {
        try {
          const ar = await apiRequest("GET", `/api/inspections/${insp.id}/answers`);
          const answers: Answer[] = ar.ok ? await ar.json() : [];
          return { ...insp, answers };
        } catch {
          return { ...insp, answers: [] };
        }
      }));
      setInspections(withAnswers);
    } catch (e) {
      console.error("Failed to load inspections:", e);
    }
  };

  // Load inspections whenever currentUser changes
  useEffect(() => {
    if (currentUser) loadInspections();
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
      currentUser, login, logout,
      users, setUsers,
      inspections, loadInspections, addInspection, updateInspection, saveAnswers, deleteInspection, getInspection,
    }}>
      {children}
    </Store.Provider>
  );
}

export function useStore() {
  return useContext(Store);
}
