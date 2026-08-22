"use strict";

const KUROMOJI_DIC_BASE = "https://cdn.jsdelivr.net/npm/kuromoji@0.1.2/dict/";
const BODY_TOP_N = 40;

const STOP_NOUNS = new Set([
  "こと", "もの", "ため", "よう", "ところ", "わけ", "はず", "つもり", "まま",
  "とき", "時", "方", "他", "私", "自分", "今", "前", "後", "間", "中", "所",
  "点", "場合", "感じ", "意味", "問題", "部分", "状態", "結果", "原因", "関係",
  "予定", "以上", "以下", "これ", "それ", "あれ", "どれ", "こちら", "そちら",
  "みたい", "的", "系", "際", "面", "側", "内", "外", "上", "下",
  "人", "ひと", "者", "性", "化", "度", "用", "版", "さん", "など"
]);

let tokenizer = null;

const URL_IN_TEXT = /https?:\/\/[^\s\u3000<>"]+|www\.[^\s\u3000<>"]+|\b[a-z0-9][-a-z0-9]*\.(?:com|net|org|jp|io|co\.jp|note\.com)(?:\/[^\s\u3000<>"]*)?/gi;

function stripUrls(text) {
  if (!text) return "";
  return text.replace(URL_IN_TEXT, " ");
}

function isUrlLikeToken(w) {
  if (!w) return true;
  if (/^https?$/i.test(w)) return true;
  if (/^www\.?$/i.test(w)) return true;
  if (/^[a-z0-9][-a-z0-9]*\.(com|net|org|jp|io|co\.jp)$/i.test(w)) return true;
  if (w.includes("://")) return true;
  if (w.includes("/") && /[a-z]/i.test(w)) return true;
  if ((w.match(/\./g) || []).length >= 2 && /^[a-z0-9._/-]+$/i.test(w)) return true;
  return false;
}

function patchDictionaryXhr() {
  if (XMLHttpRequest.prototype.__kuromojiDicPatched) return;
  const origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url, async, user, password) {
    let fixed = url;
    if (typeof fixed === "string") {
      if (fixed.startsWith("https:/") && !fixed.startsWith("https://")) {
        fixed = "https://" + fixed.slice(7);
      } else if (fixed.startsWith("http:/") && !fixed.startsWith("http://")) {
        fixed = "http://" + fixed.slice(6);
      } else if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(fixed)) {
        const name = fixed.replace(/^\.?\/?(dict\/)?/, "");
        fixed = KUROMOJI_DIC_BASE + name;
      }
    }
    return origOpen.call(this, method, fixed, async, user, password);
  };
  XMLHttpRequest.prototype.__kuromojiDicPatched = true;
}

function isValidNoun(token) {
  if (!token.pos.startsWith("名詞")) return false;
  if (token.pos_detail_1 === "非自立") return false;
  if (token.pos_detail_1 === "代名詞") return false;
  if (token.pos_detail_1 === "数") return false;
  const w = token.surface_form;
  if (!w || STOP_NOUNS.has(w)) return false;
  if (isUrlLikeToken(w)) return false;
  if (/^[a-zA-Z0-9][a-zA-Z0-9+.#-]*$/.test(w)) return w.length >= 1;
  return w.length >= 2;
}

function collectNouns(text) {
  const nouns = [];
  for (const token of tokenizer.tokenize(stripUrls(text))) {
    if (isValidNoun(token)) nouns.push(token.surface_form);
  }
  return nouns;
}

function extractRepresentativeNouns(title, body) {
  const titleNouns = collectNouns(title || "");
  const freq = new Map();
  for (const token of tokenizer.tokenize(stripUrls(body || ""))) {
    if (!isValidNoun(token)) continue;
    const w = token.surface_form;
    freq.set(w, (freq.get(w) || 0) + 1);
  }
  const bodyTop = [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, BODY_TOP_N)
    .map(([w]) => w);
  const seen = new Set();
  const result = [];
  for (const w of [...titleNouns, ...bodyTop]) {
    if (!seen.has(w)) {
      seen.add(w);
      result.push(w);
    }
  }
  return result;
}

function loadKuromoji() {
  patchDictionaryXhr();
  try {
    importScripts("kuromoji.min.js");
    if (typeof kuromoji !== "undefined") return;
  } catch (_) {}
  importScripts("https://cdn.jsdelivr.net/npm/kuromoji@0.1.2/build/kuromoji.js");
}

self.onmessage = function (e) {
  const { type, id, title, body } = e.data;

  if (type === "init") {
    if (tokenizer) {
      self.postMessage({ type: "ready", id });
      return;
    }
    self.postMessage({ type: "status", id, message: "辞書ライブラリ読込中..." });
    try {
      loadKuromoji();
    } catch (err) {
      self.postMessage({ type: "error", id, message: "kuromoji読込失敗: " + (err.message || String(err)) });
      return;
    }
    self.postMessage({ type: "status", id, message: "辞書ダウンロード中（初回は1-2分かかることがあります）..." });
    kuromoji.builder({ dicPath: KUROMOJI_DIC_BASE }).build((err, t) => {
      if (err) {
        self.postMessage({ type: "error", id, message: err.message || String(err) });
        return;
      }
      tokenizer = t;
      self.postMessage({ type: "ready", id });
    });
    return;
  }

  if (type === "extract") {
    if (!tokenizer) {
      self.postMessage({ type: "error", id, message: "形態素解析エンジン未初期化" });
      return;
    }
    try {
      const nouns = extractRepresentativeNouns(title, body);
      self.postMessage({ type: "extracted", id, nouns });
    } catch (err) {
      self.postMessage({ type: "error", id, message: err.message || String(err) });
    }
  }
};
