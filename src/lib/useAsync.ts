import { useCallback, useEffect, useState } from 'react';

interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

// Minimal data-loading hook: runs the fetcher on mount and whenever a dep in
// `deps` changes, with a manual reload().
export function useAsync<T>(fetcher: () => Promise<T>, deps: unknown[] = []): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(fetcher, deps);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    run()
      .then((res) => active && setData(res))
      .catch((e: unknown) => active && setError(message(e)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [run, tick]);

  return { data, loading, error, reload: () => setTick((n) => n + 1) };
}

// Debounce a fast-changing value (a search box) so each keystroke does not hit
// the server. Returns the value once it has been still for `ms`.
export function useDebounced<T>(value: T, ms = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

export interface PagedState<T> {
  rows: T[];
  total: number;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  hasMore: boolean;
  loadMore: () => void;
  reload: () => void;
}

// Offset pagination over a server-side page fetcher. The first page reloads
// whenever a dep (a filter) changes; `loadMore` appends the next page.
export function usePaged<T>(
  fetchPage: (offset: number, limit: number) => Promise<{ rows: T[]; total: number }>,
  deps: unknown[] = [],
  pageSize = 25,
): PagedState<T> {
  const [rows, setRows] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(fetchPage, deps);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    run(0, pageSize)
      .then((res) => {
        if (!active) return;
        setRows(res.rows);
        setTotal(res.total);
      })
      .catch((e: unknown) => {
        if (!active) return;
        setError(message(e));
        setRows([]);
        setTotal(0);
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [run, pageSize, tick]);

  const loaded = rows.length;
  const loadMore = useCallback(() => {
    setLoadingMore(true);
    setError(null);
    run(loaded, pageSize)
      .then((res) => {
        setRows((prev) => [...prev, ...res.rows]);
        setTotal(res.total);
      })
      .catch((e: unknown) => setError(message(e)))
      .finally(() => setLoadingMore(false));
  }, [run, loaded, pageSize]);

  return {
    rows,
    total,
    loading,
    loadingMore,
    error,
    hasMore: loaded < total,
    loadMore,
    reload: () => setTick((n) => n + 1),
  };
}
