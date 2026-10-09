/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Catálogo de permissões e regras de rota, compartilhado entre front e backend.
//
// Modelo: toda pessoa aprovada começa SOMENTE LEITURA (sem nenhuma permissão).
// Admin tem tudo. Cada permissão liberada pelo painel de configurações vale só
// para aquela pessoa. O backend é quem decide (ver `requiredPermission`); o front
// usa o mesmo catálogo só para esconder/desabilitar o que a pessoa não pode usar.
//
// ATENÇÃO: a lista abaixo é um ponto de partida por área do sistema. Para criar ou
// refinar permissões, edite PERMISSIONS (o que aparece nas configurações) e
// ROUTE_RULES (qual permissão cada rota de escrita exige).

export interface PermissionDef {
  id: string;
  label: string;
  group: string;
}

export const PERMISSIONS: PermissionDef[] = [
  // Acessos
  { id: 'users.approve', label: 'Aprovar ou recusar solicitações de acesso', group: 'Acessos' },
  { id: 'users.manage', label: 'Gerenciar permissões e remover acessos', group: 'Acessos' },

  // Compras
  { id: 'suppliers.edit', label: 'Editar fornecedores e produtos', group: 'Compras' },
  { id: 'lists.edit', label: 'Criar e editar listas de compras e requisições', group: 'Compras' },
  { id: 'orders.approve', label: 'Aprovar ou recusar requisições e compras', group: 'Compras' },
  { id: 'delivered.edit', label: 'Atualizar produtos entregues', group: 'Compras' },
  { id: 'reminders.edit', label: 'Criar e editar lembretes', group: 'Compras' },

  // Dashboard
  { id: 'invoices.import', label: 'Importar notas fiscais (XML)', group: 'Dashboard' },
  { id: 'dashboard.manage', label: 'Gerenciar gastos, pendentes e limites do dashboard', group: 'Dashboard' },

  // Sistema
  { id: 'config.manage', label: 'Gerenciar categorias e setores', group: 'Sistema' },
  { id: 'ai.use', label: 'Usar as ferramentas de IA', group: 'Sistema' },
];

export const PERMISSION_IDS = new Set(PERMISSIONS.map(p => p.id));

// Regra de uma rota que grava dados:
//   string  -> exige essa permissão
//   null    -> qualquer pessoa aprovada (ex.: registrar o próprio aparelho para notificações)
//   'admin' -> somente admin
export type RouteRule = string | null | 'admin';

// Primeira regra que casar com o início do caminho (sem o /api) vence.
// Escrita sem regra correspondente exige admin (negar por padrão).
const ROUTE_RULES: Array<[prefix: string, rule: RouteRule]> = [
  ['/xml/suppliers/delete-all', 'admin'],
  ['/xml/suppliers', 'suppliers.edit'],
  ['/xml/products/delete-item', 'dashboard.manage'],
  ['/xml/products/', 'suppliers.edit'],
  ['/xml/shopping_lists', 'lists.edit'],
  ['/xml/purchase_orders/approve-requisition', 'orders.approve'],
  ['/xml/purchase_orders/approve', 'orders.approve'],
  ['/xml/purchase_orders/reject', 'orders.approve'],
  ['/xml/purchase_orders', 'lists.edit'],
  ['/xml/delivered_products', 'delivered.edit'],
  ['/xml/reminders', 'reminders.edit'],
  ['/xml/process', 'invoices.import'],
  ['/xml/pending-imports', 'invoices.import'],
  ['/xml/pending-list-products', 'dashboard.manage'],
  ['/xml/price-increases', 'dashboard.manage'],
  ['/xml/list-spendings', 'dashboard.manage'],
  ['/xml/spendings', 'dashboard.manage'],
  ['/xml/invoices', 'dashboard.manage'],
  ['/xml/setor-limits', 'dashboard.manage'],
  ['/xml/setores', 'config.manage'],
  ['/xml/categories', 'config.manage'],
  ['/ai/', 'ai.use'],
  ['/xml/cache/invalidate', null],
  ['/notifications/subscribe', null],
];

export const requiredPermission = (path: string): RouteRule => {
  for (const [prefix, rule] of ROUTE_RULES) {
    if (path.startsWith(prefix)) return rule;
  }
  return 'admin';
};

export interface PermissionSubject {
  role?: string;
  status?: string;
  permissions?: string[];
}

export const isAdminUser = (u: PermissionSubject | null | undefined): boolean => !!u && u.role === 'admin';

export const userCan = (u: PermissionSubject | null | undefined, permission: string): boolean => {
  if (!u) return false;
  if (u.role === 'admin') return true;
  if (u.status !== 'approved') return false;
  return Array.isArray(u.permissions) && u.permissions.includes(permission);
};

// Pessoa aprovada, não admin e sem nenhuma permissão: só consegue ver as páginas.
export const isReadOnlyUser = (u: PermissionSubject | null | undefined): boolean =>
  !!u && u.role !== 'admin' && (!Array.isArray(u.permissions) || u.permissions.length === 0);
