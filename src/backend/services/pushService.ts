import webPush from "web-push";
import { PUSH_CONFIG } from "../config.js";
import { fsOps } from "../firebase.js";

/**
 * Serviço de Notificações Push
 */
export class PushService {
  static init() {
    try {
      webPush.setVapidDetails(
        PUSH_CONFIG.email,
        PUSH_CONFIG.publicKey,
        PUSH_CONFIG.privateKey
      );
      console.log("[PushService] VAPID details initialized successfully.");
    } catch (err) {
      console.error("[PushService] Failed to initialize VAPID details:", err);
    }
  }

  /**
   * Envia uma notificação para uma única subscrição
   */
  static async sendNotification(subscription: any, title: string, message: string, url: string = '/') {
    const payload = JSON.stringify({
      title,
      body: message,
      url,
      tag: 'gestor-update-' + Date.now()
    });

    try {
      await webPush.sendNotification(subscription, payload);
      return true;
    } catch (err: any) {
      // Remove subscrição se ela não for mais válida (404 ou 410)
      if (err.statusCode === 404 || err.statusCode === 410) {
        const docId = Buffer.from(subscription.endpoint).toString('base64').substring(0, 50);
        try {
          await fsOps.delete(fsOps.doc('push_subscriptions', docId));
        } catch (e) {
          console.error("[PushService] Erro ao remover inscrição inválida:", e);
        }
      }
      return false;
    }
  }

  /**
   * Envia uma notificação para todos os inscritos
   */
  static async broadcast(title: string, message: string, url: string = '/') {
    const snapshot = await fsOps.getDocs('push_subscriptions');
    const subscriptions = snapshot.docs.map((doc: any) => doc.data());

    const results = await Promise.all(
      subscriptions.map((sub: any) => this.sendNotification(sub, title, message, url))
    );

    return results.filter(Boolean).length;
  }
}
