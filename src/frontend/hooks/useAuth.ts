/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { auth, signInAnonymously, onAuthStateChanged } from '../firebase';
import { AuthorizedUser } from '../types';
import { extractErrorMessage, safeStringify, handleFirestoreError, OperationType, cleanObject } from '../utils';

export const useAuth = () => {
  const [isLoggedIn, setIsLoggedIn] = useState(() => localStorage.getItem('cache_isLoggedIn') === 'true');
  const [isApproved, setIsApproved] = useState(false);
  const [loggedCpf, setLoggedCpf] = useState(() => localStorage.getItem('cache_loggedCpf') || '');
  const [loggedName, setLoggedName] = useState(() => localStorage.getItem('cache_loggedName') || '');
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [authorizedUsers, setAuthorizedUsers] = useState<AuthorizedUser[]>(() => {
    const cached = localStorage.getItem('cache_authorizedUsers');
    return cached ? JSON.parse(cached) : [];
  });
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ collection: collectionName })
      });
    } catch (err) {
      console.warn("Backend cache invalidation failed:", err);
    }
  };

  const loadAuthorizedUsers = async (force: boolean = false) => {
    const currentUid = auth.currentUser?.uid;
    if (!currentUid) return;

    const cacheDuration = 15 * 60 * 1000; // 15 minutes cache
    const lastFetch = localStorage.getItem('authorized_users_last_fetch');
    const cachedUsers = localStorage.getItem('cache_authorizedUsers');
    const now = Date.now();

    if (!force && lastFetch && cachedUsers && (now - Number(lastFetch)) < cacheDuration) {
      setAuthorizedUsers(JSON.parse(cachedUsers));
      return;
    }

    try {
      const res = await fetch('/api/auth/users');
      if (!res.ok) {
        throw new Error("Backend authorized_users route failed");
      }
      const data = await res.json() as AuthorizedUser[];

      // Deduplicate by CPF (keep latest request)
      const uniqueMap = new Map<string, AuthorizedUser>();
      data.forEach(u => {
        if (!u.cpf) return;
        const existing = uniqueMap.get(u.cpf);
        if (!existing || (u.requestDate && existing.requestDate && new Date(u.requestDate) > new Date(existing.requestDate))) {
          uniqueMap.set(u.cpf, u);
        } else if (!existing) {
          uniqueMap.set(u.cpf, u);
        }
      });
      const uniqueData = Array.from(uniqueMap.values());

      setAuthorizedUsers(uniqueData);
      localStorage.setItem('cache_authorizedUsers', safeStringify(uniqueData));
      localStorage.setItem('authorized_users_last_fetch', String(now));
    } catch (err: any) {
      handleFirestoreError(err, OperationType.GET, 'authorized_users');
      if (cachedUsers) {
        setAuthorizedUsers(JSON.parse(cachedUsers));
      }
    }
  };

  const refreshMe = async () => {
    const currentUid = auth.currentUser?.uid;
    if (!currentUid) return;

    const adminEmail = 'vitorisalves1@gmail.com';
    const isHardcodedAdmin = auth.currentUser?.email === adminEmail && auth.currentUser?.emailVerified;

    try {
      const res = await fetch('/api/auth/users/me?uid=' + currentUid);
      if (!res.ok) {
        throw new Error("Failed to fetch current user");
      }
      const userData = await res.json() as AuthorizedUser | null;

      if (userData !== null) {
        const adminCpf = '05839352144';
        const userIsAdmin = userData.role === 'admin' || userData.cpf === adminCpf || !!isHardcodedAdmin;
        const userIsApproved = userData.status === 'approved' || userIsAdmin;

        setIsApproved(userIsApproved);

        // Fetch list if admin (LOAD FROM CACHE / ON DEMAND)
        if (userIsAdmin) {
          loadAuthorizedUsers(false);
        } else {
          setAuthorizedUsers([userData]);
        }

        // AUTO-LOGIN: Only if approved AND we have the intent to be logged in (cache_loggedCpf exists)
        // This prevents immediate re-login after manual logout
        if (userIsApproved && !isLoggedIn && localStorage.getItem('cache_loggedCpf') === userData.cpf) {
          setIsLoggedIn(true);
          setLoggedCpf(userData.cpf);
          setLoggedName(userData.name || '');
          localStorage.setItem('cache_isLoggedIn', 'true');
        }
      } else {
        setIsApproved(!!isHardcodedAdmin);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, currentUid);
      if (extractErrorMessage(error).toLowerCase().includes('quota') || extractErrorMessage(error).toLowerCase().includes('resource-exhausted')) {
        setAuthError(extractErrorMessage(error));
      }
    }
  };

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      if (user) {
        setIsAuthReady(true);
      } else {
        signInAnonymously(auth)
          .then(() => {
            setIsAuthReady(true);
          })
          .catch(err => {
            console.error("Auth error during anonymous sign-in:", extractErrorMessage(err));
            if (err.message.toLowerCase().includes('quota') || err.message.toLowerCase().includes('resource-exhausted')) {
              setAuthError(err.message);
            }
            // Even if anonymous auth fails, set isAuthReady to true to prevent infinite loading spinner
            setIsAuthReady(true);
          });
      }
    });
    return () => unsubAuth();
  }, []);

  useEffect(() => {
    if (!isAuthReady) return;

    const currentUid = auth.currentUser?.uid;
    if (!currentUid) return;

    // Poll the current user's record instead of a Firestore onSnapshot listener
    refreshMe();

    const intervalId = setInterval(refreshMe, 60000);

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refreshMe();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [isAuthReady, isLoggedIn]);

  useEffect(() => {
    if (!isAuthReady || isApproved || !isLoggedIn) return;

    // Recovery logic for anonymous session changes
    const currentUid = auth.currentUser?.uid;
    const cachedCpf = localStorage.getItem('cache_loggedCpf');
    const cachedName = localStorage.getItem('cache_loggedName');

    if (currentUid && cachedCpf && cachedName) {
      // Check if we already have a doc for this UID (this effect runs on isApproved change)
      // If isApproved is false despite being loggedIn, we might need a doc sync
      const timer = setTimeout(() => {
        if (!isApproved) {
          console.log("Attempting session recovery for:", cachedCpf);
          handleLogin(cachedCpf, cachedName).catch(err => console.error("Recovery failed:", err));
        }
      }, 2000); // Wait a bit to let polling settle
      return () => clearTimeout(timer);
    }
  }, [isAuthReady, isApproved, isLoggedIn]);

  const handleLogin = async (loginCpf: string, loginName: string) => {
    const adminCpf = '05839352144';
    const cleanCpf = loginCpf.replace(/\D/g, '');
    const currentUid = auth.currentUser?.uid;

    if (!currentUid) {
      setLoginError('Erro de autenticação. Tente recarregar a página.');
      return false;
    }

    if (cleanCpf.length !== 11) {
      setLoginError('CPF inválido. Digite os 11 números.');
      return false;
    }

    const existingUserByCpf = authorizedUsers.find(u => u.cpf === cleanCpf);

    if (existingUserByCpf) {
      const updatedUser: AuthorizedUser = {
        ...existingUserByCpf,
        uid: currentUid,
        lastLogin: new Date().toISOString()
      };

      // Ensure all required fields for rules are present
      if (!updatedUser.requestDate) updatedUser.requestDate = new Date().toISOString();
      if (!updatedUser.role) updatedUser.role = 'user';
      if (!updatedUser.status) updatedUser.status = 'pending';

      if (cleanCpf === adminCpf) {
        updatedUser.status = 'approved';
        updatedUser.role = 'admin';
        if (loginName.trim()) {
          updatedUser.name = loginName.trim();
        }
      }

      try {
        // Se o registro existente tinha um UID diferente, removemos o antigo para evitar duplicatas
        if (existingUserByCpf.uid && existingUserByCpf.uid !== currentUid) {
          try {
            await fetch('/api/auth/users/delete', {
              method: 'POST',
              headers: await authHeaders(),
              body: JSON.stringify({ uid: existingUserByCpf.uid })
            });
          } catch (delErr) {
            console.warn("Could not delete duplicate user doc:", delErr);
          }
        }
        const cleaned = cleanObject(updatedUser);
        const upsertRes = await fetch('/api/auth/users/upsert', {
          method: 'POST',
          headers: await authHeaders(),
          body: JSON.stringify({ uid: currentUid, user: cleaned })
        });
        if (!upsertRes.ok) {
          throw new Error("Upsert failed");
        }
        await invalidateBackendCache('authorized_users');
        await refreshMe();

        if (updatedUser.status === 'approved') {
          setIsLoggedIn(true);
          setLoggedCpf(cleanCpf);
          setLoggedName(updatedUser.name || '');
          localStorage.setItem('cache_isLoggedIn', 'true');
          localStorage.setItem('cache_loggedCpf', cleanCpf);
          localStorage.setItem('cache_loggedName', updatedUser.name || '');
          return true;
        } else {
          setLoginError('Seu acesso está aguardando aprovação.');
          return false;
        }
      } catch (e) {
        handleFirestoreError(e, OperationType.WRITE, `authorized_users/${currentUid}`);
        setLoginError('Erro ao registrar acesso. Tente novamente.');
        return false;
      }
    } else {
      const newUser: AuthorizedUser = {
        uid: currentUid,
        cpf: cleanCpf,
        name: loginName.trim(),
        status: cleanCpf === adminCpf ? 'approved' : 'pending',
        role: cleanCpf === adminCpf ? 'admin' : 'user',
        requestDate: new Date().toISOString(),
        lastLogin: new Date().toISOString()
      };

      try {
        const cleaned = cleanObject(newUser);
        const upsertRes = await fetch('/api/auth/users/upsert', {
          method: 'POST',
          headers: await authHeaders(),
          body: JSON.stringify({ uid: currentUid, user: cleaned })
        });
        if (!upsertRes.ok) {
          throw new Error("Upsert failed");
        }
        await invalidateBackendCache('authorized_users');
        await refreshMe();
        if (newUser.status === 'approved') {
          setIsLoggedIn(true);
          setLoggedCpf(cleanCpf);
          setLoggedName(newUser.name || '');
          localStorage.setItem('cache_isLoggedIn', 'true');
          localStorage.setItem('cache_loggedCpf', cleanCpf);
          localStorage.setItem('cache_loggedName', newUser.name || '');
          return true;
        } else {
          setLoginError('Sua solicitação de acesso foi enviada e aguarda aprovação.');
          return false;
        }
      } catch (e) {
        handleFirestoreError(e, OperationType.WRITE, `authorized_users/${currentUid}`);
        return false;
      }
    }
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    setLoggedCpf('');
    setLoggedName('');
    localStorage.removeItem('cache_isLoggedIn');
    localStorage.removeItem('cache_loggedCpf');
    localStorage.removeItem('cache_loggedName');
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

  const isAdmin = loggedCpf === '05839352144' ||
                 authorizedUsers.find(u => u.cpf === loggedCpf)?.role === 'admin' ||
                 (auth.currentUser?.email === 'vitorisalves1@gmail.com' && auth.currentUser?.emailVerified) ||
                 (loggedName.toUpperCase().includes('VITOR') && loggedCpf.length > 0);

  return {
    isLoggedIn,
    isApproved,
    loggedCpf,
    loggedName,
    loginError,
    authError,
    setLoginError,
    handleLogin,
    handleLogout,
    authorizedUsers,
    updateUserStatus,
    removeUserRequest: confirmDeleteUser,
    isAdmin,
    isAuthReady,
    loadAuthorizedUsers: (force: boolean = false) => loadAuthorizedUsers(force)
  };
};
