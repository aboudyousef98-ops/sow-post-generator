// GET /api/docs → self-contained HTML page documenting the SOW Bot API.
//
// PUBLIC by design: no guard, no auth. This page MUST contain no token values
// and no secrets — only placeholders ($SOW_BOT_TOKEN, $SITE). It is safe to
// serve to anyone, so it deliberately does NOT import ./lib/guard.
//
// A redirect from /api/docs already exists in netlify.toml.

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>SOW Bot API</title>
<style>
  :root {
    --bg: #0f1115;
    --panel: #171a21;
    --border: #272c36;
    --text: #e6e8ec;
    --muted: #9aa3b2;
    --accent: #6ea8fe;
    --code-bg: #0b0d11;
    --get: #4ec9a0;
    --post: #e0a05a;
    --patch: #c08bff;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--bg);
    color: var(--text);
    font: 15px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  }
  .wrap { max-width: 920px; margin: 0 auto; padding: 32px 20px 96px; }
  h1 { font-size: 28px; margin: 0 0 4px; }
  h2 { font-size: 20px; margin: 40px 0 8px; padding-top: 12px; border-top: 1px solid var(--border); }
  h3 { font-size: 15px; margin: 16px 0 6px; color: var(--muted); text-transform: uppercase; letter-spacing: .04em; }
  p { color: var(--text); }
  a { color: var(--accent); text-decoration: none; }
  a:hover { text-decoration: underline; }
  .lead { color: var(--muted); max-width: 70ch; }
  code { font-family: "SF Mono", ui-monospace, Menlo, Consolas, monospace; font-size: 13px; }
  p code, li code, td code { background: var(--code-bg); border: 1px solid var(--border); border-radius: 4px; padding: 1px 5px; }
  pre {
    background: var(--code-bg); border: 1px solid var(--border); border-radius: 8px;
    padding: 14px 16px; overflow-x: auto; margin: 10px 0;
  }
  pre code { background: none; border: none; padding: 0; }
  .toc { background: var(--panel); border: 1px solid var(--border); border-radius: 10px; padding: 16px 20px; }
  .toc ul { margin: 6px 0 0; padding-left: 18px; columns: 2; column-gap: 32px; }
  .toc li { margin: 2px 0; }
  .ep {
    background: var(--panel); border: 1px solid var(--border); border-radius: 10px;
    padding: 4px 20px 18px; margin: 14px 0;
  }
  .method {
    display: inline-block; font-family: ui-monospace, monospace; font-size: 12px; font-weight: 700;
    padding: 2px 8px; border-radius: 5px; margin-right: 8px; color: #0b0d11;
  }
  .m-get { background: var(--get); }
  .m-post { background: var(--post); }
  .m-patch { background: var(--patch); }
  .path { font-family: ui-monospace, monospace; font-size: 14px; color: var(--text); word-break: break-all; }
  table { border-collapse: collapse; width: 100%; margin: 8px 0; font-size: 13px; }
  th, td { text-align: left; border-bottom: 1px solid var(--border); padding: 6px 8px; vertical-align: top; }
  th { color: var(--muted); font-weight: 600; }
  .note { background: var(--panel); border: 1px solid var(--border); border-left: 3px solid var(--accent); border-radius: 8px; padding: 12px 18px; margin: 12px 0; }
  .muted { color: var(--muted); }
  @media (max-width: 640px) { .toc ul { columns: 1; } }
