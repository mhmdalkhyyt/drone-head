/* ═══════════════════════════════════════════════════════════════
   Cookie Policy Management Module
   GDPR Compliant Cookie Consent System
   ═══════════════════════════════════════════════════════════════ */

const COOKIE_CONSENT_KEY = 'gdpr_cookie_consent';
const COOKIE_CONSENT_EXPIRY_DAYS = 365; // 1 year consent validity

/**
 * Cookie Categories Definition
 * Each category defines which cookies belong to it and whether it's required
 */
const COOKIE_CATEGORIES = {
  essential: {
    id: 'essential',
    name: 'Essential Cookies',
    icon: '🔒',
    description: 'These cookies are necessary for the app to function and cannot be switched off. They are usually only set in response to actions made by you such as setting your privacy preferences, logging in, or filling in forms.',
    cookies: ['session', 'auth_token', 'csrf_token', 'user_preferences'],
    required: true
  },
  analytics: {
    id: 'analytics',
    name: 'Analytics Cookies',
    icon: '📊',
    description: 'These cookies allow us to count visits and traffic sources so we can measure and improve the performance of our app. They help us to know which pages are the most and least popular and see how visitors move around the app.',
    cookies: ['session_id', 'page_views', 'referrer', 'entry_exit_pages'],
    required: false
  },
  functionality: {
    id: 'functionality',
    name: 'Functionality Cookies',
    icon: '⚙️',
    description: 'These cookies enable the app to provide enhanced functionality and personalization. They may be set by us or by third party providers whose services we have added to our pages.',
    cookies: ['theme', 'map_preferences', 'ui_state', 'last_visited'],
    required: false
  }
};

/**
 * CookieManager Class
 * Handles all cookie consent and management operations
 */
class CookieManager {
  constructor() {
    this.consent = this._loadConsent();
    this.modal = null;
    this.settingsPanel = null;
    this._init();
  }

  /**
   * Initialize the cookie manager
   */
  _init() {
    this._createModal();
    this._checkConsent();
    this._bindEvents();
  }

  /**
   * Load consent from localStorage
   * @returns {Object|null} Parsed consent data or null
   */
  _loadConsent() {
    try {
      const stored = localStorage.getItem(COOKIE_CONSENT_KEY);
      if (!stored) return null;

      const parsed = JSON.parse(stored);
      
      // Check if consent has expired
      if (parsed.expiryDate && new Date() > new Date(parsed.expiryDate)) {
        this._clearConsent();
        return null;
      }

      return parsed;
    } catch (e) {
      console.error('Error loading cookie consent:', e);
      return null;
    }
  }

