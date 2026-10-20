/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback } from 'react';
import { auth, googleProvider, signInWithPopup, signOut, onAuthStateChanged } from '../firebase';
import { AuthorizedUser } from '../types';
import { extractErrorMessage, safeStringify, handleFirestoreError, OperationType } from '../utils';
import { userCan, isReadOnlyUser, PermissionSubject } from '../../shared/permissions';

const USERS_CACHE_KEY = 'cache_authorizedUsers';
const USERS_FETCH_KEY = 'authorized_users_last_fetch';

// Login com conta Google. Quem decide papel, status e permissões é sempre o servidor
// (/api/auth/session e /api/auth/users/me); o navegador só mostra o que o servidor devolveu.
export const useAuth = () => {
  const [isApproved, setIsApproved] = useState(false);
  const [loggedName, setLoggedName] = useState('');
  const [loggedCpf, setLoggedCpf] = useState('');
  const [signedInEmail, setSignedInEmail] = useState('');
  const [isAuthReady, setIsAuthReady] = useState(false);
  // Enquanto o servidor ainda não respondeu sobre o acesso, não mostramos "aguardando aprovação".
  const [isCheckingAccess, setIsCheckingAccess] = useState(false);
  // Papel/status/permissões da pessoa logada, como o servidor tem registrado.
  const [myAccess, setMyAccess] = useState<PermissionSubject | null>(null);
  const [authorizedUsers, setAuthorizedUsers] = useState<AuthorizedUser[]>([]);
  const [loginError, setLoginError] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);

  const authHeaders = async (): Promise<Record<string, string>> => {
    const t = await auth.currentUser?.getIdToken().catch(() => undefined);
    return t
      ? { 'Content-Type': 'application/json', 'Authorization': `Bearer ${t}` }
      : { 'Content-Type': 'application/json' };
  };

  const invalidateBackendCache = async (collectionName: string) => {
    try {
      await fetch('/api/xml/cache/invalidate', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({ collection: collectionName })
      });
    } catch (err) {
      console.warn("Backend cache invalidation failed:", err);
    }
  };

  const clearLocalSession = () => {
    setIsApproved(false);
    setMyAccess(null);
    setLoggedName('');
    setLoggedCpf('');
    setSignedInEmail('');
    setAuthorizedUsers([]);
    try {
      localStorage.removeItem(USERS_CACHE_KEY);
      localStorage.removeItem(USERS_FETCH_KEY);
    } catch { /* storage indisponível */ }
  };

  const loadAuthorizedUsers = async (force: boolean = false) => {
    if (!auth.currentUser) return;

    const cacheDuration = 20 * 1000; // lista curta: novas solicitações de acesso precisam aparecer logo
    let lastFetch: string | null = null;
    let cachedUsers: string | null = null;
    try {
      lastFetch = localStorage.getItem(USERS_FETCH_KEY);
      cachedUsers = localStorage.getItem(USERS_CACHE_KEY);
    } catch { /* storage indisponível */ }
    const now = Date.now();

    if (!force && lastFetch && cachedUsers && (now - Number(lastFetch)) < cacheDuration) {
      setAuthorizedUsers(JSON.parse(cachedUsers));
      return;
    }

    try {
      const res = await fetch(force ? '/api/auth/users?fresh=true' : '/api/auth/users');
      if (!res.ok) {
        throw new Error("Backend authorized_users route failed");
      }
      const data = await res.json() as AuthorizedUser[];
      setAuthorizedUsers(data);
      try {
        localStorage.setItem(USERS_CACHE_KEY, safeStringify(data));
        localStorage.setItem(USERS_FETCH_KEY, String(now));
      } catch { /* storage indisponível */ }
    } catch (err: any) {
      handleFirestoreError(err, OperationType.GET, 'authorized_users');
      if (cachedUsers) {
        setAuthorizedUsers(JSON.parse(cachedUsers));
      }
    }
  };

  // Registra a sessão no servidor (cria o cadastro como pendente se for a primeira vez).
  const registerSession = async (): Promise<boolean> => {
    try {
      const res = await fetch('/api/auth/session', {
        method: 'POST',
        headers: await authHeaders(),
        body: '{}'
      });
      return res.ok;
    } catch {
      return false;
    }
  };

  const refreshMe = useCallback(async () => {
    if (!auth.currentUser) return;

    const readMe = async (): Promise<{ ok: boolean; data: AuthorizedUser | null }> => {
      const res = await fetch('/api/auth/users/me');
      if (!res.ok) return { ok: false, data: null };
      return { ok: true, data: await res.json() as AuthorizedUser | null };
    };

    try {
      let me = await readMe();
      if (me.ok && me.data === null) {
        // Primeira vez desta conta: cria o cadastro (pendente) e lê de novo.
        await registerSession();
        me = await readMe();
      }
      if (!me.ok) throw new Error("Failed to fetch current user");

      const userData = me.data;
      if (userData) {
        const userIsAdmin = userData.role === 'admin';
        const userIsApproved = userData.status === 'approved';
        setIsApproved(userIsApproved);
        setLoggedName(userData.name || auth.currentUser?.displayName || '');
        setLoggedCpf(userData.cpf || '');
        setMyAccess({
          role: userIsAdmin ? 'admin' : 'user',
          status: userData.status,
          permissions: Array.isArray(userData.permissions) ? userData.permissions : []
        });

        const canManageUsers = userIsApproved && (userIsAdmin ||
          (userData.permissions || []).includes('users.approve') ||
          (userData.permissions || []).includes('users.manage'));
        if (canManageUsers) {
          loadAuthorizedUsers(false);
        } else {
          setAuthorizedUsers([userData]);
        }
      } else {
        setIsApproved(false);
        setMyAccess(null);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, auth.currentUser?.uid || 'me');
      const msg = extractErrorMessage(error).toLowerCase();
      if (msg.includes('quota') || msg.includes('resource-exhausted')) {
        setAuthError(extractErrorMessage(error));
      }
    } finally {
      setIsCheckingAccess(false);
    }
  }, []);

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      // Sessões anônimas do sistema antigo não servem mais: saem e pedem o login Google.
      if (user && user.isAnonymous) {
        signOut(auth).catch(() => {});
        return;
      }
      if (user) {
        setSignedInEmail(user.email || '');
        setIsCheckingAccess(true);
      } else {
        clearLocalSession();
        setIsCheckingAccess(false);
      }
      setIsAuthReady(true);
    });
    return () => unsubAuth();
  }, []);

  // Com sessão Google ativa: confere o acesso agora, a cada minuto e ao voltar para a aba.
  useEffect(() => {
    if (!isAuthReady || !signedInEmail) return;

    refreshMe();
    const intervalId = setInterval(refreshMe, 60000);
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') refreshMe();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [isAuthReady, signedInEmail, refreshMe]);

  const loginWithGoogle = async () => {
    setLoginError('');
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err: any) {
      const code = String(err?.code || '');
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return;
      if (code === 'auth/popup-blocked') {
        setLoginError('O navegador bloqueou a janela de login. Libere pop-ups para este site e tente de novo.');
      } else if (code === 'auth/unauthorized-domain') {
        setLoginError('Este endereço ainda não está autorizado para login. Avise o administrador.');
      } else {
        setLoginError('Não foi possível entrar com o Google. Tente novamente.');
      }
      console.error('Google sign-in error:', extractErrorMessage(err));
    }
  };

  const handleLogout = () => {
    clearLocalSession();
    signOut(auth).catch(() => {});
  };

  const updateUserStatus = async (uid: string, status: 'approved' | 'denied') => {
    try {
      const res = await fetch('/api/auth/users/status', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({ uid, status })
      });
      if (!res.ok) {
        throw new Error("Status update failed");
      }
      await invalidateBackendCache('authorized_users');
      setAuthorizedUsers(prev => {
        if (status === 'denied') {
          return prev.filter(u => u.uid !== uid);
        } else {
          return prev.map(u => u.uid === uid ? { ...u, status } : u);
        }
      });
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `authorized_users/${uid}`);
    }
  };

  const updateUserPermissions = async (uid: string, permissions: string[]) => {
    const previous = authorizedUsers;
    // Atualiza na tela já; volta atrás se o servidor recusar.
    setAuthorizedUsers(prev => prev.map(u => u.uid === uid ? { ...u, permissions } : u));
    try {
      const res = await fetch('/api/auth/users/permissions', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({ uid, permissions })
      });
      if (!res.ok) {
        throw new Error('Permissions update failed');
      }
      const data = await res.json();
      if (Array.isArray(data.permissions)) {
        setAuthorizedUsers(prev => prev.map(u => u.uid === uid ? { ...u, permissions: data.permissions } : u));
      }
      await invalidateBackendCache('authorized_users');
    } catch (e) {
      setAuthorizedUsers(previous);
      handleFirestoreError(e, OperationType.WRITE, `authorized_users/${uid}`);
    }
  };

  const confirmDeleteUser = async (uid: string) => {
    try {
      const res = await fetch('/api/auth/users/delete', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({ uid })
      });
      if (!res.ok) {
        throw new Error("Delete failed");
      }
      await invalidateBackendCache('authorized_users');
      setAuthorizedUsers(prev => prev.filter(u => u.uid !== uid));
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `authorized_users/${uid}`);
    }
  };

  // Tudo vem do que o servidor devolveu: o navegador não decide quem é admin.
  const isAdmin = myAccess?.role === 'admin' && myAccess?.status === 'approved';
  const can = (permission: string) => isAdmin || userCan(myAccess, permission);
  const isReadOnly = isApproved && !isAdmin && isReadOnlyUser(myAccess);

  return {
    // Entrou no app = conta Google aprovada.
    isLoggedIn: isApproved,
    isApproved,
    // Conta Google ativa que ainda não foi aprovada (mostra a tela de espera).
    isPendingApproval: !!signedInEmail && !isApproved && !isCheckingAccess,
    signedInEmail,
    loggedCpf,
    loggedName,
    loginError,
    authError,
    setLoginError,
    loginWithGoogle,
    handleLogout,
    authorizedUsers,
    updateUserStatus,
    updateUserPermissions,
    removeUserRequest: confirmDeleteUser,
    isAdmin,
    can,
    isReadOnly,
    isAuthReady,
    loadAuthorizedUsers: (force: boolean = false) => loadAuthorizedUsers(force)
  };
};
