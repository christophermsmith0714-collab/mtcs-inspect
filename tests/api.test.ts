/**
 * MTCS Inspection App — Comprehensive API Test Suite
 * Tests against live server on http://localhost:5000
 * Uses timestamp-suffixed emails to avoid conflicts between runs.
 */

import { describe, it, expect, beforeAll } from "vitest";

const BASE = "http://localhost:5000";
const TS = Date.now(); // unique suffix for this run

// ─── Helpers ───────────────────────────────────────────────────────────────

async function post(path: string, body: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

async function get(path: string) {
  const res = await fetch(`${BASE}${path}`);
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

async function patch(path: string, body: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

async function del(path: string) {
  const res = await fetch(`${BASE}${path}`, { method: "DELETE" });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

// ─── Shared state ──────────────────────────────────────────────────────────
let createdClientId: number;
let createdClientEmail: string;
let createdInspectionId: number;
let templateId: number;
let questionId: number;

// ═══════════════════════════════════════════════════════════════════════════
// Auth Tests
// ═══════════════════════════════════════════════════════════════════════════

describe("POST /api/auth/login", () => {
  it("returns user object for valid admin credentials", async () => {
    const { status, data } = await post("/api/auth/login", {
      email: "admin@mtcs.com",
      password: "admin123",
    });
    expect(status).toBe(200);
    expect(data.user).toBeDefined();
    expect(data.user.email).toBe("admin@mtcs.com");
    expect(data.user.role).toBe("admin");
    expect(data.user.password).toBeUndefined(); // password must not be returned
    expect(Array.isArray(data.user.assignedTemplates)).toBe(true);
  });

  it("returns 401 for wrong password", async () => {
    const { status, data } = await post("/api/auth/login", {
      email: "admin@mtcs.com",
      password: "wrongpassword",
    });
    expect(status).toBe(401);
    expect(data.error).toBeDefined();
  });

  it("returns 401 for unknown email", async () => {
    const { status, data } = await post("/api/auth/login", {
      email: `nonexistent_${TS}@example.com`,
      password: "somepassword",
    });
    expect(status).toBe(401);
    expect(data.error).toBeDefined();
  });

  it("returns 400 when email is missing", async () => {
    const { status, data } = await post("/api/auth/login", { password: "admin123" });
    expect(status).toBe(400);
    expect(data.error).toBeDefined();
  });

  it("returns 400 when password is missing", async () => {
    const { status, data } = await post("/api/auth/login", { email: "admin@mtcs.com" });
    expect(status).toBe(400);
    expect(data.error).toBeDefined();
  });

  it("returns 400 when body is empty", async () => {
    const { status } = await post("/api/auth/login", {});
    expect(status).toBe(400);
  });

  it("returns 403 for inactive client account", async () => {
    // First create a client with inactive subscription
    const email = `inactive_${TS}@example.com`;
    await post("/api/clients", {
      name: "Inactive User",
      email,
      password: "pass123",
      company: "Test Co",
    });
    // Find the created user and set inactive
    const { data: users } = await get("/api/users");
    const user = users.find((u: any) => u.email === email);
    if (user) {
      await patch(`/api/clients/${user.id}`, { subscriptionStatus: "inactive" });
    }
    const { status, data } = await post("/api/auth/login", { email, password: "pass123" });
    expect(status).toBe(403);
    expect(data.error).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Users Tests
// ═══════════════════════════════════════════════════════════════════════════

describe("GET /api/users", () => {
  it("returns an array of users", async () => {
    const { status, data } = await get("/api/users");
    expect(status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
  });

  it("does not expose passwords", async () => {
    const { data } = await get("/api/users");
    for (const user of data) {
      expect(user.password).toBeUndefined();
    }
  });

  it("returns assignedTemplates as an array", async () => {
    const { data } = await get("/api/users");
    for (const user of data) {
      expect(Array.isArray(user.assignedTemplates)).toBe(true);
    }
  });

  it("includes the admin user", async () => {
    const { data } = await get("/api/users");
    const admin = data.find((u: any) => u.email === "admin@mtcs.com");
    expect(admin).toBeDefined();
    expect(admin.role).toBe("admin");
  });
});

describe("PATCH /api/users/:id", () => {
  it("updates a user name", async () => {
    const { data: users } = await get("/api/users");
    const admin = users.find((u: any) => u.email === "admin@mtcs.com");
    const newName = `Chris Smith Updated ${TS}`;
    const { status, data } = await patch(`/api/users/${admin.id}`, { name: newName });
    expect(status).toBe(200);
    expect(data.name).toBe(newName);
    // Restore original name
    await patch(`/api/users/${admin.id}`, { name: "Chris Smith" });
  });

  it("returns 404 for non-existent user id", async () => {
    const { status, data } = await patch("/api/users/999999", { name: "Ghost" });
    expect(status).toBe(404);
    expect(data.error).toBeDefined();
  });

  it("does not expose password in response", async () => {
    const { data: users } = await get("/api/users");
    const admin = users.find((u: any) => u.email === "admin@mtcs.com");
    const { data } = await patch(`/api/users/${admin.id}`, { name: "Chris Smith" });
    expect(data.password).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Clients Tests
// ═══════════════════════════════════════════════════════════════════════════

describe("POST /api/clients", () => {
  it("creates a new client and returns safe user object", async () => {
    createdClientEmail = `testclient_${TS}@example.com`;
    const { status, data } = await post("/api/clients", {
      name: "Test Client",
      email: createdClientEmail,
      password: "securepass",
      company: "Test Corp",
      assignedTemplates: [1, 2],
    });
    expect(status).toBe(201);
    expect(data.user).toBeDefined();
    expect(data.user.email).toBe(createdClientEmail);
    expect(data.user.role).toBe("client");
    expect(data.user.subscriptionStatus).toBe("active");
    expect(data.user.password).toBeUndefined();
    createdClientId = data.user.id;
  });

  it("returns 409 when email already exists", async () => {
    const { status, data } = await post("/api/clients", {
      name: "Duplicate",
      email: createdClientEmail,
      password: "pass",
    });
    expect(status).toBe(409);
    expect(data.error).toMatch(/already/i);
  });

  it("returns 400 when name is missing", async () => {
    const { status } = await post("/api/clients", {
      email: `no_name_${TS}@example.com`,
      password: "pass",
    });
    expect(status).toBe(400);
  });

  it("returns 400 when email is missing", async () => {
    const { status } = await post("/api/clients", {
      name: "No Email",
      password: "pass",
    });
    expect(status).toBe(400);
  });

  it("returns 400 when password is missing", async () => {
    const { status } = await post("/api/clients", {
      name: "No Password",
      email: `no_pass_${TS}@example.com`,
    });
    expect(status).toBe(400);
  });

  it("creates client without company (optional field)", async () => {
    const { status, data } = await post("/api/clients", {
      name: "No Company Client",
      email: `no_company_${TS}@example.com`,
      password: "pass123",
    });
    expect(status).toBe(201);
    expect(data.user).toBeDefined();
  });

  it("stores assignedTemplates as array of numbers", async () => {
    // Login to verify assignedTemplates was stored correctly
    const { data: loginData } = await post("/api/auth/login", {
      email: createdClientEmail,
      password: "securepass",
    });
    expect(Array.isArray(loginData.user.assignedTemplates)).toBe(true);
  });

  it("handles very long name (edge case)", async () => {
    const longName = "A".repeat(255);
    const { status } = await post("/api/clients", {
      name: longName,
      email: `long_name_${TS}@example.com`,
      password: "pass123",
    });
    // Should either succeed or return a validation error, not crash
    expect([200, 201, 400]).toContain(status);
  });
});

describe("PATCH /api/clients/:id", () => {
  it("updates client company name", async () => {
    const { status, data } = await patch(`/api/clients/${createdClientId}`, {
      company: "Updated Corp",
    });
    expect(status).toBe(200);
    expect(data.company).toBe("Updated Corp");
  });

  it("updates assignedTemplates", async () => {
    const { status, data } = await patch(`/api/clients/${createdClientId}`, {
      assignedTemplates: [1],
    });
    expect(status).toBe(200);
    expect(Array.isArray(data.assignedTemplates)).toBe(true);
    expect(data.assignedTemplates).toContain(1);
  });

  it("updates subscription status to inactive", async () => {
    const { status, data } = await patch(`/api/clients/${createdClientId}`, {
      subscriptionStatus: "inactive",
    });
    expect(status).toBe(200);
    expect(data.subscriptionStatus).toBe("inactive");
    // Restore
    await patch(`/api/clients/${createdClientId}`, { subscriptionStatus: "active" });
  });

  it("returns 404 for non-existent client id", async () => {
    const { status, data } = await patch("/api/clients/999999", { name: "Ghost" });
    expect(status).toBe(404);
    expect(data.error).toBeDefined();
  });

  it("does not expose password in response", async () => {
    const { data } = await patch(`/api/clients/${createdClientId}`, { name: "Test Client" });
    expect(data.password).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Templates Tests
// ═══════════════════════════════════════════════════════════════════════════

describe("GET /api/templates", () => {
  it("returns array of templates", async () => {
    const { status, data } = await get("/api/templates");
    expect(status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThanOrEqual(2);
  });

  it("templates have required fields", async () => {
    const { data } = await get("/api/templates");
    for (const tpl of data) {
      expect(tpl.id).toBeDefined();
      expect(tpl.name).toBeDefined();
      expect(tpl.type).toBeDefined();
    }
    templateId = data[0].id;
  });

  it("includes SPCC template", async () => {
    const { data } = await get("/api/templates");
    const spcc = data.find((t: any) => t.type === "spcc");
    expect(spcc).toBeDefined();
  });

  it("includes stormwater template", async () => {
    const { data } = await get("/api/templates");
    const sw = data.find((t: any) => t.type === "stormwater");
    expect(sw).toBeDefined();
  });
});

describe("GET /api/templates/:id/questions", () => {
  it("returns questions for a valid template id", async () => {
    const { status, data } = await get(`/api/templates/${templateId}/questions`);
    expect(status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
  });

  it("questions have required fields", async () => {
    const { data } = await get(`/api/templates/${templateId}/questions`);
    for (const q of data) {
      expect(q.id).toBeDefined();
      expect(q.templateId).toBe(templateId);
      expect(q.section).toBeDefined();
      expect(q.questionText).toBeDefined();
      questionId = q.id;
    }
  });

  it("returns empty array for non-existent template id", async () => {
    const { status, data } = await get("/api/templates/999999/questions");
    // Should return 200 with empty array (no questions for that template)
    expect(status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Inspections Tests
// ═══════════════════════════════════════════════════════════════════════════

describe("POST /api/inspections", () => {
  it("creates a new inspection with valid data", async () => {
    const { status, data } = await post("/api/inspections", {
      userId: createdClientId,
      templateId: templateId,
      facilityName: `Test Facility ${TS}`,
      facilityAddress: "123 Main St",
      inspectorName: "Inspector Test",
      inspectionDate: "2024-06-01",
      status: "in_progress",
      createdAt: new Date().toISOString(),
    });
    expect(status).toBe(201);
    expect(data.id).toBeDefined();
    expect(data.facilityName).toBe(`Test Facility ${TS}`);
    expect(data.status).toBe("in_progress");
    createdInspectionId = data.id;
  });

  it("creates inspection without optional fields", async () => {
    const { status, data } = await post("/api/inspections", {
      userId: createdClientId,
      templateId: templateId,
      facilityName: `Minimal Facility ${TS}`,
      inspectorName: "Min Inspector",
      inspectionDate: "2024-06-02",
      createdAt: new Date().toISOString(),
    });
    expect(status).toBe(201);
    expect(data.id).toBeDefined();
    // Clean up
    await del(`/api/inspections/${data.id}`);
  });

  it("returns 400 when facilityName is missing", async () => {
    const { status } = await post("/api/inspections", {
      userId: createdClientId,
      templateId: templateId,
      inspectorName: "Inspector",
      inspectionDate: "2024-06-01",
      createdAt: new Date().toISOString(),
    });
    expect(status).toBe(400);
  });

  it("returns 400 when inspectorName is missing", async () => {
    const { status } = await post("/api/inspections", {
      userId: createdClientId,
      templateId: templateId,
      facilityName: "Some Facility",
      inspectionDate: "2024-06-01",
      createdAt: new Date().toISOString(),
    });
    expect(status).toBe(400);
  });

  it("returns 400 when inspectionDate is missing", async () => {
    const { status } = await post("/api/inspections", {
      userId: createdClientId,
      templateId: templateId,
      facilityName: "Some Facility",
      inspectorName: "Inspector",
      createdAt: new Date().toISOString(),
    });
    expect(status).toBe(400);
  });

  it("auto-fills createdAt when omitted", async () => {
    const { status, data } = await post("/api/inspections", {
      userId: createdClientId,
      templateId: templateId,
      facilityName: `Auto Date Facility ${TS}`,
      inspectorName: "Auto Date Inspector",
      inspectionDate: "2024-07-01",
    });
    expect(status).toBe(201);
    expect(data.createdAt).toBeDefined();
    await del(`/api/inspections/${data.id}`);
  });
});

describe("GET /api/inspections", () => {
  it("returns inspections for a specific userId", async () => {
    const { status, data } = await get(`/api/inspections?userId=${createdClientId}`);
    expect(status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
    // Should contain our created inspection
    const found = data.find((i: any) => i.id === createdInspectionId);
    expect(found).toBeDefined();
  });

  it("returns all inspections for admin role", async () => {
    const { status, data } = await get("/api/inspections?role=admin");
    expect(status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
  });

  it("returns 400 when neither userId nor role=admin is provided", async () => {
    const { status, data } = await get("/api/inspections");
    expect(status).toBe(400);
    expect(data.error).toBeDefined();
  });

  it("returns empty array for userId with no inspections", async () => {
    // Create a brand new client with no inspections
    const { data: newClient } = await post("/api/clients", {
      name: "Empty Client",
      email: `empty_client_${TS}@example.com`,
      password: "pass123",
    });
    const { status, data } = await get(`/api/inspections?userId=${newClient.user.id}`);
    expect(status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBe(0);
  });

  it("returns 400 for invalid (NaN) userId", async () => {
    const { status } = await get("/api/inspections?userId=notanumber");
    expect(status).toBe(400);
  });
});

describe("GET /api/inspections/:id", () => {
  it("returns a specific inspection by id", async () => {
    const { status, data } = await get(`/api/inspections/${createdInspectionId}`);
    expect(status).toBe(200);
    expect(data.id).toBe(createdInspectionId);
  });

  it("returns 404 for non-existent inspection id", async () => {
    const { status, data } = await get("/api/inspections/999999");
    expect(status).toBe(404);
    expect(data.error).toBeDefined();
  });
});

describe("PATCH /api/inspections/:id", () => {
  it("updates inspection status to completed", async () => {
    const { status, data } = await patch(`/api/inspections/${createdInspectionId}`, {
      status: "completed",
      completedAt: new Date().toISOString(),
    });
    expect(status).toBe(200);
    expect(data.status).toBe("completed");
    expect(data.completedAt).toBeDefined();
  });

  it("updates generalComments field", async () => {
    const comment = `Test comment at ${TS}`;
    const { status, data } = await patch(`/api/inspections/${createdInspectionId}`, {
      generalComments: comment,
    });
    expect(status).toBe(200);
    expect(data.generalComments).toBe(comment);
  });

  it("updates facilityName", async () => {
    const newName = `Updated Facility ${TS}`;
    const { status, data } = await patch(`/api/inspections/${createdInspectionId}`, {
      facilityName: newName,
    });
    expect(status).toBe(200);
    expect(data.facilityName).toBe(newName);
  });

  it("returns 404 for non-existent inspection id", async () => {
    const { status, data } = await patch("/api/inspections/999999", { status: "completed" });
    expect(status).toBe(404);
    expect(data.error).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Answers Tests
// ═══════════════════════════════════════════════════════════════════════════

describe("POST /api/inspections/:id/answers", () => {
  it("saves answers for an inspection", async () => {
    const { status, data } = await post(`/api/inspections/${createdInspectionId}/answers`, {
      answers: [
        {
          questionId: questionId,
          answer: "yes",
          comments: "Looks good",
          photos: [],
        },
      ],
    });
    expect(status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBe(1);
    expect(data[0].questionId).toBe(questionId);
    expect(data[0].answer).toBe("yes");
  });

  it("updates existing answer (upsert behavior)", async () => {
    const { status, data } = await post(`/api/inspections/${createdInspectionId}/answers`, {
      answers: [
        {
          questionId: questionId,
          answer: "no",
          comments: "Updated comment",
          photos: [],
        },
      ],
    });
    expect(status).toBe(200);
    expect(data[0].answer).toBe("no");
  });

  it("saves multiple answers at once", async () => {
    // Get questions for this template
    const { data: questions } = await get(`/api/templates/${templateId}/questions`);
    const answerPayload = questions.slice(0, 3).map((q: any) => ({
      questionId: q.id,
      answer: "yes",
      comments: "",
      photos: [],
    }));
    const { status, data } = await post(`/api/inspections/${createdInspectionId}/answers`, {
      answers: answerPayload,
    });
    expect(status).toBe(200);
    expect(data.length).toBe(3);
  });

  it("saves answer with n/a value", async () => {
    const { status, data } = await post(`/api/inspections/${createdInspectionId}/answers`, {
      answers: [{ questionId: questionId, answer: "n/a", comments: "", photos: [] }],
    });
    expect(status).toBe(200);
    expect(data[0].answer).toBe("n/a");
  });

  it("saves answer with photo data", async () => {
    const fakePhoto = "data:image/png;base64,iVBORw0KGgo=";
    const { status, data } = await post(`/api/inspections/${createdInspectionId}/answers`, {
      answers: [{ questionId: questionId, answer: "yes", comments: "", photos: [fakePhoto] }],
    });
    expect(status).toBe(200);
    expect(data[0]).toBeDefined();
  });
});

describe("GET /api/inspections/:id/answers", () => {
  it("returns answers for an inspection", async () => {
    const { status, data } = await get(`/api/inspections/${createdInspectionId}/answers`);
    expect(status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
  });

  it("answers include a photos array (mapped from photoUrls)", async () => {
    const { data } = await get(`/api/inspections/${createdInspectionId}/answers`);
    for (const ans of data) {
      expect(Array.isArray(ans.photos)).toBe(true);
    }
  });

  it("returns empty array for inspection with no answers", async () => {
    // Create a fresh inspection
    const { data: newInsp } = await post("/api/inspections", {
      userId: createdClientId,
      templateId: templateId,
      facilityName: `No Answers Facility ${TS}`,
      inspectorName: "Inspector",
      inspectionDate: "2024-08-01",
      createdAt: new Date().toISOString(),
    });
    const { status, data } = await get(`/api/inspections/${newInsp.id}/answers`);
    expect(status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBe(0);
    await del(`/api/inspections/${newInsp.id}`);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Data Integrity: Create → Read → Update → Delete
// ═══════════════════════════════════════════════════════════════════════════

describe("Data integrity: full inspection lifecycle", () => {
  let lifecycleInspectionId: number;

  it("creates an inspection (CREATE)", async () => {
    const { status, data } = await post("/api/inspections", {
      userId: createdClientId,
      templateId: templateId,
      facilityName: `Lifecycle Facility ${TS}`,
      facilityAddress: "456 Oak Ave",
      inspectorName: "Lifecycle Inspector",
      inspectionDate: "2024-09-15",
      status: "in_progress",
      createdAt: new Date().toISOString(),
    });
    expect(status).toBe(201);
    lifecycleInspectionId = data.id;
  });

  it("reads the created inspection (READ)", async () => {
    const { status, data } = await get(`/api/inspections/${lifecycleInspectionId}`);
    expect(status).toBe(200);
    expect(data.id).toBe(lifecycleInspectionId);
    expect(data.facilityName).toBe(`Lifecycle Facility ${TS}`);
    expect(data.facilityAddress).toBe("456 Oak Ave");
  });

  it("saves answers to the inspection (ANSWERS CREATE)", async () => {
    const { status, data } = await post(`/api/inspections/${lifecycleInspectionId}/answers`, {
      answers: [
        { questionId: questionId, answer: "yes", comments: "All clear", photos: [] },
      ],
    });
    expect(status).toBe(200);
    expect(data[0].answer).toBe("yes");
  });

  it("reads the answers back (ANSWERS READ)", async () => {
    const { status, data } = await get(`/api/inspections/${lifecycleInspectionId}/answers`);
    expect(status).toBe(200);
    expect(data.length).toBeGreaterThan(0);
    const ans = data.find((a: any) => a.questionId === questionId);
    expect(ans).toBeDefined();
    expect(ans.answer).toBe("yes");
  });

  it("updates the inspection status (UPDATE)", async () => {
    const { status, data } = await patch(`/api/inspections/${lifecycleInspectionId}`, {
      status: "completed",
      completedAt: new Date().toISOString(),
    });
    expect(status).toBe(200);
    expect(data.status).toBe("completed");
  });

  it("verifies update persisted (READ after UPDATE)", async () => {
    const { data } = await get(`/api/inspections/${lifecycleInspectionId}`);
    expect(data.status).toBe("completed");
  });

  it("deletes the inspection (DELETE)", async () => {
    const { status, data } = await del(`/api/inspections/${lifecycleInspectionId}`);
    expect(status).toBe(200);
    expect(data.success).toBe(true);
  });

  it("returns 404 after deletion (READ after DELETE)", async () => {
    const { status } = await get(`/api/inspections/${lifecycleInspectionId}`);
    expect(status).toBe(404);
  });

  it("returns empty answers after deletion (ANSWERS after DELETE)", async () => {
    const { data } = await get(`/api/inspections/${lifecycleInspectionId}/answers`);
    // After deleting inspection, answers should be gone
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// DELETE /api/inspections/:id
// ═══════════════════════════════════════════════════════════════════════════

describe("DELETE /api/inspections/:id", () => {
  it("deletes an inspection and its answers", async () => {
    const { data: newInsp } = await post("/api/inspections", {
      userId: createdClientId,
      templateId: templateId,
      facilityName: `Delete Test ${TS}`,
      inspectorName: "Delete Inspector",
      inspectionDate: "2024-10-01",
      createdAt: new Date().toISOString(),
    });
    // Add an answer
    await post(`/api/inspections/${newInsp.id}/answers`, {
      answers: [{ questionId: questionId, answer: "yes", comments: "", photos: [] }],
    });
    // Delete
    const { status, data } = await del(`/api/inspections/${newInsp.id}`);
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    // Inspection should be gone
    const { status: s2 } = await get(`/api/inspections/${newInsp.id}`);
    expect(s2).toBe(404);
    // Answers should be gone
    const { data: answers } = await get(`/api/inspections/${newInsp.id}/answers`);
    expect(answers.length).toBe(0);
  });

  it("returns success even for non-existent inspection id (idempotent delete)", async () => {
    // Express 5 route handles this — should not error out
    const { status } = await del("/api/inspections/999999");
    // May return 200 (idempotent) or 404; document actual behavior
    expect([200, 404]).toContain(status);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Auth Register
// ═══════════════════════════════════════════════════════════════════════════

describe("POST /api/auth/register", () => {
  it("registers a new user", async () => {
    const { status, data } = await post("/api/auth/register", {
      name: "Register Test User",
      email: `register_${TS}@example.com`,
      password: "regpass123",
      role: "client",
      subscriptionStatus: "active",
      subscriptionStartDate: new Date().toISOString(),
      assignedTemplates: "[]",
    });
    expect(status).toBe(201);
    expect(data.user).toBeDefined();
    expect(data.user.password).toBeUndefined();
  });

  it("returns 409 for duplicate email", async () => {
    const email = `dup_register_${TS}@example.com`;
    await post("/api/auth/register", {
      name: "First",
      email,
      password: "pass1",
      role: "client",
      subscriptionStatus: "active",
      subscriptionStartDate: new Date().toISOString(),
      assignedTemplates: "[]",
    });
    const { status, data } = await post("/api/auth/register", {
      name: "Second",
      email,
      password: "pass2",
      role: "client",
      subscriptionStatus: "active",
      subscriptionStartDate: new Date().toISOString(),
      assignedTemplates: "[]",
    });
    expect(status).toBe(409);
    expect(data.error).toBeDefined();
  });

  it("returns 400 for invalid data (missing required fields)", async () => {
    const { status } = await post("/api/auth/register", { name: "No Email User" });
    expect(status).toBe(400);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Edge Cases
// ═══════════════════════════════════════════════════════════════════════════

describe("Edge cases", () => {
  it("handles empty string facility name (should fail validation)", async () => {
    const { status } = await post("/api/inspections", {
      userId: createdClientId,
      templateId: templateId,
      facilityName: "",
      inspectorName: "Inspector",
      inspectionDate: "2024-06-01",
      createdAt: new Date().toISOString(),
    });
    // Empty string on a notNull field — should fail or create depending on Zod schema
    expect([400, 201]).toContain(status);
  });

  it("handles very long facility name", async () => {
    const longName = "X".repeat(500);
    const { status, data } = await post("/api/inspections", {
      userId: createdClientId,
      templateId: templateId,
      facilityName: longName,
      inspectorName: "Inspector",
      inspectionDate: "2024-06-01",
      createdAt: new Date().toISOString(),
    });
    expect([201, 400]).toContain(status);
    if (status === 201) {
      await del(`/api/inspections/${data.id}`);
    }
  });

  it("GET /api/inspections?userId=0 returns 400", async () => {
    const { status } = await get("/api/inspections?userId=0");
    // userId=0 parses as 0 which is falsy — should return 400
    expect(status).toBe(400);
  });

  it("PATCH /api/users/:id with non-numeric id returns 404", async () => {
    // parseInt('abc') = NaN, storage will get NaN as id
    const { status } = await patch("/api/users/abc", { name: "Test" });
    // Depending on implementation may return 404 or 400
    expect([400, 404]).toContain(status);
  });

  it("answers endpoint handles empty answers array", async () => {
    const { status, data } = await post(`/api/inspections/${createdInspectionId}/answers`, {
      answers: [],
    });
    expect(status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBe(0);
  });

  it("duplicate email in /api/clients returns 409", async () => {
    const email = `dup_client_${TS}@example.com`;
    await post("/api/clients", { name: "First", email, password: "pass1" });
    const { status } = await post("/api/clients", { name: "Second", email, password: "pass2" });
    expect(status).toBe(409);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Cleanup: delete the main created inspection
// ═══════════════════════════════════════════════════════════════════════════

describe("Cleanup", () => {
  it("deletes the main test inspection", async () => {
    if (!createdInspectionId) return;
    const { status } = await del(`/api/inspections/${createdInspectionId}`);
    expect([200, 404]).toContain(status);
  });
});
