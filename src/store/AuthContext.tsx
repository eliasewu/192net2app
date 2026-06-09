import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { api } from '../services/api';

export interface User {
  id: string; username: string; email: string;
  role: string; permissions: string[]; client_id?: string; supplier_id?: string;
  name?: string; is_active: boolean; last_login?: string;
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
  addUser: (u: any, password: string) => void;
  updateUser: (id: string, data: any) => void;
  deleteUser: (id: string) => void;
  toggleUserBlock: (id: string) => void;
  resetPassword: (id: string, newPassword: string) => void;
  changeOwnPassword: (currentPassword: string, newPassword: string) => boolean;
  verifySuperAdmin: (password: string) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [usersDb, setUsersDb] = useState<User[]>([]);

  // On mount, check for existing token
  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    const savedUser = localStorage.getItem('auth_user');
    if (token && savedUser) {
      try {
        setUser(JSON.parse(savedUser));
        api.setToken(token);
      } catch {}
    }
    setIsLoading(false);
  }, []);

  // Login via API
  const login = async (username: string, password: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const response = await api.post('/auth/login', { username, password });
      if (response.success && response.token) {
        localStorage.setItem('auth_token', response.token);
        localStorage.setItem('auth_user', JSON.stringify(response.user));
        api.setToken(response.token);
        setUser(response.user);
        return { success: true };
      }
      return { success: false, error: 'Invalid credentials' };
    } catch (e: any) {
      return { success: false, error: e.message || 'Login failed' };
    }
  };

  const logout = () => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
    api.setToken(null);
    setUser(null);
    window.location.href = '/login';
  };

  const hasPermission = (p: string) => {
    if (!user) return false;
    if (user.role === 'super_admin' || user.permissions.includes('all')) return true;
    return user.permissions.includes(p);
  };
  const isSuperAdmin = () => user?.role === 'super_admin';
  const isAdmin = () => user?.role === 'super_admin' || user?.role === 'admin';
  const getVisibleUsers = () => usersDb;

  // Stub functions for user management
  const addUser = (u: any, pw: string) => {};
  const updateUser = (id: string, d: any) => {};
  const deleteUser = (id: string) => {};
  const toggleUserBlock = (id: string) => {};
  const resetPassword = (id: string, pw: string) => {};
  const changeOwnPassword = (cp: string, np: string): boolean => { return false; };
  const verifySuperAdmin = (p: string): boolean => { return false; };

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
