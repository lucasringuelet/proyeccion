import { useEffect, useMemo, useState } from "react";

export interface UsePaginationResult<T> {
  page: number;
  pageSize: number;
  totalPages: number;
  total: number;
  startIndex: number;
  endIndex: number;
  paginated: T[];
  setPage: (p: number) => void;
  setPageSize: (s: number) => void;
}

/**
 * Paginación client-side. Resetea a page=1 cuando la longitud de items cambia
 * (filtros aplicados, búsqueda, etc.) para no quedar en una página vacía.
 */
export function usePagination<T>(
  items: T[],
  defaultPageSize = 50,
): UsePaginationResult<T> {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);

  useEffect(() => {
    setPage(1);
  }, [items.length, pageSize]);

  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, total);

  const paginated = useMemo(
    () => items.slice(startIndex, endIndex),
    [items, startIndex, endIndex],
  );

  return {
    page: safePage,
    pageSize,
    totalPages,
    total,
    startIndex,
    endIndex,
    paginated,
    setPage,
    setPageSize,
  };
}
