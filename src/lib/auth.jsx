// src/lib/auth.jsx
//
// <AuthProvider> hydrates from /api/auth/session once on mount and exposes
// { user, loading, login, logout, refresh, providers } to the rest of the
// app via the context defined in authContext.js.

import { useCallback, useEffect, useMemo, useState } from "react";
import { AuthContext } from "./authContext.js";

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/session", { credentials: "same-origin" });
      if (!res.ok) {
        setUser(null);
        return null;
      }
      const data = await res.json();
      setUser(data.user || null);
      if (Array.isArray(data.providers)) setProviders(data.providers);
      return data.user || null;
    } catch {
      setUser(null);
      return null;
    }
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      await refresh();
      if (alive) setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [refresh]);

  const login = useCallback((provider, redirect = "/portal") => {
    const params = new URLSearchParams({ provider, redirect });
    window.location.href = `/api/auth/login?${params.toString()}`;
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin",
      });
    } catch {
      // Ignore — we clear local state regardless.
    }
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, logout, refresh, providers }),
    [user, loading, login, logout, refresh, providers]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
