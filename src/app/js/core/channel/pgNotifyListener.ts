// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   PG NOTIFY LISTENER — SPEC_AGENT_CHANNEL_NEXT_GEN F11.1 / RF-T3.4

   Runtime wrapper for Postgres LISTEN/NOTIFY real-time channel.
   Subscribes to `agent_channel_<llm_id>` and receives notifications
   when a message targeting that agent arrives.

   DEPENDENCY: `pg` (node-postgres) — npm install pg
   When `pg` is not installed, falls back to a no-op stub that logs
   a warning. This allows the module to be imported in environments
   without the dependency (CI, browser bundles, airgapped dev).

   Pure-logic payload building/parsing lives in:
   scripts/agent-channel-notify.mjs (buildNotifyPayload, parseNotifyPayload,
   resolveChannelName, buildListenSql, sanitizeChannelName)

   USAGE:
     const listener = await connectPgNotify(connStr, 'agent_channel_claude_adm');
     listener.onNotification((msg) => console.log(msg.parsed));
     // ... later
     listener.disconnect();
   ================================================================ */

export interface PgNotifyMessage {
  channel: string;
  payload: string;
  parsed: Record<string, unknown> | null;
  receivedAt: string;
}

export type NotificationCallback = (msg: PgNotifyMessage) => void;

export interface PgNotifyListener {
  onNotification(callback: NotificationCallback): void;
  disconnect(): void;
  readonly connected: boolean;
  readonly stubMode: boolean;
  readonly channel: string;
}

const STUB_WARNING =
  '[pgNotifyListener] pg module not available — running in stub mode. ' +
  'Install with: npm install pg';

function safeParse(raw: string): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'string') return null;
  try {
    const obj = JSON.parse(raw);
    if (obj && typeof obj === 'object') return obj as Record<string, unknown>;
    return null;
  } catch {
    return null;
  }
}

class StubListener implements PgNotifyListener {
  readonly stubMode = true;
  readonly connected = false;
  readonly channel: string;

  constructor(channel: string) {
    this.channel = channel;
    console.warn(STUB_WARNING);
  }

  onNotification(_callback: NotificationCallback): void {
    // no-op in stub mode
  }

  disconnect(): void {
    // no-op in stub mode
  }
}

class PgListener implements PgNotifyListener {
  readonly stubMode = false;
  readonly channel: string;

  private _client: any;
  private _callbacks: NotificationCallback[] = [];
  private _connected = false;

  constructor(client: any, channel: string) {
    this._client = client;
    this.channel = channel;
    this._connected = true;

    this._client.on('notification', (msg: any) => {
      const parsed = safeParse(msg.payload ?? '');
      const notification: PgNotifyMessage = {
        channel: msg.channel ?? this.channel,
        payload: msg.payload ?? '',
        parsed,
        receivedAt: new Date().toISOString(),
      };
      for (const cb of this._callbacks) {
        try {
          cb(notification);
        } catch (err) {
          console.error('[pgNotifyListener] callback error:', err);
        }
      }
    });

    this._client.on('error', (err: any) => {
      console.error('[pgNotifyListener] connection error:', err.message);
      this._connected = false;
    });

    this._client.on('end', () => {
      this._connected = false;
    });
  }

  get connected(): boolean {
    return this._connected;
  }

  onNotification(callback: NotificationCallback): void {
    this._callbacks.push(callback);
  }

  disconnect(): void {
    if (this._client) {
      this._client.removeAllListeners('notification');
      this._client.end().catch((e: unknown) => console.debug('[pg-notify]', e instanceof Error ? e.message : e));
      this._client = null;
    }
    this._connected = false;
    this._callbacks = [];
  }
}

export async function connectPgNotify(
  connectionString: string,
  channel: string
): Promise<PgNotifyListener> {
  if (!connectionString || typeof connectionString !== 'string') {
    return new StubListener(channel || 'agent_channel_broadcast');
  }
  if (!channel || typeof channel !== 'string') {
    channel = 'agent_channel_broadcast';
  }

  let pg: any;
  try {
    // 'pg' is an optional runtime dependency (see USAGE above) with no bundled
    // types and no @types/pg installed. Import via a non-literal specifier so
    // TS doesn't statically resolve/type-check the real (untyped) module.
    const pgSpecifier: string = 'pg';
    pg = await import(pgSpecifier);
  } catch {
    return new StubListener(channel);
  }

  const Client = pg.default?.Client ?? pg.Client;
  if (!Client) {
    return new StubListener(channel);
  }

  try {
    const client = new Client({ connectionString });
    await client.connect();
    await client.query(`LISTEN ${channel}`);
    return new PgListener(client, channel);
  } catch (err: any) {
    console.error('[pgNotifyListener] connect failed:', err.message);
    return new StubListener(channel);
  }
}

export { StubListener, PgListener, safeParse };
