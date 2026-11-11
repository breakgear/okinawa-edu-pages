// 代表ページだけ、ページ全体（縦長）のスクリーンショットを撮って public/full/ に保存するスクリプト
// 撮るページは public/full-targets.json の ids で指定する
import { chromium } from 'playwright';
import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PAGES_FILE = path.join(ROOT, 'public', 'pages.json');
const TARGETS_FILE = path.join(ROOT, 'public', 'full-targets.json');
const OUT_DIR = path.join(ROOT, 'public', 'full');
const STATUS_FILE = path.join(ROOT, 'public', 'full-shots.json');

const VIEWPORT = { width: 1280, height: 800 };
const OUT_WIDTH = 800;        // 保存する画像の横幅
const MAX_HEIGHT = 15000;     // これより長いページは途中まで撮る

const HIDE_CSS = `
  .modal, .modal__overlay { display: none !important; }
  html, body { overflow: visible !important; }
  *, *::before, *::after { animation-duration: 0s !important; animation-delay: 0s !important; transition: none !important; }
`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const readJson = async (f, fb) => { try { return JSON.parse(await fs.readFile(f, 'utf8')); } catch { return fb; } };

async function shootFull(context, item) {
  const page = await context.newPage();
  try {
    await page.goto(new URL(item.url).href, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    await page.addStyleTag({ content: HIDE_CSS }).catch(() => {});
    // 下までゆっくりスクロールして、後から読み込まれる画像も表示させる
    await page.evaluate(async () => {
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      for (let y = 0; y < document.documentElement.scrollHeight; y += Math.round(innerHeight * 0.8)) {
        window.scrollTo(0, y);
        await wait(250);
      }
      window.scrollTo(0, 0);
    });
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    await sleep(1000);
    const fullHeight = await page.evaluate(() => Math.max(document.documentElement.scrollHeight, document.body.scrollHeight));
    const height = Math.min(fullHeight, MAX_HEIGHT);
    const png = await page.screenshot({ type: 'png', fullPage: true, clip: { x: 0, y: 0, width: VIEWPORT.width, height } });
    const jpg = await sharp(png, { limitInputPixels: false }).resize({ width: OUT_WIDTH }).jpeg({ quality: 70, mozjpeg: true }).toBuffer();
    await fs.writeFile(path.join(OUT_DIR, `${item.id}.jpg`), jpg);
    const meta = await sharp(jpg).metadata();
    return { ok: true, at: new Date().toISOString(), width: meta.width, height: meta.height, cut: fullHeight > MAX_HEIGHT, bytes: jpg.length };
  } finally {
    await page.close().catch(() => {});
  }
}

async function main() {
  const { pages } = await readJson(PAGES_FILE, { pages: [] });
  const { ids = [] } = await readJson(TARGETS_FILE, {});
  const byId = Object.fromEntries(pages.map((p) => [p.id, p]));
  await fs.mkdir(OUT_DIR, { recursive: true });

  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' });

  const status = {};
  for (const id of ids) {
    const item = byId[id];
    if (!item) { status[id] = { ok: false, error: 'pages.json にないid' }; continue; }
    for (let attempt = 1; attempt <= 2; attempt++) {
      try { status[id] = await shootFull(context, item); break; }
      catch (e) { status[id] = { ok: false, error: String(e.message || e).split('\n')[0], at: new Date().toISOString() }; await sleep(3000); }
    }
    const s = status[id];
    console.log(`${s.ok ? 'OK' : 'NG'} ${id} ${item ? item.title : ''} ${s.ok ? `${s.width}x${s.height} ${Math.round(s.bytes / 1024)}KB` : s.error}`);
    await sleep(500);
  }
  await browser.close();

  // 対象から外したページの古い画像は消す
  for (const f of await fs.readdir(OUT_DIR)) {
    if (f.endsWith('.jpg') && !ids.includes(f.replace(/\.jpg$/, ''))) await fs.unlink(path.join(OUT_DIR, f));
  }
  await fs.writeFile(STATUS_FILE, JSON.stringify(status, null, 1) + '\n');
}

main().catch((e) => { console.error(e); process.exit(1); });
