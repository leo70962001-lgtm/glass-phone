// node tools/publish.js ["commit message"] — commit everything, create the GitHub repo on first use
// (token from Git Credential Manager via `git credential fill`; never printed), push main and make sure
// GitHub Pages serves the main branch root. No build step: the site is the repo root as-is.
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO = 'glass-phone';
const sh = (cmd, opts = {}) => execSync(cmd, { cwd: ROOT, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], ...opts }).trim();
const msg = process.argv[2] || 'Update 玻璃主畫面';

function credential() {
  const out = execSync('git credential fill', { input: 'protocol=https\nhost=github.com\n\n', encoding: 'utf8' });
  const kv = Object.fromEntries(out.trim().split('\n').map((l) => l.split('=')));
  if (!kv.password) throw new Error('no GitHub credential stored in the credential manager');
  return kv;
}
async function api(token, method, url, body) {
  const r = await fetch('https://api.github.com' + url, { method, headers: { Authorization: 'Bearer ' + token, 'User-Agent': REPO, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  let j = null; try { j = await r.json(); } catch { /* empty */ }
  return { status: r.status, j };
}

try {
  try { sh('git rev-parse --is-inside-work-tree'); } catch { sh('git init -b main'); }
  // author: reuse what the other published projects use, else the GitHub login with a noreply address
  const { username, password } = credential();
  const me = await api(password, 'GET', '/user');
  const login = me.j.login || username;
  let name = '', email = '';
  try { name = sh('git config user.name'); email = sh('git config user.email'); } catch { /* unset */ }
  if (!name || !email) {
    try { name = sh('git -C D:/ai/kaii-tantei config user.name'); email = sh('git -C D:/ai/kaii-tantei config user.email'); } catch { /* unset */ }
    if (!name) name = login;
    if (!email) email = (me.j.id ? me.j.id + '+' : '') + login + '@users.noreply.github.com';
    sh('git config user.name "' + name + '"'); sh('git config user.email "' + email + '"');
  }
  sh('git add -A');
  let changed = true;
  try { sh('git diff --cached --quiet'); changed = false; } catch { changed = true; }
  if (changed) sh('git commit -q -F -', { input: msg + '\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>\n' });
  console.log(changed ? 'committed: ' + sh('git log -1 --format=%h%x20%s') : 'nothing new to commit');
  // repo
  const exists = await api(password, 'GET', '/repos/' + login + '/' + REPO);
  if (exists.status === 404) {
    const made = await api(password, 'POST', '/user/repos', {
      name: REPO, description: '玻璃主畫面 — three.js 厚玻璃圖示的手機主畫面：光線追蹤玻璃、可調厚度與立體感、ComfyUI 絲帶動畫桌布、陀螺儀視差、粉塵消散刪除',
      homepage: 'https://' + login + '.github.io/' + REPO + '/', private: false, has_wiki: false, has_projects: false,
    });
    console.log('repo created:', made.status, made.j && made.j.html_url);
  } else console.log('repo exists:', exists.j.html_url);
  const remote = 'https://github.com/' + login + '/' + REPO + '.git';
  try { sh('git remote get-url origin'); sh('git remote set-url origin ' + remote); } catch { sh('git remote add origin ' + remote); }
  console.log(sh('git push -u origin main 2>&1'));
  // pages from the main branch root
  const pg = await api(password, 'GET', '/repos/' + login + '/' + REPO + '/pages');
  if (pg.status === 404) {
    const on = await api(password, 'POST', '/repos/' + login + '/' + REPO + '/pages', { source: { branch: 'main', path: '/' } });
    console.log('pages enabled:', on.status, on.j && (on.j.html_url || on.j.message));
  } else console.log('pages:', pg.status, pg.j && pg.j.html_url, pg.j && pg.j.status);
  console.log('open: https://' + login + '.github.io/' + REPO + '/');
} catch (e) {
  console.error('publish failed:', e.message);
  process.exit(1);
}
