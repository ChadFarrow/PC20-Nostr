// Safe localStorage/sessionStorage wrappers for privacy browsers (e.g., DuckDuckGo on Android)
// that may block or restrict Web Storage API access.

export const safeLocalStorage = {
  getItem(key: string): string | null {
    try { return localStorage.getItem(key); } catch { return null; }
  },
  setItem(key: string, value: string): void {
    try { localStorage.setItem(key, value); } catch { /* blocked by privacy browser */ }
  },
  removeItem(key: string): void {
    try { localStorage.removeItem(key); } catch { /* blocked by privacy browser */ }
  },
  clear(): void {
    try { localStorage.clear(); } catch { /* blocked by privacy browser */ }
  },
  keys(): string[] {
    try { return Object.keys(localStorage); } catch { return []; }
  }
};

export const safeSessionStorage = {
  getItem(key: string): string | null {
    try { return sessionStorage.getItem(key); } catch { return null; }
  },
  setItem(key: string, value: string): void {
    try { sessionStorage.setItem(key, value); } catch { /* blocked by privacy browser */ }
  },
  removeItem(key: string): void {
    try { sessionStorage.removeItem(key); } catch { /* blocked by privacy browser */ }
  }
};
