// Mobile/tablet UI checks: layout, tap targets, drawer, modals, no horizontal overflow.
//   bash test/setup-browser.sh && python3 serve.py 8099 & node test/e2e-mobile.mjs
import { chromium } from 'playwright';

const URL = process.env.URL || 'http://127.0.0.1:8099/';
const ENV = {
  ...process.env,
  LD_LIBRARY_PATH: '/tmp/rootfs/usr/lib/x86_64-linux-gnu:/tmp/rootfs/lib/x86_64-linux-gnu:/tmp/rootfs/usr/lib',
  FONTCONFIG_FILE: '/tmp/fonts.conf',
};

const VIEWPORTS = [
  { name: 'iphone-se', width: 320, height: 568, dpr: 2, touch: true },
  { name: 'iphone-12', width: 390, height: 844, dpr: 3, touch: true },
  { name: 'pixel-7', width: 412, height: 915, dpr: 2.6, touch: true },
  { name: 'ipad-mini', width: 768, height: 1024, dpr: 2, touch: true },
  { name: 'desktop', width: 1440, height: 900, dpr: 1, touch: false },
];

const browser = await chromium.launch({ env: ENV });
let failures = 0;
const check = (ok, label, detail = '') => {
  console.log(`${ok ? '  PASS' : '  FAIL'}  ${label}${detail ? ' — ' + detail : ''}`);
  if (!ok) failures++;
};

for (const vp of VIEWPORTS) {
  console.log(`\n=== ${vp.name} (${vp.width}x${vp.height}) ===`);
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: vp.dpr,
    hasTouch: vp.touch,
    isMobile: vp.touch,
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForSelector('.welcome h1', { timeout: 30000 });
  await page.waitForTimeout(600);

  const layout = await page.evaluate(() => {
    const de = document.documentElement;
    const rect = (s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x), y: Math.round(r.y) }; };
    const small = [...document.querySelectorAll('button, .file-btn')].filter((b) => {
      const r = b.getBoundingClientRect();
      return r.width > 0 && (r.width < 34 || r.height < 34);
    }).map((b) => (b.id || b.className) + ` ${Math.round(b.getBoundingClientRect().width)}x${Math.round(b.getBoundingClientRect().height)}`);
    return {
      scrollW: de.scrollWidth, innerW: window.innerWidth,
      bodyScrollW: document.body.scrollWidth,
      topbar: rect('.topbar'), composer: rect('.composer-wrap'), messages: rect('#messages'),
      sideHidden: document.body.classList.contains('side-hidden'),
      sideVisible: !!document.querySelector('.side-col') && getComputedStyle(document.querySelector('.side-col')).display !== 'none',
      textareaFont: getComputedStyle(document.querySelector('#input')).fontSize,
      smallTargets: small,
      sandboxText: document.querySelector('#sbSandbox')?.textContent,
    };
  });
  check(layout.scrollW <= layout.innerW + 1, 'no horizontal overflow', `scrollWidth=${layout.scrollW} viewport=${layout.innerW}`);
  check(layout.bodyScrollW <= layout.innerW + 1, 'body does not overflow', `bodyScrollWidth=${layout.bodyScrollW}`);
  check(parseFloat(layout.textareaFont) >= 16 || !vp.touch, 'composer font ≥16px on touch (no iOS zoom)', layout.textareaFont);
  check(!vp.touch || layout.smallTargets.length === 0, 'all tap targets ≥34px', layout.smallTargets.slice(0, 4).join(', '));
  check(vp.touch ? layout.sideHidden && !layout.sideVisible : layout.sideVisible,
    vp.touch ? 'side panel starts closed on phones' : 'side panel visible on desktop');
  check(!!layout.composer && layout.composer.y + layout.composer.h <= vp.height + 2, 'composer inside the viewport', JSON.stringify(layout.composer));

  await page.screenshot({ path: `/tmp/mobile-${vp.name}-chat.png` });

  if (vp.touch) {
    // Drawer: open, verify scrim + panel, screenshot, close by tapping the scrim.
    await page.click('#btnWorkspace');
    await page.waitForTimeout(350);
    const drawer = await page.evaluate(() => ({
      scrimVisible: !document.querySelector('#scrim').hidden,
      sideRect: (() => { const r = document.querySelector('.side-col').getBoundingClientRect(); return { w: Math.round(r.width), x: Math.round(r.x) }; })(),
      closeVisible: getComputedStyle(document.querySelector('#btnSideClose')).display !== 'none',
    }));
    check(drawer.scrimVisible, 'scrim appears with the drawer');
    check(drawer.closeVisible, 'drawer close button visible on phones');
    check(drawer.sideRect.x + drawer.sideRect.w <= vp.width + 1, 'drawer fits the viewport', JSON.stringify(drawer.sideRect));
    await page.screenshot({ path: `/tmp/mobile-${vp.name}-drawer.png` });
    // Close via the ✕ button (always available), then re-open and close by tapping the scrim.
    await page.click('#btnSideClose');
    await page.waitForTimeout(300);
    check(await page.evaluate(() => document.body.classList.contains('side-hidden') && document.querySelector('#scrim').hidden), 'close button hides the drawer');
    await page.click('#btnWorkspace');
    await page.waitForTimeout(300);
    const scrimTappable = await page.evaluate(() => {
      const r = document.querySelector('#scrim').getBoundingClientRect();
      const side = document.querySelector('.side-col').getBoundingClientRect();
      return Math.round(r.width - side.width) > 8;   // a visible strip of scrim to the left of the drawer
    });
    if (scrimTappable) {
      await page.click('#scrim', { position: { x: 4, y: Math.round(vp.height / 2) } });
      await page.waitForTimeout(300);
      check(await page.evaluate(() => document.body.classList.contains('side-hidden')), 'scrim tap closes the drawer');
    } else {
      check(true, 'scrim tap closes the drawer (skipped: drawer is full width)');
      await page.click('#btnSideClose');
      await page.waitForTimeout(250);
    }
  }

  // Settings modal
  await page.click('#btnSettings');
  await page.waitForTimeout(350);
  const modal = await page.evaluate(() => {
    const m = document.querySelector('.modal');
    if (!m) return null;
    const r = m.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height), y: Math.round(r.y), viewportW: window.innerWidth, viewportH: window.innerHeight };
  });
  check(!!modal && modal.w <= modal.viewportW + 1 && modal.h <= modal.viewportH + 1, 'settings modal fits the screen', JSON.stringify(modal));
  await page.screenshot({ path: `/tmp/mobile-${vp.name}-settings.png` });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  check(await page.evaluate(() => document.querySelector('#modalRoot').hidden), 'Escape closes the modal');
  check(errors.length === 0, 'no page errors', errors.slice(0, 2).join(' | '));
  await context.close();
}

await browser.close();
console.log(failures ? `\n${failures} CHECK(S) FAILED` : '\nALL MOBILE CHECKS PASSED');
process.exit(failures ? 1 : 0);
