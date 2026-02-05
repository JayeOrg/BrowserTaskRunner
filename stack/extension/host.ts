import { WebSocketServer, WebSocket } from 'ws';
import path from 'node:path';

export interface CommandMessage {
  type: string;
  url?: string;
  selector?: string;
  value?: string;
  timeout?: number;
}

export interface ResponseMessage {
  id?: number;
  type?: string;
  error?: string;
  url?: string;
  title?: string;
  found?: boolean;
  content?: string;
  selector?: string;
  iframes?: unknown[];
  cfElements?: unknown[];
  buttons?: unknown[];
  iframeInfo?: unknown[];
  success?: boolean;
  pong?: boolean;
  result?: unknown;
  cdpClick?: boolean;
  cdpError?: string;
}

interface PendingCommand {
  resolve: (value: ResponseMessage) => void;
  reject: (reason: Error) => void;
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
    if (this.server) return;

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
            const message: ResponseMessage = JSON.parse(data.toString());

            if (message.type === 'ready' && !settled) {
              settled = true;
              clearTimeout(timeout);
              resolve();
              return;
            }

            if (message.id !== undefined) {
              const pending = this.pendingCommands.get(message.id);
              if (pending) {
                this.pendingCommands.delete(message.id);
                if (message.error) {
                  pending.reject(new Error(message.error));
                } else {
                  pending.resolve(message);
                }
              }
            }
          } catch (error) {
            console.error('[ExtensionHost] Error parsing message:', error);
          }
        });

        ws.on('close', () => {
          this.ws = null;
        });
      });
    });
  }

  private logInstructions(): void {
    const extensionPath = path.join(process.cwd(), 'dist', 'extension', 'extension');
    console.log(`[ExtensionHost] WebSocket server listening on port ${this.port}`);
    console.log('[ExtensionHost] Waiting for Chrome extension to connect...');
    console.log('');
    console.log('='.repeat(50));
    console.log('CONNECT THE EXTENSION:');
    console.log('1. Open Chrome');
    console.log('2. Go to chrome://extensions');
    console.log('3. Enable "Developer mode"');
    console.log('4. Click "Load unpacked"');
    console.log(`5. Select: ${extensionPath}`);
    console.log('6. Open a new tab (extension needs an active tab)');
    console.log('='.repeat(50));
    console.log('');
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
      this.pendingCommands.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, ...command }));

      setTimeout(() => {
        if (this.pendingCommands.has(id)) {
          this.pendingCommands.delete(id);
          reject(new Error(`Command timeout: ${command.type}`));
        }
      }, 30000);
    });
  }

  navigate(url: string): Promise<ResponseMessage> {
    console.log(`[Command] Navigate to ${url}`);
    return this.send({ type: 'navigate', url });
  }

  getUrl(): Promise<ResponseMessage> {
    return this.send({ type: 'getUrl' });
  }

  fill(selector: string, value: string): Promise<ResponseMessage> {
    console.log(`[Command] Fill ${selector}`);
    return this.send({ type: 'fill', selector, value });
  }

  click(selector: string): Promise<ResponseMessage> {
    console.log(`[Command] Click ${selector}`);
    return this.send({ type: 'click', selector });
  }

  clickTurnstile(): Promise<ResponseMessage> {
    console.log('[Command] Click Cloudflare Turnstile');
    return this.send({ type: 'clickTurnstile' });
  }

  debugPage(): Promise<ResponseMessage> {
    console.log('[Command] Debug page elements');
    return this.send({ type: 'debugPage' });
  }

  waitForSelector(selector: string, timeout = 10000): Promise<ResponseMessage> {
    console.log(`[Command] Wait for ${selector}`);
    return this.send({ type: 'waitForSelector', selector, timeout });
  }

  getContent(selector: string | null = null): Promise<ResponseMessage> {
    return this.send({ type: 'getContent', selector: selector ?? undefined });
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
