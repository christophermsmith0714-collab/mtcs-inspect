// Simple in-memory auth state (no localStorage - sandboxed)
let currentUser: any = null;

export function getUser() {
  return currentUser;
}

export function setUser(user: any) {
  currentUser = user;
}

export function clearUser() {
  currentUser = null;
}

export function isAdmin() {
  return currentUser?.role === "admin";
}
