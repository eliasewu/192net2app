import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { api } from '../services/api';

export interface User {
  id: string; username: string; email: string;
  role: string; permissions: string[]; client_id?: string; supplier_id?: string;
  name?: string; is_active: boolean; last_login?: string; created_by?: string;
}

interface AuthContextType {
  user: User | null; isAuthenticated: boolean; isLoading: boolean;
  login: (u: string, p: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  hasPermission: (p: string) => boolean;
  isSuperAdmin: () => boolean;
  isAdmin: () => boolean;
  users: User[];
  getVisibleUsers: () => User[];
  addUser: (u: Omit<User, 'id' | 'is_active' | 'last_login' | 'created_by'>, password: string) => void;
  updateUser: (id: string, data: Partial<User>) => void;
  deleteUser: (id: string) => void;
  toggleUserBlock: (id: string) => void;
  resetPassword: (id: string, newPassword: string) => void;
  changeOwnPassword: (currentPassword: string, newPassword: string) => Promise<boolean>;
  verifySuperAdmin: (password: string) => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [usersDb, setUsersDb] = useState<User[]>([]);

  // Load users from API
  const loadUsers = async () => {
    try {
      const res = await api.get('/users');
      if (res.success && res.data) setUsersDb(res.data);
    } catch {}
  };

  // On mount: restore token from localStorage (api.ts constructor does this),
  // then validate it by fetching the current user profile. If the token is
  // expired/invalid the 401 handler in api.ts clears it silently.
  useEffect(() => {
    const token = api.getToken();
    if (token) {
      // Quick validation: fetch /api/auth/me to confirm the token is still
      // valid. If it 401s, clearTokenSilent drops it; otherwise set user.
      api.get('/auth/me').then(res => {
        if (res.success && res.user) {
          setUser(res.user);
          loadUsers();
        }
      }).catch((err) => {
        // Token invalid/expired — api.ts already dropped it via clearTokenSilent.
        // For non-401 errors, log a warning so operators can diagnose.
        if (err && err.message !== 'Unauthorized') {
          console.warn('[auth] session restore failed:', err.message || err);
        }
      }).finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, []);

  const login = async (username: string, password: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const response = await api.post('/auth/login', { username, password });
      if (response.success && response.token) {
        api.setToken(response.token);
        setUser(response.user);
        // Populate AuthContext.usersDb (consumed by UserManagement via
        // getVisibleUsers). DataContext.reloadAll will *also* fetch /api/users
        // into its own `users` slot via the onTokenChange subscriber; this
        // is a small redundant round trip but keeps the two contexts
        // independent (no provider-order coupling).
        loadUsers();
        return { success: true };
      }
      return { success: false, error: 'Invalid credentials' };
    } catch (e: any) { return { success: false, error: e.message || 'Login failed' }; }
  };

  const logout = () => {
    api.setToken(null);
    setUser(null);
    setUsersDb([]);
    // Use React Router navigation instead of full page reload.
    // window.location is synchronous and Page may not have been
    // imported yet; use a setTimeout to let state settle, then
    // navigate via the DOM (avoids circular import of useNavigate).
    setTimeout(() => {
      window.location.href = '/login';
    }, 0);
  };

  const hasPermission = (p: string) => {
    if (!user) return false;
    if (user.role === 'super_admin' || user.permissions.includes('all')) return true;
    return user.permissions.includes(p);
  };
  const isSuperAdmin = () => user?.role === 'super_admin';
  const isAdmin = () => user?.role === 'super_admin' || user?.role === 'admin';
  const getVisibleUsers = () => {
    if (!user) return [];
    if (user.role === 'super_admin' || user.role === 'admin') return usersDb;
    return usersDb.filter(u => u.id === user.id);
  };

  // User management via API
  const addUser = async (nu: any, pw: string) => {
    await api.post('/users', { ...nu, password: pw });
    loadUsers();
  };
  const updateUser = async (id: string, data: any) => {
    await api.put('/users/' + id, data);
    loadUsers();
    if (user && user.id === id) {
      const res = await api.get('/users');
      if (res.success && res.data) {
        const updated = res.data.find((u: User) => String(u.id) === String(id));
        if (updated) { setUser(updated); }
      }
    }
  };
  const deleteUser = async (id: string) => {
    if (user && user.id === id) { throw new Error('Cannot delete yourself'); }
    await api.delete('/users/' + id);
    loadUsers();
  };
  const toggleUserBlock = async (id: string) => {
    const target = usersDb.find(u => u.id === id);
    if (!target) return;
    await api.put('/users/' + id, { is_active: !target.is_active });
    loadUsers();
  };
  const resetPassword = async (id: string, pw: string) => {
    await api.put('/users/' + id, { password: pw });
  };
  const changeOwnPassword = async (cp: string, np: string): Promise<boolean> => {
    if (!user) return false;
    const check = await api.post('/auth/login', { username: user.username, password: cp });
    if (!check.success) return false;
    await api.put('/users/' + user.id, { password: np });
    return true;
  };
  const verifySuperAdmin = async (p: string): Promise<boolean> => {
    try { const r = await api.post('/auth/login', { username: 'admin', password: p }); return r.success; } catch { return false; }
  };

  return (
    <AuthContext.Provider value={{
      user, isAuthenticated: !!user, isLoading,
      login, logout, hasPermission, isSuperAdmin, isAdmin,
      users: usersDb, getVisibleUsers,
      addUser, updateUser, deleteUser, toggleUserBlock,
      resetPassword, changeOwnPassword, verifySuperAdmin
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
