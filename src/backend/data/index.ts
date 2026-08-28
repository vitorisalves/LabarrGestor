import type { DataRepo } from './types.js';
import { firestoreRepo } from './firestoreRepo.js';
import { makeSupabaseRepo } from './supabaseRepo.js';

const backend = (process.env.DATA_BACKEND || 'firestore').toLowerCase();

// `makeSupabaseRepo()` é side-effect-free (não toca no client até um método rodar),
// portanto importá-lo sob o backend firestore é inofensivo.
export const repo: DataRepo = backend === 'supabase' ? makeSupabaseRepo() : firestoreRepo;
