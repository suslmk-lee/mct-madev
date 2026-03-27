import { createServer as createHttpServer, type Server as HttpServer } from 'node:http';
import type express from 'express';
import { createApp, type AppOptions } from './app.js';
import { createWebSocketServer, type WebSocketManager } from './websocket/index.js';
import type { ServerDatabase } from './database.js';

export interface ServerInstance {
  app: express.Express;
  server: HttpServer;
  wss: WebSocketManager;
  listen: (port?: number, host?: string) => Promise<{ port: number; host: string }>;
  close: () => Promise<void>;
}

export interface ServerOptions extends AppOptions {
  /** Port to listen on (default: 3001) */
  port?: number;
  /** Host to bind to (default: '0.0.0.0') */
  host?: string;
  /** Database instance for API routes */
  db?: ServerDatabase;
}

export function createServer(options: ServerOptions = {}): ServerInstance {
  // Create HTTP server first so we can attach WebSocket
  const tempApp = createApp({ staticDir: options.staticDir, corsOrigin: options.corsOrigin });
  const server = createHttpServer(tempApp);
  const wss = createWebSocketServer(server, options.db);

  // Now create the real app with db and wss injected
  const app = createApp({ ...options, wss });

  // Replace the request handler on the server
  server.removeAllListeners('request');
  server.on('request', app);

  function listen(
    port = options.port ?? 3001,
    host = options.host ?? '0.0.0.0',
  ): Promise<{ port: number; host: string }> {
    return new Promise((resolve, reject) => {
      server.on('error', reject);
      server.listen(port, host, () => {
        const addr = server.address();
        const resolvedPort =
          typeof addr === 'object' && addr ? addr.port : port;
        const resolvedHost =
          typeof addr === 'object' && addr ? addr.address : host;
        resolve({ port: resolvedPort, host: resolvedHost });
      });
    });
  }

  function close(): Promise<void> {
    return new Promise((resolve) => {
      wss.close();
      // Force-close timeout so shutdown never hangs
      const forceTimer = setTimeout(() => {
        server.closeAllConnections?.();
        resolve();
      }, 3000);
      server.close(() => {
        clearTimeout(forceTimer);
        resolve();
      });
      // Destroy keep-alive connections immediately (Node 18.2+)
      server.closeAllConnections?.();
    });
  }

  return { app, server, wss, listen, close };
}
