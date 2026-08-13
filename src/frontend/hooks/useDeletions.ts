import { useState, useCallback } from 'react';

export const useDeletions = () => {
  const [deletions, setDeletions] = useState<{
    supplier: string | null;
    list: string | null;
    reminder: string | null;
    category: string | null;
    user: string | null;
  }>({
    supplier: null,
    list: null,
    reminder: null,
    category: null,
    user: null
  });

  const setDeletion = useCallback((type: keyof typeof deletions, id: string | null) => {
    setDeletions(prev => ({ ...prev, [type]: id }));
  }, []);

  return {
    deletions,
    setDeletion
  };
};
