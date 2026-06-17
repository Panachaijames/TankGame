import { Peer, type DataConnection } from 'peerjs';

export type NetRole = 'host' | 'client';
export interface NetMsg {
  t: string;
  [k: string]: unknown;
}

// All host peer ids live under this namespace so room codes don't collide with
// other apps using the public PeerJS broker.
const PREFIX = 'htank-';
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no easily-confused chars
const randomCode = (n = 5) =>
  Array.from({ length: n }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');

const OPEN_TIMEOUT = 12000;

/**
 * Thin WebRTC session over PeerJS. Star topology: the host accepts many client
 * connections; a client holds a single connection to the host. Signaling uses
 * the PeerJS broker; gameplay data is direct peer-to-peer.
 */
export class NetSession {
  peer: Peer | null = null;
  role: NetRole = 'host';
  roomCode = '';
  selfId = '';
  conns = new Map<string, DataConnection>();

  onMessage: (fromId: string, msg: NetMsg) => void = () => {};
  onPeersChanged: () => void = () => {};
  onFatal: (msg: string) => void = () => {};

  /** Create a room; resolves with the short room code. */
  async host(): Promise<string> {
    this.role = 'host';
    for (let attempt = 0; attempt < 6; attempt++) {
      const code = randomCode();
      try {
        await this.openPeer(PREFIX + code);
        this.roomCode = code;
        this.selfId = this.peer!.id;
        this.peer!.on('connection', (c) => this.attachConn(c));
        this.attachFatalHandler();
        return code;
      } catch {
        /* id taken or transient — retry with a new code */
      }
    }
    throw new Error('Could not create a room. Try again.');
  }

  /** Join an existing room by code. */
  async join(code: string): Promise<void> {
    this.role = 'client';
    this.roomCode = code.trim().toUpperCase();
    await this.openPeer();
    this.selfId = this.peer!.id;
    this.attachFatalHandler();
    const conn = this.peer!.connect(PREFIX + this.roomCode, { reliable: true });
    await new Promise<void>((resolve, reject) => {
      const to = setTimeout(() => reject(new Error('Could not reach that room (timed out).')), OPEN_TIMEOUT);
      conn.on('open', () => {
        clearTimeout(to);
        this.attachConn(conn);
        resolve();
      });
      conn.on('error', (e) => {
        clearTimeout(to);
        reject(e instanceof Error ? e : new Error('Connection failed.'));
      });
    });
  }

  private openPeer(id?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const peer = id ? new Peer(id) : new Peer();
      const to = setTimeout(() => {
        peer.destroy();
        reject(new Error('Network timed out.'));
      }, OPEN_TIMEOUT);
      peer.once('open', () => {
        clearTimeout(to);
        this.peer = peer;
        resolve();
      });
      peer.once('error', (e: { type?: string; message?: string }) => {
        clearTimeout(to);
        peer.destroy();
        reject(new Error(e?.type || e?.message || 'peer error'));
      });
    });
  }

  private attachFatalHandler() {
    this.peer?.on('error', (e: { type?: string }) => {
      // Ignore per-connection errors that already rejected; surface broker drops.
      if (e?.type === 'network' || e?.type === 'server-error' || e?.type === 'socket-error') {
        this.onFatal(e.type);
      }
    });
    this.peer?.on('disconnected', () => {
      // Try to reconnect to the broker (does not drop existing P2P links).
      try {
        this.peer?.reconnect();
      } catch {
        /* ignore */
      }
    });
  }

  private attachConn(conn: DataConnection) {
    this.conns.set(conn.peer, conn);
    conn.on('data', (d) => this.onMessage(conn.peer, d as NetMsg));
    conn.on('close', () => {
      this.conns.delete(conn.peer);
      this.onPeersChanged();
    });
    this.onPeersChanged();
  }

  /** Host → all clients. */
  broadcast(msg: NetMsg) {
    for (const c of this.conns.values()) if (c.open) c.send(msg);
  }

  /** Client → host (a client only holds the host connection). */
  sendToHost(msg: NetMsg) {
    for (const c of this.conns.values()) if (c.open) c.send(msg);
  }

  send(toId: string, msg: NetMsg) {
    const c = this.conns.get(toId);
    if (c?.open) c.send(msg);
  }

  peerIds(): string[] {
    return [...this.conns.keys()];
  }

  close() {
    for (const c of this.conns.values()) {
      try {
        c.close();
      } catch {
        /* ignore */
      }
    }
    this.conns.clear();
    try {
      this.peer?.destroy();
    } catch {
      /* ignore */
    }
    this.peer = null;
  }
}
