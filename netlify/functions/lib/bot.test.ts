// Request/response-level tests for the bot API's edit-update route (Aboud
// 2026-11-26), PATCH /projects/:id/updates/:updateId. The rest of bot.mts has
// no unit harness yet (precedent: "live end-to-end tested with a real token" —
// see _CHECKPOINT_pending_package.md, Group C) — this introduces one, scoped
// to the new route, rather than reaching for every endpoint at once.
//
// The store is a tiny in-memory fake, not @netlify/blobs: bot.mts only calls
// get / getWithMetadata / setJSON, so that is all this needs to implement.
// This runs the REAL handler (the actual default export), not a reimplemented
// copy of its logic.
//
// Lives in lib/ alongside the other netlify/functions test files — NOT beside
// bot.mts itself — because netlify dev auto-discovers any top-level file in
// netlify/functions/ as a function candidate; a sibling bot.test.ts showed up
// as a phantom "bot.test" function in local dev. lib/ is never scanned.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateTokenValue, newTokenRecord, type TokenRecord } from './botAuth';
import handler from '../bot.mts';

class FakeStore {
  data = new Map<string, unknown>();
  async get(key: string) {
    return this.data.has(key) ? this.data.get(key) : null;
  }
  async getWithMetadata(key: string) {
    return this.data.has(key) ? { data: this.data.get(key), etag: `etag-${key}-${JSON.stringify(this.data.get(key)).length}` } : null;
  }
  async setJSON(key: string, value: unknown) {
    this.data.set(key, value);
    return { modified: true };
  }
}

const store = new FakeStore();

vi.mock('./store', () => ({
  getSowpostStore: () => store,
  getSowpostStoreStrong: () => store,
}));

const SITE = 'https://sow-post-generator.netlify.app';
const BOT_TOKEN = generateTokenValue();
const HUMAN_TOKEN = generateTokenValue();
// Safely in the past relative to the real wall clock the handler stamps
// edits with (new Date().toISOString()) — otherwise mergeStamped's
// newer-updatedAt-wins rule would reject the "after" write as older.
const NOW = '2026-01-01T00:00:00.000Z';

function seed() {
  store.data.clear();
  const botRecord: TokenRecord = newTokenRecord(BOT_TOKEN, 'sow_bot', 'aboudyousef', undefined, NOW);
  const humanRecord: TokenRecord = newTokenRecord(HUMAN_TOKEN, 'orajab', 'aboudyousef', undefined, NOW);
  store.data.set('tokens', [botRecord, humanRecord]);
  store.data.set('users', [
    { username: 'sow_bot', displayName: 'SOW Bot - Aboud', role: 'admin' },
    { username: 'orajab', displayName: 'Omar Rajab', role: 'member' },
  ]);
  store.data.set('board', {
    projects: [{ id: 'p1', name: 'Test Project', coordinator: '', statusId: null, updatedAt: NOW }],
    labels: [],
    activity: [],
    updates: [
      { id: 'u-bot', projectId: 'p1', text: 'Original bot text', by: 'SOW Bot - Aboud', at: NOW, kind: 'note', updatedAt: NOW },
      { id: 'u-human', projectId: 'p1', text: 'A human wrote this', by: 'Omar Rajab', at: NOW, kind: 'note', updatedAt: NOW },
      {
        id: 'u-deleted',
        projectId: 'p1',
        text: 'Gone',
        by: 'SOW Bot - Aboud',
        at: NOW,
        kind: 'note',
        updatedAt: NOW,
        deleted: { at: NOW, by: 'SOW Bot - Aboud' },
      },
    ],
  });
}

function patch(path: string, body: unknown, token = BOT_TOKEN) {
  return handler(
    new Request(`${SITE}/api/bot/v1${path}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
}

beforeEach(() => seed());

describe('PATCH /projects/:id/updates/:updateId', () => {
  it('edits the bot\'s own update: 200, text changed, editedAt/editedBy set', async () => {
    const res = await patch('/projects/p1/updates/u-bot', { text: 'Updated text from the bot' });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.update.text).toBe('Updated text from the bot');
    expect(json.update.by).toBe('SOW Bot - Aboud'); // author unchanged
    expect(json.update.editedBy).toBe('SOW Bot - Aboud');
    expect(typeof json.update.editedAt).toBe('string');

    // Persisted, not just echoed.
    const board = (await store.get('board')) as { updates: { id: string; text: string }[] };
    expect(board.updates.find((u) => u.id === 'u-bot')?.text).toBe('Updated text from the bot');
  });

  it('logs an update-edit activity entry with no duplicated text', async () => {
    await patch('/projects/p1/updates/u-bot', { text: 'Second edit' });
    const board = (await store.get('board')) as {
      activity: { projectId: string; action: string; actor: string; source?: string; changes?: unknown }[];
    };
    const entry = board.activity.find((a) => a.action === 'update-edit');
    expect(entry).toBeTruthy();
    expect(entry!.projectId).toBe('p1');
    expect(entry!.actor).toBe('SOW Bot - Aboud');
    expect(entry!.source).toBe('api');
    expect(entry!.changes).toBeUndefined();
  });

  it('refuses to edit someone else\'s update: 403, nothing written', async () => {
    const res = await patch('/projects/p1/updates/u-human', { text: 'hijacked' });
    expect(res.status).toBe(403);
    const board = (await store.get('board')) as { updates: { id: string; text: string }[] };
    expect(board.updates.find((u) => u.id === 'u-human')?.text).toBe('A human wrote this');
  });

  it('an admin bot token still cannot edit another user\'s update (no admin override)', async () => {
    // sow_bot is seeded with role admin; confirm that role alone does not
    // bypass the "own update only" rule — this must be author-scoped, not
    // permission-scoped, per the ask.
    const res = await patch('/projects/p1/updates/u-human', { text: 'still not allowed' });
    expect(res.status).toBe(403);
  });

  it('404s for an update that does not exist', async () => {
    const res = await patch('/projects/p1/updates/does-not-exist', { text: 'x' });
    expect(res.status).toBe(404);
  });

  it('404s for a soft-deleted update — it reads as gone, not editable', async () => {
    const res = await patch('/projects/p1/updates/u-deleted', { text: 'resurrect' });
    expect(res.status).toBe(404);
  });

  it('404s when the update exists but belongs to a different project', async () => {
    const res = await patch('/projects/p-other/updates/u-bot', { text: 'wrong project' });
    expect(res.status).toBe(404);
  });

  it('400s for an empty or missing text body', async () => {
    expect((await patch('/projects/p1/updates/u-bot', { text: '' })).status).toBe(400);
    expect((await patch('/projects/p1/updates/u-bot', {})).status).toBe(400);
  });

  it('identical text is a no-op — no activity entry, no editedAt stamp', async () => {
    const res = await patch('/projects/p1/updates/u-bot', { text: 'Original bot text' });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.noop).toBe(true);
    expect(json.update.editedAt).toBeUndefined();
    const board = (await store.get('board')) as { activity: { action: string }[] };
    expect(board.activity.some((a) => a.action === 'update-edit')).toBe(false);
  });

  it('401s for a revoked or unknown token', async () => {
    const res = await patch('/projects/p1/updates/u-bot', { text: 'x' }, 'sow_live_not-a-real-token');
    expect(res.status).toBe(401);
  });

  it('the human member\'s own token CAN edit the human\'s own update', async () => {
    const res = await patch('/projects/p1/updates/u-human', { text: 'self-edit is fine' }, HUMAN_TOKEN);
    expect(res.status).toBe(200);
  });
});
