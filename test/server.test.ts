import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Replace the real AnkiConnect client: these tests must never reach Anki.
const mocks = vi.hoisted(() => ({
  addNotes: vi.fn(),
  addNote: vi.fn(),
  canAddNotesWithErrorDetail: vi.fn(),
  modelNamesAndIds: vi.fn(),
  findModelsByName: vi.fn(),
  findModelsById: vi.fn(),
  version: vi.fn(),
  createDeck: vi.fn(),
  getDeckConfig: vi.fn(),
  deckNames: vi.fn(),
  multi: vi.fn(),
}));

vi.mock('../src/utils/ankiClient.js', () => ({
  ANKI_CONNECT_URL: 'http://127.0.0.1:8765',
  ankiClient: {
    note: {
      addNotes: mocks.addNotes,
      addNote: mocks.addNote,
      canAddNotesWithErrorDetail: mocks.canAddNotesWithErrorDetail,
    },
    model: {
      modelNamesAndIds: mocks.modelNamesAndIds,
      findModelsByName: mocks.findModelsByName,
      findModelsById: mocks.findModelsById,
    },
    deck: {
      createDeck: mocks.createDeck,
      getDeckConfig: mocks.getDeckConfig,
      deckNames: mocks.deckNames,
    },
    miscellaneous: { version: mocks.version, multi: mocks.multi },
  },
}));

const { registerConsolidatedTools } = await import('../src/tools/consolidated.js');
const { registerPrompts } = await import('../src/prompts/index.js');

async function connect() {
  const server = new McpServer({ name: 'test', version: '0.0.0' });
  registerConsolidatedTools(server);
  registerPrompts(server);
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

const textOf = (result: Awaited<ReturnType<Client['callTool']>>) =>
  (result.content as Array<{ type: string; text: string }>).map((c) => c.text).join('\n');

beforeEach(() => {
  vi.resetAllMocks();
  let id = 1;
  mocks.modelNamesAndIds.mockResolvedValue({ Basic: 1 });
  mocks.findModelsByName.mockResolvedValue([
    {
      name: 'Basic',
      flds: [
        { name: 'Front', ord: 0 },
        { name: 'Back', ord: 1 },
      ],
    },
  ]);
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
  mocks.canAddNotesWithErrorDetail.mockImplementation(async ({ notes }) =>
    notes.map(() => ({ canAdd: true }))
  );
  mocks.addNotes.mockImplementation(async ({ notes }) => notes.map(() => id++));
  mocks.version.mockResolvedValue(6);
});

describe('MCP server', () => {
  it('registers the 7 tools with titles and annotations', async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      'anki_operations',
      'get_analytics',
      'get_media_file',
      'manage_decks',
      'manage_flashcards',
      'manage_models',
      'study_session',
    ]);
    for (const tool of tools) {
      expect(tool.title).toBeTruthy();
      expect(tool.annotations?.readOnlyHint).toBeTypeOf('boolean');
      expect(tool.annotations?.destructiveHint).toBeTypeOf('boolean');
    }
    const analytics = tools.find((t) => t.name === 'get_analytics');
    expect(analytics?.annotations).toMatchObject({ readOnlyHint: true, openWorldHint: false });
    const flashcards = tools.find((t) => t.name === 'manage_flashcards');
    expect(flashcards?.description).toContain('writing_good_flashcards');
  });

  it('serves the writing-good-flashcards prompt', async () => {
    const client = await connect();
    const { prompts } = await client.listPrompts();
    expect(prompts.map((p) => p.name)).toContain('writing_good_flashcards');
    const prompt = await client.getPrompt({
      name: 'writing_good_flashcards',
      arguments: { topic: 'TCP handshake' },
    });
    const content = prompt.messages[0]?.content as { text: string };
    expect(content.text).toMatch(/Minimum information principle/);
    expect(content.text).toMatch(/Matuschak/);
    expect(content.text).toMatch(/TCP handshake/);
  });

  it('create_batch imports from a CSV file with top-level defaults', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'anki-mcp-test-'));
    const file = join(dir, 'cards.csv');
    await writeFile(file, 'Front,Back,tags\n"What is 2+2?",4,math\nCapital of France,Paris,\n');

    const client = await connect();
    const result = await client.callTool({
      name: 'manage_flashcards',
      arguments: {
        operation: 'create_batch',
        filePath: file,
        deckName: 'Test',
        modelName: 'Basic',
        tags: ['imported'],
      },
    });
    expect(result.isError).toBeFalsy();
    expect(mocks.addNotes).toHaveBeenCalledTimes(1);
    expect(mocks.addNotes.mock.calls[0]?.[0].notes).toEqual([
      {
        deckName: 'Test',
        modelName: 'Basic',
        fields: { Front: 'What is 2+2?', Back: '4' },
        tags: ['imported', 'math'],
      },
      {
        deckName: 'Test',
        modelName: 'Basic',
        fields: { Front: 'Capital of France', Back: 'Paris' },
        tags: ['imported'],
      },
    ]);
    expect(textOf(result)).toMatch(/2 added, 0 failed/);
    expect(textOf(result)).toMatch(/#1 id 1 "What is 2\+2\?"/);
  });

  it('create_batch dryRun never writes', async () => {
    const client = await connect();
    const result = await client.callTool({
      name: 'manage_flashcards',
      arguments: {
        operation: 'create_batch',
        dryRun: true,
        deckName: 'Test',
        modelName: 'Basic',
        notes: [{ fields: { Front: 'q', Back: 'a' } }],
      },
    });
    expect(textOf(result)).toMatch(/Dry run: 1 of 1/);
    expect(mocks.addNotes).not.toHaveBeenCalled();
  });

  it('reports argument and file errors without blaming Anki or pinging it', async () => {
    const client = await connect();
    const missing = await client.callTool({
      name: 'manage_flashcards',
      arguments: { operation: 'create', deckName: 'D' },
    });
    expect(missing.isError).toBe(true);
    expect(textOf(missing)).toBe(
      'manage_flashcards failed: create requires deckName, modelName, and fields'
    );

    const relative = await client.callTool({
      name: 'manage_flashcards',
      arguments: { operation: 'create_batch', filePath: 'cards.csv', deckName: 'D' },
    });
    expect(textOf(relative)).toMatch(/filePath must be absolute/);
    expect(textOf(relative)).not.toMatch(/AnkiConnect|quit/);
    expect(mocks.version).not.toHaveBeenCalled();
  });

  it('manage_decks create reports the deck even if setting limits fails', async () => {
    mocks.createDeck.mockResolvedValue(1234);
    mocks.getDeckConfig.mockRejectedValue(new Error('collection is not available'));
    const client = await connect();
    const result = await client.callTool({
      name: 'manage_decks',
      arguments: { operation: 'create', deckName: 'New', newPerDay: 10 },
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(
      /Created deck "New" \(ID: 1234\), but its limits were not set: AnkiConnect rejected the request: collection is not available/
    );
  });

  it('manage_models list shows field names in order', async () => {
    const client = await connect();
    const result = await client.callTool({
      name: 'manage_models',
      arguments: { operation: 'list' },
    });
    expect(textOf(result)).toContain('Basic (ID: 1) fields: Front, Back');
  });
});
