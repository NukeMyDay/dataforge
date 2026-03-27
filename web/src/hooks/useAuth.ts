import { useState, useCallback } from "react";

const TOKEN_KEY = "dataforge_token";

export interface AuthUser {
  email: string;
  tier: "free" | "pro" | "enterprise";
  id: number;
}

export function useAuth() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));

  const login = useCallback((t: string) => {
    localStorage.setItem(TOKEN_KEY, t);
    setToken(t);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
  }, []);

  return { token, login, logout, isLoggedIn: token !== null };
}
