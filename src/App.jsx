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
      const apiUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';
      
      // Always check server session first to verify auth state
      const response = await fetch(`${apiUrl}/auth/me`, {
        credentials: 'include'
      });

      if (response.ok) {
        // Server recognizes the session
        const data = await parseResponse(response);
        if (data.authenticated) {
          setIsAuthenticated(true);
          setIsGuest(false);
          setUser(data.user || null);
          // Update localStorage with server data
          localStorage.setItem('authUser', JSON.stringify(data.user));
          localStorage.removeItem('guestSession');
          setLoading(false);
          return;
        } else if (data.guest) {
          setIsAuthenticated(false);
          setIsGuest(true);
          setUser(data.user || null);
          localStorage.setItem('guestSession', JSON.stringify(data.user || { guest: true }));
          localStorage.removeItem('authUser');
          setLoading(false);
          return;
        }
      }

      if (response.status === 401) {
        // Server doesn't recognize session - check localStorage for cached auth
        const authUserStr = localStorage.getItem('authUser');
        if (authUserStr) {
          try {
            const authUser = JSON.parse(authUserStr);
            if (authUser.id && authUser.email) {
              // Use cached auth, but it might be stale
              console.log('[App] Using cached authUser from localStorage:', authUser.email);
              setIsAuthenticated(true);
              setIsGuest(false);
              setUser(authUser);
              setLoading(false);
              return;
            }
          } catch (e) {
            console.log('Invalid authUser in localStorage');
            localStorage.removeItem('authUser');
          }
        }

        // Check for guest session
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

        // No auth found anywhere
        setIsAuthenticated(false);
        setIsGuest(false);
        setUser(null);
        setLoading(false);
        return;
      }

      // Other errors
      const data = await parseResponse(response);
      throw new Error(data.error || 'Auth check failed');

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
    // Save auth state to localStorage for persistence across reload
    localStorage.setItem('authUser', JSON.stringify(userData));
    localStorage.removeItem('guestSession'); // Clear guest session if switching from guest
    console.log('[App] User logged in and saved to localStorage:', userData.email);
  };

  const handleGuestLogin = (guestUser) => {
    setIsAuthenticated(false);
    setIsGuest(true);
    const guest = guestUser || { name: 'Guest', email: 'guest@deepernova.com', guest: true };
    setUser(guest);
    // Save guest session to localStorage
    localStorage.setItem('guestSession', JSON.stringify(guest));
    localStorage.removeItem('authUser'); // Clear authenticated user if switching to guest
    console.log('[App] Guest session started');
  };

  const handleSignupSuccess = (userData) => {
    setIsAuthenticated(true);
    setIsGuest(false);
    setUser(userData);
    // Save auth state to localStorage for persistence across reload
    localStorage.setItem('authUser', JSON.stringify(userData));
    localStorage.removeItem('guestSession'); // Clear guest session if switching from guest
    console.log('[App] User signed up and saved to localStorage:', userData.email);
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
      // Clear auth from localStorage
      localStorage.removeItem('authUser');
      localStorage.removeItem('guestSession');
      localStorage.removeItem('chatbot_conversations');
      console.log('[App] User logged out and localStorage cleared');
      
      setIsAuthenticated(false);
      setIsGuest(false);
      setUser(null);
    }
  };

  if (loading) {
    console.log('[App] Rendering: Loading...');
    return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>Loading...</div>;
  }

  if (!isAuthenticated && !isGuest) {
    console.log('[App] Rendering: Login (not authenticated, not guest)');
    return <Login onLoginSuccess={handleLoginSuccess} onGuestLogin={handleGuestLogin} onSignupSuccess={handleSignupSuccess} />;
  }

  console.log(`[App] Rendering: ChatBot (isAuthenticated=${isAuthenticated}, isGuest=${isGuest})`);
  return (
    <>
      <ChatBot user={user} isAuthenticated={isAuthenticated} isGuest={isGuest} onLogout={handleLogout} />
    </>
  )
}

export default App
