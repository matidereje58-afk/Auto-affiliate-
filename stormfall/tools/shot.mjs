// Headless verification harness: boots the game in Chromium/SwiftShader,
// captures console + page errors, runs a script of actions, and writes a PNG.
//
//   node tools/shot.mjs out.png [--w 1280] [--h 720] [--wait 6000]
//                    [--do 'click:#btn-play' '--do' 'wait:8000' ...]
//
// Actions: click:<sel>  key:<code>  wait:<ms>  eval:<js>  shot:<file>
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME_PATH ||
  path.join(process.env.HOME, '.cache/ms-playwright/chromium-1148/chrome-linux/chrome');

const argv = process.argv.slice(2);
const positional = argv.filter((a) => !a.startsWith('--'));
const flag = (name, dflt) => {
  const i = argv.indexOf('--' + name);
  return i >= 0 ? argv[i + 1] : dflt;
};

const out = positional[0] || 'shot.png';
const W = Number(flag('w', 1280));
const H = Number(flag('h', 720));
const WAIT = Number(flag('wait', 7000));
const PORT = Number(flag('port', 8123));
const actions = [];
for (let i = 0; i < argv.length; i++) if (argv[i] === '--do') actions.push(argv[i + 1]);

// --- server --------------------------------------------------------------
const server = spawn(process.execPath, [path.join(ROOT, 'tools/serve.js'), String(PORT)], {
  stdio: ['ignore', 'pipe', 'pipe'],
});
await new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error('server start timeout')), 10000);
  server.stdout.on('data', (d) => {
    if (String(d).includes('dev server')) { clearTimeout(t); res(); }
  });
  server.stderr.on('data', (d) => process.stderr.write('[srv] ' + d));
});

const logs = [];
const errors = [];
let browser;

try {
  browser = await chromium.launch({
    executablePath: CHROME,
    args: [
      '--no-sandbox', '--disable-dev-shm-usage',
      '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader',
      '--disable-frame-rate-limit',
    ],
  });
  const page = await browser.newPage({ viewport: { width: W, height: H } });

  page.on('console', (m) => {
    const txt = `[${m.type()}] ${m.text()}`;
    logs.push(txt);
    if (m.type() === 'error') errors.push(txt);
  });
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}\n${e.stack || ''}`));
  page.on('requestfailed', (r) =>
    errors.push(`[requestfailed] ${r.url()} ${r.failure()?.errorText}`));

  await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(WAIT);

  for (const a of actions) {
    const [kind, ...rest] = a.split(':');
    const arg = rest.join(':');
    if (kind === 'click') await page.click(arg, { timeout: 15000 });
    else if (kind === 'key') await page.keyboard.press(arg);
    else if (kind === 'wait') await page.waitForTimeout(Number(arg));
    else if (kind === 'eval') {
      const r = await page.evaluate(arg);
      logs.push(`[eval] ${arg} => ${JSON.stringify(r)}`);
    } else if (kind === 'shot') {
      await page.screenshot({ path: path.resolve(ROOT, arg) });
      console.log('  shot →', arg);
    }
    logs.push(`[action] ${a}`);
  }

  const target = path.resolve(ROOT, out);
  await page.screenshot({ path: target });

  // Pull engine health out of the page if it exposes a probe.
  const probe = await page.evaluate(() => {
    const g = globalThis.__GAME;
    if (!g) return null;
    return typeof g.probe === 'function' ? g.probe() : { present: true };
  });

  console.log('\n=== console (' + logs.length + ') ===');
  for (const l of logs.slice(-40)) console.log(l);
  console.log('\n=== probe ===\n' + JSON.stringify(probe, null, 1));
  if (errors.length) {
    console.log('\n!!! ERRORS (' + errors.length + ') !!!');
    for (const e of errors.slice(0, 25)) console.log(e);
    console.log('\nSHOT: ' + out + ' (has visual errors)');
    process.exitCode = 1;
  } else {
    console.log('\nNo errors. SHOT: ' + out);
  }
} catch (e) {
  console.error('HARNESS FAILURE:', e.message);
  if (logs.length) {
    console.log('\n--- last logs ---');
    for (const l of logs.slice(-30)) console.log(l);
  }
  if (errors.length) {
    console.log('\n--- errors ---');
    for (const x of errors.slice(0, 20)) console.log(x);
  }
  process.exitCode = 1;
} finally {
  if (browser) await browser.close().catch(() => {});
  server.kill('SIGKILL');
}