"use client";

import { ApiError, api } from "./api";

export type AuthResponse = { authenticated: boolean };

export function login(email: string, password: string) {
  return api<AuthResponse>("/auth/token/", {
    method: "POST",
    body: JSON.stringify({ username: email, password }),
  });
}
export function register(email: string, password: string) {
  return api<AuthResponse>("/auth/register/", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}
export function saveAuth() {
  // Remove credentials left behind by the earlier preview; new tokens are HttpOnly cookies.
  localStorage.removeItem("access_token");
  localStorage.removeItem("refresh_token");
}
export async function logout() {
  await api<void>("/auth/logout/", { method: "POST", body: "{}" });
}
export async function isAuthed() {
  try {
    await api("/auth/me/");
    return true;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return false;
    throw error;
  }
}
export function handleAuthError(error: unknown) {
  if (!(error instanceof ApiError) || error.status !== 401) return;
  if (["/login", "/register"].includes(window.location.pathname)) return;
  window.location.replace("/login");
}
