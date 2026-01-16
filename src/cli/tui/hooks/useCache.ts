/**
 * Cache loading hook for TUI
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { readCacheStatus, getBundledCachePath } from "../../../tracker/cache.js";
import { computeCacheStats } from "../../../tracker/checkpoint-helpers.js";
import type { CacheData } from "../types.js";

export interface UseCacheResult {
  data: CacheData | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

export function useCache(cachePath?: string): UseCacheResult {
  const [data, setData] = useState<CacheData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const versionRef = useRef(0);
  const mountedRef = useRef(true);

  const loadCache = useCallback(async () => {
    const version = ++versionRef.current;

    setLoading(true);
    setError(null);

    try {
      const path = cachePath ?? getBundledCachePath();
      if (!path) {
        throw new Error("No cache path available. Use --cache or ensure bundled cache exists.");
      }

      const { checkpoints, elections } = await readCacheStatus(path);

      // Skip if superseded by newer request or unmounted
      if (version !== versionRef.current || !mountedRef.current) return;

      const stats = computeCacheStats(checkpoints, elections);
      setData({ checkpoints, elections, stats });
    } catch (err) {
      if (version !== versionRef.current || !mountedRef.current) return;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (version === versionRef.current && mountedRef.current) {
        setLoading(false);
      }
    }
  }, [cachePath]);

  useEffect(() => {
    mountedRef.current = true;
    void loadCache();
    return () => {
      mountedRef.current = false;
    };
  }, [loadCache]);

  return { data, loading, error, reload: loadCache };
}
