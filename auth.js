(() => {
  'use strict';

  const ACCOUNTS_KEY = 'lso_local_accounts_v2';
  const LEGACY_ACCOUNTS_KEY = 'lso_local_accounts_v1';
  const SESSION_KEY = 'lso_active_account_v2';
  const DEFAULT_USERNAME = 'SNA1161';
  const DEFAULT_PASSWORD = 'SNA1161';

  const el = (id) => document.getElementById(id);
  const normalizeUsername = (value) => String(value || '').trim().toLowerCase();

  function emit(name, detail = {}) {
    window.dispatchEvent(new CustomEvent(name, { detail }));
  }

  function setTrialStatus(message = 'Trial mode — saved on this device only') {
    emit('lso:cloud-status', { kind: 'trial', message });
  }

  function readStorage(storage, key, fallback = null) {
    try {
      const value = storage.getItem(key);
      return value === null ? fallback : value;
    } catch {
      return fallback;
    }
  }

  function writeStorage(storage, key, value) {
    try {
      storage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  }

  function removeStorage(storage, key) {
    try { storage.removeItem(key); } catch { /* Browser storage may be blocked. */ }
  }

  function normalizeApprovalStatus(account) {
    if (account?.isDefault) return 'Approved';
    return ['Pending', 'Approved', 'Rejected'].includes(account?.approvalStatus)
      ? account.approvalStatus
      : 'Pending';
  }

  function normalizeAccount(account) {
    const approvalStatus = normalizeApprovalStatus(account);
    return {
      ...account,
      email: account?.email || '',
      displayName: account?.displayName || account?.username || 'LSO Account',
      role: account?.role === 'Administrator' ? 'Administrator' : 'Staff Account',
      approvalStatus,
      disabled: Boolean(account?.disabled),
      isDefault: Boolean(account?.isDefault),
      requestedAt: account?.requestedAt || account?.createdAt || new Date().toISOString(),
      createdAt: account?.createdAt || account?.requestedAt || new Date().toISOString(),
      approvedAt: account?.isDefault ? (account?.approvedAt || account?.createdAt || new Date().toISOString()) : (account?.approvedAt || ''),
      approvedBy: account?.isDefault ? (account?.approvedBy || DEFAULT_USERNAME) : (account?.approvedBy || ''),
      rejectedAt: account?.rejectedAt || '',
      rejectedBy: account?.rejectedBy || ''
    };
  }

  function loadRawAccounts() {
    try {
      let raw = readStorage(localStorage, ACCOUNTS_KEY, null);
      if (raw === null) raw = readStorage(localStorage, LEGACY_ACCOUNTS_KEY, '[]');
      const parsed = JSON.parse(raw || '[]');
      return Array.isArray(parsed) ? parsed.map(normalizeAccount) : [];
    } catch {
      return [];
    }
  }

  function persistAccounts(accounts) {
    const normalized = Array.isArray(accounts) ? accounts.map(normalizeAccount) : [];
    const saved = writeStorage(localStorage, ACCOUNTS_KEY, JSON.stringify(normalized));
    if (saved) emit('lso:accounts-changed', { count: normalized.length, source: 'local-trial' });
    return saved;
  }

  function randomSalt() {
    if (window.crypto?.getRandomValues) {
      const bytes = new Uint8Array(16);
      window.crypto.getRandomValues(bytes);
      return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
    }
    return `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
  }

  function fallbackHash(text) {
    let first = 0x811c9dc5;
    let second = 0x9e3779b9;
    for (let index = 0; index < text.length; index += 1) {
      const code = text.charCodeAt(index);
      first ^= code;
      first = Math.imul(first, 0x01000193);
      second ^= code + index;
      second = Math.imul(second, 0x85ebca6b);
    }
    return `${(first >>> 0).toString(16).padStart(8, '0')}${(second >>> 0).toString(16).padStart(8, '0')}`;
  }

  async function createPasswordHash(password, salt, method = 'auto') {
    const text = `${salt}:${password}`;
    const canUseSha256 = Boolean(window.crypto?.subtle && window.TextEncoder);
    if ((method === 'auto' || method === 'sha256') && canUseSha256) {
      try {
        const bytes = new TextEncoder().encode(text);
        const digest = await window.crypto.subtle.digest('SHA-256', bytes);
        const hex = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
        return `sha256$${hex}`;
      } catch (error) {
        if (method === 'sha256') throw error;
      }
    }
    return `localhash$${fallbackHash(text)}`;
  }

  async function verifyPassword(password, account) {
    if (!account?.passwordHash || !account?.salt) return false;
    const method = account.passwordHash.startsWith('sha256$') ? 'sha256' : 'localhash';
    const candidate = await createPasswordHash(password, account.salt, method);
    return candidate === account.passwordHash;
  }

  async function ensureDefaultAccount() {
    const accounts = loadRawAccounts();
    const index = accounts.findIndex((account) => normalizeUsername(account.username) === normalizeUsername(DEFAULT_USERNAME));

    if (index >= 0) {
      const current = accounts[index];
      accounts[index] = normalizeAccount({
        ...current,
        username: DEFAULT_USERNAME,
        displayName: 'LSO Administrator',
        role: 'Administrator',
        approvalStatus: 'Approved',
        disabled: false,
        isDefault: true
      });
      if (!current.passwordHash || !current.salt) {
        const salt = randomSalt();
        accounts[index].salt = salt;
        accounts[index].passwordHash = await createPasswordHash(DEFAULT_PASSWORD, salt);
      }
      persistAccounts(accounts);
      return accounts;
    }

    const salt = randomSalt();
    accounts.push(normalizeAccount({
      id: window.crypto?.randomUUID ? window.crypto.randomUUID() : `account-${Date.now()}`,
      username: DEFAULT_USERNAME,
      email: '',
      displayName: 'LSO Administrator',
      role: 'Administrator',
      salt,
      passwordHash: await createPasswordHash(DEFAULT_PASSWORD, salt),
      createdAt: new Date().toISOString(),
      requestedAt: new Date().toISOString(),
      approvalStatus: 'Approved',
      approvedAt: new Date().toISOString(),
      approvedBy: DEFAULT_USERNAME,
      isDefault: true,
      disabled: false
    }));
    persistAccounts(accounts);
    return accounts;
  }

  function setMessage(id, message = '', success = false) {
    const node = el(id);
    if (!node) return;
    node.textContent = message;
    node.classList.toggle('hidden', !message);
    node.classList.toggle('success', Boolean(message && success));
  }

  function setFormBusy(formId, busy) {
    const form = el(formId);
    if (!form) return;
    [...form.elements].forEach((control) => { control.disabled = Boolean(busy); });
    form.classList.toggle('is-busy', Boolean(busy));
  }

  function switchAuthMode(mode) {
    const isLogin = mode === 'login';
    el('loginForm')?.classList.toggle('hidden', !isLogin);
    el('registerForm')?.classList.toggle('hidden', isLogin);
    el('loginTab')?.classList.toggle('active', isLogin);
    el('registerTab')?.classList.toggle('active', !isLogin);
    el('loginTab')?.setAttribute('aria-selected', String(isLogin));
    el('registerTab')?.setAttribute('aria-selected', String(!isLogin));
    setMessage('loginMessage');
    setMessage('registerMessage');
    setTimeout(() => (isLogin ? el('loginUsername') : el('registerDisplayName'))?.focus(), 30);
  }

  function accountInitial(account) {
    const source = String(account?.displayName || account?.username || 'A').trim();
    return source.charAt(0).toUpperCase() || 'A';
  }

  function publicAccount(account) {
    return {
      id: account.id,
      email: account.email || '',
      username: account.username,
      displayName: account.displayName,
      role: account.role || 'Staff Account',
      approvalStatus: normalizeApprovalStatus(account),
      isDefault: Boolean(account.isDefault),
      disabled: Boolean(account.disabled),
      storageMode: 'Local Trial'
    };
  }

  function showApplication(account) {
    window.LSOCurrentAccount = publicAccount(account);
    document.body.dataset.accountRole = window.LSOCurrentAccount.role;
    document.body.dataset.storageMode = 'trial';
    el('authScreen')?.classList.add('hidden');
    el('appShell')?.classList.remove('hidden');
    if (el('currentAccountName')) el('currentAccountName').textContent = account.displayName || account.username;
    if (el('currentAccountUsername')) el('currentAccountUsername').textContent = `@${account.username}`;
    if (el('accountAvatar')) el('accountAvatar').textContent = accountInitial(account);
    if (el('currentAccountRole')) el('currentAccountRole').textContent = `${account.role || 'Staff Account'} • Trial`;
    document.querySelectorAll('.admin-only').forEach((node) => node.classList.toggle('hidden', account.role !== 'Administrator'));
    setTrialStatus();
    emit('lso:auth-changed', window.LSOCurrentAccount);
    emit('lso:accounts-changed', { count: loadRawAccounts().length, source: 'local-trial' });
    document.title = 'LSO Orchestra Management System — Trial Mode';
  }

  function showLoginScreen({ preserveMessage = false } = {}) {
    window.LSOCurrentAccount = null;
    delete document.body.dataset.accountRole;
    document.body.dataset.storageMode = 'trial';
    el('appShell')?.classList.add('hidden');
    el('authScreen')?.classList.remove('hidden');
    el('sidebar')?.classList.remove('open');
    el('memberModal')?.classList.add('hidden');
    document.body.style.overflow = '';
    document.title = 'Login | LSO Trial Mode';
    el('loginForm')?.reset();
    el('registerForm')?.reset();
    if (el('loginUsername')) el('loginUsername').value = DEFAULT_USERNAME;
    if (el('loginPassword')) el('loginPassword').value = DEFAULT_PASSWORD;
    if (!preserveMessage) switchAuthMode('login');
    setTrialStatus('Trial mode ready — records stay in this browser');
    emit('lso:auth-changed', null);
  }

  async function handleLogin(event) {
    event.preventDefault();
    setMessage('loginMessage');

    const username = el('loginUsername')?.value.trim() || '';
    const password = el('loginPassword')?.value || '';
    setFormBusy('loginForm', true);

    try {
      const account = loadRawAccounts().find((item) => normalizeUsername(item.username) === normalizeUsername(username));
      if (!account || !(await verifyPassword(password, account))) {
        setMessage('loginMessage', 'The username or password is incorrect.');
        return;
      }

      const approval = normalizeApprovalStatus(account);
      if (approval === 'Pending') {
        setMessage('loginMessage', 'Your registration is pending administrator approval.');
        return;
      }
      if (approval === 'Rejected') {
        setMessage('loginMessage', 'Your registration was rejected. Please contact the administrator.');
        return;
      }
      if (account.disabled) {
        setMessage('loginMessage', 'This account has been disabled by an administrator.');
        return;
      }

      if (!writeStorage(sessionStorage, SESSION_KEY, account.username)) {
        setMessage('loginMessage', 'This browser blocked session storage. Allow browser storage and try again.');
        return;
      }

      showApplication(account);
      window.LSOApp?.refresh?.();
      window.LSOOperations?.refreshAll?.();
    } finally {
      setFormBusy('loginForm', false);
    }
  }

  async function handleRegistration(event) {
    event.preventDefault();
    setMessage('registerMessage');

    const displayName = el('registerDisplayName')?.value.trim() || '';
    const email = el('registerEmail')?.value.trim().toLowerCase() || '';
    const username = el('registerUsername')?.value.trim() || '';
    const password = el('registerPassword')?.value || '';
    const confirmPassword = el('registerConfirmPassword')?.value || '';

    if (displayName.length < 2) {
      setMessage('registerMessage', 'Enter a valid display name.');
      return;
    }
    if (email && !/^\S+@\S+\.\S+$/.test(email)) {
      setMessage('registerMessage', 'Enter a valid email address or leave it blank.');
      return;
    }
    if (!/^[A-Za-z0-9._-]{4,30}$/.test(username)) {
      setMessage('registerMessage', 'Username must be 4–30 characters and may contain letters, numbers, periods, underscores, or hyphens.');
      return;
    }
    if (normalizeUsername(username) === normalizeUsername(DEFAULT_USERNAME)) {
      setMessage('registerMessage', `${DEFAULT_USERNAME} is reserved for the administrator.`);
      return;
    }
    if (password.length < 6) {
      setMessage('registerMessage', 'Password must contain at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setMessage('registerMessage', 'The passwords do not match.');
      return;
    }

    setFormBusy('registerForm', true);
    try {
      const accounts = loadRawAccounts();
      if (accounts.some((account) => normalizeUsername(account.username) === normalizeUsername(username))) {
        setMessage('registerMessage', 'That username is already registered.');
        return;
      }

      const salt = randomSalt();
      const now = new Date().toISOString();
      accounts.push(normalizeAccount({
        id: window.crypto?.randomUUID ? window.crypto.randomUUID() : `account-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        username,
        email,
        displayName,
        role: 'Staff Account',
        salt,
        passwordHash: await createPasswordHash(password, salt),
        createdAt: now,
        requestedAt: now,
        approvalStatus: 'Pending',
        isDefault: false,
        disabled: false
      }));

      if (!persistAccounts(accounts)) {
        setMessage('registerMessage', 'This browser blocked local storage. The account could not be saved.');
        return;
      }

      el('registerForm')?.reset();
      switchAuthMode('login');
      if (el('loginUsername')) el('loginUsername').value = username;
      if (el('loginPassword')) el('loginPassword').value = '';
      setMessage('loginMessage', 'Registration submitted. The administrator must approve this account before login.', true);
    } finally {
      setFormBusy('registerForm', false);
    }
  }

  async function handleLogout() {
    removeStorage(sessionStorage, SESSION_KEY);
    showLoginScreen();
  }

  async function saveAccounts(accounts) {
    const active = window.LSOCurrentAccount;
    if (!active || active.role !== 'Administrator') return false;

    const current = loadRawAccounts();
    const byId = new Map(current.map((account) => [account.id, account]));
    const normalized = accounts.map((account) => {
      const stored = byId.get(account.id) || {};
      return normalizeAccount({
        ...stored,
        ...account,
        salt: stored.salt,
        passwordHash: stored.passwordHash
      });
    });

    const defaultAccount = current.find((account) => account.isDefault || normalizeUsername(account.username) === normalizeUsername(DEFAULT_USERNAME));
    if (defaultAccount && !normalized.some((account) => account.id === defaultAccount.id)) normalized.unshift(defaultAccount);
    return persistAccounts(normalized);
  }

  async function deleteAccount(accountId) {
    const active = window.LSOCurrentAccount;
    if (!active || active.role !== 'Administrator') return false;
    const accounts = loadRawAccounts();
    const target = accounts.find((account) => account.id === accountId);
    if (!target || target.isDefault || target.username === active.username) return false;
    return persistAccounts(accounts.filter((account) => account.id !== accountId));
  }

  function refreshActiveAccount() {
    const activeUsername = readStorage(sessionStorage, SESSION_KEY, '');
    const account = loadRawAccounts().find((item) => normalizeUsername(item.username) === normalizeUsername(activeUsername));
    if (account && normalizeApprovalStatus(account) === 'Approved' && !account.disabled) {
      showApplication(account);
      return true;
    }
    removeStorage(sessionStorage, SESSION_KEY);
    showLoginScreen();
    return false;
  }

  function wireAuthEvents() {
    el('loginTab')?.addEventListener('click', () => switchAuthMode('login'));
    el('registerTab')?.addEventListener('click', () => switchAuthMode('register'));
    el('loginForm')?.addEventListener('submit', handleLogin);
    el('registerForm')?.addEventListener('submit', handleRegistration);
    el('logoutButton')?.addEventListener('click', handleLogout);

    document.querySelectorAll('[data-password-target]').forEach((button) => {
      button.addEventListener('click', () => {
        const input = el(button.dataset.passwordTarget);
        if (!input) return;
        const isHidden = input.type === 'password';
        input.type = isHidden ? 'text' : 'password';
        button.textContent = isHidden ? 'Hide' : 'Show';
        button.setAttribute('aria-label', isHidden ? 'Hide password' : 'Show password');
      });
    });
  }

  window.LSOAuth = {
    loadAccounts: () => loadRawAccounts().map((account) => ({ ...account, salt: undefined, passwordHash: undefined })),
    saveAccounts,
    deleteAccount,
    refreshAccounts: async () => {
      const accounts = loadRawAccounts();
      emit('lso:accounts-changed', { count: accounts.length, source: 'local-trial' });
      return accounts.map((account) => ({ ...account, salt: undefined, passwordHash: undefined }));
    },
    getActiveAccount: () => window.LSOCurrentAccount ? { ...window.LSOCurrentAccount } : null,
    signOut: handleLogout,
    refreshActiveAccount
  };

  async function initializeAuth() {
    wireAuthEvents();
    await ensureDefaultAccount();
    refreshActiveAccount();
  }

  initializeAuth().catch((error) => {
    showLoginScreen({ preserveMessage: true });
    setMessage('loginMessage', `The local trial account system could not be initialized. ${error.message || 'Enable browser storage and reload.'}`);
  });
})();
