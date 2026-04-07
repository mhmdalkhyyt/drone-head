// Authentication and State Management for Drone Command Center

const API_URL = window.location.origin;

// Global state
let currentUser = null;
let authToken = null;
let savedStates = [];

// DOM Elements
const userInfo = document.getElementById('user-info');
const currentUserEl = document.getElementById('current-user');
const btnLogout = document.getElementById('btn-logout');
const btnSaveState = document.getElementById('btn-save-state');
const btnLoadState = document.getElementById('btn-load-state');
const btnDeleteState = document.getElementById('btn-delete-state');
const stateSelect = document.getElementById('state-select');
const stateNameInput = document.getElementById('state-name');

// Initialize authentication
async function initAuth() {
  // Get stored token
  authToken = localStorage.getItem('token');
  const storedUser = localStorage.getItem('user');
  
  if (storedUser) {
    try {
      currentUser = JSON.parse(storedUser);
    } catch (e) {
      localStorage.removeItem('user');
      authToken = null;
    }
  }
  
  if (!authToken || !currentUser) {
    // Not authenticated, redirect to login
    window.location.href = '/login/login.html';
    return false;
  }
  
  // Verify token is still valid
  try {
    const response = await fetch(`${API_URL}/api/auth/me`, {
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });
    
    if (!response.ok) {
      throw new Error('Token invalid');
    }
    
    const data = await response.json();
    currentUser = data.user;
    
    // Show user info
    updateUserInfo();
    return true;
  } catch (error) {
    console.error('Token verification failed:', error);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login/login.html';
    return false;
  }
}

// Update user info display
function updateUserInfo() {
  if (currentUser && currentUser.username) {
    currentUserEl.textContent = currentUser.username;
    userInfo.classList.remove('hidden');
  }
}

// Logout
async function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  authToken = null;
  currentUser = null;
  window.location.href = '/login/login.html';
}

// Event listeners
if (btnLogout) {
  btnLogout.addEventListener('click', logout);
}

// ─── State Management ─────────────────────────────────────────────────────────

// Get current application state
function getCurrentAppState() {
  // Collect all the current state from the application
  const state = {
    timestamp: new Date().toISOString(),
    drones: [],
    hubs: [],
    fleets: [],
    missions: [],
    noGoZones: [],
    groundUnits: [],
    roads: [],
    paths: []
  };
  
  // Try to get data from the app's global variables if they exist
  if (typeof window.drones !== 'undefined') {
    state.drones = window.drones;
  }
  if (typeof window.hubs !== 'undefined') {
    state.hubs = window.hubs;
  }
  if (typeof window.fleets !== 'undefined') {
    state.fleets = window.fleets;
  }
  if (typeof window.missions !== 'undefined') {
    state.missions = window.missions;
  }
  if (typeof window.noGoZones !== 'undefined') {
    state.noGoZones = window.noGoZones;
  }
  if (typeof window.groundUnits !== 'undefined') {
    state.groundUnits = window.groundUnits;
  }
  if (typeof window.roads !== 'undefined') {
    state.roads = window.roads;
  }
  if (typeof window.walkablePaths !== 'undefined') {
    state.paths = window.walkablePaths;
  }
  
  // Also try to fetch from API if available
  return state;
}

// Save state to server
async function saveState(name = null) {
  if (!authToken) {
    alert('You must be logged in to save states');
    return;
  }
  
  const stateName = name || stateNameInput.value || `State ${new Date().toLocaleString()}`;
  const stateData = getCurrentAppState();
  
  try {
    const response = await fetch(`${API_URL}/api/states`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({
        state_data: stateData,
        name: stateName
      })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to save state');
    }
    
    alert('State saved successfully!');
    stateNameInput.value = '';
    loadSavedStates();
  } catch (error) {
    alert(`Error: ${error.message}`);
  }
}

// Load saved states list
async function loadSavedStates() {
  if (!authToken) return;
  
  try {
    const response = await fetch(`${API_URL}/api/states`, {
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });
    
    if (!response.ok) {
      throw new Error('Failed to load states');
    }
    
    const data = await response.json();
    savedStates = data.states || [];
    
    // Update dropdown
    updateStateDropdown();
  } catch (error) {
    console.error('Error loading states:', error);
  }
}

// Update state dropdown
function updateStateDropdown() {
  // Clear existing options except the first one
  while (stateSelect.options.length > 1) {
    stateSelect.remove(1);
  }
  
  // Add saved states
  savedStates.forEach(state => {
    const option = document.createElement('option');
    option.value = state.id;
    option.textContent = `${state.name} - ${new Date(state.saved_at).toLocaleString()}`;
    stateSelect.appendChild(option);
  });
}

// Load state from server
async function loadState() {
  const stateId = stateSelect.value;
  
  if (!stateId) {
    alert('Please select a state to load');
    return;
  }
  
  if (!confirm('Loading this state will replace your current data. Continue?')) {
    return;
  }
  
  try {
    const response = await fetch(`${API_URL}/api/states/${stateId}/load`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to load state');
    }
    
    const data = await response.json();
    const stateData = data.state_data;
    
    // Apply the state to the application
    applyState(stateData);
    
    alert('State loaded successfully!');
  } catch (error) {
    alert(`Error: ${error.message}`);
  }
}

// Apply state to the application
function applyState(stateData) {
  // This function should be called after app.js has initialized
  // It will update the application with the saved state
  
  // Dispatch a custom event that app.js can listen to
  const event = new CustomEvent('stateLoaded', { detail: stateData });
  window.dispatchEvent(event);
  
  // Also try to apply directly if the app's data structures exist
  if (typeof window.applySavedState === 'function') {
    window.applySavedState(stateData);
  }
}

// Delete saved state
async function deleteState() {
  const stateId = stateSelect.value;
  
  if (!stateId) {
    alert('Please select a state to delete');
    return;
  }
  
  if (!confirm('Are you sure you want to delete this state?')) {
    return;
  }
  
  try {
    const response = await fetch(`${API_URL}/api/states/${stateId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to delete state');
    }
    
    alert('State deleted successfully!');
    loadSavedStates();
  } catch (error) {
    alert(`Error: ${error.message}`);
  }
}

// Event listeners for state management
if (btnSaveState) {
  btnSaveState.addEventListener('click', () => saveState());
}

if (btnLoadState) {
  btnLoadState.addEventListener('click', loadState);
}

if (btnDeleteState) {
  btnDeleteState.addEventListener('click', deleteState);
}

// Export for use in other scripts
window.Auth = {
  initAuth,
  logout,
  saveState,
  loadSavedStates,
  loadState,
  deleteState,
  getCurrentAppState,
  applyState
};

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAuth);
} else {
  initAuth();
}