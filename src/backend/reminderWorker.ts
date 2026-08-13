import { query, collection, where } from 'firebase/firestore/lite';
import { fsOps, getDb } from './firebase.js';
import { PushService } from './services/pushService.js';

/**
 * Worker em segundo plano para verificar lembretes
 */
export const startBackgroundReminderWorker = () => {
  console.log("[ReminderWorker] Inicializando verificação de lembretes (intervalo adaptativo)...");
  
  const DEFAULT_INTERVAL = 900000; // 15 minutos padrão para otimização extrema de leitura de cota
  const QUOTA_EXCEEDED_INTERVAL = 7200000; // 2 horas de pausa em caso de quota excedida
  
  let currentDelay = DEFAULT_INTERVAL;
  let timerId: NodeJS.Timeout | null = null;

  async function checkLoop() {
    try {
      const nowStr = new Date().toISOString();
      let snapshot;
      
      const db = await getDb();
      if (db.collection) {
        // Admin SDK Query
        const q = db.collection('reminders')
          .where('notified', '==', false)
          .where('date', '<=', nowStr);
        snapshot = await fsOps.getDocs(q, 'reminders_pending', true);
      } else {
        // Client SDK Query
        const remindersColl = collection(db as any, 'reminders');
        const q = query(
          remindersColl, 
          where('notified', '==', false),
          where('date', '<=', nowStr)
        );
        snapshot = await fsOps.getDocs(q, 'reminders_pending', true);
      }

      // Reset standard delay on successful check
      currentDelay = DEFAULT_INTERVAL;

      if (snapshot && !snapshot.empty && snapshot.docs) {
        console.log(`[ReminderWorker] Processando ${snapshot.docs.length} lembretes pendentes...`);

        for (const reminderDoc of snapshot.docs) {
          const reminder = reminderDoc.data();
          const title = "Lembrete de Produto";
          const message = `Está na hora de comprar: ${reminder.productName}`;

          await PushService.broadcast(title, message);

          try {
            const targetRef = reminderDoc.ref || fsOps.doc('reminders', reminderDoc.id);
            await fsOps.update(targetRef, { notified: true }, `reminders/${reminderDoc.id}`);
          } catch (updateErr) {
            console.error(`[ReminderWorker] Erro ao atualizar lembrete ${reminderDoc.id}:`, updateErr);
          }
        }
      }
    } catch (err: any) {
      const errStr = String(err?.message || err).toLowerCase();
      if (errStr.includes('quota exceeded') || errStr.includes('quota') || errStr.includes('resource-exhausted') || errStr.includes('limit')) {
        console.warn(`[ReminderWorker] Quota do Firestore atingida/excedida. Reduzindo frequência para 1 hora para economizar recursos. Erro original: ${err.message || err}`);
        currentDelay = QUOTA_EXCEEDED_INTERVAL;
      } else {
        console.error("[ReminderWorker] Erro no ciclo de verificação:", err);
        // On generic error, double the standard interval temporarily up to 30 mins
        currentDelay = Math.min(currentDelay * 2, 1800000);
      }
    } finally {
      timerId = setTimeout(checkLoop, currentDelay);
    }
  }

  // Primeiro disparo após o atraso inicial
  timerId = setTimeout(checkLoop, currentDelay);
};
