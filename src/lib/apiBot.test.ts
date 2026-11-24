// Bot API client wrappers (api.ts): tokens + webhook config. The one risk that
// matters is the request SHAPE — the token endpoint doubles as create+revoke,
// and putBotConfig must OMIT webhookSecret when the caller leaves it blank so a
// save never wipes the stored secret.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateApiToken, getBotConfig, listApiTokens, putBotConfig, revokeApiToken } from './api';

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

describe('bot API client', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('listApiTokens GETs /tokens and unwraps { tokens }', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ tokens: [{ id: 't1', prefix: 'sow_ab', username: 'aboud', createdAt: 'x' }] }),
    );
    const tokens = await listApiTokens();
    expect(tokens).toHaveLength(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain('/tokens');
  });

  it('generateApiToken POSTs username+label and returns the one-time token', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ token: 'sow_secret_value', record: { id: 't2', prefix: 'sow_se', username: 'omar', createdAt: 'x' } }),
    );
    const res = await generateApiToken('omar', 'bot');
    expect(res.token).toBe('sow_secret_value');
    const init = fetchMock.mock.calls[0][1];
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ username: 'omar', label: 'bot' });
  });

  it('revokeApiToken POSTs { action: revoke, id } to the same endpoint', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ record: { id: 't2', prefix: 'sow_se', username: 'omar', createdAt: 'x', revokedAt: 'y' } }),
    );
    const { record } = await revokeApiToken('t2');
    expect(record.revokedAt).toBe('y');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ action: 'revoke', id: 't2' });
  });

  it('getBotConfig unwraps { config }', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ config: { enabled: true, webhookUrl: 'u', events: [], hasSecret: true, updatedAt: 'x', updatedBy: 'me' } }),
    );
    const cfg = await getBotConfig();
    expect(cfg.hasSecret).toBe(true);
  });

  it('putBotConfig PUTs the patch and omits webhookSecret when the caller omits it', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        config: { enabled: false, webhookUrl: 'u', events: ['project.created'], hasSecret: true, updatedAt: 'x', updatedBy: 'me' },
      }),
    );
    await putBotConfig({ enabled: false, webhookUrl: 'u', events: ['project.created'] });
    const init = fetchMock.mock.calls[0][1];
    expect(init.method).toBe('PUT');
    const body = JSON.parse(init.body);
    expect('webhookSecret' in body).toBe(false);
  });

  it('putBotConfig forwards an empty-string webhookSecret (the explicit "clear")', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ config: { enabled: true, webhookUrl: 'u', events: [], hasSecret: false, updatedAt: 'x', updatedBy: 'me' } }),
    );
    await putBotConfig({ webhookSecret: '' });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ webhookSecret: '' });
  });

  it('throws an ApiError carrying the status on a non-ok response', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, false, 403));
    await expect(listApiTokens()).rejects.toMatchObject({ status: 403 });
  });
});
