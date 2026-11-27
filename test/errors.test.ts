import { describe, expect, it, vi } from 'vitest';
import {
  AnkiConnectionError,
  InputError,
  explainWriteFailure,
  isConnectionError,
  wrapFetchWithConnectionErrors,
} from '../src/utils/errors.js';

const URL = 'http://127.0.0.1:8765';

function undiciFetchFailed(code = 'ECONNREFUSED') {
  return new TypeError('fetch failed', {
    cause: Object.assign(new Error(`connect ${code} 127.0.0.1:8765`), { code }),
  });
}

describe('isConnectionError', () => {
  it('recognises undici "fetch failed" and socket error codes', () => {
    expect(isConnectionError(undiciFetchFailed())).toBe(true);
    expect(isConnectionError(Object.assign(new Error('x'), { code: 'ECONNRESET' }))).toBe(true);
    expect(isConnectionError(new Error('socket hang up'))).toBe(true);
    expect(isConnectionError(new AnkiConnectionError(URL))).toBe(true);
  });

  it('does not flag AnkiConnect errors', () => {
    expect(isConnectionError(new Error('cannot create note because it is a duplicate'))).toBe(
      false
    );
    expect(isConnectionError('fetch')).toBe(false);
    expect(isConnectionError(undefined)).toBe(false);
  });
});

describe('wrapFetchWithConnectionErrors', () => {
  it('translates connection failures into an actionable message', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(undiciFetchFailed());
    const wrapped = wrapFetchWithConnectionErrors(fetchImpl, URL);
    await expect(wrapped(URL, {})).rejects.toThrow(
      "Couldn't reach AnkiConnect at http://127.0.0.1:8765. Is Anki running? (It may have quit during the last operation.)"
    );
    await expect(wrapped(URL, {})).rejects.toBeInstanceOf(AnkiConnectionError);
  });

  it('passes other errors and successful responses through', async () => {
    const response = { status: 200, headers: {}, json: async () => ({}) };
    const ok = wrapFetchWithConnectionErrors(vi.fn().mockResolvedValue(response), URL);
    await expect(ok(URL)).resolves.toBe(response);

    const other = wrapFetchWithConnectionErrors(vi.fn().mockRejectedValue(new Error('boom')), URL);
    await expect(other(URL)).rejects.toThrow('boom');
  });
});

describe('explainWriteFailure', () => {
  const pingOk = { miscellaneous: { version: vi.fn().mockResolvedValue(6) } };
  const pingDown = {
    miscellaneous: { version: vi.fn().mockRejectedValue(new AnkiConnectionError(URL)) },
  };

  it('returns the connection message as-is without pinging', async () => {
    const client = { miscellaneous: { version: vi.fn() } };
    expect(await explainWriteFailure(client, new AnkiConnectionError(URL))).toMatch(
      /Is Anki running/
    );
    expect(client.miscellaneous.version).not.toHaveBeenCalled();
  });

  it('reports input errors as-is without pinging', async () => {
    const client = { miscellaneous: { version: vi.fn() } };
    expect(await explainWriteFailure(client, new InputError('create requires deckName'))).toBe(
      'create requires deckName'
    );
    expect(client.miscellaneous.version).not.toHaveBeenCalled();
  });

  it('says the request was rejected when Anki still answers', async () => {
    expect(await explainWriteFailure(pingOk, new Error('deck was not found'))).toBe(
      'AnkiConnect rejected the request: deck was not found'
    );
  });

  it('says Anki may have quit when the ping fails', async () => {
    expect(await explainWriteFailure(pingDown, new Error('response status is 500'))).toMatch(
      /not responding any more, so Anki may have quit/
    );
  });
});
