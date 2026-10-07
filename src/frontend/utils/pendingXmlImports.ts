/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Notas XML pendentes de importação, salvas no servidor e compartilhadas entre o
// Dashboard ("dashboard") e o Importar XML dos Produtos ("products").

export type PendingXmlSide = 'dashboard' | 'products';

export interface PendingXmlDoc {
  id: string;
  nfeKey: string;
  fileName: string;
  xmlText: string;
  supplierName: string;
  dhEmi: string;
  vTotTrib: number;
  alreadyImported: { dashboard: boolean; products: boolean };
}

export interface StagePendingXmlInput {
  side: PendingXmlSide;
  nfeKey: string;
  fileName: string;
  xmlText: string;
  supplierName?: string;
  dhEmi?: string;
  vTotTrib?: number;
  productsAlreadyImported?: boolean;
}

export const stagePendingXml = async (input: StagePendingXmlInput) => {
  try {
    const res = await fetch('/api/xml/pending-imports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input)
    });
    if (!res.ok) return null;
    return await res.json() as { id: string; alreadyImported: { dashboard: boolean; products: boolean } };
  } catch (err) {
    console.error('Erro ao salvar nota XML pendente:', err);
    return null;
  }
};

export const fetchPendingXml = async (side: PendingXmlSide): Promise<PendingXmlDoc[]> => {
  try {
    const res = await fetch(`/api/xml/pending-imports?side=${side}`, { headers: { 'Cache-Control': 'no-cache' } });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.error('Erro ao buscar notas XML pendentes:', err);
    return [];
  }
};

export const setPendingXmlStatus = async (nfeKeys: string[], side: PendingXmlSide, status: 'done' | 'dismissed') => {
  if (nfeKeys.length === 0) return;
  try {
    await fetch('/api/xml/pending-imports/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: nfeKeys, side, status })
    });
  } catch (err) {
    console.error('Erro ao atualizar status da nota XML pendente:', err);
  }
};
