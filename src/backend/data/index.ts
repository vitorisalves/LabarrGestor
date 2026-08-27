import type { DataRepo } from './types.js';
import { firestoreRepo } from './firestoreRepo.js';

const backend = (process.env.DATA_BACKEND || 'firestore').toLowerCase();

if (backend === 'supabase') {
  console.warn('[data] DATA_BACKEND=supabase not implemented yet; falling back to firestore');
}

export const repo: DataRepo = firestoreRepo;
