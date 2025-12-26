import React, { createContext, useContext, useState, useEffect } from 'react';

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
            const res = await fetch('/api/user/me', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const userData = await res.json();
                setUser(userData);
            } else {
                logout();
            }
        } catch (e) {
            console.error(e);
            logout();
        }
    };

    const login = async (username: string, password: string) => {
        const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        setToken(data.token);
        setUser(data.user);
        localStorage.setItem('authToken', data.token);
    };

    const register = async (username: string, password: string) => {
        const res = await fetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

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
        const res = await fetch('/api/user/decks', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ ...deck, format })
        });
        if (!res.ok) throw new Error("Failed to save deck");
        await refreshUser();
    };

    const updateDeck = async (deckId: string, deckData: any, format?: string) => {
        if (!token) throw new Error("Not logged in");
        const res = await fetch(`/api/user/decks/${deckId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ ...deckData, format })
        });
        if (!res.ok) throw new Error("Failed to update deck");
        await refreshUser();
    };

    const deleteDeck = async (deckId: string) => {
        if (!token) throw new Error("Not logged in");
        const res = await fetch(`/api/user/decks/${deckId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        if (!res.ok) throw new Error("Failed to delete deck");
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
