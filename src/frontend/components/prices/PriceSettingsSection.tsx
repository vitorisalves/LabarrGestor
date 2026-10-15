import React from 'react';
import { SlidersHorizontal } from 'lucide-react';
import type { PriceParams } from '../../../shared/priceEstimation';
import { normalizeParams, validateParams, PriceSettingsChange } from '../../../shared/priceSettings';
import { fetchPriceSettings, savePriceSettings } from '../../utils/priceEstimationApi';

const SCALAR_FIELDS: Array<{ key: keyof PriceParams; label: string; hint: string }> = [
  { key: 'windowMonths', label: 'Janela de histórico (meses)', hint: 'Compras mais antigas só entram se houver menos de 2 na janela.' },
  { key: 'maxMonthlyTrendPct', label: 'Variação máxima da tendência (% ao mês)', hint: 'Teto do aumento ou queda projetados por mês.' },
  { key: 'maxProjectionMonths', label: 'Projeção máxima (meses)', hint: 'Limite de meses projetados desde a última compra.' },
  { key: 'leadDays', label: 'Prazo até a compra (dias)', hint: '0 = compra imediata, sem projetar aumento.' },
  { key: 'defaultBase', label: 'Margem base padrão (%)', hint: 'Usada quando a categoria não tem margem própria.' },
  { key: 'volK', label: 'Peso da volatilidade', hint: 'Quanto a oscilação dos preços aumenta a margem.' },
  { key: 'ageStartMonths', label: 'Meses sem acréscimo de idade', hint: 'Depois disso a margem cresce com a idade do preço.' },
  { key: 'agePctPerMonth', label: 'Acréscimo por mês de idade (%)', hint: 'Somado à margem a cada mês de preço antigo.' },
  { key: 'minMargin', label: 'Margem mínima (%)', hint: 'Piso da margem de segurança.' },
  { key: 'maxMargin', label: 'Margem máxima (%)', hint: 'Teto da margem de segurança.' },
  { key: 'staleDays', label: 'Dias para preço desatualizado', hint: 'Acima disso a confiança cai para baixa.' },
];

export const PriceSettingsSection: React.FC<{ categories: string[] }> = ({ categories }) => {
  const [enabled, setEnabled] = React.useState(false);
  const [draft, setDraft] = React.useState<Record<string, string>>({});
  const [categoryDraft, setCategoryDraft] = React.useState<Record<string, string>>({});
  const [history, setHistory] = React.useState<PriceSettingsChange[]>([]);
  const [message, setMessage] = React.useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = React.useState(false);

  const load = React.useCallback(async () => {
    const s = await fetchPriceSettings(true);
    if (!s) return;
    setEnabled(s.enabled);
    setHistory(s.history || []);
    const next: Record<string, string> = {};
    SCALAR_FIELDS.forEach(f => { next[f.key] = String(s.params[f.key]); });
    setDraft(next);
    const cats: Record<string, string> = {};
    Object.entries(s.params.baseByCategory).forEach(([k, v]) => { cats[k] = String(v); });
    setCategoryDraft(cats);
  }, []);

  React.useEffect(() => { load(); }, [load]);

  if (!enabled) return null;

  const handleSave = async () => {
    const baseByCategory: Record<string, number> = {};
    Object.entries(categoryDraft).forEach(([k, v]) => {
      if (v.trim() !== '') baseByCategory[k] = Number(v.replace(',', '.'));
    });
    const scalars: Record<string, number> = {};
    SCALAR_FIELDS.forEach(f => { scalars[f.key] = Number((draft[f.key] ?? '').replace(',', '.')); });
    const params = normalizeParams({ ...scalars, baseByCategory } as Partial<PriceParams>);
    const errors = validateParams(params);
    if (errors.length > 0) {
      setMessage({ ok: false, text: errors.join(' ') });
      return;
    }
    setSaving(true);
    const result = await savePriceSettings(params);
    setSaving(false);
    setMessage(result.ok ? { ok: true, text: 'Configurações salvas.' } : { ok: false, text: result.message || 'Não foi possível salvar.' });
    if (result.ok) await load();
  };

  return (
    <section className="space-y-4">
      <h3 className="text-sm font-black text-slate-800 flex items-center gap-3 uppercase tracking-wider">
        <SlidersHorizontal className="w-4 h-4 text-indigo-600" />
        Estimativa de preços
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {SCALAR_FIELDS.map(f => (
          <label key={f.key} className="block p-3 bg-slate-50 border border-slate-100 rounded-xl">
            <span className="block text-[11px] font-black text-slate-700">{f.label}</span>
            <span className="block text-[10px] text-slate-400 font-medium mb-1">{f.hint}</span>
            <input
              type="text"
              inputMode="decimal"
              value={draft[f.key] ?? ''}
              onChange={e => setDraft(prev => ({ ...prev, [f.key]: e.target.value }))}
              className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm font-bold outline-none focus:border-indigo-500"
            />
          </label>
        ))}
      </div>

      <div className="space-y-2">
        <p className="text-[11px] font-black text-slate-700 uppercase tracking-wider">Margem base por categoria (%)</p>
        <p className="text-[10px] text-slate-400 font-medium">Vazio = usa a margem base padrão. Produto com várias categorias usa a maior.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {categories.map(cat => (
            <label key={cat} className="flex items-center justify-between gap-3 p-2 bg-white border border-slate-100 rounded-lg">
              <span className="text-xs font-bold text-slate-700 truncate">{cat}</span>
              <input
                type="text"
                inputMode="decimal"
                value={categoryDraft[cat] ?? ''}
                placeholder="padrão"
                onChange={e => setCategoryDraft(prev => ({ ...prev, [cat]: e.target.value }))}
                className="w-20 px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold text-right outline-none focus:border-indigo-500"
              />
            </label>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-xs font-black uppercase disabled:opacity-50"
        >
          {saving ? 'Salvando...' : 'Salvar configurações'}
        </button>
        {message && (
          <span className={`text-xs font-bold ${message.ok ? 'text-emerald-600' : 'text-rose-600'}`}>{message.text}</span>
        )}
      </div>

      {history.length > 0 && (
        <div className="space-y-1">
          <p className="text-[11px] font-black text-slate-700 uppercase tracking-wider">Últimas alterações</p>
          <div className="max-h-40 overflow-y-auto bg-slate-50 border border-slate-100 rounded-xl divide-y divide-slate-100">
            {[...history].reverse().slice(0, 20).map((h, i) => (
              <p key={i} className="px-3 py-1.5 text-[11px] text-slate-600 font-medium">
                {new Date(h.at).toLocaleString('pt-BR')} · <span className="font-bold">{h.by}</span> · {h.field}: {String(h.before ?? '—')} → {String(h.after ?? '—')}
              </p>
            ))}
          </div>
        </div>
      )}
    </section>
  );
};
