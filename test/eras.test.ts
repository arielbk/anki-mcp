import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createMcpHandler, InMemoryTransport } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Replace the real AnkiConnect client: these tests must never reach Anki.
const mocks = vi.hoisted(() => ({
  modelNamesAndIds: vi.fn(),
  findModelsById: vi.fn(),
  findModelsByName: vi.fn(),
  canAddNotesWithErrorDetail: vi.fn(),
  addNotes: vi.fn(),
  version: vi.fn(),
  deckNames: vi.fn(),
}));

vi.mock('../src/utils/ankiClient.js', () => ({
  ANKI_CONNECT_URL: 'http://127.0.0.1:8765',
  ankiClient: {
    model: {
      modelNamesAndIds: mocks.modelNamesAndIds,
      findModelsById: mocks.findModelsById,
      findModelsByName: mocks.findModelsByName,
    },
    note: {
      canAddNotesWithErrorDetail: mocks.canAddNotesWithErrorDetail,
      addNotes: mocks.addNotes,
    },
    deck: { deckNames: mocks.deckNames },
    miscellaneous: { version: mocks.version },
  },
}));

const { createServer } = await import('../src/server.js');
const { createHttpApp } = await import('../src/http.js');

const TOOLS = [
  'anki_gui',
  'anki_operations',
  'get_analytics',
  'get_media_file',
  'manage_decks',
  'manage_flashcards',
  'manage_models',
  'study_session',
];

beforeEach(() => {
  vi.resetAllMocks();
  let id = 100;
  mocks.modelNamesAndIds.mockResolvedValue({ Basic: 1 });
  mocks.findModelsById.mockResolvedValue([
    {
      id: 1,
      name: 'Basic',
      type: 0,
      flds: [
        { name: 'Back', ord: 1 },
        { name: 'Front', ord: 0 },
      ],
    },
  ]);
  mocks.findModelsByName.mockResolvedValue([
    {
      name: 'Basic',
      flds: [
        { name: 'Front', ord: 0 },
        { name: 'Back', ord: 1 },
      ],
    },
  ]);
  mocks.canAddNotesWithErrorDetail.mockImplementation(async ({ notes }) =>
    notes.map(() => ({ canAdd: true }))
  );
  mocks.addNotes.mockImplementation(async ({ notes }) => notes.map(() => id++));
  mocks.version.mockResolvedValue(6);
  mocks.deckNames.mockResolvedValue(['Default', 'Spanish']);
});

const textOf = (result: Awaited<ReturnType<Client['callTool']>>) =>
  (result.content as Array<{ type: string; text: string }>).map((c) => c.text).join('\n');

/** Lists everything and calls a tool: the same checks for every transport and era. */
async function exercise(client: Client) {
  const { tools } = await client.listTools();
  expect(tools.map((t) => t.name).sort()).toEqual(TOOLS);
  for (const tool of tools) expect(tool.description).toBeTruthy();

  const { resources } = await client.listResources();
  expect(resources.map((r) => r.uri)).toContain('anki:///decks/names');
  const deckNames = await client.readResource({ uri: 'anki:///decks/names' });
  expect((deckNames.contents[0] as { text: string }).text).toContain('Spanish');
  const { resourceTemplates } = await client.listResourceTemplates();
  expect(resourceTemplates.length).toBeGreaterThan(0);

  const { prompts } = await client.listPrompts();
  expect(prompts.map((p) => p.name)).toContain('writing_good_flashcards');

  const result = await client.callTool({
    name: 'manage_models',
    arguments: { operation: 'list' },
  });
  expect(result.isError).toBeFalsy();
  expect(textOf(result)).toContain('Basic (ID: 1) fields: Front, Back');
}

const legacyClient = () => new Client({ name: 'legacy-client', version: '0.0.0' });
const modernClient = () =>
  new Client({ name: 'modern-client', version: '0.0.0' }, { versionNegotiation: { mode: 'auto' } });

