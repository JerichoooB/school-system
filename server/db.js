import pg from 'pg';
import { attachDatabasePool } from '@vercel/functions';
import { Pool as NeonPool, neonConfig } from '@neondatabase/serverless';
import WebSocket from 'ws';
import { HttpsProxyAgent } from 'https-proxy-agent';

let pool;
export function createPool(connectionString) {
  if (!connectionString) throw new Error('DATABASE_URL is required');
  const url = new URL(connectionString);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  // URL SSL parameters must not weaken remote certificate verification.
  for (const key of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert', 'uselibpqcompat']) url.searchParams.delete(key);
  const useWebSocket = !local && process.env.DATABASE_TRANSPORT === 'websocket';
  if (useWebSocket) {
    if (!url.hostname.endsWith('.neon.tech')) throw new Error('WebSocket transport requires a Neon database host');
    const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
    neonConfig.webSocketConstructor = class extends WebSocket {
      constructor(address, protocols) {
        super(address, protocols, proxy ? { agent: new HttpsProxyAgent(proxy) } : undefined);
      }
    };
  }
  const Pool = useWebSocket ? NeonPool : pg.Pool;
  const databasePool = new Pool({
    connectionString: url.toString(),
    // WebSocket transport verifies TLS on its WSS tunnel, rather than nesting pg TLS.
    ssl: local || useWebSocket ? false : { rejectUnauthorized: true },
    max: 3,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 10000,
    allowExitOnIdle: true,
  });
  databasePool.on('error', () => console.error('Idle database connection failed'));
  return databasePool;
}

export function getPool() {
  if (!pool) {
    pool = createPool(process.env.DATABASE_URL);
    // Let Vercel Fluid compute close idle connections before an instance suspends.
    if (process.env.VERCEL && process.env.DATABASE_TRANSPORT !== 'websocket') attachDatabasePool(pool);
  }
  return pool;
}
export const query = (text, values) => getPool().query(text, values);
