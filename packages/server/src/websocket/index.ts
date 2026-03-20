import { WebSocketServer, type WebSocket } from 'ws';
import type { Server as HttpServer } from 'node:http';
import { EventEmitter } from 'node:events';
import type { SystemEvent } from '@mct-madev/core';

const HEARTBEAT_INTERVAL = 30_000;

interface ClientMeta {
  isAlive: boolean;
  /** Set of project IDs this client is subscribed to */
  subscriptions: Set<string>;
}

export interface WebSocketManager extends EventEmitter {
  wss: WebSocketServer;
  /** Broadcast an event to all connected clients */
  broadcast: (event: SystemEvent) => void;
  /** Broadcast an event only to clients subscribed to a specific project */
  broadcastToProject: (projectId: string, event: SystemEvent) => void;
  close: () => void;
}

interface ClientCommand {
  type: 'subscribe' | 'unsubscribe';
  projectId: string;
}

export function createWebSocketServer(server: HttpServer): WebSocketManager {
  const emitter = new EventEmitter() as WebSocketManager;
  const clients = new Map<WebSocket, ClientMeta>();

  const wss = new WebSocketServer({ server });

  // Heartbeat: detect broken connections
  const heartbeat = setInterval(() => {
    for (const [ws, meta] of clients) {
      if (!meta.isAlive) {
        ws.terminate();
        clients.delete(ws);
        continue;
      }
      meta.isAlive = false;
      ws.ping();
    }
  }, HEARTBEAT_INTERVAL);

  wss.on('connection', (ws: WebSocket) => {
    clients.set(ws, { isAlive: true, subscriptions: new Set() });
    emitter.emit('connection', ws);

    ws.on('pong', () => {
      const meta = clients.get(ws);
      if (meta) meta.isAlive = true;
    });

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        emitter.emit('message', message, ws);

        // Handle subscribe/unsubscribe commands
        handleClientCommand(ws, message);
      } catch {
        // Ignore malformed messages
      }
    });

    ws.on('close', () => {
      clients.delete(ws);
      emitter.emit('disconnect', ws);
    });

    ws.on('error', (err) => {
      emitter.emit('error', err);
      clients.delete(ws);
    });
  });

  wss.on('close', () => {
    clearInterval(heartbeat);
  });

  function handleClientCommand(ws: WebSocket, message: unknown): void {
    if (!message || typeof message !== 'object') return;
    const cmd = message as ClientCommand;

    if (cmd.type === 'subscribe' && cmd.projectId && typeof cmd.projectId === 'string') {
      const meta = clients.get(ws);
      if (meta) {
        meta.subscriptions.add(cmd.projectId);
        ws.send(JSON.stringify({ type: 'subscribed', projectId: cmd.projectId }));
      }
    } else if (cmd.type === 'unsubscribe' && cmd.projectId && typeof cmd.projectId === 'string') {
      const meta = clients.get(ws);
      if (meta) {
        meta.subscriptions.delete(cmd.projectId);
        ws.send(JSON.stringify({ type: 'unsubscribed', projectId: cmd.projectId }));
      }
    }
  }

  function broadcast(event: SystemEvent): void {
    const payload = JSON.stringify(event);
    for (const [ws] of clients) {
      if (ws.readyState === ws.OPEN) {
        ws.send(payload);
      }
    }
  }

  function broadcastToProject(projectId: string, event: SystemEvent): void {
    const payload = JSON.stringify(event);
    for (const [ws, meta] of clients) {
      if (ws.readyState === ws.OPEN && meta.subscriptions.has(projectId)) {
        ws.send(payload);
      }
    }
  }

  function close(): void {
    clearInterval(heartbeat);
    // Forcefully terminate all connected clients so server.close() can finish
    for (const [ws] of clients) {
      try { ws.terminate(); } catch { /* ignore */ }
    }
    clients.clear();
    wss.close();
  }

  emitter.wss = wss;
  emitter.broadcast = broadcast;
  emitter.broadcastToProject = broadcastToProject;
  emitter.close = close;

  return emitter;
}
