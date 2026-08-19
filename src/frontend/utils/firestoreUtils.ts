/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { auth } from '../firebase';
import { safeStringify } from './formatters';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function cleanObject<T extends object>(obj: T): T {
  const result = { ...obj } as any;
  Object.keys(result).forEach(key => {
    if (result[key] === undefined) {
      delete result[key];
    } else if (typeof result[key] === 'object' && result[key] !== null) {
      if (Array.isArray(result[key])) {
        result[key] = result[key].map((item: any) =>
          typeof item === 'object' && item !== null ? cleanObject(item) : item
        );
      } else {
        result[key] = cleanObject(result[key]);
      }
    }
  });
  return result;
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  const stringified = safeStringify(errInfo);
  
  // Skip throwing for NOT_FOUND / 404
  const errMsgLower = errInfo.error.toLowerCase();
  if (errMsgLower.includes('not found') || errMsgLower.includes('404')) {
    console.warn('Firestore Warn (Not Found): ', stringified);
    return;
  }

  // Skip throwing for Quota Exceeded/Resource Exhaustion
  if (
    errMsgLower.includes('quota') ||
    errMsgLower.includes('resource-exhausted') ||
    errMsgLower.includes('limit') ||
    errMsgLower.includes('exhausted')
  ) {
    console.warn('Firestore Warn (Quota Exceeded): ', stringified);
    return;
  }
  
  console.error('Firestore Error: ', stringified);
  throw new Error(stringified);
}
