import React, { useEffect, useState } from 'react';
import './Login.css';

const Login = ({ onLoginSuccess, onGuestLogin, onSignupSuccess }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [signupLoading, setSignupLoading] = useState(false);

  useEffect(() => {
    const parseResponse = async (response) => {
      const text = await response.text();
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        return JSON.parse(text);
      }
      throw new Error(text || `Unexpected response type: ${contentType}`);
    };

    const checkAuth = async () => {
      try {
        const apiUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';
        const response = await fetch(`${apiUrl}/auth/me`, {
          credentials: 'include'
        });

        if (!response.ok) {
          if (response.status !== 401) {
            const data = await parseResponse(response);
            throw new Error(data.error || 'Failed to check authentication');
          }
          setUser(null);
        } else {
          const data = await parseResponse(response);
          if (data.authenticated) {
            setUser(data.user);
            onLoginSuccess?.(data.user);
          } else if (data.guest) {
            setUser(data.user);
            onGuestLogin?.(data.user);
          } else {
            setUser(null);
          }
        }
      } catch (err) {
        console.error('Auth check error:', err);
        setError(err.message || 'Failed to check authentication');
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
  }, [onLoginSuccess, onGuestLogin]);

  const handleGoogleLogin = () => {
    const apiUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';
    window.location.href = `${apiUrl}/auth/google`;
  };

  const handleGuestLogin = async () => {
    try {
      setError(null);
      // Client-side only - no server needed
      const guestUser = { 
        name: 'Guest', 
        email: 'guest@deepernova.com', 
        guest: true 
      };
      
      // Store in localStorage for persistence
      localStorage.setItem('guestSession', JSON.stringify(guestUser));
      
      onGuestLogin?.(guestUser);
    } catch (err) {
      console.error('Guest login error:', err);
      setError(err.message || 'Guest login failed');
    }
  };

  const handleSignup = async (event) => {
    event.preventDefault();
    setError(null);

    const normalizedEmail = email.trim().toLowerCase();
    if (!name.trim()) return setError('Nama harus diisi.');
    if (!normalizedEmail) return setError('Email harus diisi.');
    if (!normalizedEmail.endsWith('@deepernova.com')) {
      return setError('Email harus menggunakan domain @deepernova.com.');
    }

    setSignupLoading(true);
    try {
      const apiUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';
      const response = await fetch(`${apiUrl}/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: name.trim(), email: normalizedEmail })
      });
      const text = await response.text();
      const contentType = response.headers.get('content-type') || '';
      const data = contentType.includes('application/json') ? JSON.parse(text) : null;

      if (!response.ok) {
        throw new Error(data?.error || text || 'Signup failed');
      }

      setName('');
      setEmail('');
      onSignupSuccess?.(data?.user);
    } catch (err) {
      console.error('Signup error:', err);
      setError(err.message || 'Signup failed');
    } finally {
      setSignupLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      // Clear guest session from localStorage
      localStorage.removeItem('guestSession');
      
      const apiUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';
      await fetch(`${apiUrl}/auth/logout`, {
        method: 'POST',
        credentials: 'include'
      });
      setUser(null);
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  if (loading) {
    return (
      <div className="login-container">
        <div className="login-box">
          <h2>Orion AI</h2>
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  if (user) {
    return (
      <div className="login-container">
        <div className="login-box user-info">
          {user.picture && <img src={user.picture} alt={user.name} className="user-avatar" />}
          <h2>Selamat datang! 👋</h2>
          <p className="user-name">{user.name}</p>
          <p className="user-email">{user.email}</p>
          {user.guest && <p className="guest-note">Anda sedang menggunakan mode Guest.</p>}
          <button className="logout-btn" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="login-container">
      <div className="login-box">
        <h1>🚀 Orion AI</h1>
        <p className="subtitle">Chat dengan AI yang pintar dan responsif</p>

        {error && <div className="error-message">{error}</div>}

        <button className="google-login-btn" onClick={handleGoogleLogin}>
          <svg className="google-icon" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.0 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          Login dengan Google
        </button>

        <button className="guest-login-btn" onClick={handleGuestLogin}>
          Masuk sebagai Guest
        </button>

        <div className="divider">atau buat akun @deepernova.com</div>

        <form className="signup-card" onSubmit={handleSignup}>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nama lengkap"
            aria-label="Nama lengkap"
          />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="email@deepernova.com"
            aria-label="Email @deepernova.com"
          />
          <button className="signup-btn" type="submit" disabled={signupLoading}>
            {signupLoading ? 'Membuat akun...' : 'Buat akun DeeperNova'}
          </button>
        </form>

        <p className="info-text">
          Silahkan login untuk:
        </p>
        <ul className="features-list">
          <li>💾 Simpan riwayat chat Anda</li>
          <li>⚡ Akses di berbagai perangkat</li>
          <li>📝 Kelola session dan preferensi</li>
          <li>🔒 Data aman dan terlindungi</li>
        </ul>
      </div>
    </div>
  );
};

export default Login;
