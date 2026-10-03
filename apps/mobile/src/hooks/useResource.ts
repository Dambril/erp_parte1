import {useCallback, useEffect, useRef, useState} from 'react';
import {mensajeError} from '@erp/api-client';
import type {Paginated} from '@erp/domain';
import {useConnectivity} from '../state/ConnectivityContext';
import {useConstruction} from '../state/ConstructionContext';

export interface Resource<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/**
 * Carga un recurso de la API y lo vuelve a pedir cuando cambia `key`, cuando el canal de tiempo real avisa
 * de un cambio o cuando vuelve la conexión tras un error. `key` resume de qué depende `load` (ids, filtros).
 * Con `enabled: false` no pide nada (p. ej. el historial de movimientos sin permiso para verlo).
 */
export function useResource<T>(load: () => Promise<T>, key: string, enabled = true): Resource<T> {
  const {version} = useConstruction();
  const online = useConnectivity();
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const loadRef = useRef(load);
  loadRef.current = load;
  const failedRef = useRef(false);
  failedRef.current = error !== null;

  useEffect(() => {
    if (online && failedRef.current) setAttempt((current) => current + 1);
  }, [online]);

  useEffect(() => {
    if (!enabled) {
      setData(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    loadRef.current().then(
      (result) => {
        if (cancelled) return;
        setData(result);
        setError(null);
        setLoading(false);
      },
      (err) => {
        if (cancelled) return;
        setError(mensajeError(err));
        setLoading(false);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [key, enabled, version, attempt]);

  const reload = useCallback(() => setAttempt((current) => current + 1), []);
  return {data, loading, error, reload};
}

export interface PagedList<T> {
  items: T[];
  total: number;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  reload: () => void;
  /** Pide la página siguiente si la hay; pensado para `onEndReached` de `FlatList`. */
  loadMore: () => void;
}

/** Listado paginado de la API. Al cambiar `key` (o llegar un aviso de cambio) vuelve a la primera página. */
export function usePagedList<T extends {id: string}>(
  fetchPage: (page: number) => Promise<Paginated<T>>,
  key: string,
  enabled = true,
): PagedList<T> {
  const first = useResource(() => fetchPage(1), key, enabled);
  // Las páginas siguientes pertenecen a una primera página concreta: si esta se recarga, se descartan.
  const [more, setMore] = useState<{of: Paginated<T> | null; items: T[]; page: number}>({of: null, items: [], page: 1});
  const [loadingMore, setLoadingMore] = useState(false);
  const fetchRef = useRef(fetchPage);
  fetchRef.current = fetchPage;

  const source = first.data;
  const extra = more.of === source ? more : {of: source, items: [] as T[], page: 1};
  const items = source ? [...source.items, ...extra.items] : [];
  const total = source?.total ?? 0;
  const hasMore = items.length < total;

  const loadMore = () => {
    if (!source || !hasMore || loadingMore || first.loading) return;
    const nextPage = extra.page + 1;
    const known = new Set(items.map((item) => item.id));
    setLoadingMore(true);
    fetchRef.current(nextPage).then(
      (result) => {
        setMore({of: source, items: [...extra.items, ...result.items.filter((item) => !known.has(item.id))], page: nextPage});
        setLoadingMore(false);
      },
      () => setLoadingMore(false),
    );
  };

  return {items, total, loading: first.loading, loadingMore, error: first.error, reload: first.reload, loadMore};
}
