import type { YankiFetchAdapter } from 'yanki-connect';

/**
 * Raised when AnkiConnect cannot be reached at all (Anki not running, quit
 * mid-request, wrong port, ...). Distinct from AnkiConnect answering with an
 * error, which means Anki is up but rejected the request.
 */
export class AnkiConnectionError extends Error {
  readonly url: string;

  constructor(url: string, options?: { cause?: unknown }) {
    super(
      `Couldn't reach AnkiConnect at ${url}. Is Anki running? (It may have quit during the last operation.)`,
      options
    );
    this.name = 'AnkiConnectionError';
    this.url = url;
  }
}

/**
 * A problem with the caller's input (missing arguments, unreadable file,
 * invalid notes) found before anything was sent to Anki. Reported as-is,
 * without pinging AnkiConnect.
 */
export class InputError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'InputError';
  }
}

const CONNECTION_ERROR_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'EPIPE',
  'ETIMEDOUT',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'UND_ERR_SOCKET',
  'UND_ERR_CONNECT_TIMEOUT',
]);

const CONNECTION_ERROR_MESSAGES = [
  'fetch failed',
  'econnrefused',
  'econnreset',
  'socket hang up',
  'other side closed',
];

/**
 * True when `error` (or anything in its `cause` chain) looks like a network
 * level failure to talk to AnkiConnect, as opposed to an error AnkiConnect
 * returned.
 */
export function isConnectionError(error: unknown, depth = 0): boolean {
  if (error instanceof AnkiConnectionError) return true;
  if (depth > 5 || error === null || typeof error !== 'object') return false;

  const { code, message, cause, errors } = error as {
    code?: unknown;
    message?: unknown;
    cause?: unknown;
    errors?: unknown;
  };
  if (typeof code === 'string' && CONNECTION_ERROR_CODES.has(code)) return true;
  if (typeof message === 'string') {
    const lower = message.toLowerCase();
    if (CONNECTION_ERROR_MESSAGES.some((m) => lower.includes(m))) return true;
  }
  if (Array.isArray(errors) && errors.some((e) => isConnectionError(e, depth + 1))) return true;
  return isConnectionError(cause, depth + 1);
}

/**
 * Wraps a fetch implementation so network failures surface as
 * {@link AnkiConnectionError} with an actionable message instead of
 * undici's bare "fetch failed".
 */
export function wrapFetchWithConnectionErrors(
  fetchImpl: YankiFetchAdapter,
  url: string
): YankiFetchAdapter {
  return async (input, init) => {
    try {
      return await fetchImpl(input, init);
    } catch (error) {
      if (isConnectionError(error)) throw new AnkiConnectionError(url, { cause: error });
      throw error;
    }
  };
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Anything with a `version` ping, so tests can pass a stub. */
export interface Pingable {
  miscellaneous: { version: () => Promise<number> };
}

/** Returns true if AnkiConnect answers a `version` request. Never throws. */
export async function isAnkiReachable(client: Pingable): Promise<boolean> {
  try {
    await client.miscellaneous.version();
    return true;
  } catch {
    return false;
  }
}

/**
 * Builds the message for a failed write. Pings AnkiConnect so the caller can
 * tell "Anki is down" apart from "Anki rejected the request".
 */
export async function explainWriteFailure(client: Pingable, error: unknown): Promise<string> {
  if (error instanceof AnkiConnectionError || error instanceof InputError) return error.message;
  const reachable = await isAnkiReachable(client);
  if (!reachable) {
    return `${errorMessage(error)}. AnkiConnect is not responding any more, so Anki may have quit during this operation; some changes may have been applied. Restart Anki and check before retrying.`;
  }
  if (isConnectionError(error)) {
    return `${errorMessage(error)}. AnkiConnect is reachable again, so this was probably a transient connection problem; check whether the change was applied before retrying.`;
  }
  return `AnkiConnect rejected the request: ${errorMessage(error)}`;
}
