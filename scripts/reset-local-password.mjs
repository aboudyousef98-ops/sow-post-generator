// Reset ONE account's password in the LOCAL blob store only, so `netlify dev`
// can be logged into on this laptop. Created 2026-10-19.
//
//   node scripts/reset-local-password.mjs aboudyousef "local-only-2026"
//
// WHAT IT TOUCHES
//   .netlify/blobs-serve/entries/<id>/site%3Asowpost/users   (gitignored)
// and nothing else. Production credentials live in Netlify Blobs in the cloud
// and are not reachable from here.
//
// WHY `updatedAt` IS DELIBERATELY NOT BUMPED
//   mergeUsers() keeps the record with the STRICTLY newer updatedAt. Leaving
//   the timestamp alone means this local record can never win a merge against
//   the real one — so even if a client ever pushed it, production keeps its own
//   password. Bumping it would turn a local convenience into a live change.
//
// Delete this file once you are done with it.

import { createHash, randomBytes } from 'node:crypto';
import { copyFileSync, existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [username, password] = process.argv.slice(2);
if (!username || !password) {
  console.error('usage: node scripts/reset-local-password.mjs <username> "<new password>"');
  process.exit(1);
}

const ROOT = '.netlify/blobs-serve/entries';
if (!existsSync(ROOT)) {
  console.error(`No local blob store at ${ROOT}. Run \`netlify dev\` once first.`);
  process.exit(1);
}

// One deploy-id directory per site; find the users key under it.
const target = readdirSync(ROOT)
  .map((id) => join(ROOT, id, 'site%3Asowpost', 'users'))
  .find((p) => existsSync(p));

if (!target) {
  console.error('Could not find the local `users` blob.');
  process.exit(1);
}

const backup = `${target}.bak-${new Date().toISOString().slice(0, 10)}`;
if (!existsSync(backup)) copyFileSync(target, backup);

const parsed = JSON.parse(readFileSync(target, 'utf8'));
const list = Array.isArray(parsed) ? parsed : parsed.users;
const user = list.find((u) => u.username === username);
if (!user) {
  console.error(`No account "${username}" here. Found: ${list.map((u) => u.username).join(', ')}`);
  process.exit(1);
}

// Same algorithm as src/lib/auth.ts — hex sha256(`${salt}:${password}`).
const salt = randomBytes(12).toString('hex');
user.salt = salt;
user.passHash = createHash('sha256').update(`${salt}:${password}`).digest('hex');
// user.updatedAt is left exactly as it was. See the note at the top.

writeFileSync(target, JSON.stringify(parsed));

const ok = createHash('sha256').update(`${user.salt}:${password}`).digest('hex') === user.passHash;
console.log(`backup written: ${backup}`);
console.log(`password reset for "${username}" (role ${user.role}) — local store only`);
console.log(`updatedAt unchanged: ${user.updatedAt}`);
console.log(`untouched accounts: ${list.filter((u) => u.username !== username).map((u) => u.username).join(', ')}`);
console.log(`self-check: ${ok ? 'hash matches the new password' : 'MISMATCH — do not rely on this'}`);
console.log('\nRestart `netlify dev` if the login still rejects it.');
