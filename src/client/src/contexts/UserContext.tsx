import React, { createContext, useContext, useState, useEffect } from 'react';
import { ApiService } from '../services/ApiService';

interface User {
  id: string;
  username: string;
  decks: SavedDeck[];
  matchHistory: any[];
  createdAt: number;
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
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  logout: () => void;
  saveDeck: (deck: any, format?: string) => Promise<void>;
  updateDeck: (deckId: string, deckData: any, format?: string) => Promise<void>;
  deleteDeck: (deckId: string) => Promise<void>;
  refreshUser: () => Promise<void>;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export const UserProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('authToken'));

  useEffect(() => {
    if (token) {
      refreshUser();
    }
  }, [token]);

  const refreshUser = async () => {
    if (!token) return;
    try {
      const userData = await ApiService.get<User>('/api/user/me');
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

  const saveDeck = async (deck: any, format?: string) => {
    if (!token) throw new Error("Not logged in");
    await ApiService.post('/api/user/decks', { ...deck, format });
    await refreshUser();
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

  return (
    <UserContext.Provider value={{ user, token, login, register, logout, saveDeck, updateDeck, deleteDeck, refreshUser }}>
      {children}
    </UserContext.Provider>
  );
};

export const useUser = () => {
  const context = useContext(UserContext);
  if (!context) throw new Error('useUser must be used within a UserProvider');
  return context;
};
