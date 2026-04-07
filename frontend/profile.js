// Profile Page Logic for Drone Command Center

const API_URL = window.location.origin;

// Global state
let currentUser = null;
let authToken = null;
let userProfile = null;

// DOM Elements
const profileForm = document.getElementById('profile-form');
const passwordForm = document.getElementById('password-form');
const btnDeleteAccount = document.getElementById('btn-delete-account');
const btnCancel = document.getElementById('btn-cancel');
const toast = document.getElementById('toast');
const toastMessage = document.getElementById('toast-message');

// Profile fields
const displayNameInput = document.getElementById('display-name');
const emailInput = document.getElementById('email');
const currentPasswordInput = document.getElementById('current-password');
const newPasswordInput = document.getElementById('new-password');
const confirmPasswordInput = document.getElementById('confirm-password');

// Display fields
const profileUsername = document.getElementById('profile-username');
const profileJoined = document.getElementById('profile-joined');
const profileInitial = document.getElementById('profile-initial');

// Initialize authentication
async function initProfile() {
  // Get stored token
  authToken = localStorage.getItem('authToken');
  const storedUser = localStorage.getItem('currentUser');
  
  if (!authToken || !storedUser) {
    window.location.href = '/login/login.html';
    return;
  }
  
  try {
    currentUser = JSON.parse(storedUser);
    
    // Verify token and fetch profile
    const response = await fetch(`${API_URL}/api/auth/me/profile`, {
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });
    
    if (!response.ok) {
      throw new Error('Authentication failed');
    }
    
    const data = await response.json();
    userProfile = data.profile;
    
    // Populate profile fields
    populateProfileFields(data);
    
  } catch (error) {
    console.error('Error loading profile:', error);
    localStorage.removeItem('authToken');
    localStorage.removeItem('currentUser');
    window.location.href = '/login/login.html';
  }
}

// Populate profile fields with data
function populateProfileFields(data) {
  const { user, profile } = data;
  
  profileUsername.textContent = user.username;
  profileJoined.textContent = `Joined: ${new Date(user.created_at).toLocaleDateString()}`;
  profileInitial.textContent = (user.username || 'U').charAt(0).toUpperCase();
  
  // Populate form fields
  if (profile.display_name) {
    displayNameInput.value = profile.display_name;
  }
  if (profile.email) {
    emailInput.value = profile.email;
  }
}

// Show toast notification
function showToast(message, type = 'success') {
  toastMessage.textContent = message;
  toast.className = `toast toast--${type}`;
  
  setTimeout(() => {
    toast.className = 'toast toast--hidden';
  }, 3000);
}

// Handle profile form submission
async function handleProfileSubmit(e) {
  e.preventDefault();
  
  const displayName = displayNameInput.value.trim() || null;
  const email = emailInput.value.trim() || null;
  
  try {
    const response = await fetch(`${API_URL}/api/auth/me/profile`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({ display_name: displayName, email })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to update profile');
    }
    
    const data = await response.json();
    userProfile = data.profile;
    
    // Update display
    profileInitial.textContent = (displayName || currentUser.username).charAt(0).toUpperCase();
    
    showToast('Profile updated successfully!');
  } catch (error) {
    console.error('Error updating profile:', error);
    showToast(error.message, 'error');
  }
}

// Handle password form submission
async function handlePasswordSubmit(e) {
  e.preventDefault();
  
  const currentPassword = currentPasswordInput.value;
  const newPassword = newPasswordInput.value;
  const confirmPassword = confirmPasswordInput.value;
  
  // Validation
  if (newPassword.length < 6) {
    showToast('New password must be at least 6 characters', 'error');
    return;
  }
  
  if (newPassword !== confirmPassword) {
    showToast('New passwords do not match', 'error');
    return;
  }
  
  try {
    const response = await fetch(`${API_URL}/api/auth/me/password`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({ current_password: currentPassword, new_password: newPassword })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to change password');
    }
    
    // Clear password fields
    currentPasswordInput.value = '';
    newPasswordInput.value = '';
    confirmPasswordInput.value = '';
    
    showToast('Password changed successfully!');
  } catch (error) {
    console.error('Error changing password:', error);
    showToast(error.message, 'error');
  }
}

// Handle account deletion
async function handleDeleteAccount() {
  if (!confirm('Are you sure you want to delete your account? This action cannot be undone.')) {
    return;
  }
  
  if (!confirm('This is a DANGEROUS action. Are you REALLY sure?')) {
    return;
  }
  
  try {
    const response = await fetch(`${API_URL}/api/auth/user`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to delete account');
    }
    
    // Clear local storage and redirect to login
    localStorage.removeItem('authToken');
    localStorage.removeItem('currentUser');
    
    showToast('Account deleted successfully');
    setTimeout(() => {
      window.location.href = '/login/login.html';
    }, 1000);
    
  } catch (error) {
    console.error('Error deleting account:', error);
    showToast(error.message, 'error');
  }
}

// Cancel and go back
function handleCancel() {
  window.location.href = 'index.html';
}

// Event listeners
if (profileForm) {
  profileForm.addEventListener('submit', handleProfileSubmit);
}

if (passwordForm) {
  passwordForm.addEventListener('submit', handlePasswordSubmit);
}

if (btnDeleteAccount) {
  btnDeleteAccount.addEventListener('click', handleDeleteAccount);
}

if (btnCancel) {
  btnCancel.addEventListener('click', handleCancel);
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initProfile);
} else {
  initProfile();
}