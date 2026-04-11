// src/lib/authContext.js
//
// Lives separately from auth.jsx so that file only exports the
// <AuthProvider> component, which keeps Vite's fast refresh working.

import { createContext, useContext } from "react";

export const AuthContext = createContext(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
