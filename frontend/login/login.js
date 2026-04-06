// API Base URL
const API_URL = window.location.origin;

// DOM Elements
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const deletePanel = document.getElementById('delete-panel');
const loginFormEl = document.getElementById('login-form-el');
const registerFormEl = document.getElementById('register-form-el');
const deleteForm = document.getElementById('delete-form');

// Error displays
const loginError = document.getElementById('login-error');
const registerError = document.getElementById('register-error');
const deleteError = document.getElementById('delete-error');

// Toggle between login and register
document.getElementById('show-register').addEventListener('click', () => {
  loginForm.classList.add('hidden');
  registerForm.classList.remove('hidden');
  clearErrors();
});

document.getElementById('show-login').addEventListener('click', () => {
  registerForm.classList.add('hidden');
  loginForm.classList.remove('hidden');
  clearErrors();
});

// Toggle delete panel
document.getElementById('show-delete').addEventListener('click', () => {
  deletePanel.classList.toggle('hidden');
  clearErrors();
});

document.getElementById('cancel-delete').addEventListener('click', () => {
  deletePanel.classList.add('hidden');
  deleteForm.reset();
  clearErrors();
});

// Clear all errors
function clearErrors() {
  loginError.classList.add('hidden');
  registerError.classList.add('hidden');
  deleteError.classList.add('hidden');
}

// Show error
function showError(element, message) {
  element.textContent = message;
  element.classList.remove('hidden');
}

// Login form submission
loginFormEl.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearErrors();

  const username = document.getElementById('login-username').value;
  const password = document.getElementById('login-password').value;

  try {
    const response = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ username, password })
    });

    // Check if response is OK before trying to parse JSON
    if (!response.ok) {
      let errorMessage = 'Login failed';
      try {
        const errorData = await response.json();
        errorMessage = errorData.error || errorMessage;
      } catch {
        // If we can't parse the error response, use status text
        errorMessage = response.statusText || errorMessage;
      }
      throw new Error(errorMessage);
    }

    // Parse JSON response
    let data;
    try {
      const text = await response.text();
      if (!text) {
        throw new Error('Empty response from server');
      }
      data = JSON.parse(text);
    } catch (parseError) {
      throw new Error('Invalid response from server: ' + parseError.message);
    }

    // Validate response has required data
    if (!data.token || !data.user) {
      throw new Error('Invalid server response');
    }

    // Store token and user info
    localStorage.setItem('authToken', data.token);
    localStorage.setItem('currentUser', JSON.stringify(data.user));

    // Redirect to main app
    window.location.href = '/index.html';
  } catch (error) {
    showError(loginError, error.message);
  }
});

// Register form submission
registerFormEl.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearErrors();

  const username = document.getElementById('register-username').value;
  const password = document.getElementById('register-password').value;
  const confirm = document.getElementById('register-confirm').value;

  // Validate passwords match
  if (password !== confirm) {
    showError(registerError, 'Passwords do not match');
    return;
  }

  // Validate password length
  if (password.length < 6) {
    showError(registerError, 'Password must be at least 6 characters');
    return;
  }

  try {
    const response = await fetch(`${API_URL}/api/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ username, password })
    });

    // Check if response is OK before trying to parse JSON
    if (!response.ok) {
      let errorMessage = 'Registration failed';
      try {
        const errorData = await response.json();
        errorMessage = errorData.error || errorMessage;
      } catch {
        // If we can't parse the error response, use status text
        errorMessage = response.statusText || errorMessage;
      }
      throw new Error(errorMessage);
    }

    // Parse JSON response
    let data;
    try {
      const text = await response.text();
      if (!text) {
        throw new Error('Empty response from server');
      }
      data = JSON.parse(text);
    } catch (parseError) {
      throw new Error('Invalid response from server: ' + parseError.message);
    }

    // Validate response has required data
    if (!data.token || !data.user) {
      throw new Error('Invalid server response');
    }

    // Auto-login after registration
    localStorage.setItem('authToken', data.token);
    localStorage.setItem('currentUser', JSON.stringify(data.user));

    // Redirect to main app
    window.location.href = '/index.html';
  } catch (error) {
    showError(registerError, error.message);
  }
});

// Delete account form submission
deleteForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearErrors();

  const username = document.getElementById('delete-username').value;
  const password = document.getElementById('delete-password').value;

  try {
    // First, login to get a token
    const loginResponse = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ username, password })
    });

    if (!loginResponse.ok) {
      let errorMessage = 'Invalid credentials';
      try {
        const errorData = await loginResponse.json();
        errorMessage = errorData.error || errorMessage;
      } catch {
        errorMessage = loginResponse.statusText || errorMessage;
      }
      throw new Error(errorMessage);
    }

    let loginData;
    try {
      const text = await loginResponse.text();
      if (!text) {
        throw new Error('Empty response from server');
      }
      loginData = JSON.parse(text);
    } catch (parseError) {
      throw new Error('Invalid response from server: ' + parseError.message);
    }

    // Delete the account
    const deleteResponse = await fetch(`${API_URL}/api/auth/user`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${loginData.token}`
      }
    });

    if (!deleteResponse.ok) {
      let errorMessage = 'Failed to delete account';
      try {
        const errorData = await deleteResponse.json();
        errorMessage = errorData.error || errorMessage;
      } catch {
        errorMessage = deleteResponse.statusText || errorMessage;
      }
      throw new Error(errorMessage);
    }

    let deleteData;
    try {
      const text = await deleteResponse.text();
      if (!text) {
        throw new Error('Empty response from server');
      }
      deleteData = JSON.parse(text);
    } catch (parseError) {
      throw new Error('Invalid response from server: ' + parseError.message);
    }

    // Clear any stored data
    localStorage.removeItem('authToken');
    localStorage.removeItem('currentUser');

    // Show success and redirect
    alert('Account deleted successfully');
    window.location.href = '/login/login.html';
  } catch (error) {
    showError(deleteError, error.message);
  }
});

// Check if already logged in
window.addEventListener('DOMContentLoaded', () => {
  const token = localStorage.getItem('authToken');
  if (token) {
    // Verify token is still valid
    fetch(`${API_URL}/api/auth/me`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    })
    .then(async (res) => {
      if (!res.ok) {
        throw new Error('Token invalid');
      }
      const text = await res.text();
      if (!text) {
        throw new Error('Empty response');
      }
      return JSON.parse(text);
    })
    .then(data => {
      if (data.user) {
        // Already logged in, redirect to main app
        window.location.href = '/index.html';
      }
    })
    .catch(() => {
      // Token invalid, clear it
      localStorage.removeItem('authToken');
      localStorage.removeItem('currentUser');
    });
  }
});
