import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import app from "./app.js";

async function startServer() {
  const PORT = Number(process.env.PORT || 3000);

  // --- MIDDLEWARE VITE / SERVIDO DE ARQUIVOS ESTÁTICOS ---
  // Configura o Vite para desenvolvimento ou serve a pasta 'dist' em produção.
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // --- INICIALIZAÇÃO DO SERVIDOR ---
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
