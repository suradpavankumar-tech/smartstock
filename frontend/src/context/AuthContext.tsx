import React, { createContext, useContext, useState, useEffect } from "react";
import { User, BusinessSummary } from "../types";
import { api } from "../services/api";

interface AuthContextType {
  user: User | null;
  currentBusiness: BusinessSummary | null;
  businesses: BusinessSummary[];
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, pass: string) => Promise<void>;
  register: (data: any) => Promise<void>;
  switchBusiness: (businessId: number) => Promise<void>;
  logout: () => void;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  currentBusiness: null,
  businesses: [],
  token: null,
  isAuthenticated: false,
  isLoading: true,
  login: async () => {},
  register: async () => {},
  switchBusiness: async () => {},
  logout: () => {},
  refreshProfile: async () => {},
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [currentBusiness, setCurrentBusiness] = useState<BusinessSummary | null>(null);
  const [businesses, setBusinesses] = useState<BusinessSummary[]>([]);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem("smartstock_token"));
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const refreshProfile = async () => {
    try {
      const data = await api.getMe();
      setUser(data.user);
      setBusinesses(data.businesses);
      // If active business already saved, verify it's still accessible
      const savedBizId = localStorage.getItem("smartstock_active_business_id");
      if (savedBizId) {
        const found = data.businesses.find((b) => b.id === Number(savedBizId));
        if (found) {
          setCurrentBusiness(found);
          return;
        }
      }
      // Otherwise default directly to user's first business
      if (data.current_business) {
        setCurrentBusiness(data.current_business);
        localStorage.setItem("smartstock_active_business_id", data.current_business.id.toString());
      }
    } catch (err) {
      console.error("Failed to load user profile:", err);
      logout();
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      refreshProfile();
    } else {
      setIsLoading(false);
    }

    const handleLogoutEvent = () => logout();
    window.addEventListener("auth:logout", handleLogoutEvent);
    return () => window.removeEventListener("auth:logout", handleLogoutEvent);
  }, [token]);

  const login = async (email: string, pass: string) => {
    const res = await api.login(email, pass);
    localStorage.setItem("smartstock_token", res.access_token);
    if (res.business_id) {
      localStorage.setItem("smartstock_active_business_id", res.business_id.toString());
    }
    setToken(res.access_token);
    await refreshProfile();
  };

  const register = async (data: any) => {
    const res = await api.register(data);
    localStorage.setItem("smartstock_token", res.access_token);
    if (res.business_id) {
      localStorage.setItem("smartstock_active_business_id", res.business_id.toString());
    }
    setToken(res.access_token);
    await refreshProfile();
  };

  const switchBusiness = async (businessId: number) => {
    const res = await api.switchBusiness(businessId);
    localStorage.setItem("smartstock_token", res.access_token);
    localStorage.setItem("smartstock_active_business_id", res.business_id.toString());
    setToken(res.access_token);
    await refreshProfile();
  };

  const logout = () => {
    localStorage.removeItem("smartstock_token");
    localStorage.removeItem("smartstock_active_business_id");
    setToken(null);
    setUser(null);
    setCurrentBusiness(null);
    setBusinesses([]);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        currentBusiness,
        businesses,
        token,
        isAuthenticated: !!token && !!user,
        isLoading,
        login,
        register,
        switchBusiness,
        logout,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
