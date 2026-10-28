import { useCallback, useEffect, useRef, useState, type DependencyList } from 'react';
import { subscribeChanges, type StoreName } from '../adapters/storage/db';
import { toAppError, type AppError } from '../domain/errors';

export interface QueryState<T> {
  data: T | undefined;
  loading: boolean;
  error: AppError | null;
  reload: () => void;
}

/**
 * Veri sorgusu: ilgili depolar değiştiğinde (aynı veya başka sekmede) kendiliğinden yenilenir.
 * Yeniden yüklemede önceki veri korunur; böylece ekran titremez.
 */
export function useQuery<T>(fn: () => Promise<T>, deps: DependencyList, stores: readonly StoreName[]): QueryState<T> {
  const [data, setData] = useState<T | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<AppError | null>(null);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const seq = useRef(0);

  const run = useCallback(() => {
    const id = ++seq.current;
    setLoading(true);
    fnRef
      .current()
      .then((d) => {
        if (id !== seq.current) return;
        setData(d);
        setError(null);
      })
      .catch((e: unknown) => {
        if (id === seq.current) setError(toAppError(e));
      })
      .finally(() => {
        if (id === seq.current) setLoading(false);
      });
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(run, deps);

  const storesKey = stores.join(',');
  useEffect(() => {
    const watched = new Set(storesKey.split(','));
    return subscribeChanges((changed) => {
      for (const s of changed) {
        if (watched.has(s)) {
          run();
          return;
        }
      }
    });
  }, [storesKey, run]);

  return { data, loading, error, reload: run };
}
