(() => {
  'use strict';

  /*
   * LOCAL TRIAL STORAGE ADAPTER
   * ---------------------------
   * This temporary mode deliberately does not contact Supabase. All records
   * are saved in this browser's localStorage so the complete interface can be
   * opened and tested while the cloud connection is being repaired.
   */

  const nativeStorage = window.localStorage;

  function emit(name, detail = {}) {
    window.dispatchEvent(new CustomEvent(name, { detail }));
  }

  function status(message = 'Trial mode — saved on this device only') {
    emit('lso:cloud-status', { kind: 'trial', message });
  }

  function getItem(key) {
    try {
      return nativeStorage.getItem(key);
    } catch {
      return null;
    }
  }

  function setItem(key, value) {
    try {
      nativeStorage.setItem(key, String(value));
      return true;
    } catch {
      return false;
    }
  }

  function removeItem(key) {
    try {
      nativeStorage.removeItem(key);
      return true;
    } catch {
      return false;
    }
  }

  window.LSOStorage = { getItem, setItem, removeItem };

  window.LSOCloud = {
    client: null,
    isConfigured: () => false,
    isLoaded: () => true,
    isTrialMode: () => true,
    getItem,
    setItem,
    removeItem,
    loadSharedState: async () => null,
    disconnect: async () => { status('Trial mode — signed out; local records kept'); },
    cloneState: () => null,
    hasLegacyData: () => false,
    isCloudEmpty: () => true,
    migrateLegacyIfNeeded: async () => false,
    listProfiles: async () => [],
    getOwnProfile: async () => null,
    updateProfiles: async () => [],
    deleteAccount: async () => undefined,
    flush: async () => undefined
  };

  const announce = () => status();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(announce, 0), { once: true });
  } else {
    setTimeout(announce, 0);
  }
})();
