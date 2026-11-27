import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  detectFormat,
  parseDelimited,
  parseNotesText,
  readNotesFile,
} from '../src/utils/notesFile.js';

describe('parseDelimited', () => {
  it('splits simple CSV rows', () => {
    expect(parseDelimited('a,b\n1,2\n', ',')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('handles quoted fields with delimiters, escaped quotes and newlines', () => {
    const csv = 'Front,Back\n"Hello, world","She said ""hi""\non two lines"\r\n';
    expect(parseDelimited(csv, ',')).toEqual([
      ['Front', 'Back'],
      ['Hello, world', 'She said "hi"\non two lines'],
    ]);
  });

  it('keeps empty fields and quoted empty strings', () => {
    expect(parseDelimited('a,,""\n', ',')).toEqual([['a', '', '']]);
  });

  it('handles TSV with HTML and a BOM, and skips blank lines', () => {
    const tsv = '﻿Front\tBack\n<b>x</b>\t<code>y, z</code>\n\n';
    expect(parseDelimited(tsv, '\t')).toEqual([
      ['Front', 'Back'],
      ['<b>x</b>', '<code>y, z</code>'],
    ]);
  });

  it('treats quotes inside an unquoted field literally', () => {
    expect(parseDelimited('say "hi",b', ',')).toEqual([['say "hi"', 'b']]);
  });

  it('throws on an unterminated quote', () => {
    expect(() => parseDelimited('"oops,b', ',')).toThrow(/Unterminated/);
  });
});

describe('parseNotesText', () => {
  it('maps CSV columns to fields and special tags/deck/model columns', () => {
    const csv = 'Front,Back,Tags,Deck,Model\nQ1,A1,"a b,c",My Deck,Basic\nQ2,A2,,,\n';
    expect(parseNotesText(csv, 'csv')).toEqual([
      {
        fields: { Front: 'Q1', Back: 'A1' },
        tags: ['a', 'b', 'c'],
        deckName: 'My Deck',
        modelName: 'Basic',
      },
      { fields: { Front: 'Q2', Back: 'A2' } },
    ]);
  });

  it('parses TSV', () => {
    expect(parseNotesText('Front\tBack\nq\t"a\tb"\n', 'tsv')).toEqual([
      { fields: { Front: 'q', Back: 'a\tb' } },
    ]);
  });

  it('rejects rows with more columns than the header', () => {
    expect(() => parseNotesText('Front,Back\n1,2,3\n', 'csv')).toThrow(/Row 2 has 3 columns/);
  });

  it('rejects a header with only special columns', () => {
    expect(() => parseNotesText('tags,deck\na,b\n', 'csv')).toThrow(/no note field columns/);
  });

  it('parses a JSON array of notes', () => {
    const json = JSON.stringify([
      { fields: { Front: 'q', Back: 'a' } },
      { deckName: 'D', modelName: 'Basic', fields: { Front: 'q2' }, tags: ['t'] },
    ]);
    expect(parseNotesText(json, 'json')).toEqual([
      { fields: { Front: 'q', Back: 'a' } },
      { deckName: 'D', modelName: 'Basic', fields: { Front: 'q2' }, tags: ['t'] },
    ]);
  });

  it('reports which JSON note is invalid', () => {
    expect(() => parseNotesText('[{"fields":{"Front":"q"}},{"front":"x"}]', 'json')).toThrow(
      /Note #2/
    );
    expect(() => parseNotesText('{"notes":[]}', 'json')).toThrow(/array of notes/);
    expect(() => parseNotesText('{nope', 'json')).toThrow(/Invalid JSON/);
  });
});

describe('detectFormat / readNotesFile', () => {
  it('detects formats by extension', () => {
    expect(detectFormat('/x/cards.json')).toBe('json');
    expect(detectFormat('/x/cards.CSV')).toBe('csv');
    expect(detectFormat('/x/cards.tsv')).toBe('tsv');
    expect(detectFormat('/x/cards.txt')).toBe('tsv');
    expect(() => detectFormat('/x/cards.xlsx')).toThrow(/Unsupported/);
  });

  it('reads a file from disk', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'anki-mcp-test-'));
    const file = join(dir, 'cards.csv');
    await writeFile(file, 'Front,Back\nq,a\n');
    await expect(readNotesFile(file)).resolves.toEqual([{ fields: { Front: 'q', Back: 'a' } }]);
  });

  it('gives a clear error for a missing file', async () => {
    await expect(readNotesFile('/definitely/not/here.csv')).rejects.toThrow(/Couldn't read/);
  });
});
