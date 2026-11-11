// 全ページのスクリーンショットを撮って public/shots/ に保存するスクリプト
// 使い方: node scripts/shoot.mjs
//   ONLY_MISSING=1  … まだ撮っていないページ（または失敗したページ）だけ撮る
//   LIMIT=10        … 先頭から10件だけ撮る（お試し用）
//   CONCURRENCY=3   … 同時に開くページ数
import { chromium } from 'playwright';
import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PAGES_FILE = path.join(ROOT, 'public', 'pages.json');
const SHOTS_DIR = path.join(ROOT, 'public', 'shots');
const STATUS_FILE = path.join(ROOT, 'public', 'shots.json');

const CONCURRENCY = Number(process.env.CONCURRENCY || 3);
const ONLY_MISSING = process.env.ONLY_MISSING === '1';
const LIMIT = Number(process.env.LIMIT || 0);

const VIEWPORT = { width: 1280, height: 800 };
const THUMB_WIDTH = 480;

// トップページのお知らせ用ポップアップなど、画面をふさぐものを隠す
const HIDE_CSS = `
  .modal, .modal__overlay { display: none !important; }
  html, body { overflow: visible !important; }
  *, *::before, *::after { animation-duration: 0s !important; animation-delay: 0s !important; transition: none !important; }
`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function readJson(file, fallback) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch { return fallback; }
}

async function shootOne(context, item) {
  const page = await context.newPage();
  try {
    const target = new URL(item.url).href; // 日本語や全角スペースを含むURLも正しく開けるようにする
    const res = await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    await page.addStyleTag({ content: HIDE_CSS }).catch(() => {});
    await sleep(800);
    const png = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, ...VIEWPORT } });
    const jpg = await sharp(png).resize({ width: THUMB_WIDTH }).jpeg({ quality: 72, mozjpeg: true }).toBuffer();
    await fs.writeFile(path.join(SHOTS_DIR, `${item.id}.jpg`), jpg);
    return { ok: true, status: res ? res.status() : null, at: new Date().toISOString() };
  } finally {
    await page.close().catch(() => {});
  }
}

async function main() {
  const { pages } = await readJson(PAGES_FILE, { pages: [] });
  const status = await readJson(STATUS_FILE, {});
  await fs.mkdir(SHOTS_DIR, { recursive: true });

  let queue = pages;
  if (ONLY_MISSING) queue = queue.filter((p) => !(status[p.id] && status[p.id].ok));
  if (LIMIT > 0) queue = queue.slice(0, LIMIT);
  console.log(`撮影するページ: ${queue.length} / 全${pages.length}`);

  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
    locale: 'ja-JP',
    timezoneId: 'Asia/Tokyo',
  });

  let done = 0, failed = 0;
  const work = [...queue];
  const worker = async () => {
    while (work.length) {
      const item = work.shift();
      let result;
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          result = await shootOne(context, item);
          break;
        } catch (e) {
          result = { ok: false, error: String(e.message || e).split('\n')[0], at: new Date().toISOString() };
          if (attempt === 1) await sleep(3000);
        }
      }
      status[item.id] = result;
      done++;
      if (!result.ok) failed++;
      if (done % 25 === 0 || !result.ok) {
        console.log(`${done}/${queue.length} ${result.ok ? 'OK' : 'NG'} ${item.id} ${item.url}${result.ok ? '' : ' → ' + result.error}`);
      }
      await sleep(300); // サイトに負担をかけないよう少し間をあける
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  await browser.close();

  const sorted = Object.fromEntries(Object.entries(status).sort(([a], [b]) => a.localeCompare(b)));
  await fs.writeFile(STATUS_FILE, JSON.stringify(sorted, null, 1) + '\n');
  console.log(`完了: ${done}件（失敗 ${failed}件）`);
}

main().catch((e) => { console.error(e); process.exit(1); });
