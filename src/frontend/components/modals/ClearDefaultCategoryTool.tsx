import React from 'react';

type Result = { status: string; applied?: boolean; supplierProducts?: number; pendingItems?: number; reason?: string };

const call = async (apply: boolean): Promise<Result> => {
  const res = await fetch('/api/xml/maintenance/clear-default-category', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apply })
  });
  if (!res.ok) throw new Error('Falha ao consultar o servidor.');
  return res.json();
};

/** Só admin: tira o antigo padrão "Ingredientes" dos produtos (eles ficam sem categoria). */
export const ClearDefaultCategoryTool: React.FC = () => {
  const [busy, setBusy] = React.useState(false);
  const [preview, setPreview] = React.useState<Result | null>(null);
  const [done, setDone] = React.useState<Result | null>(null);
  const [error, setError] = React.useState('');

  const run = async (apply: boolean) => {
    setBusy(true);
    setError('');
    try {
      const r = await call(apply);
      if (apply) { setDone(r); setPreview(null); } else { setPreview(r); setDone(null); }
    } catch (e: any) {
      setError(e?.message || 'Erro inesperado.');
    } finally {
      setBusy(false);
    }
  };

  const total = (preview?.supplierProducts || 0) + (preview?.pendingItems || 0);

  return (
    <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl space-y-2">
      <p className="text-xs font-bold text-slate-600">
        Produtos antigos com a categoria "Ingredientes" (que não está nas Configurações) podem voltar a ficar sem categoria.
      </p>
      {!preview && (
        <button
          onClick={() => run(false)}
          disabled={busy}
          className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold uppercase tracking-widest disabled:opacity-50"
        >
          {busy ? 'Verificando...' : 'Verificar produtos'}
        </button>
      )}
      {preview?.status === 'skipped' && <p className="text-xs font-bold text-slate-600">{preview.reason}</p>}
      {preview?.status === 'success' && (
        <div className="space-y-2">
          <p className="text-xs font-bold text-slate-600">
            {total === 0
              ? 'Nenhum produto com "Ingredientes". Nada a fazer.'
              : `${preview.supplierProducts} produto(s) de fornecedores e ${preview.pendingItems} item(ns) pendente(s) ficarão sem categoria.`}
          </p>
          {total > 0 && (
            <button
              onClick={() => run(true)}
              disabled={busy}
              className="px-4 py-2 bg-red-600 text-white rounded-xl text-xs font-bold uppercase tracking-widest disabled:opacity-50"
            >
              {busy ? 'Aplicando...' : 'Tirar "Ingredientes" agora'}
            </button>
          )}
        </div>
      )}
      {done?.status === 'success' && (
        <p className="text-xs font-bold text-emerald-600">
          Pronto: {done.supplierProducts} produto(s) e {done.pendingItems} item(ns) pendente(s) atualizados. Atualize a página (F5) para ver.
        </p>
      )}
      {error && <p className="text-xs font-bold text-red-500">{error}</p>}
    </div>
  );
};
