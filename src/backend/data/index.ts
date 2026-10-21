import type { DataRepo } from './types.js';
import { firestoreRepo } from './firestoreRepo.js';
import { makeSupabaseRepo } from './supabaseRepo.js';
import { makeMemoryRepo } from './memoryRepo.js';
import { IS_VERCEL } from '../config.js';

/** Escolhe o repositório pelo ambiente. `memory` é só para testes: proibido na Vercel e em produção. */
export function pickRepo(env: { DATA_BACKEND?: string; NODE_ENV?: string }, isVercel: boolean = IS_VERCEL): DataRepo {
  const backend = (env.DATA_BACKEND || 'firestore').toLowerCase();
  if (backend === 'memory') {
    if (isVercel || env.NODE_ENV === 'production') {
      throw new Error('DATA_BACKEND=memory não é permitido em produção.');
    }
    return makeMemoryRepo();
  }
  // `makeSupabaseRepo()` é side-effect-free (não toca no client até um método rodar),
  // portanto importá-lo sob o backend firestore é inofensivo.
  return backend === 'supabase' ? makeSupabaseRepo() : firestoreRepo;
}

export const repo: DataRepo = pickRepo(process.env);
