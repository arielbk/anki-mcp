import { YankiConnect, defaultYankiConnectOptions } from 'yanki-connect';
import { wrapFetchWithConnectionErrors } from './errors.js';

function resolveHost(value: string | undefined): string {
  if (!value) return defaultYankiConnectOptions.host;
  return /^https?:\/\//.test(value) ? value : `http://${value}`;
}

function resolvePort(value: string | undefined): number {
  const port = Number(value);
  return value && Number.isInteger(port) && port > 0 ? port : defaultYankiConnectOptions.port;
}

const host = resolveHost(process.env.ANKI_CONNECT_HOST);
const port = resolvePort(process.env.ANKI_CONNECT_PORT);

/** Where the client talks to AnkiConnect; used in error messages. */
export const ANKI_CONNECT_URL = `${host}:${port}`;

const baseFetch = defaultYankiConnectOptions.fetchAdapter ?? fetch.bind(globalThis);

/**
 * Shared AnkiConnect client. Network failures are translated once here into
 * an AnkiConnectionError with an actionable message.
 */
export const ankiClient = new YankiConnect({
  host,
  port,
  fetchAdapter: wrapFetchWithConnectionErrors(baseFetch, ANKI_CONNECT_URL),
});
