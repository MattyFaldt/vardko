import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Reusable polling hook.
 * Calls `fetcher` immediately then every `intervalMs` milliseconds.
 * Re-creates the interval whenever `deps` change.
 */
export function usePolling<T>(
  fetcher: () => Promise<T>,
  intervalMs: number,
  deps: unknown[],
): { data: T | null; loading: boolean; error: string | null; refetch: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const activeRef = useRef(true);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const doFetch = useCallback(async () => {
    if (!activeRef.current) return;
    try {
      const result = await fetcherRef.current();
      if (activeRef.current) {
        setData(result);
        setError(null);
        setLoading(false);
      }
    } catch (err) {
      if (activeRef.current) {
        setError(err instanceof Error ? err.message : 'Polling error');
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    activeRef.current = true;
    setLoading(true);
    doFetch();
    const interval = setInterval(doFetch, intervalMs);
    return () => {
      activeRef.current = false;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervalMs, ...deps]);

  return { data, loading, error, refetch: doFetch };
}
