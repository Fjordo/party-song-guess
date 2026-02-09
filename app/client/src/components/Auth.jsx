import React, { useState } from 'react';
import { signUp, signIn } from '../services/supabaseClient';
import { t } from '../i18n';

export default function Auth({ onAuthSuccess }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const scrollbarStyle = `
    .custom-scrollbar::-webkit-scrollbar {
      width: 6px;
      height: 6px;
    }
    .custom-scrollbar::-webkit-scrollbar-track {
      background: rgba(0, 0, 0, 0.2);
      border-radius: 4px;
    }
    .custom-scrollbar::-webkit-scrollbar-thumb {
      background: #4b5563;
      border-radius: 4px;
    }
    .custom-scrollbar::-webkit-scrollbar-thumb:hover {
      background: #6b7280;
    }
  `;

  const handleAuth = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isSignUp) {
        // Registrazione - passa l'username (opzionale)
        const { error: signUpError } = await signUp(email, password, username);
        if (signUpError) throw signUpError;

        setEmail('');
        setPassword('');
        setUsername('');
        setError('');
        alert('✅ Registrazione completata! Controlla la tua email per verificare l\'account.');
        setIsSignUp(false);
      } else {
        // Login
        const { error: signInError } = await signIn(email, password);
        if (signInError) throw signInError;
        onAuthSuccess();
      }
    } catch (err) {
      setError(err.message || 'Errore durante l\'autenticazione');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-900 text-white flex flex-col overflow-hidden">
      <style>{scrollbarStyle}</style>

      <div className="flex-1 overflow-y-auto p-4 w-full custom-scrollbar">
        <div className="flex flex-col items-center justify-center min-h-full py-8">
          {/* Header */}
          <div className="text-center mb-8 flex-shrink-0">
            <h1 className="text-4xl sm:text-5xl font-bold mb-3 text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-600">
              Party Song Guess
            </h1>
            <p className="text-gray-400 text-sm">
              {isSignUp ? 'Crea un nuovo account' : 'Accedi al tuo account'}
            </p>
          </div>

          {/* Card Container */}
          <div className="w-full max-w-md bg-gray-800 rounded-xl p-8 shadow-2xl border border-gray-700">
            {/* Form */}
            <form onSubmit={handleAuth} className="space-y-5">
              {/* Username (mostrato solo durante Sign Up) */}
              {isSignUp && (
                <div>
                  <label htmlFor="username" className="block text-sm font-semibold text-gray-300 mb-2">
                    Nome Utente (opzionale)
                  </label>
                  <input
                    id="username"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="il_tuo_username"
                    maxLength={30}
                    className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition"
                  />
                  <p className="text-xs text-gray-400 mt-1">Se non inserito, useremo la parte prima della tua email</p>
                </div>
              )}

              {/* Email */}
              <div>
                <label htmlFor="email" className="block text-sm font-semibold text-gray-300 mb-2">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="tua@email.com"
                  required
                  className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition"
                />
              </div>

              {/* Password */}
              <div>
                <label htmlFor="password" className="block text-sm font-semibold text-gray-300 mb-2">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={6}
                  className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition"
                />
                {isSignUp && <p className="text-xs text-gray-400 mt-1">Minimo 6 caratteri</p>}
              </div>

              {/* Error Message */}
              {error && (
                <div className="p-4 bg-red-900/50 border border-red-600 text-red-200 rounded-lg text-sm">
                  ⚠️ {error}
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-bold rounded-lg hover:from-purple-700 hover:to-pink-700 transition disabled:opacity-50 mt-6"
              >
                {loading ? '⏳ Attendere...' : isSignUp ? '✍️ Registrati' : '🎮 Accedi'}
              </button>
            </form>

            {/* Divider */}
            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-600"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-gray-800 text-gray-400">oppure</span>
              </div>
            </div>

            {/* Toggle Sign Up / Sign In */}
            <button
              type="button"
              onClick={() => {
                setIsSignUp(!isSignUp);
                setError('');
                setEmail('');
                setPassword('');
                setUsername('');
              }}
              className="w-full py-3 bg-gray-700 hover:bg-gray-600 text-white font-semibold rounded-lg transition"
            >
              {isSignUp ? '🔐 Hai già un account? Accedi' : '📝 Non hai un account? Registrati'}
            </button>

            {/* Guest Mode */}
            <button
              onClick={onAuthSuccess}
              className="w-full py-3 mt-4 text-gray-300 font-semibold rounded-lg border border-gray-600 hover:bg-gray-700/50 transition"
            >
              👤 Continua come ospite
            </button>
          </div>

          {/* Footer Info */}
          <p className="text-center text-gray-500 text-xs mt-8 max-w-md px-4">
            I tuoi dati sono gestiti in modo sicuro da Supabase con crittografia end-to-end
          </p>
        </div>
      </div>
    </div>
  );
}
