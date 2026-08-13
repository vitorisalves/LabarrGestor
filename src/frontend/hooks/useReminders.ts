/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, getDocs, addDoc, doc, updateDoc, query, orderBy, deleteDoc, where } from 'firebase/firestore';
import { Reminder } from '../types';
import { extractErrorMessage, safeStringify, handleFirestoreError, OperationType, cleanObject } from '../utils';

export const useReminders = (
  isAuthReady: boolean, 
  isApproved: boolean, 
  addAppNotification: (title: string, message: string) => void
) => {
  const [reminders, setReminders] = useState<Reminder[]>(() => {
    const cached = localStorage.getItem('cache_reminders');
    return cached ? JSON.parse(cached) : [];
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    localStorage.setItem('cache_reminders', safeStringify(reminders));
  }, [reminders]);

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

  const checkForDueReminders = (data: Reminder[]) => {
    const now = new Date();
    data.forEach(reminder => {
      if (!reminder.notified) {
        const remDate = new Date(reminder.date);
        if (remDate <= now) {
          addAppNotification(
            "Lembrete de Produto",
            `Está na hora de comprar: ${reminder.productName}`
          );
          // Mark as notified in DB
          if (reminder.id && !reminder.id.startsWith('temp-')) {
            updateDoc(doc(db, 'reminders', reminder.id), { notified: true })
              .then(() => invalidateBackendCache('reminders'))
              .catch(err => {
                handleFirestoreError(err, OperationType.UPDATE, `reminders/${reminder.id}`);
                console.warn("Could not sync reminder status:", err.message);
              });
          }
        }
      }
    });
  };

  const loadReminders = async (force: boolean = false) => {
    if (!isAuthReady || !isApproved) return;

    const cacheDuration = 30 * 1000 * 60; // 30 minutes cache
    const lastFetch = localStorage.getItem('reminders_last_fetch');
    const cachedReminders = localStorage.getItem('cache_reminders');
    const now = Date.now();

    if (!force && lastFetch && cachedReminders && (now - Number(lastFetch)) < cacheDuration) {
      const data = JSON.parse(cachedReminders);
      setReminders(data);
      checkForDueReminders(data);
      return;
    }

    try {
      let data: Reminder[] = [];
      try {
        const res = await fetch('/api/xml/reminders');
        if (res.ok) {
          data = await res.json() as Reminder[];
          data.sort((a, b) => a.date.localeCompare(b.date));
        } else {
          throw new Error("Backend caching route failed");
        }
      } catch (backendErr) {
        console.warn("Backend reminders failed, resorting to client-side Firestore:", backendErr);
        const q = query(collection(db, 'reminders'), orderBy('date', 'asc'));
        const snapshot = await getDocs(q);
        data = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Reminder[];
      }

      setReminders(data);
      localStorage.setItem('cache_reminders', safeStringify(data));
      localStorage.setItem('reminders_last_fetch', String(now));
      checkForDueReminders(data);
    } catch (err: any) {
      handleFirestoreError(err, OperationType.GET, 'reminders');
      if (cachedReminders) {
        const data = JSON.parse(cachedReminders);
        setReminders(data);
        checkForDueReminders(data);
      }
      const isQuota = extractErrorMessage(err).toLowerCase().includes('quota') || extractErrorMessage(err).toLowerCase().includes('resource-exhausted');
      if (!isQuota) console.error("Reminders sync error:", extractErrorMessage(err));
    }
  };

  useEffect(() => {
    loadReminders(false);
  }, [isAuthReady, isApproved, addAppNotification]);

  useEffect(() => {
    if (!isAuthReady || !isApproved) return;
    
    // Check dues every minute locally
    const interval = setInterval(() => {
      checkForDueReminders(reminders);
    }, 60000);

    return () => clearInterval(interval);
  }, [isAuthReady, reminders]);

  const addReminder = async (productName: string, date: string) => {
    // Generate an optimistic local ID
    const tempId = 'temp-' + Date.now();
    const newReminder: Reminder = { id: tempId, productName, date, notified: false };
    
    // Add explicitly to local state (optimistic)
    setReminders(prev => [...prev, newReminder].sort((a,b) => a.date.localeCompare(b.date)));
    
    // Notification for confirmation
    addAppNotification(
      "Lembrete Criado",
      `Notificaremos você sobre "${productName}" em ${new Date(date).toLocaleString('pt-BR')}`
    );

    try {
      const cleaned = cleanObject({
        productName,
        date,
        notified: false
      });
      const docRef = await addDoc(collection(db, 'reminders'), cleaned);
      await invalidateBackendCache('reminders');
      // Replace temporary ID with real Firestore ID
      setReminders(prev => prev.map(r => r.id === tempId ? { ...r, id: docRef.id } : r));
    } catch (err: any) {
      handleFirestoreError(err, OperationType.WRITE, `reminders/${productName}`);
      console.warn("Could not sync reminder to cloud:", err.message);
    }
  };

  const deleteReminder = async (id: string) => {
    // Optimistic delete
    setReminders(prev => prev.filter(r => r.id !== id));
    
    try {
      if (!id.startsWith('temp-')) {
        await deleteDoc(doc(db, 'reminders', id));
        await invalidateBackendCache('reminders');
      }
    } catch (err: any) {
      handleFirestoreError(err, OperationType.DELETE, `reminders/${id}`);
      console.warn("Cloud reminder delete failed:", err.message);
    }
  };

  return {
    reminders,
    refreshReminders: () => loadReminders(true),
    addReminder,
    deleteReminder,
    error
  };
};
