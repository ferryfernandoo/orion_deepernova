import { useState, useEffect } from 'react';
import ChatBot from './components/ChatBot'
import Login from './components/Login'
import './App.css'

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isGuest, setIsGuest] = useState(false);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuth();

    const params = new URLSearchParams(window.location.search);
    if (params.get('session_started')) {
      checkAuth();
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  const apiUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

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
      // Check for client-side guest session first
      const guestSessionStr = localStorage.getItem('guestSession');
      if (guestSessionStr) {
        try {
          const guestUser = JSON.parse(guestSessionStr);
          if (guestUser.guest) {
            setIsAuthenticated(false);
            setIsGuest(true);
            setUser(guestUser);
            setLoading(false);
            return;
          }
        } catch (e) {
          console.log('Invalid guest session in localStorage');
          localStorage.removeItem('guestSession');
        }
      }
      
      // Otherwise try server auth
      const response = await fetch(`${apiUrl}/auth/me`, {
        credentials: 'include'
      });

      if (!response.ok) {
        if (response.status === 401) {
          setIsAuthenticated(false);
          setIsGuest(false);
          setUser(null);
        } else {
          const data = await parseResponse(response);
          throw new Error(data.error || 'Auth check failed');
        }
      } else {
        const data = await parseResponse(response);
        if (data.authenticated) {
          setIsAuthenticated(true);
          setIsGuest(false);
          setUser(data.user || null);
        } else if (data.guest) {
          setIsAuthenticated(false);
          setIsGuest(true);
          setUser(data.user || null);
        } else {
          setIsAuthenticated(false);
          setIsGuest(false);
          setUser(null);
        }
      }
    } catch (error) {
      console.error('Auth check error:', error);
      setIsAuthenticated(false);
      setIsGuest(false);
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const handleLoginSuccess = (userData) => {
    setIsAuthenticated(true);
    setIsGuest(false);
    setUser(userData);
  };

  const handleGuestLogin = (guestUser) => {
    setIsAuthenticated(false);
    setIsGuest(true);
    setUser(guestUser || { name: 'Guest', email: 'guest@deepernova.com', guest: true });
  };

  const handleSignupSuccess = (userData) => {
    setIsAuthenticated(true);
    setIsGuest(false);
    setUser(userData);
  };

  const handleLogout = async () => {
    const apiUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';
    try {
      await fetch(`${apiUrl}/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      });
    } catch (error) {
      console.error('Logout request failed:', error);
    } finally {
      setIsAuthenticated(false);
      setIsGuest(false);
      setUser(null);
    }
  };

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>Loading...</div>;
  }

  if (!isAuthenticated && !isGuest) {
    return <Login onLoginSuccess={handleLoginSuccess} onGuestLogin={handleGuestLogin} onSignupSuccess={handleSignupSuccess} />;
  }

  return (
    <>
      <ChatBot user={user} onLogout={handleLogout} />
    </>
  )
}

export default App
