import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const BASE = 'http://localhost:5173';
const OUT = '/Volumes/Extreme SSD/note/20260808_app_colabo/docs/screenshots';
const VIEWPORT = { width: 390, height: 844 };

mkdirSync(OUT, { recursive: true });

const DEMO_USER = JSON.stringify({ name: 'たろう', character: 'kuma', onboarded: true });
const DEMO_LOGS = JSON.stringify({
  '2026-08-01': { type: 'write', timestamp: '2026-08-01T10:00:00.000Z', declarationId: null },
  '2026-08-02': { type: 'rest',  timestamp: '2026-08-02T10:00:00.000Z', declarationId: 'rest_01' },
  '2026-08-04': { type: 'write', timestamp: '2026-08-04T10:00:00.000Z', declarationId: null },
  '2026-08-05': { type: 'rest',  timestamp: '2026-08-05T10:00:00.000Z', declarationId: 'rest_02' },
  '2026-08-06': { type: 'write', timestamp: '2026-08-06T10:00:00.000Z', declarationId: null },
  '2026-08-07': { type: 'write', timestamp: '2026-08-07T10:00:00.000Z', declarationId: null },
});
const DEMO_BOOKMARKS = JSON.stringify([
  { id: '1', name: 'クリエイターA', url: 'https://note.com', priority: 3, lastRecommended: null },
  { id: '2', name: 'クリエイターB', url: 'https://note.com', priority: 2, lastRecommended: null },
]);

async function shot(page, name, waitMs = 500) {
  await page.waitForTimeout(waitMs);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log(`✓ ${name}.png`);
}

async function passSplash(page) {
  await page.waitForSelector('.splash', { timeout: 5000 });
  await page.click('.splash');
  await page.waitForTimeout(700);
}

const browser = await chromium.launch({ headless: true });

// シーン1: スプラッシュ
{
  const page = await browser.newPage();
  await page.setViewportSize(VIEWPORT);
  await page.goto(BASE);
  await shot(page, 'scene01_splash', 800);
  await page.close();
}

// シーン2: 初回登録
{
  const page = await browser.newPage();
  await page.setViewportSize(VIEWPORT);
  await page.addInitScript(() => localStorage.clear());
  await page.goto(BASE);
  await passSplash(page);
  await shot(page, 'scene02a_onboarding');
  await page.fill('input[type="text"]', 'たろう');
  await shot(page, 'scene02b_name_filled', 300);
  await page.close();
}

// シーン3: 相棒クリエイト
{
  const page = await browser.newPage();
  await page.setViewportSize(VIEWPORT);
  await page.addInitScript(() => localStorage.clear());
  await page.goto(BASE);
  await passSplash(page);
  await page.fill('input[type="text"]', 'たろう');
  await page.click('button:has-text("相棒クリエイト")');
  await shot(page, 'scene03_creator', 800);
  await page.close();
}

// シーン4: ホーム（はじめまして）
{
  const page = await browser.newPage();
  await page.setViewportSize(VIEWPORT);
  await page.addInitScript(({ user }) => {
    localStorage.setItem('nob_user', user);
    localStorage.setItem('nob_logs', '{}');
    localStorage.setItem('nob_sound', 'off');
  }, { user: DEMO_USER });
  await page.goto(BASE);
  await passSplash(page);
  await shot(page, 'scene04_home_hajimemashite');
  await page.close();
}

// シーン5: 書くボタン
{
  const page = await browser.newPage();
  await page.setViewportSize(VIEWPORT);
  await page.addInitScript(({ user, logs, bookmarks }) => {
    localStorage.setItem('nob_user', user);
    localStorage.setItem('nob_logs', logs);
    localStorage.setItem('nob_bookmarks', bookmarks);
    localStorage.setItem('nob_sound', 'off');
  }, { user: DEMO_USER, logs: DEMO_LOGS, bookmarks: DEMO_BOOKMARKS });
  await page.goto(BASE);
  await passSplash(page);
  await shot(page, 'scene05a_home');
  await page.click('button.choice-btn.write');
  await shot(page, 'scene05b_write_overlay', 900);
  await page.close();
}

// シーン6: 休むオーバーレイ
{
  const page = await browser.newPage();
  await page.setViewportSize(VIEWPORT);
  await page.addInitScript(({ user, logs }) => {
    localStorage.setItem('nob_user', user);
    localStorage.setItem('nob_logs', logs);
    localStorage.setItem('nob_sound', 'off');
  }, { user: DEMO_USER, logs: DEMO_LOGS });
  await page.goto(BASE);
  await passSplash(page);
  await page.click('button.choice-btn.rest');
  await shot(page, 'scene06_rest_overlay', 1000);
  await page.close();
}

// シーン6b: テンプレート編集
{
  const page = await browser.newPage();
  await page.setViewportSize(VIEWPORT);
  await page.addInitScript(({ user, logs }) => {
    localStorage.setItem('nob_user', user);
    localStorage.setItem('nob_logs', logs);
    localStorage.setItem('nob_sound', 'off');
  }, { user: DEMO_USER, logs: DEMO_LOGS });
  await page.goto(BASE);
  await passSplash(page);
  await page.click('button:has-text("テンプレートを編集")');
  await shot(page, 'scene06b_template', 600);
  await page.close();
}

// シーン7: カレンダー
{
  const page = await browser.newPage();
  await page.setViewportSize(VIEWPORT);
  await page.addInitScript(({ user, logs }) => {
    localStorage.setItem('nob_user', user);
    localStorage.setItem('nob_logs', logs);
    localStorage.setItem('nob_sound', 'off');
  }, { user: DEMO_USER, logs: DEMO_LOGS });
  await page.goto(BASE);
  await passSplash(page);
  await shot(page, 'scene07a_calendar_week');
  await page.click('.calendar-month-btn');
  await shot(page, 'scene07b_calendar_month', 500);
  await page.close();
}

// シーン8: おすすめ
{
  const page = await browser.newPage();
  await page.setViewportSize(VIEWPORT);
  await page.addInitScript(({ user, logs, bookmarks }) => {
    localStorage.setItem('nob_user', user);
    localStorage.setItem('nob_logs', logs);
    localStorage.setItem('nob_bookmarks', bookmarks);
    localStorage.setItem('nob_sound', 'off');
  }, { user: DEMO_USER, logs: DEMO_LOGS, bookmarks: DEMO_BOOKMARKS });
  await page.goto(BASE);
  await passSplash(page);
  await page.click('button:has-text("おすすめ編集")');
  await shot(page, 'scene08a_bookmark_editor', 600);
  await page.click('button:has-text("✕")');
  await page.waitForTimeout(300);
  await page.click('button.btn-recommend');
  await shot(page, 'scene08b_recommend_overlay', 500);
  await page.close();
}

// シーン9: エンディング
{
  const page = await browser.newPage();
  await page.setViewportSize(VIEWPORT);
  await page.addInitScript(({ user, logs }) => {
    localStorage.setItem('nob_user', user);
    localStorage.setItem('nob_logs', logs);
    localStorage.setItem('nob_sound', 'off');
  }, { user: DEMO_USER, logs: DEMO_LOGS });
  await page.goto(BASE);
  await passSplash(page);
  await shot(page, 'scene09_ending');
  await page.close();
}

await browser.close();
console.log('\n全スクリーンショット完了！');
