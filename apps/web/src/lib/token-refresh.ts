import { refreshTokenApi } from './api-client';

/**
 * Token refresh interceptor.
 *
 * Wraps an API call so that if it returns a 401 error code,
 * we attempt to refresh the access token and retry once.
 * If refresh fails, the `onLogout` callback is invoked.
 */

type TokenStore = {
  getAccessToken: () => string | null;
  getRefreshToken: () => string | null;
  setTokens: (accessToken: string, refreshToken: string) => void;
  onLogout: () => void;
};

let tokenStore: TokenStore | null = null;

/** Call once during app init (from AuthProvider) to wire up the token store. */
export function configureTokenRefresh(store: TokenStore) {
  tokenStore = store;
}

/** In-flight refresh promise to prevent concurrent refreshes. */
let refreshPromise: Promise<string | null> | null = null;

async function doRefresh(): Promise<string | null> {
  if (!tokenStore) return null;
  const rt = tokenStore.getRefreshToken();
  if (!rt) {
    tokenStore.onLogout();
    return null;
  }
  try {
    const result = await refreshTokenApi(rt);
    if (result.success) {
      tokenStore.setTokens(result.data.accessToken, result.data.refreshToken);
      return result.data.accessToken;
    }
    tokenStore.onLogout();
    return null;
  } catch {
    tokenStore.onLogout();
    return null;
  }
}

/**
 * Wraps an async API function so that a 401 triggers a token refresh + retry.
 *
 * Usage:
 *   const result = await withTokenRefresh(token => api.getSomething(token));
 */
export async function withTokenRefresh<T>(
  apiFn: (token: string) => Promise<{ success: boolean; error?: { code: string; message: string }; data?: T }>,
): Promise<{ success: true; data: T } | { success: false; error: { code: string; message: string } }> {
  if (!tokenStore) {
    return { success: false, error: { code: 'NO_TOKEN_STORE', message: 'Token store not configured' } };
  }

  const token = tokenStore.getAccessToken() || '';
  const result = await apiFn(token) as { success: boolean; error?: { code: string; message: string }; data?: T };

  if (result.success) {
    return result as { success: true; data: T };
  }

  // Check for 401 / auth error
  const errorCode = result.error?.code || '';
  if (errorCode === 'UNAUTHORIZED' || errorCode === 'TOKEN_EXPIRED' || errorCode === '401') {
    // Attempt refresh (dedup concurrent refreshes)
    if (!refreshPromise) {
      refreshPromise = doRefresh().finally(() => { refreshPromise = null; });
    }
    const newToken = await refreshPromise;
    if (newToken) {
      // Retry with new token
      const retry = await apiFn(newToken) as { success: boolean; error?: { code: string; message: string }; data?: T };
      if (retry.success) return retry as { success: true; data: T };
      return retry as { success: false; error: { code: string; message: string } };
    }
    // Refresh failed, logout already triggered
  }

  return result as { success: false; error: { code: string; message: string } };
}

/**
 * Convenience: get the current access token from the store.
 * Returns empty string if not available.
 */
export function getCurrentToken(): string {
  return tokenStore?.getAccessToken() || '';
}
