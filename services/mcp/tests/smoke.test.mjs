// Smoke test: a real MCP client talks to the server over a linked in-memory
// transport, lists the tools, calls each one, and checks nothing can write.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { createServer } from '../src/server.js';
import { openData } from '../src/data.js';

const DIR = fileURLToPath(new URL('./fixtures', import.meta.url));

async function connect() {
  const [a, b] = InMemoryTransport.createLinkedPair();
  await createServer(openData(DIR)).connect(b);
  const client = new Client({ name: 'smoke', version: '0' });
  await client.connect(a);
  return client;
}
const json = (r) => JSON.parse(r.content[0].text);

test('lists exactly the four read-only tools', async () => {
  const c = await connect();
  const { tools } = await c.listTools();
  assert.deepEqual(tools.map((t) => t.name).sort(), ['list_trips', 'place_facts', 'price_trip', 'search_places']);
  for (const t of tools) {
    assert.equal(t.annotations.readOnlyHint, true, t.name);
    assert.equal(t.annotations.destructiveHint, false, t.name);
    assert.equal(t.annotations.openWorldHint, false, t.name);
  }
  await c.close();
});

test('each tool answers through the client', async () => {
  const c = await connect();
  const s = json(await c.callTool({ name: 'search_places', arguments: { query: 'bruges' } }));
  assert.equal(s.places[0].id, 'gem:bruges');
  const f = json(await c.callTool({ name: 'place_facts', arguments: { id: 'gem:bruges' } }));
  assert.ok(f.day_price.day_eur > 0);
  const p = await c.callTool({ name: 'price_trip', arguments: { stops: [{ id: 'gem:bruges', nights: 2 }] } });
  assert.ok(json(p).total_eur > 0);
  assert.ok(p.structuredContent.total_eur > 0);
  const l = json(await c.callTool({ name: 'list_trips', arguments: { country: 'AD' } }));
  assert.equal(l.total, 2);
  await c.close();
});

test('bad input is an error result or a protocol error, never a crash', async () => {
  const c = await connect();
  const e = await c.callTool({ name: 'place_facts', arguments: { id: 'nope' } });
  assert.equal(e.isError, true);
  const bad = await c.callTool({ name: 'price_trip', arguments: { stops: [{ id: 'MAD', nights: 0 }] } }).catch((x) => x);
  assert.ok(bad.isError || bad instanceof Error);
  const none = await c.callTool({ name: 'write_trip', arguments: {} }).catch((x) => x);
  assert.ok(none.isError || none instanceof Error);
  await c.close();
});

test('stdio: the bin starts, serves tools/list and exits on close', async () => {
  const t = new StdioClientTransport({ command: process.execPath, args: [fileURLToPath(new URL('../src/stdio.js', import.meta.url))], env: { ...process.env, CARTA_DATA_DIR: DIR } });
  const c = new Client({ name: 'smoke-stdio', version: '0' });
  await c.connect(t);
  assert.equal((await c.listTools()).tools.length, 4);
  await c.close();
});

test('static: no write, network, secret or Claude API code in src', () => {
  const src = ['server.js', 'tools.js', 'data.js', 'text.js', 'stdio.js']
    .map((f) => readFileSync(fileURLToPath(new URL(`../src/${f}`, import.meta.url)), 'utf8')).join('\n');
  assert.doesNotMatch(src, /writeFile|appendFile|unlink|rmSync|mkdirSync|createWriteStream/);
  assert.doesNotMatch(src, /fetch\(|node:http|node:https|node:net|child_process/);
  assert.doesNotMatch(src, /process\.env\.[A-Z_]*(KEY|SECRET|TOKEN)/);
  assert.doesNotMatch(src, /anthropic|api\.anthropic/i);
});
