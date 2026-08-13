/**
 * Service Worker para Gestor de Fornecedores PWA
 * Especializado em persistência offline e notificações push.
 */

const CACHE_NAME = 'gestor-fornecedores-v6';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json'
];

/**
 * Evento Install: Prepara o cache inicial e força a atualização imediata.
 */
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(ASSETS_TO_CACHE);
    // Permite que o novo SW assuma o controle sem esperar as abas serem fechadas
    self.skipWaiting();
  })());
});

/**
 * Evento Activate: Limpa caches obsoletos e assume o controle dos clientes.
 */
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    // Limpeza de cache atomizada: deleta tudo que não for a versão atual
    await Promise.all(
      keys.map(key => key !== CACHE_NAME && caches.delete(key))
    );
    // Assume controle imediato das janelas abertas
    await self.clients.claim();
  })());
});

/**
 * Evento Fetch: Implementa estratégia de Cache-First com Network-Fallback.
 * Otimizado para não interceptar requisições externas críticas (Firebase/Google Docs).
 */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Filtro preventivo: Não cachear requisições de API, Firebase ou Chrome Extensions
  const shouldSkipCache = 
    url.origin !== self.location.origin || 
    request.method !== 'GET' ||
    url.pathname.includes('/api/') || 
    url.hostname.includes('googleapis.com');

  if (shouldSkipCache) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    
    try {
      const networkResponse = await fetch(request);
      
      // Auto-cache: Salva novos recursos estáticos conforme são acessados
      if (networkResponse?.status === 200) {
        cache.put(request, networkResponse.clone());
      }
      
      return networkResponse;
    } catch (error) {
      // Retorna do cache se a rede falhar
      const cachedResponse = await cache.match(request);
      if (cachedResponse) return cachedResponse;

      // Fallback Offline: Se for navegação, retorna a raiz para manter o SPA funcionando
      if (request.mode === 'navigate') {
        return cache.match('/');
      }
      throw error;
    }
  })());
});

/**
 * Evento Push: Processa notificações em segundo plano enviadas via servidor.
 */
self.addEventListener('push', (event) => {
  let data = {};
  
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = { title: 'Gestor Fornecedores', body: event.data.text() };
    }
  }
  
  const title = data.title || 'Gestor Fornecedores';
  const options = {
    body: data.body || data.message || 'Nova atualização disponível.',
    icon: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTF8VmLyweYpbSL_D3D1F-hsvmGwm9EHcPi5A&s',
    badge: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTF8VmLyweYpbSL_D3D1F-hsvmGwm9EHcPi5A&s',
    vibrate: [200, 100, 200, 100, 200],
    tag: data.tag || 'gestor-update',
    renotify: true,
    data: { 
      url: data.url || '/',
      id: data.id || Date.now()
    },
    // Parâmetros críticos para Android/iOS exibirem na tela de bloqueio
    actions: [
      { action: 'open', title: 'Abrir App' },
      { action: 'close', title: 'Fechar' }
    ]
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

/**
 * Evento NotificationClick: Gerencia o foco e navegação quando o usuário interage.
 */
self.addEventListener('notificationclick', (event) => {
  const { notification, action } = event;
  notification.close();

  if (action === 'close') return;

  event.waitUntil((async () => {
    const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    
    const targetUrl = notification.data?.url || '/';
    
    // Tenta focar em uma aba existente
    for (const client of allClients) {
      if (client.url.includes(targetUrl) && 'focus' in client) {
        return client.focus();
      }
    }

    // Se nenhuma aba estiver aberta, abre uma nova
    if (self.clients.openWindow) {
      return self.clients.openWindow(targetUrl);
    }
  })());
});