describe('stdio entry (serveStdio)', () => {
  it('serves a 2025-era client over the initialize handshake', async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const handle = serveStdio(createServer, { transport: serverTransport });
    const client = legacyClient();
    await client.connect(clientTransport);
    expect(client.getProtocolEra()).toBe('legacy');
    await exercise(client);
    await client.close();
    await handle.close();
  });

  it('serves a 2026-07-28 client', async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const handle = serveStdio(createServer, { transport: serverTransport });
    const client = modernClient();
    await client.connect(clientTransport);
    expect(client.getProtocolEra()).toBe('modern');
    expect(client.getNegotiatedProtocolVersion()).toBe('2026-07-28');
    await exercise(client);
    await client.close();
    await handle.close();
  });
});

describe('HTTP handler (createMcpHandler)', () => {
  const connectHttp = async (client: Client) => {
    const handler = createMcpHandler(createServer);
    const transport = new StreamableHTTPClientTransport(new URL('http://127.0.0.1/mcp'), {
      fetch: (input, init) => handler.fetch(new Request(input, init)),
    });
    await client.connect(transport);
    return { client, handler };
  };

  it('serves a 2025-era client statelessly', async () => {
    const { client, handler } = await connectHttp(legacyClient());
    expect(client.getProtocolEra()).toBe('legacy');
    await exercise(client);
    await client.close();
    await handler.close();
  });

  it('serves a 2026-07-28 client, including progress notifications', async () => {
    const { client, handler } = await connectHttp(modernClient());
    expect(client.getProtocolEra()).toBe('modern');
    expect(client.getNegotiatedProtocolVersion()).toBe('2026-07-28');
    await exercise(client);

    const progress: number[] = [];
    const result = await client.callTool(
      {
        name: 'manage_flashcards',
        arguments: {
          operation: 'create_batch',
          deckName: 'Test',
          modelName: 'Basic',
          chunkSize: 1,
          notes: [{ fields: { Front: 'q1', Back: 'a1' } }, { fields: { Front: 'q2', Back: 'a2' } }],
        },
      },
      { onprogress: (p) => progress.push(p.progress) }
    );
    expect(textOf(result)).toMatch(/2 added, 0 failed/);
    expect(progress).toEqual([1, 2]);

    await client.close();
    await handler.close();
  });
});

describe('HTTP app (express wiring)', () => {
  let server: Server | undefined;
  let closeHandler: (() => Promise<void>) | undefined;

  const listen = async () => {
    const { app, handler } = createHttpApp({ host: '127.0.0.1' });
    closeHandler = handler.close;
    const s = app.listen(0, '127.0.0.1');
    server = s;
    await new Promise<void>((resolve) => s.once('listening', resolve));
    return `http://127.0.0.1:${(s.address() as AddressInfo).port}/mcp`;
  };

  afterEach(async () => {
    await closeHandler?.();
    await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
    server = undefined;
  });

  it('serves both eras through express.json() and toNodeHandler', async () => {
    const url = new URL(await listen());
    const clients = [
      [legacyClient(), 'legacy'],
      [modernClient(), 'modern'],
    ] as const;
    for (const [client, era] of clients) {
      await client.connect(new StreamableHTTPClientTransport(url));
      expect(client.getProtocolEra()).toBe(era);
      await exercise(client);
      await client.close();
    }
  });

  it('answers a raw 2025 initialize without a session ID', async () => {
    const url = await listen();
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: { name: 'curl', version: '0' },
        },
      }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('mcp-session-id')).toBeNull();
    expect(await res.text()).toContain('"protocolVersion":"2025-06-18"');
  });

  it('returns 405 for 2025 session operations', async () => {
    const url = await listen();
    expect((await fetch(url, { method: 'GET' })).status).toBe(405);
    expect((await fetch(url, { method: 'DELETE' })).status).toBe(405);
  });

  it('rejects foreign Host and Origin headers (DNS rebinding protection)', async () => {
    const url = await listen();
    const { request } = await import('node:http');
    const status = (headers: Record<string, string>) =>
      new Promise<number>((resolve, reject) => {
        const req = request(url, { method: 'POST', headers }, (res) => {
          res.resume();
          resolve(res.statusCode ?? 0);
        });
        req.on('error', reject);
        req.end('{}');
      });
    const json = { 'content-type': 'application/json' };
    expect(await status({ ...json, host: 'evil.example.com' })).toBe(403);
    expect(await status({ ...json, origin: 'http://evil.example.com' })).toBe(403);
  });
});
