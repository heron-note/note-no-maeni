#!/usr/bin/env node
/**
 * note記事のURLからOGP情報・ハッシュタグ・投稿日を取得し、
 * data/articles.json に追記（既存IDなら更新）してコミットする。
 *
 * 実行環境: GitHub Actions (Node.js 18+ の組み込み fetch を使用)
 * 入力: 環境変数 ARTICLE_URL
 */
import { readFile, writeFile } from 'node:fs/promises';

const ARTICLES_PATH = new URL('../data/articles.json', import.meta.url);

function decodeHtmlEntities(str) {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function extractMetaContent(html, attrName, attrValue) {
  const tagRegex = new RegExp(`<meta[^>]*${attrName}="${attrValue}"[^>]*>`, 'i');
  const tagMatch = html.match(tagRegex);
  if (!tagMatch) return '';
  const contentMatch = tagMatch[0].match(/content="([^"]*)"/);
  return contentMatch ? decodeHtmlEntities(contentMatch[1]) : '';
}

function extractHashtags(html) {
  const matches = [...html.matchAll(/href="[^"]*\/hashtag\/([^"]+)"/g)];
  const tags = matches.map(m => decodeHtmlEntities(decodeURIComponent(m[1])));
  return [...new Set(tags)];
}

function extractPublishedAt(html) {
  const match = html.match(/<time\s+datetime="([^"]+)"/);
  return match ? match[1].slice(0, 10) : new Date().toISOString().slice(0, 10);
}

function extractArticleId(url) {
  const match = url.match(/\/n\/([a-zA-Z0-9]+)/);
  return match ? match[1] : url;
}

function stripAuthorSuffix(title) {
  return title.replace(/｜[^｜]*$/, '').trim();
}

async function main() {
  const url = process.env.ARTICLE_URL;
  if (!url) {
    console.error('ARTICLE_URL is not set');
    process.exit(1);
  }

  const res = await fetch(url, {
    headers: { 'User-Agent': 'note-no-maeni-ogp-fetch/1.0 (+https://heron-note.github.io/note-no-maeni/)' },
  });
  if (!res.ok) {
    console.error(`Failed to fetch ${url}: HTTP ${res.status}`);
    process.exit(1);
  }
  const html = await res.text();

  const rawTitle = extractMetaContent(html, 'property', 'og:title');
  const hashtags = extractHashtags(html);

  const article = {
    id: extractArticleId(url),
    url: extractMetaContent(html, 'property', 'og:url') || url,
    title: stripAuthorSuffix(rawTitle),
    description: extractMetaContent(html, 'name', 'description').trim(),
    thumbnail: extractMetaContent(html, 'property', 'og:image'),
    tags: hashtags,
    publishedAt: extractPublishedAt(html),
    addedAt: new Date().toISOString().slice(0, 10),
    category: hashtags[0] ?? '',
    featured: false,
    pinned: false,
  };

  let data = { articles: [] };
  try {
    data = JSON.parse(await readFile(ARTICLES_PATH, 'utf-8'));
  } catch {
    // articles.json が無ければ新規作成
  }
  if (!Array.isArray(data.articles)) data.articles = [];

  const existingIndex = data.articles.findIndex(a => a.id === article.id);
  if (existingIndex >= 0) {
    // 既存項目は featured/pinned/category など編集済みの値を保ちつつOGP由来の項目のみ更新
    data.articles[existingIndex] = { ...data.articles[existingIndex], ...article, category: data.articles[existingIndex].category };
  } else {
    data.articles.unshift(article);
  }

  await writeFile(ARTICLES_PATH, JSON.stringify(data, null, 2) + '\n', 'utf-8');
  console.log(`Saved article: ${article.title} (${article.id})`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
