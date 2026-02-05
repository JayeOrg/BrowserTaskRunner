import { WebSocketServer, type WebSocket } from 'ws';
import path from 'node:path';
import type { CommandMessage, ResponseMessage } from './types.js';
import { createPrefixLogger } from '../behaviour/utils/site-utils.js';

export type { CommandMessage, ResponseMessage };

const logger = createPrefixLogger('Host');

function isResponseMessage(value: unknown): value is ResponseMessage {
  return typeof value === 'object' && value !== null;
}

interface PendingCommand {
  resolve: (value: ResponseMessage) => void;
  reject: (reason: Error) => void;
  timeoutId: ReturnType<typeof setTimeout>;
}

export class ExtensionHost {
  private readonly port: number;
  private ws: WebSocket | null = null;
  private server: WebSocketServer | null = null;
  private pendingCommands: Map<number, PendingCommand> = new Map();
  private commandId = 0;

  constructor(port: number) {
    this.port = port;
  }

  async start(): Promise<void> {
    if (this.server) {return;}

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const timeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          reject(new Error('Extension did not connect within 60 seconds'));
        }
      }, 60000);

      this.server = new WebSocketServer({ port: this.port });

      this.server.on('listening', () => {
        this.logInstructions();
      });

      this.server.on('error', (error: Error) => {
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          reject(error);
        }
      });

      this.server.on('connection', (ws: WebSocket) => {
        this.ws = ws;
        ws.on('message', (data: Buffer) => {
          try {
            const parsed: unknown = JSON.parse(data.toString());
            if (!isResponseMessage(parsed)) {
              logger.log('Invalid message format');
              return;
            }
            const message = parsed;

            if (message.type === 'ready' && !settled) {
              settled = true;
              clearTimeout(timeout);
              resolve();
              return;
            }

            if (message.id !== undefined) {
              const pending = this.pendingCommands.get(message.id);
              if (pending) {
                clearTimeout(pending.timeoutId);
                this.pendingCommands.delete(message.id);
                if (message.error) {
                  pending.reject(new Error(message.error));
                } else {
                  pending.resolve(message);
                }
              }
            }
          } catch (error) {
            logger.log('Error parsing message', { error: String(error) });
          }
        });

        ws.on('close', () => {
          this.ws = null;
        });
      });
    });
  }

  private logInstructions(): void {
    logger.log('WebSocket server listening', { port: this.port });

    // Skip manual instructions when running in Docker (automated)
    if (process.env['DOCKER']) {
      return;
    }

    const extensionPath = path.join(process.cwd(), 'dist', 'extension', 'extension');
    logger.log('Waiting for Chrome extension to connect...');
    logger.log('='.repeat(50));
    logger.log('CONNECT THE EXTENSION:');
    logger.log('1. Open Chrome');
    logger.log('2. Go to chrome://extensions');
    logger.log('3. Enable "Developer mode"');
    logger.log('4. Click "Load unpacked"');
    logger.log(`5. Select: ${extensionPath}`);
    logger.log('6. Open a new tab (extension needs an active tab)');
    logger.log('='.repeat(50));
  }

  private ensureConnection(): WebSocket {
    if (!this.ws) {
      throw new Error('Extension not connected');
    }
    return this.ws;
  }

  send(command: CommandMessage): Promise<ResponseMessage> {
    return new Promise((resolve, reject) => {
      const socket = this.ensureConnection();

      const id = ++this.commandId;
      const timeoutId = setTimeout(() => {
        if (this.pendingCommands.has(id)) {
          this.pendingCommands.delete(id);
          reject(new Error(`Command timeout: ${command.type}`));
        }
      }, 30000);

      this.pendingCommands.set(id, { resolve, reject, timeoutId });
      socket.send(JSON.stringify({ id, ...command }));
    });
  }

  // --- Generic browser automation primitives ---
  // Command logging removed: task step logs already provide visibility

  navigate(url: string): Promise<ResponseMessage> {
    return this.send({ type: 'navigate', url });
  }

  getUrl(): Promise<ResponseMessage> {
    return this.send({ type: 'getUrl' });
  }

  fill(selector: string, value: string): Promise<ResponseMessage> {
    return this.send({ type: 'fill', selector, value });
  }

  click(selector: string): Promise<ResponseMessage> {
    return this.send({ type: 'click', selector });
  }

  cdpClick(x: number, y: number): Promise<ResponseMessage> {
    return this.send({ type: 'cdpClick', x, y });
  }

  waitForSelector(selector: string, timeout = 10000): Promise<ResponseMessage> {
    return this.send({ type: 'waitForSelector', selector, timeout });
  }

  getContent(selector: string | null = null): Promise<ResponseMessage> {
    return this.send(selector ? { type: 'getContent', selector } : { type: 'getContent' });
  }

  querySelectorRect(selectors: string[]): Promise<ResponseMessage> {
    return this.send({ type: 'querySelectorRect', selectors });
  }

  ping(): Promise<ResponseMessage> {
    return this.send({ type: 'ping' });
  }

  close(): void {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