  /**
   * Save consent to localStorage
   * @param {Object} consentData - Consent data to save
   */
  _saveConsent(consentData) {
    try {
      const consent = {
        ...consentData,
        timestamp: new Date().toISOString(),
        expiryDate: new Date(Date.now() + COOKIE_CONSENT_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString(),
        version: '1.0'
      };
      localStorage.setItem(COOKIE_CONSENT_KEY, JSON.stringify(consent));
      this.consent = consent;
    } catch (e) {
      console.error('Error saving cookie consent:', e);
    }
  }

  /**
   * Clear consent data
   */
  _clearConsent() {
    localStorage.removeItem(COOKIE_CONSENT_KEY);
    this.consent = null;
  }

  /**
   * Check if consent exists and show modal if needed
   */
  _checkConsent() {
    // Always show modal if no consent or consent expired
    if (!this.hasConsent()) {
      this.showModal();
    }
  }

  /**
   * Create the consent modal HTML
   */
  _createModal() {
    // Create overlay container
    const overlay = document.createElement('div');
    overlay.className = 'cookie-consent-overlay';
    overlay.id = 'cookie-consent-overlay';
    
    // Create modal HTML
    overlay.innerHTML = `
      <div class="cookie-consent-modal" role="dialog" aria-labelledby="cookie-modal-title" aria-modal="true">
        <div class="cookie-consent-header">
          <h2 id="cookie-modal-title">
            <span class="cookie-consent-header__icon">🍪</span>
            Cookie Preferences
          </h2>
          <p>We use cookies to enhance your experience. By continuing to visit this site, you agree to our use of cookies. You can customize your preferences below.</p>
        </div>
        
        <div class="cookie-consent-body">
          <div class="cookie-consent-categories">
            ${this._renderCategory(COOKIE_CATEGORIES.essential)}
            ${this._renderCategory(COOKIE_CATEGORIES.analytics)}
            ${this._renderCategory(COOKIE_CATEGORIES.functionality)}
          </div>
        </div>
        
        <div class="cookie-consent-footer">
          <div class="cookie-consent-footer__actions">
            <button type="button" class="cookie-btn cookie-btn--secondary" id="cookie-reject-all">
              ✋ Reject All
            </button>
            <button type="button" class="cookie-btn cookie-btn--primary" id="cookie-accept-all">
              ✓ Accept All
            </button>
          </div>
          <div class="cookie-consent-footer__link">
            <a href="#" id="cookie-policy-link">Read Cookie Policy</a>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    this.modal = overlay;

    // Create settings panel for later access
    this._createSettingsPanel();
  }

  /**
   * Render a single cookie category
   * @param {Object} category - Category configuration
   * @returns {string} HTML string
   */
  _renderCategory(category) {
    const isConsented = this.consent?.categories?.[category.id];
    const isChecked = isConsented ? 'checked' : '';
    const isDisabled = category.required ? 'disabled' : '';
    const badgeClass = category.required ? 'required' : 'optional';
    const badgeText = category.required ? 'Required' : 'Optional';

    return `
      <div class="cookie-category ${category.required ? 'cookie-category--essential' : ''}">
        <div class="cookie-category-header">
          <div class="cookie-category__name">
            <span class="cookie-category__icon">${category.icon}</span>
            <span>${category.name}</span>
            <span class="cookie-category__badge cookie-category__badge--${badgeClass}">${badgeText}</span>
          </div>
          <label class="cookie-toggle">
            <input type="checkbox" ${isDisabled} ${isChecked} data-category="${category.id}">
            <span class="cookie-toggle__slider"></span>
          </label>
        </div>
        <p class="cookie-category__description">${category.description}</p>
        <p class="cookie-category__cookies">
          <strong>Cookies in this category:</strong> ${category.cookies.join(', ')}
        </p>
      </div>
    `;
  }

  /**
   * Create settings panel for accessing cookie settings later
   */
  _createSettingsPanel() {
    const panel = document.createElement('div');
    panel.className = 'cookie-settings-panel';
    panel.id = 'cookie-settings-panel';
    
    panel.innerHTML = `
      <div class="cookie-settings-content">
        <div class="cookie-settings-header">
          <h3>Cookie Preferences</h3>
          <button type="button" class="cookie-settings-close" id="cookie-settings-close">&times;</button>
        </div>
        <div class="cookie-consent-body">
          <p style="margin-bottom: 20px; color: var(--text-secondary, #a0a0b0);">
            Manage your cookie preferences. Changes will take effect immediately. Some cookies may require a page refresh.
          </p>
          <div class="cookie-consent-categories">
            ${this._renderCategory(COOKIE_CATEGORIES.essential)}
            ${this._renderCategory(COOKIE_CATEGORIES.analytics)}
            ${this._renderCategory(COOKIE_CATEGORIES.functionality)}
          </div>
        </div>
        <div class="cookie-consent-footer">
          <button type="button" class="cookie-btn cookie-btn--danger" id="cookie-revoke-all">
            🗑 Clear All Cookies
          </button>
          <button type="button" class="cookie-btn cookie-btn--primary" id="cookie-save-settings">
            ✓ Save Preferences
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(panel);
    this.settingsPanel = panel;
  }

  /**
   * Bind event listeners
   */
  _bindEvents() {
    if (!this.modal) return;

    // Accept all button
    const acceptAllBtn = document.getElementById('cookie-accept-all');
    if (acceptAllBtn) {
      acceptAllBtn.addEventListener('click', () => {
        this.saveConsent({
          essential: true,
          analytics: true,
          functionality: true
        });
        this.hideModal();
        this._onConsentChange();
      });
    }

    // Reject all button
    const rejectAllBtn = document.getElementById('cookie-reject-all');
    if (rejectAllBtn) {
      rejectAllBtn.addEventListener('click', () => {
        this.saveConsent({
          essential: true,
          analytics: false,
          functionality: false
        });
        this.hideModal();
        this._onConsentChange();
      });
    }

    // Cookie policy link
    const policyLink = document.getElementById('cookie-policy-link');
    if (policyLink) {
      policyLink.addEventListener('click', (e) => {
        e.preventDefault();
        this.showSettings();
      });
    }

    // Settings panel close button
    const settingsClose = document.getElementById('cookie-settings-close');
    if (settingsClose) {
      settingsClose.addEventListener('click', () => {
        this.hideSettings();
      });
    }

    // Settings save button
    const settingsSave = document.getElementById('cookie-save-settings');
    if (settingsSave) {
      settingsSave.addEventListener('click', () => {
        const categories = {};
        const toggles = this.settingsPanel.querySelectorAll('input[data-category]');
        toggles.forEach(toggle => {
          categories[toggle.dataset.category] = toggle.checked;
        });
        
        // Ensure essential is always true
        categories.essential = true;
        
        this.saveConsent(categories);
        this.hideSettings();
        this._onConsentChange();
      });
    }

    // Settings revoke all button
    const revokeAllBtn = document.getElementById('cookie-revoke-all');
    if (revokeAllBtn) {
      revokeAllBtn.addEventListener('click', () => {
        this.revokeConsent();
        this.hideSettings();
        this.showModal();
      });
    }

    // Close modal on overlay click
    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) {
        // Don't allow closing without making a choice
      }
    });
  }

  /**
   * Callback when consent changes
   * Dispatches a custom event for other parts of the app to listen
   */
  _onConsentChange() {
    const event = new CustomEvent('cookieConsentChange', {
      detail: this.consent
    });
    document.dispatchEvent(event);
  }

  // Public API

  /**
   * Show the consent modal
   */
  showModal() {
    if (this.modal) {
      this.modal.classList.add('cookie-consent-overlay--visible');
      document.body.style.overflow = 'hidden'; // Prevent background scrolling
    }
  }

  /**
   * Hide the consent modal
   */
  hideModal() {
    if (this.modal) {
      this.modal.classList.remove('cookie-consent-overlay--visible');
      document.body.style.overflow = '';
    }
  }

  /**
   * Show the settings panel
   */
  showSettings() {
    if (this.settingsPanel) {
      // Update toggles with current consent
      const toggles = this.settingsPanel.querySelectorAll('input[data-category]');
      toggles.forEach(toggle => {
        toggle.checked = this.consent?.categories?.[toggle.dataset.category] || false;
      });
      
      this.settingsPanel.classList.add('cookie-settings-panel--visible');
      document.body.style.overflow = 'hidden';
    }
  }

  /**
   * Hide the settings panel
   */
  hideSettings() {
    if (this.settingsPanel) {
      this.settingsPanel.classList.remove('cookie-settings-panel--visible');
      document.body.style.overflow = '';
    }
  }

  /**
   * Check if user has given consent
   * @returns {boolean}
   */
  hasConsent() {
    return this.consent !== null;
  }

  /**
   * Check if a specific category is accepted
   * @param {string} category - Category ID
   * @returns {boolean}
   */
  hasAccepted(category) {
    if (!this.consent) return false;
    if (category === 'essential') return true; // Essential is always accepted
    return this.consent.categories?.[category] || false;
  }

  /**
   * Save consent
   * @param {Object} categories - Object with category IDs as keys and boolean values
   */
  saveConsent(categories) {
    this._saveConsent({
      categories: {
        essential: true, // Always required
        analytics: categories.analytics || false,
        functionality: categories.functionality || false
      },
      acceptedAll: categories.analytics && categories.functionality,
      rejectedAll: !categories.analytics && !categories.functionality
    });
  }

  /**
   * Revoke all consent
   */
  revokeConsent() {
    this._clearConsent();
    this._deleteAllCookies();
  }

  /**
   * Get current consent status
   * @returns {Object|null}
   */
  getConsent() {
    return this.consent;
  }

  /**
   * Delete all non-essential cookies
   */
  _deleteAllCookies() {
    const cookies = document.cookie.split(';');
    cookies.forEach(cookie => {
      const name = cookie.split('=')[0].trim();
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
    });
  }

  /**
   * Set a cookie with category enforcement
   * @param {string} name - Cookie name
   * @param {string} value - Cookie value
   * @param {number} days - Expiry days
   * @param {string} category - Cookie category
   * @param {Object} options - Additional options (path, domain, secure, sameSite)
   */
  setCookie(name, value, days, category, options = {}) {
    // Check if category is allowed
    if (category !== 'essential' && !this.hasAccepted(category)) {
      console.warn(`Cookie "${name}" blocked: category "${category}" not consented`);
      return false;
    }

    const { path = '/', domain, secure = true, sameSite = 'lax' } = options;
    
    let cookieStr = `${encodeURIComponent(name)}=${encodeURIComponent(value)}`;
    cookieStr += `; expires=${this._getExpiryDate(days)}`;
    cookieStr += `; path=${path}`;
    
    if (domain) {
      cookieStr += `; domain=${domain}`;
    }
    
    if (secure) {
      cookieStr += '; secure';
    }
    
    cookieStr += `; samesite=${sameSite}`;
    
    document.cookie = cookieStr;
    return true;
  }

  /**
   * Get expiry date string
   * @param {number} days - Number of days
   * @returns {string}
   */
  _getExpiryDate(days) {
    const date = new Date();
    date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
    return date.toUTCString();
  }

  /**
   * Get a cookie value
   * @param {string} name - Cookie name
   * @returns {string|null}
   */
  getCookie(name) {
    const cookies = document.cookie.split(';');
    for (let cookie of cookies) {
      const [cookieName, cookieValue] = cookie.split('=').map(c => c.trim());
      if (cookieName === decodeURIComponent(name)) {
        return decodeURIComponent(cookieValue);
      }
    }
    return null;
  }

  /**
   * Delete a cookie
   * @param {string} name - Cookie name
   * @param {string} path - Cookie path
   */
  deleteCookie(name, path = '/') {
    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=${path};`;
  }

  /**
   * Get all cookie categories
   * @returns {Object}
   */
  getCategories() {
    return COOKIE_CATEGORIES;
  }

  /**
   * Check if analytics are allowed
   * @returns {boolean}
   */
  isAnalyticsAllowed() {
    return this.hasAccepted('analytics');
  }

  /**
   * Check if functionality cookies are allowed
   * @returns {boolean}
   */
  isFunctionalityAllowed() {
    return this.hasAccepted('functionality');
  }
}

// Create global instance
const cookieManager = new CookieManager();

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { cookieManager, CookieManager, COOKIE_CATEGORIES };
}