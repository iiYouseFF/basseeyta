import React, { createContext, useContext, useEffect, useState } from 'react';
import { fetchMe } from './api';

type AdminUser = { id: string; email: string; name: string; is_superadmin?: boolean } | null;

const Ctx = createContext<{
  token: string | null;
  admin: AdminUser;
  setToken: (t: string | null) => void;
  setAdmin: (a: AdminUser) => void;
  logout: () => void;
  loading: boolean;
}>({ token: null, admin: null, setToken: () => {}, setAdmin: () => {}, logout: () => {}, loading: true });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setTokenState] = useState<string | null>(() => localStorage.getItem('admin_token'));
  const [admin, setAdminState] = useState<AdminUser>(() => {
    try { return JSON.parse(localStorage.getItem('admin_user') || 'null'); } catch { return null; }
  });
  const [loading, setLoading] = useState(true);

  const setToken = (t: string | null) => {
    setTokenState(t);
    if (t) localStorage.setItem('admin_token', t);
    else localStorage.removeItem('admin_token');
  };
  const setAdmin = (a: AdminUser) => {
    setAdminState(a);
    if (a) localStorage.setItem('admin_user', JSON.stringify(a));
    else localStorage.removeItem('admin_user');
  };
  const logout = () => {
    setToken(null);
    setAdmin(null);
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_user');
  };

  useEffect(() => {
    let mounted = true;
    if (token && !admin) {
      fetchMe()
        .then((a) => { if (mounted) setAdmin(a); })
        .catch(() => { if (mounted) logout(); })
        .finally(() => mounted && setLoading(false));
    } else {
      setLoading(false);
    }
    return () => { mounted = false; };
  }, [token]);

  return <Ctx.Provider value={{ token, admin, setToken, setAdmin, logout, loading }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
