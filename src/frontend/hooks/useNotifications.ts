/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback, useEffect } from 'react';
import { UINotification, AppNotification } from '../types';
import { extractErrorMessage } from '../utils';

export const useNotifications = () => {
  const [notifications, setNotifications] = useState<UINotification[]>([]);
  const [appNotifications, setAppNotifications] = useState<AppNotification[]>([]);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);

  const urlBase64ToUint8Array = (base64String: string) => {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  };

  // Compara a applicationServerKey de uma inscrição existente com a chave
  // desejada. Se o par VAPID do servidor mudou, a inscrição antiga passa a
  // ser recusada pelo FCM com 403 ("invalid JWT") e precisa ser refeita.
  const sameServerKey = (existing: PushSubscription, desired: Uint8Array): boolean => {
    const current = existing.options?.applicationServerKey;
    if (!current) return false;
    const a = new Uint8Array(current as ArrayBuffer);
    if (a.length !== desired.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== desired[i]) return false;
    return true;
  };

  const subscribeToPush = async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      console.warn('Push não suportado neste navegador.');
      return;
    }

    try {
      const registration = await navigator.serviceWorker.ready;

      // Busca a chave pública do servidor
      const response = await fetch('/api/notifications/vapid-key');
      const responseText = await response.text();
      if (!responseText) return;

      const { publicKey } = JSON.parse(responseText);

      if (!publicKey) return;

      const desiredKey = urlBase64ToUint8Array(publicKey);

      // Se já existe uma inscrição criada com outra chave VAPID, o navegador
      // recusaria um novo subscribe() com chave diferente — é preciso cancelar
      // a antiga primeiro.
      const existing = await registration.pushManager.getSubscription();
      if (existing && !sameServerKey(existing, desiredKey)) {
        try { await existing.unsubscribe(); } catch (e) { console.warn('Falha ao cancelar inscrição antiga:', e); }
      }

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: desiredKey
      });

      // Envia a assinatura para o backend
      const regRes = await fetch('/api/notifications/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(subscription.toJSON())
      });

      if (regRes.ok) {
        console.log('Inscrito no Web Push com sucesso!');
      } else {
        const errorText = await regRes.text();
        let errorData = errorText;
        try {
          if (errorText) errorData = JSON.parse(errorText);
        } catch (e) {}
        console.error('Erro ao salvar inscrição no servidor:', errorData);
      }
    } catch (err) {
      console.error('Falha ao inscrever no Push:', extractErrorMessage(err));
    }
  };

  // Endpoint da própria inscrição push deste dispositivo, para que o backend
  // não reenvie via push aquilo que já foi exibido localmente.
  const getOwnEndpoint = async (): Promise<string | null> => {
    try {
      if (!('serviceWorker' in navigator)) return null;
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      return subscription?.endpoint ?? null;
    } catch {
      return null;
    }
  };

  const pushAppNotification = useCallback((title: string, message: string, type: 'forecast' | 'default' = 'default') => {
    const id = Math.random().toString(36).substr(2, 9);
    setAppNotifications(prev => [{
      id,
      title,
      message,
      date: new Date().toISOString(),
      read: false,
      type
    }, ...prev]);
  }, []);

  const requestPermission = async () => {
    if (!('Notification' in window)) {
      alert('Seu navegador não suporta notificações nativas.');
      return;
    }
    
    try {
      const permission = await Notification.requestPermission();
      
      if (permission === 'granted') {
        if ('vibrate' in navigator) {
          navigator.vibrate([100, 50, 100]);
        }
        
        // Ativa o Web Push após a permissão ser concedida
        await subscribeToPush();

        new Notification('Notificações Ativadas!', {
          body: 'Você agora receberá alertas de lembretes e listas neste dispositivo.',
          icon: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTF8VmLyweYpbSL_D3D1F-hsvmGwm9EHcPi5A&s'
        });
      } else if (permission === 'denied') {
        const isIframe = window.self !== window.top;
        if (!isIframe) {
          alert('Permissão negada. Ative as notificações nas configurações do navegador/celular para receber lembretes.');
        } else {
          console.warn('Permissão negada em iframe. Tente abrir em uma nova aba.');
        }
      }
    } catch (error) {
      console.error('Erro ao solicitar permissão:', extractErrorMessage(error));
    }
  };

  const addNotification = useCallback((name: string, quantity: number, type: 'cart' | 'info' = 'info') => {
    const id = Math.random().toString(36).substr(2, 9);
    setNotifications(prev => [...prev, { id, name, quantity, type }]);
    
    // Pequena vibração ao adicionar ao carrinho
    if (type === 'cart' && 'vibrate' in navigator) {
      navigator.vibrate(50);
    }

    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 3000);
  }, []);

  const addAppNotification = useCallback((title: string, message: string, type?: 'forecast' | 'default') => {
    // Registro imediato na central de avisos do app.
    pushAppNotification(title, message, type ?? 'default');

    // Entrega ao servidor: o Service Worker é o único ponto que decide entre
    // aviso in-app (PWA aberto) e notificação do sistema (PWA fechado).
    // `excludeEndpoint` evita eco de push para este mesmo dispositivo.
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      getOwnEndpoint().then(excludeEndpoint => {
        fetch('/api/notifications/broadcast', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, message, excludeEndpoint })
        }).catch(err => console.warn('Falha no broadcast push:', err));
      });
    }
  }, [pushAppNotification]);

  // PWA aberto: o Service Worker repassa o push para exibição in-app.
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

    const handler = (event: MessageEvent) => {
      const data = event.data;
      if (!data || data.type !== 'PUSH_NOTIFICATION') return;
      const payload = data.payload || {};
      pushAppNotification(payload.title || 'Aviso', payload.body || '', 'default');
    };

    navigator.serviceWorker.addEventListener('message', handler);
    return () => navigator.serviceWorker.removeEventListener('message', handler);
  }, [pushAppNotification]);

  const markAllAsRead = () => {
    setAppNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  // Tenta re-inscrever automaticamente se a permissão já estiver concedida
  // Isso garante que o servidor sempre tenha o token mais atualizado
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'granted') {
        subscribeToPush();
      }
    }
  }, []);

  const clearNotifications = () => {
    setAppNotifications([]);
  };

  return {
    notifications,
    appNotifications,
    isNotificationsOpen,
    setIsNotificationsOpen,
    addNotification,
    addAppNotification,
    markAllAsRead,
    clearNotifications,
    requestPermission
  };
};
