import React, { createContext, useContext, useState, useEffect } from 'react';
import { ApiService } from '../services/ApiService';

interface User {
  id: string;
  username: string;
  email?: string;
  googleId?: string;
  authProvider: 'local' | 'google';
  decks: SavedDeck[];
  matchHistory: any[];
  createdAt: number;
  // Premium subscription fields
  isPremium: boolean;
  premiumSince?: string;
  premiumUntil?: string;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  subscriptionPlan?: 'monthly' | 'yearly';
  subscriptionStatus?: 'active' | 'canceled' | 'past_due';
}

export interface SavedDeck {
  id: string;
  name: string;
  cards: any[];
  createdAt: number;
  format?: string;
}

interface UserContextType {
  user: User | null;
  token: string | null;
  isPremium: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  logout: () => void;
  saveDeck: (deck: any, format?: string) => Promise<SavedDeck>;
  updateDeck: (deckId: string, deckData: any, format?: string) => Promise<void>;
  deleteDeck: (deckId: string) => Promise<void>;
  refreshUser: () => Promise<void>;
  // Premium subscription methods
  subscribe: (plan: 'monthly' | 'yearly') => Promise<void>;
  openBillingPortal: () => Promise<void>;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export const UserProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('authToken'));

  // Handle OAuth callback - check URL for token parameter
  useEffect(() => {
    const handleOAuthCallback = () => {
      const urlParams = new URLSearchParams(window.location.search);
      const oauthToken = urlParams.get('token');
      const path = window.location.pathname;

      // Check if we're on the OAuth callback path with a token
      if (path === '/auth/callback' && oauthToken) {
        // Store the token
        setToken(oauthToken);
        localStorage.setItem('authToken', oauthToken);

        // Clean up the URL (remove token from URL for security)
        window.history.replaceState({}, document.title, '/');

        // Set active tab to profile
        localStorage.setItem('activeTab', 'profile');
      }
    };

    handleOAuthCallback();
  }, []);

  useEffect(() => {
    if (token) {
      refreshUser();
    }
  }, [token]);

  const refreshUser = async () => {
    if (!token) return;
    try {
      const userData = await ApiService.get<User>('/api/auth/me');
      setUser(userData);
    } catch (e) {
      console.error(e);
      logout();
    }
  };

  const login = async (username: string, password: string) => {
    const data = await ApiService.post<{ token: string, user: User, error?: string }>('/api/auth/login', { username, password });

    setToken(data.token);
    setUser(data.user);
    localStorage.setItem('authToken', data.token);
  };

  const register = async (username: string, password: string) => {
    const data = await ApiService.post<{ token: string, user: User, error?: string }>('/api/auth/register', { username, password });

    setToken(data.token);
    setUser(data.user);
    localStorage.setItem('authToken', data.token);
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('authToken');
  };

  const saveDeck = async (deck: any, format?: string): Promise<SavedDeck> => {
    if (!token) throw new Error("Not logged in");
    const savedDeck = await ApiService.post<SavedDeck>('/api/user/decks', { ...deck, format });
    await refreshUser();
    return savedDeck;
  };

  const updateDeck = async (deckId: string, deckData: any, format?: string) => {
    if (!token) throw new Error("Not logged in");
    await ApiService.put(`/api/user/decks/${deckId}`, { ...deckData, format });
    await refreshUser();
  };

  const deleteDeck = async (deckId: string) => {
    if (!token) throw new Error("Not logged in");
    await ApiService.delete(`/api/user/decks/${deckId}`);
    await refreshUser();
  }

  // Premium convenience getter
  const isPremium = user?.isPremium ?? false;

  // Subscribe to premium plan
  const subscribe = async (plan: 'monthly' | 'yearly') => {
    if (!token) throw new Error("Not logged in");
    const data = await ApiService.post<{ url: string }>('/api/payment/stripe/create-session', { plan });
    // Redirect to Stripe Checkout
    window.location.href = data.url;
  };

  // Open Stripe Customer Portal for managing subscription
  const openBillingPortal = async () => {
    if (!token) throw new Error("Not logged in");
    const data = await ApiService.post<{ url: string }>('/api/payment/stripe/portal', {});
    // Redirect to Stripe Portal
    window.location.href = data.url;
  };

  return (
    <UserContext.Provider value={{
      user,
      token,
      isPremium,
      login,
      register,
      logout,
      saveDeck,
      updateDeck,
      deleteDeck,
      refreshUser,
      subscribe,
      openBillingPortal
    }}>
      {children}
    </UserContext.Provider>
  );
};

export const useUser = () => {
  const context = useContext(UserContext);
  if (!context) throw new Error('useUser must be used within a UserProvider');
  return context;
};
