import React, { useState } from 'react';
import { useUser } from '../../contexts/UserContext';
import { LogIn, UserPlus } from 'lucide-react';
import { useToast } from '../../components/Toast';

export const AuthModule: React.FC<{ onSuccess: () => void }> = ({ onSuccess }) => {
    const [isLogin, setIsLogin] = useState(true);
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const { login, register } = useUser();
    const { showToast } = useToast();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            if (isLogin) {
                await login(username, password);
                showToast('Logged in successfully', 'success');
            } else {
                await register(username, password);
                showToast('Registered successfully', 'success');
            }
            onSuccess();
        } catch (err: any) {
            showToast(err.message, 'error');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex flex-col items-center justify-center p-8 bg-slate-800 rounded-lg shadow-xl max-w-md w-full mx-auto mt-10 border border-slate-700">
            <div className="mb-6 text-center">
                <h2 className="text-2xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent mb-2">
                    {isLogin ? 'Welcome Back' : 'Create Account'}
                </h2>
                <p className="text-slate-400">
                    {isLogin ? 'Sign in to access your saved decks' : 'Join the drafts and track your history'}
                </p>
            </div>

            <form onSubmit={handleSubmit} className="w-full space-y-4">
                <div>
                    <label className="block text-sm font-medium text-slate-400 mb-1">Username</label>
                    <input
                        type="text"
                        className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white focus:ring-2 focus:ring-purple-500 outline-none transition-all"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        required
                        minLength={3}
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-400 mb-1">Password</label>
                    <input
                        type="password"
                        className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white focus:ring-2 focus:ring-purple-500 outline-none transition-all"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        minLength={6}
                    />
                </div>

                <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-bold py-3 px-4 rounded transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                    {loading ? (
                        <span className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                    ) : isLogin ? (
                        <><LogIn className="w-5 h-5" /> Sign In</>
                    ) : (
                        <><UserPlus className="w-5 h-5" /> Create Account</>
                    )}
                </button>
            </form>

            <div className="mt-6 text-center">
                <button
                    onClick={() => setIsLogin(!isLogin)}
                    className="text-slate-400 hover:text-white text-sm transition-colors"
                >
                    {isLogin ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
                </button>
            </div>
        </div>
    );
};
