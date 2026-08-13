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

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey)
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
    const id = Math.random().toString(36).substr(2, 9);
    const newNotif: AppNotification = {
      id,
      title,
      message,
      date: new Date().toISOString(),
      read: false,
      type
    };

    // Notificação Nativa do Navegador (Sistema/Celular)
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'granted') {
        const options: any = {
          body: message,
          icon: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTF8VmLyweYpbSL_D3D1F-hsvmGwm9EHcPi5A&s',
          badge: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTF8VmLyweYpbSL_D3D1F-hsvmGwm9EHcPi5A&s',
          tag: title.replace(/\s+/g, '-').toLowerCase(),
          requireInteraction: true,
          vibrate: [200, 100, 200, 100, 200],
          actions: [
            { action: 'open', title: 'Ver Agora' }
          ]
        };

        try {
          // 1. Notificação Local via Service Worker (Imediato)
          if ('serviceWorker' in navigator) {
            navigator.serviceWorker.ready.then(registration => {
              registration.showNotification(title, options);
            });
          }

          // 2. Notificação via Push API (Para outros dispositivos e segundo plano real)
          fetch('/api/notifications/broadcast', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, message })
          }).catch(err => console.warn('Falha no broadcast push:', err));

        } catch (e) {
          console.warn('Erro ao enviar notificação:', e);
        }
      }
    }

    setAppNotifications(prev => [newNotif, ...prev]);
  }, []);

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