</style>
</head>
<body>
<div class="wrap">
  <h1>SOW Bot API</h1>
  <p class="lead">
    A read/write HTTP API over the SOW board. All bot endpoints live under
    <code>/api/bot/v1</code> and are authenticated with a bearer token.
    Base URL in the examples below is <code>$SITE</code>
    (e.g. <code>https://sow-post-generator.netlify.app</code>); set
    <code>$SOW_BOT_TOKEN</code> to your API token.
  </p>

  <div class="note">
    <strong>This page is public.</strong> It contains no token values and no secrets —
    only the placeholders <code>$SOW_BOT_TOKEN</code> and <code>$SITE</code>.
    Never paste a real token into a shared document.
  </div>

  <h2 id="auth">Authentication</h2>
  <p>Every bot request carries the token in the <code>Authorization</code> header:</p>
  <pre><code>Authorization: Bearer $SOW_BOT_TOKEN</code></pre>
  <p>
    A token <strong>acts as a specific user</strong>. The user's role is re-checked
    <strong>live on every request</strong>, so demoting or archiving that user immediately
    disables the token — no separate revocation step is needed for that case.
  </p>
  <p>
    Tokens are generated and revoked by an admin inside the app at
    <strong>Admin &rarr; Users &rarr; Generate API token</strong>. A token's secret value is
    shown <strong>only once</strong> at creation; store it safely, because it cannot be
    retrieved again.
  </p>
  <p>
    On write requests (<code>POST</code> / <code>PATCH</code>) you may send an optional
    <code>Idempotency-Key</code> header. Retrying a write with the same key will not create
    a duplicate — handlers are idempotent, which matters because clients and webhooks retry.
  </p>

  <h2 id="toc">Endpoints</h2>
  <div class="toc">
    <strong>Bot lane</strong> &mdash; <code>/api/bot/v1</code>, bearer token
    <ul>
      <li><a href="#get-board">GET /board</a></li>
      <li><a href="#get-project">GET /projects/:id</a></li>
      <li><a href="#get-requirements">GET /requirements</a></li>
      <li><a href="#get-matchreport">GET /match-report</a></li>
      <li><a href="#post-projects">POST /projects</a></li>
      <li><a href="#patch-project">PATCH /projects/:id</a></li>
      <li><a href="#post-update">POST /projects/:id/updates</a></li>
      <li><a href="#get-changes">GET /changes</a></li>
      <li><a href="#post-revert">POST /changes/:batchId/revert</a></li>
    </ul>
  </div>

  <h2 id="get-board">List board rows</h2>
  <div class="ep">
    <p><span class="method m-get">GET</span><span class="path">/api/bot/v1/board?section=&amp;status=&amp;coordinator=</span></p>
    <p>Lists board rows. All query params are optional filters.</p>
    <h3>Query params</h3>
    <table>
      <tr><th>Param</th><th>Notes</th></tr>
      <tr><td><code>section</code></td><td>One of <code>active</code> | <code>predesign</code> | <code>review</code> | <code>scope</code> | <code>completed</code></td></tr>
      <tr><td><code>status</code></td><td>Filter by status name</td></tr>
      <tr><td><code>coordinator</code></td><td>Filter by coordinator</td></tr>
    </table>
    <h3>Example</h3>
    <pre><code>curl "$SITE/api/bot/v1/board?section=active" \\
  -H "Authorization: Bearer $SOW_BOT_TOKEN"</code></pre>
    <h3>Response</h3>
    <pre><code>{
  "projects": [
    {
      "id": "p_123",
      "name": "123 Main St",
      "address": "123 Main St, Tampa, FL",
      "section": "active",
      "status": "Working on it",
      "preDesignStatus": null,
      "stars": 3,
      "coordinator": "jsmith",
      "installDate": "2026-12-01",
      "daysInStatus": 4,
      "daysInStatusSource": "activity",
      "sourceUrl": "https://...",
      "requestedBy": "field-bot",
      "lastUpdatedBy": "jsmith",
      "lastUpdatedAt": "2026-11-20T14:02:00.000Z"
    }
  ]
}</code></pre>
    <p class="muted">
      <code>address</code> and <code>installDate</code> are joined read-only from the Compose
      records and may be <code>null</code>.
    </p>
  </div>

  <h2 id="get-project">Get one project</h2>
  <div class="ep">
    <p><span class="method m-get">GET</span><span class="path">/api/bot/v1/projects/:id</span></p>
    <p>Returns the project plus its updates and activity log.</p>
    <h3>Example</h3>
    <pre><code>curl "$SITE/api/bot/v1/projects/p_123" \\
  -H "Authorization: Bearer $SOW_BOT_TOKEN"</code></pre>
    <h3>Response</h3>
    <pre><code>{
  "project": { "id": "p_123", "name": "123 Main St", "status": "Working on it" },
  "updates": [
    { "id": "u_1", "text": "Called AHJ", "author": "jsmith", "at": "2026-11-20T14:02:00.000Z" }
  ],
  "activity": [
    { "batchId": "b_1", "field": "status", "from": "New", "to": "Working on it", "by": "jsmith" }
  ]
}</code></pre>
  </div>

  <h2 id="get-requirements">List AHJ requirements</h2>
  <div class="ep">
    <p><span class="method m-get">GET</span><span class="path">/api/bot/v1/requirements</span></p>
    <p>Returns the AHJ requirement boards.</p>
    <h3>Example</h3>
    <pre><code>curl "$SITE/api/bot/v1/requirements" \\
  -H "Authorization: Bearer $SOW_BOT_TOKEN"</code></pre>
    <h3>Response</h3>
    <pre><code>{
  "requirements": [
    { "id": "r_1", "ahj": "Tampa", "items": ["Signed SOW", "Site plan"] }
  ]
}</code></pre>
  </div>

  <h2 id="get-matchreport">Match report</h2>
  <div class="ep">
    <p><span class="method m-get">GET</span><span class="path">/api/bot/v1/match-report</span></p>
    <p>Which jurisdictions and utilities in the Compose drafts match <em>no</em> requirements board &mdash; the gaps where a job is silently getting no requirements. Grouped by value (worst first), with the customers using each.</p>
    <h3>Example</h3>
    <pre><code>curl "$SITE/api/bot/v1/match-report" \\
  -H "Authorization: Bearer $SOW_BOT_TOKEN"</code></pre>
    <h3>Response</h3>
    <pre><code>{
  "report": {
    "gaps": [
      { "value": "Montgomery County", "kind": "ahj", "customers": ["Jane Doe", "John Roe"], "count": 2 }
    ],
    "blank": [ { "kind": "utility", "count": 3 } ],
    "checked": 42
  }
}</code></pre>
    <p class="muted"><code>kind</code> is <code>ahj</code> (jurisdiction) or <code>utility</code>; <code>blank</code> counts drafts carrying no value at all; <code>checked</code> is the number of drafts scanned.</p>
  </div>

  <h2 id="post-projects">Create a project</h2>
  <div class="ep">
    <p><span class="method m-post">POST</span><span class="path">/api/bot/v1/projects</span></p>
    <p>Creates a project. <code>status</code> and <code>preDesignStatus</code> are given <strong>by name</strong>; the server resolves them to label ids.</p>
    <h3>Body</h3>
    <table>
      <tr><th>Field</th><th>Notes</th></tr>
      <tr><td><code>name</code></td><td><strong>Required.</strong></td></tr>
      <tr><td><code>status</code></td><td>Optional, by name</td></tr>
      <tr><td><code>preDesignStatus</code></td><td>Optional, by name</td></tr>
      <tr><td><code>coordinator</code></td><td>Optional. <code>null</code> = skip auto-assign (leave unassigned)</td></tr>
      <tr><td><code>sourceUrl</code></td><td>Optional</td></tr>
      <tr><td><code>requestedBy</code></td><td>Optional</td></tr>
      <tr><td><code>force</code></td><td>Optional. <code>true</code> to create despite a fuzzy-duplicate name</td></tr>
    </table>
    <h3>Example</h3>
    <pre><code>curl -X POST "$SITE/api/bot/v1/projects" \\
  -H "Authorization: Bearer $SOW_BOT_TOKEN" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: create-123-main" \\
  -d '{"name":"123 Main St","status":"New","coordinator":null}'</code></pre>
    <h3>Response — 201</h3>
    <pre><code>{
  "project": { "id": "p_123", "name": "123 Main St", "status": "New" },
  "batchId": "b_42"
}</code></pre>
    <h3>Response — 409 (fuzzy duplicate)</h3>
    <p>Returned when the name resembles an existing project, unless <code>force: true</code> is sent.</p>
    <pre><code>{
  "error": "duplicate",
  "duplicates": [ { "id": "p_120", "name": "123 Main Street", "score": 0.92 } ]
}</code></pre>
  </div>

  <h2 id="patch-project">Update a project</h2>
  <div class="ep">
    <p><span class="method m-patch">PATCH</span><span class="path">/api/bot/v1/projects/:id</span></p>
    <p>Updates fields on a project. <code>status</code> and <code>preDesignStatus</code> are given <strong>by name</strong>. Permission-checked for members (admins always pass).</p>
    <h3>Body</h3>
    <table>
      <tr><th>Field</th><th>Notes</th></tr>
      <tr><td><code>status</code></td><td>Optional, by name</td></tr>
      <tr><td><code>preDesignStatus</code></td><td>Optional, by name</td></tr>
      <tr><td><code>coordinator</code></td><td>Optional</td></tr>
      <tr><td><code>stars</code></td><td>Optional. <code>1</code>&ndash;<code>5</code> or <code>null</code> to clear</td></tr>
    </table>
    <h3>Example</h3>
    <pre><code>curl -X PATCH "$SITE/api/bot/v1/projects/p_123" \\
  -H "Authorization: Bearer $SOW_BOT_TOKEN" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: patch-123-status" \\
  -d '{"status":"Working on it","stars":4}'</code></pre>
    <h3>Response</h3>
    <pre><code>{
  "project": { "id": "p_123", "status": "Working on it", "stars": 4 },
  "batchId": "b_43"
}</code></pre>
  </div>

  <h2 id="post-update">Add an update (note)</h2>
  <div class="ep">
    <p><span class="method m-post">POST</span><span class="path">/api/bot/v1/projects/:id/updates</span></p>
    <p>Appends a free-text update to a project. The author is the token's user, set server-side.</p>
    <h3>Body</h3>
    <table>
      <tr><th>Field</th><th>Notes</th></tr>
      <tr><td><code>text</code></td><td>The update text</td></tr>
    </table>
    <h3>Example</h3>
    <pre><code>curl -X POST "$SITE/api/bot/v1/projects/p_123/updates" \\
  -H "Authorization: Bearer $SOW_BOT_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"text":"Called the AHJ, waiting on the signed SOW."}'</code></pre>
    <h3>Response — 201</h3>
    <pre><code>{
  "update": {
    "id": "u_9",
    "text": "Called the AHJ, waiting on the signed SOW.",
    "author": "jsmith",
    "at": "2026-11-23T10:00:00.000Z"
  }
}</code></pre>
  </div>

  <h2 id="get-changes">Activity log</h2>
  <div class="ep">
    <p><span class="method m-get">GET</span><span class="path">/api/bot/v1/changes?projectId=&amp;batchId=&amp;since=</span></p>
    <p>Returns the activity log, filterable. All query params are optional.</p>
    <h3>Query params</h3>
    <table>
      <tr><th>Param</th><th>Notes</th></tr>
      <tr><td><code>projectId</code></td><td>Only changes for this project</td></tr>
      <tr><td><code>batchId</code></td><td>Only changes in this batch</td></tr>
      <tr><td><code>since</code></td><td>Only changes at or after this timestamp</td></tr>
    </table>
    <h3>Example</h3>
    <pre><code>curl "$SITE/api/bot/v1/changes?projectId=p_123&amp;since=2026-11-20T00:00:00Z" \\
  -H "Authorization: Bearer $SOW_BOT_TOKEN"</code></pre>
    <h3>Response</h3>
    <pre><code>{
  "changes": [
    {
      "batchId": "b_43",
      "projectId": "p_123",
      "field": "status",
      "from": "New",
      "to": "Working on it",
      "by": "jsmith",
      "at": "2026-11-20T14:02:00.000Z"
    }
  ]
}</code></pre>
  </div>

  <h2 id="post-revert">Revert a batch</h2>
  <div class="ep">
    <p><span class="method m-post">POST</span><span class="path">/api/bot/v1/changes/:batchId/revert</span></p>
    <p>
      Reverses a batch of changes. <strong>Conflict-safe</strong>: it skips any field that was
      changed since the batch, rather than clobbering newer work.
    </p>
    <h3>Example</h3>
    <pre><code>curl -X POST "$SITE/api/bot/v1/changes/b_43/revert" \\
  -H "Authorization: Bearer $SOW_BOT_TOKEN"</code></pre>
    <h3>Response</h3>
    <pre><code>{
  "batchId": "b_43",
  "reverted": ["p_123"],
  "conflicts": [ { "projectId": "p_124", "fields": ["status"] } ]
}</code></pre>
  </div>

  <h2 id="browser">Browser-facing management endpoints</h2>
  <p>
    Two management endpoints also exist but are <strong>not part of the bot lane</strong>. They are
    guarded by <strong>Origin + path-token</strong> (the app's own browser session), not by a bearer
    token, so they are not callable with <code>$SOW_BOT_TOKEN</code>:
  </p>
  <ul>
    <li><code>GET/POST /api/&lt;path-token&gt;/tokens</code> &mdash; list and generate bot tokens</li>
    <li><code>GET/PUT /api/&lt;path-token&gt;/botconfig</code> &mdash; read and update bot configuration</li>
  </ul>

</div>
</body>
</html>`;

export default async (req: Request): Promise<Response> => {
  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json; charset=utf-8', Allow: 'GET' },
    });
  }
  return new Response(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
};
