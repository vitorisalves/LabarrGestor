/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback } from 'react';

export const useSetorLimits = () => {
  const [setorLimits, setSetorLimits] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(false);

  const fetchSetorLimits = useCallback(async (force = false) => {
    setIsLoading(true);
    try {
      const url = force ? '/api/xml/setor-limits?fresh=true' : '/api/xml/setor-limits';
      const res = await fetch(url, force ? { headers: { 'Cache-Control': 'no-cache' } } : undefined);
      if (res.ok) {
        const data = await res.json();
        const map: Record<string, number> = {};
        (Array.isArray(data) ? data : []).forEach((d: any) => {
          if (d.setor) map[d.setor] = Number(d.monthlyLimit) || 0;
        });
        setSetorLimits(map);
      }
    } catch (err) {
      console.error('Erro ao buscar limites de setor:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSetorLimits();
  }, [fetchSetorLimits]);

  const updateSetorLimit = useCallback(async (setor: string, monthlyLimit: number) => {
    setSetorLimits(prev => ({ ...prev, [setor]: monthlyLimit }));
    try {
      await fetch('/api/xml/setor-limits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ setor, monthlyLimit })
      });
    } catch (err) {
      console.error('Erro ao salvar limite de setor:', err);
    }
  }, []);

  return { setorLimits, isLoading, fetchSetorLimits, updateSetorLimit };
};
