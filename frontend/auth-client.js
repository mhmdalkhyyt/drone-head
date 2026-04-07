/* ═══════════════════════════════════════════════════════════════
   Drone Command Center — Authentication Client Module
   Handles auth state, API calls with auth headers, and redirects
   ═══════════════════════════════════════════════════════════════ */

const AuthClient = {
  token: null,
  user: null,

  // Initialize auth state from localStorage
  init() {
    this.token = localStorage.getItem('token');
    const userStr = localStorage.getItem('user');
    this.user = userStr ? JSON.parse(userStr) : null;
    return this.isAuthenticated();
  },

  // Check if user is authenticated
  isAuthenticated() {
    return !!this.token && !!this.user;
  },

  // Verify token with server
  async verifyToken() {
    if (!this.token) {
      this.logout();
      return false;
    }

    try {
      const res = await fetch('/api/auth/me', {
        headers: {
          'Authorization': `Bearer ${this.token}`
        }
      });

      if (!res.ok) {
        this.logout();
        return false;
      }

      const data = await res.json();
      this.user = data.user;
      localStorage.setItem('user', JSON.stringify(this.user));
      return true;
    } catch (error) {
      console.error('Token verification failed:', error);
      this.logout();
      return false;
    }
  },

  // Login user
  async login(username, password) {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Login failed');
      }

      const data = await res.json();
      this.token = data.token;
      this.user = data.user;
      
      localStorage.setItem('token', this.token);
      localStorage.setItem('user', JSON.stringify(this.user));
      
      return data;
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    }
  },

  // Register new user
  async register(username, password) {
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Registration failed');
      }

      const data = await res.json();
      this.token = data.token;
      this.user = data.user;
      
      localStorage.setItem('token', this.token);
      localStorage.setItem('user', JSON.stringify(this.user));
      
      return data;
    } catch (error) {
      console.error('Registration error:', error);
      throw error;
    }
  },

  // Logout user
  logout() {
    this.token = null;
    this.user = null;
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  },

  // Get auth header
  getAuthHeader() {
    return this.token ? `Bearer ${this.token}` : null;
  },

  // API call with automatic auth handling
  async apiCall(endpoint, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    const authHeader = this.getAuthHeader();
    if (authHeader) {
      headers['Authorization'] = authHeader;
    }

    try {
      const res = await fetch(`/api${endpoint}`, {
        ...options,
        headers,
      });

      // Handle authentication errors
      if (res.status === 401 || res.status === 403) {
        this.logout();
        
        // Redirect to login if not already there
        const currentPath = window.location.pathname;
        if (!currentPath.includes('/login') && !currentPath.includes('/auth')) {
          window.location.href = '/login/login.html';
        }
        
        throw new Error('Authentication required');
      }

      // Handle not found
      if (res.status === 404) {
        const error = await res.json().catch(() => ({ error: 'Not found' }));
        throw new Error(error.error || 'Not found');
      }

      // Handle server errors
      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(error.error || 'Request failed');
      }

      // Handle empty responses
      const contentType = res.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        return await res.json();
      }
      
      return await res.text();
    } catch (error) {
      if (error.message !== 'Authentication required') {
        console.error('API call error:', error);
      }
      throw error;
    }
  },

  // HTTP method helpers
  async get(endpoint) {
    return this.apiCall(endpoint, { method: 'GET' });
  },

  async post(endpoint, body) {
    return this.apiCall(endpoint, {
      method: 'POST',
      body: JSON.stringify(body)
    });
  },

  async put(endpoint, body) {
    return this.apiCall(endpoint, {
      method: 'PUT',
      body: JSON.stringify(body)
    });
  },

  async patch(endpoint, body) {
    return this.apiCall(endpoint, {
      method: 'PATCH',
      body: JSON.stringify(body)
    });
  },

  async delete(endpoint) {
    return this.apiCall(endpoint, { method: 'DELETE' });
  },

  // Redirect to login if not authenticated
  requireAuth() {
    if (!this.isAuthenticated()) {
      window.location.href = '/login/login.html';
      return false;
    }
    return true;
  },

  // Get user display name
  getDisplayName() {
    if (this.user) {
      return this.user.username || `User ${this.user.id}`;
    }
    return 'Guest';
  }
};

// Auto-initialize on load
AuthClient.init();

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AuthClient;
}