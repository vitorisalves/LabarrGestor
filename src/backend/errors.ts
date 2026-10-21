/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { randomUUID } from 'node:crypto';

export interface PublicError {
  status: number;
  body: { error: string; message: string; ref?: string };
}

export const isProductionEnv = (env: NodeJS.ProcessEnv = process.env): boolean =>
  env.NODE_ENV === 'production' || !!env.VERCEL;

const newRef = () => randomUUID().replace(/-/g, '').slice(0, 8);

/** O que o cliente vê. Em produção, erro 5xx não mostra o texto técnico: só um código de referência. */
export function describeError(err: any, opts: { production: boolean; ref?: string }): PublicError {
  const raw = Number(err?.status);
  const status = Number.isInteger(raw) && raw >= 400 && raw <= 599 ? raw : 500;
  const original = String(err?.message || 'Ocorreu um erro inesperado.');

  if (status < 500) {
    return { status, body: { error: err?.name || 'Erro', message: original } };
  }
  if (!opts.production) {
    return { status, body: { error: err?.name || 'Erro no servidor', message: original } };
  }
  const ref = opts.ref || newRef();
  return {
    status,
    body: {
      error: 'Erro no servidor',
      message: `Algo deu errado do nosso lado. Se continuar, informe o código ${ref}.`,
      ref,
    },
  };
}

/** Para rotas que respondem o 500 na mão: registra o detalhe no log e devolve o texto seguro. */
export function internalErrorMessage(err: any, label = 'Erro'): string {
  const production = isProductionEnv();
  const ref = newRef();
  console.error(`[${label}] ref=${ref}`, err?.stack || err?.message || err);
  return production ? `Algo deu errado do nosso lado. Se continuar, informe o código ${ref}.` : String(err?.message || err);
}
