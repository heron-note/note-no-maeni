/*!
 * note-no-maeni LP template — main.js
 *
 * ユーザーの GitHub Pages サイト (user/note-lp) から
 * <script src="https://heron-note.github.io/lp-template/main.js"> として読み込まれる共通スクリプト。
 * ./data/config.json, ./data/articles.json, ./data/products.json を読み込み、
 * config.json の blocks 設定に従ってページを組み立てる。
 *
 * 開発者がこのファイルを更新すると、全ユーザーの LP に即時反映される。
 */
(function () {
  'use strict';

  var TEMPLATE_VERSION = '1.0.0';
  var DATA_BASE = './data/';

  var ICON_PRESETS = {
    1: { bg: '#F6C453', emoji: '🐦' },
    2: { bg: '#7FC8A9', emoji: '🌿' },
    3: { bg: '#8FA8D8', emoji: '📚' },
  };

  var SNS_LABELS = {
    note: 'note',
    x: 'X',
    instagram: 'Instagram',
    facebook: 'Facebook',
    tiktok: 'TikTok',
    line: 'LINE',
    youtube: 'YouTube',
    threads: 'Threads',
  };

  var SNS_ICON_CLASSES = {
    note: 'fa-regular fa-note-sticky',
    x: 'fa-brands fa-x-twitter',
    instagram: 'fa-brands fa-instagram',
    facebook: 'fa-brands fa-facebook',
    tiktok: 'fa-brands fa-tiktok',
    line: 'fa-brands fa-line',
    youtube: 'fa-brands fa-youtube',
    threads: 'fa-brands fa-threads',
  };

  var FONT_AWESOME_URL = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css';

  var FONT_PRESETS = {
    default: { family: 'inherit', google: null },
    rounded: { family: '"Zen Maru Gothic", sans-serif', google: 'Zen+Maru+Gothic:wght@500;700' },
    mincho: { family: '"Shippori Mincho", serif', google: 'Shippori+Mincho:wght@500;800' },
    pop: { family: '"Kiwi Maru", sans-serif', google: 'Kiwi+Maru:wght@500' },
    hand: { family: '"Yomogi", cursive', google: 'Yomogi' },
    stylish: { family: '"M PLUS Rounded 1c", sans-serif', google: 'M+PLUS+Rounded+1c:wght@500;700' },
  };

  var PRODUCT_TYPE_LABELS = { kindle: 'Kindle', booth: 'Booth', other: 'その他' };

  var STATE = {
    config: null,
    articles: [],
    products: [],
    activeCategory: null,
    searchQuery: '',
    articlesListEl: null,
    articlesStyle: 'card',
  };

  // ---------- utilities ----------

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    attrs = attrs || {};
    for (var key in attrs) {
      if (!Object.prototype.hasOwnProperty.call(attrs, key)) continue;
      var value = attrs[key];
      if (value == null || value === false) continue;
      if (key === 'class') node.className = value;
      else if (key === 'html') node.innerHTML = value;
      else if (key.indexOf('on') === 0 && typeof value === 'function') {
        node.addEventListener(key.slice(2), value);
      } else {
        node.setAttribute(key, value);
      }
    }
    (children == null ? [] : [].concat(children)).forEach(function (child) {
      if (child == null || child === false) return;
      node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
    });
    return node;
  }

  function fetchJSON(path, fallback) {
    return fetch(path, { cache: 'no-store' })
      .then(function (res) {
        if (!res.ok) throw new Error(path + ': HTTP ' + res.status);
        return res.json();
      })
      .catch(function (err) {
        console.warn('[lp-template]', err.message);
        return fallback;
      });
  }

  function escapeForAttr(str) {
    return String(str == null ? '' : str);
  }

  // ---------- styles ----------

  function injectStyles(primaryColor) {
    var style = document.createElement('style');
    style.setAttribute('data-lp-template', TEMPLATE_VERSION);
    style.textContent = CSS_TEXT;
    document.head.appendChild(style);
    document.documentElement.style.setProperty('--lp-primary', primaryColor || '#4A90D9');
  }

  function ensureFontAwesome() {
    if (document.getElementById('lp-fontawesome')) return;
    var link = document.createElement('link');
    link.id = 'lp-fontawesome';
    link.rel = 'stylesheet';
    link.href = FONT_AWESOME_URL;
    document.head.appendChild(link);
  }

  function applyFontFamily(key) {
    var preset = FONT_PRESETS[key] || FONT_PRESETS.default;
    if (preset.google) {
      var linkId = 'lp-google-font-' + key;
      if (!document.getElementById(linkId)) {
        var link = document.createElement('link');
        link.id = linkId;
        link.rel = 'stylesheet';
        link.href = 'https://fonts.googleapis.com/css2?family=' + preset.google + '&display=swap';
        document.head.appendChild(link);
      }
    }
    document.documentElement.style.setProperty('--lp-heading-font', preset.family);
  }

  var CSS_TEXT = [
    ':root{--lp-primary:#4A90D9;--lp-bg:#FFFBF5;--lp-surface:#FFFFFF;--lp-text:#2E2A26;--lp-muted:#8A8078;--lp-border:#EDE6DB;--lp-radius:16px;--lp-heading-font:inherit;}',
    '*{box-sizing:border-box;}',
    'body{margin:0;background:var(--lp-bg);color:var(--lp-text);font-family:-apple-system,BlinkMacSystemFont,"Hiragino Sans","Yu Gothic",sans-serif;line-height:1.7;}',
    '.lp-main{max-width:880px;margin:0 auto;padding:32px 20px 80px;}',
    '.lp-block{margin-bottom:48px;}',
    '.lp-block-title{font-family:var(--lp-heading-font);font-size:20px;font-weight:700;margin:0 0 16px;padding-left:12px;border-left:6px solid var(--lp-primary);}',
    '.lp-empty{color:var(--lp-muted);font-size:14px;}',

    /* header */
    '.lp-header{display:flex;align-items:center;gap:12px;max-width:880px;margin:0 auto;padding:28px 20px 0;}',
    '.lp-header--center{flex-direction:column;justify-content:center;text-align:center;}',
    '.lp-header-logo{width:40px;height:40px;border-radius:10px;object-fit:cover;flex-shrink:0;}',
    '.lp-header--center .lp-header-logo{width:60px;height:60px;border-radius:14px;}',
    '.lp-header-title{font-family:var(--lp-heading-font);font-size:20px;font-weight:700;}',

    /* profile */
    '.lp-profile{text-align:center;}',
    '.lp-profile--horizontal{display:flex;align-items:center;gap:20px;text-align:left;}',
    '.lp-avatar{width:96px;height:96px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:44px;margin:0 auto 16px;flex-shrink:0;}',
    '.lp-profile--horizontal .lp-avatar{margin:0;}',
    '.lp-profile-name{font-family:var(--lp-heading-font);font-size:24px;font-weight:700;margin:0 0 8px;}',
    '.lp-profile-bio{color:var(--lp-muted);margin:0;white-space:pre-wrap;}',

    /* cards shared */
    '.lp-article-card,.lp-product-card,.lp-portfolio-item{display:block;background:var(--lp-surface);border:1px solid var(--lp-border);border-radius:var(--lp-radius);overflow:hidden;text-decoration:none;color:inherit;transition:transform .15s ease,box-shadow .15s ease;}',
    '.lp-article-card:hover,.lp-product-card:hover,.lp-portfolio-item:hover{transform:translateY(-2px);box-shadow:0 8px 20px rgba(0,0,0,.08);}',
    '.lp-article-card img,.lp-product-card img{width:100%;aspect-ratio:16/9;object-fit:cover;display:block;background:var(--lp-border);}',
    '.lp-article-body,.lp-product-body{padding:14px 16px;}',
    '.lp-article-title,.lp-product-title{font-size:16px;font-weight:700;margin:0 0 6px;}',
    '.lp-article-desc,.lp-product-desc{font-size:13px;color:var(--lp-muted);margin:0 0 8px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}',
    '.lp-article-tags{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:6px;}',
    '.lp-tag{font-size:11px;color:var(--lp-primary);background:color-mix(in srgb, var(--lp-primary) 12%, white);padding:2px 8px;border-radius:999px;}',
    '.lp-article-date,.lp-product-price{font-size:12px;color:var(--lp-muted);}',
    '.lp-product-type{display:inline-block;font-size:11px;font-weight:700;color:var(--lp-primary);margin-bottom:4px;}',

    /* articles list layouts */
    '.lp-articles-list--card{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:16px;}',
    '.lp-articles-list--list .lp-article-card{display:flex;gap:14px;margin-bottom:12px;}',
    '.lp-articles-list--list .lp-article-card img{width:120px;aspect-ratio:4/3;flex-shrink:0;}',
    '.lp-articles-list--magazine{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:20px;}',
    '.lp-articles-list--magazine .lp-article-card:first-child{grid-column:1/-1;}',
    '.lp-articles-list--magazine .lp-article-card:first-child img{aspect-ratio:21/9;}',

    /* featured */
    '.lp-featured-list.lp-featured-list--grid,.lp-featured--grid .lp-featured-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:16px;}',
    '.lp-featured--banner .lp-featured-list{display:flex;flex-direction:column;gap:16px;}',
    '.lp-featured--banner .lp-article-card{display:flex;gap:16px;}',
    '.lp-featured--banner .lp-article-card img{width:45%;aspect-ratio:16/9;}',
    '.lp-featured--slide .lp-featured-list{display:flex;gap:16px;overflow-x:auto;padding-bottom:8px;-webkit-overflow-scrolling:touch;}',
    '.lp-featured--slide .lp-article-card{flex:0 0 240px;}',

    /* collection */
    '.lp-collection-group{margin-bottom:28px;}',
    '.lp-collection-group-title{font-size:15px;font-weight:700;color:var(--lp-primary);margin:0 0 10px;}',
    '.lp-collection-group-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:14px;}',

    /* portfolio */
    '.lp-portfolio-grid{display:grid;gap:12px;}',
    '.lp-portfolio--grid .lp-portfolio-grid{grid-template-columns:repeat(auto-fill,minmax(140px,1fr));}',
    '.lp-portfolio--banner .lp-portfolio-grid{grid-template-columns:1fr;}',
    '.lp-portfolio--masonry .lp-portfolio-grid{grid-template-columns:repeat(auto-fill,minmax(160px,1fr));grid-auto-rows:10px;}',
    '.lp-portfolio-item img{width:100%;height:100%;object-fit:cover;display:block;aspect-ratio:1/1;}',
    '.lp-portfolio--banner .lp-portfolio-item img{aspect-ratio:21/9;}',
    '.lp-portfolio-title{display:block;padding:8px 10px;font-size:13px;font-weight:600;}',

    /* categories / search */
    '.lp-category-tabs{display:flex;flex-wrap:wrap;gap:8px;}',
    '.lp-category-tab{border:1px solid var(--lp-border);background:var(--lp-surface);color:var(--lp-text);padding:6px 14px;border-radius:999px;font-size:13px;cursor:pointer;}',
    '.lp-category-tab.is-active{background:var(--lp-primary);border-color:var(--lp-primary);color:#fff;}',
    '.lp-search-input{width:100%;padding:10px 14px;border:1px solid var(--lp-border);border-radius:999px;font-size:14px;background:var(--lp-surface);color:var(--lp-text);}',
    '.lp-search-input:focus{outline:2px solid var(--lp-primary);outline-offset:1px;}',

    /* products */
    '.lp-products-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:16px;}',
    '.lp-products--compact .lp-products-list{display:flex;flex-direction:column;gap:10px;}',
    '.lp-products--compact .lp-product-card{display:flex;gap:12px;}',
    '.lp-products--compact .lp-product-card img{width:88px;aspect-ratio:1/1;flex-shrink:0;}',

    /* image block */
    '.lp-image img{width:100%;border-radius:var(--lp-radius);display:block;}',
    '.lp-image-caption{text-align:center;font-size:12px;color:var(--lp-muted);margin-top:8px;}',

    /* links */
    '.lp-links-list{display:flex;flex-wrap:wrap;gap:12px;justify-content:center;}',
    '.lp-link-button{width:44px;height:44px;border-radius:50%;background:var(--lp-primary);color:#fff;text-decoration:none;font-size:18px;display:flex;align-items:center;justify-content:center;transition:transform .15s ease,box-shadow .15s ease;}',
    '.lp-link-button:hover{transform:translateY(-2px);box-shadow:0 6px 14px rgba(0,0,0,.15);}',

    /* footer */
    '.lp-footer{text-align:center;padding:24px 20px 40px;font-size:12px;color:var(--lp-muted);}',
    '.lp-footer a{color:inherit;}',

    '@media (max-width:520px){.lp-profile--horizontal{flex-direction:column;text-align:center;}.lp-featured--banner .lp-article-card{flex-direction:column;}.lp-featured--banner .lp-article-card img{width:100%;}}',
  ].join('\n');

  // ---------- shared card builders ----------

  function articleCard(article, style) {
    return el('a', {
      class: 'lp-article-card lp-article-card--' + style,
      href: article.url,
      target: '_blank',
      rel: 'noopener',
    }, [
      article.thumbnail ? el('img', { src: article.thumbnail, alt: escapeForAttr(article.title), loading: 'lazy' }) : null,
      el('div', { class: 'lp-article-body' }, [
        el('h3', { class: 'lp-article-title' }, article.title || ''),
        article.description ? el('p', { class: 'lp-article-desc' }, article.description) : null,
        (article.tags && article.tags.length)
          ? el('div', { class: 'lp-article-tags' }, article.tags.map(function (t) { return el('span', { class: 'lp-tag' }, '#' + t); }))
          : null,
        article.publishedAt ? el('span', { class: 'lp-article-date' }, article.publishedAt) : null,
      ]),
    ]);
  }

  function productCard(product, style) {
    return el('a', {
      class: 'lp-product-card lp-product-card--' + style,
      href: product.url,
      target: '_blank',
      rel: 'noopener',
    }, [
      product.thumbnail ? el('img', { src: product.thumbnail, alt: escapeForAttr(product.title), loading: 'lazy' }) : null,
      el('div', { class: 'lp-product-body' }, [
        el('span', { class: 'lp-product-type' }, PRODUCT_TYPE_LABELS[product.type] || product.type || ''),
        el('h3', { class: 'lp-product-title' }, product.title || ''),
        product.description ? el('p', { class: 'lp-product-desc' }, product.description) : null,
        product.price ? el('span', { class: 'lp-product-price' }, product.price) : null,
      ]),
    ]);
  }

  // ---------- article filtering (articles / categories / search interplay) ----------

  function applyArticleFilters() {
    var query = STATE.searchQuery.trim().toLowerCase();
    return STATE.articles
      .filter(function (a) {
        var matchesCategory = !STATE.activeCategory || a.category === STATE.activeCategory;
        var matchesSearch = !query
          || (a.title || '').toLowerCase().indexOf(query) !== -1
          || (a.tags || []).some(function (t) { return t.toLowerCase().indexOf(query) !== -1; });
        return matchesCategory && matchesSearch;
      })
      .sort(function (a, b) {
        if (!!b.pinned !== !!a.pinned) return (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0);
        return new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0);
      });
  }

  function updateArticlesList() {
    if (!STATE.articlesListEl) return;
    var items = applyArticleFilters();
    STATE.articlesListEl.innerHTML = '';
    if (!items.length) {
      STATE.articlesListEl.appendChild(el('p', { class: 'lp-empty' }, '該当する記事がありません。'));
      return;
    }
    items.forEach(function (a) {
      STATE.articlesListEl.appendChild(articleCard(a, STATE.articlesStyle));
    });
  }

  // ---------- block renderers ----------

  function renderProfile(block) {
    var profile = STATE.config.profile || {};
    var preset = ICON_PRESETS[profile.icon] || ICON_PRESETS[1];
    var layout = block.style === 'horizontal' ? 'horizontal' : 'center';
    return el('section', { class: 'lp-block lp-profile lp-profile--' + layout }, [
      el('div', { class: 'lp-avatar', style: 'background:' + preset.bg }, preset.emoji),
      el('div', {}, [
        el('h1', { class: 'lp-profile-name' }, profile.name || ''),
        profile.bio ? el('p', { class: 'lp-profile-bio' }, profile.bio) : null,
      ]),
    ]);
  }

  function renderFeatured(block) {
    var items = STATE.articles.filter(function (a) { return a.featured; });
    if (!items.length) return null;
    var style = block.style || 'grid';
    return el('section', { class: 'lp-block lp-featured lp-featured--' + style }, [
      el('h2', { class: 'lp-block-title' }, 'おすすめ記事'),
      el('div', { class: 'lp-featured-list' }, items.map(function (a) { return articleCard(a, 'featured'); })),
    ]);
  }

  function renderCollection() {
    var groups = {};
    var order = [];
    STATE.articles.forEach(function (a) {
      var key = a.category && a.category.trim() ? a.category : null;
      if (!key) return;
      if (!groups[key]) { groups[key] = []; order.push(key); }
      groups[key].push(a);
    });
    if (!order.length) return null;
    return el('section', { class: 'lp-block lp-collection' }, [
      el('h2', { class: 'lp-block-title' }, '特集コレクション'),
    ].concat(order.map(function (key) {
      return el('div', { class: 'lp-collection-group' }, [
        el('h3', { class: 'lp-collection-group-title' }, key),
        el('div', { class: 'lp-collection-group-list' }, groups[key].map(function (a) { return articleCard(a, 'card'); })),
      ]);
    })));
  }

  function renderPortfolio(block) {
    var items = (STATE.config.portfolio || []);
    if (!items.length) return null;
    var style = block.style || 'grid';
    return el('section', { class: 'lp-block lp-portfolio lp-portfolio--' + style }, [
      el('h2', { class: 'lp-block-title' }, 'ポートフォリオ'),
      el('div', { class: 'lp-portfolio-grid' }, items.map(function (item) {
        return el('a', { class: 'lp-portfolio-item', href: item.url || '#', target: '_blank', rel: 'noopener' }, [
          el('img', { src: item.image, alt: escapeForAttr(item.title), loading: 'lazy' }),
          item.title ? el('span', { class: 'lp-portfolio-title' }, item.title) : null,
        ]);
      })),
    ]);
  }

  function renderArticles(block) {
    var style = block.style || 'card';
    STATE.articlesStyle = style;
    var listEl = el('div', { class: 'lp-articles-list lp-articles-list--' + style });
    STATE.articlesListEl = listEl;
    updateArticlesList();
    return el('section', { class: 'lp-block lp-articles' }, [
      el('h2', { class: 'lp-block-title' }, '記事一覧'),
      listEl,
    ]);
  }

  function renderCategories() {
    var cats = [];
    STATE.articles.forEach(function (a) {
      if (a.category && cats.indexOf(a.category) === -1) cats.push(a.category);
    });
    if (!cats.length) return null;

    var options = [{ label: 'すべて', value: '' }].concat(cats.map(function (c) { return { label: c, value: c }; }));
    var tabs = options.map(function (opt, i) {
      return el('button', {
        class: 'lp-category-tab' + (i === 0 ? ' is-active' : ''),
        type: 'button',
        'data-value': opt.value,
      }, opt.label);
    });
    var tabsWrap = el('div', { class: 'lp-category-tabs' }, tabs);
    tabsWrap.addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('.lp-category-tab') : null;
      if (!btn || !tabsWrap.contains(btn)) return;
      STATE.activeCategory = btn.getAttribute('data-value') || null;
      Array.prototype.forEach.call(tabsWrap.querySelectorAll('.lp-category-tab'), function (b) {
        b.classList.toggle('is-active', b === btn);
      });
      updateArticlesList();
    });

    return el('section', { class: 'lp-block lp-categories' }, [tabsWrap]);
  }

  function renderSearch() {
    var input = el('input', { type: 'search', class: 'lp-search-input', placeholder: 'キーワード・タグで記事を検索' });
    input.addEventListener('input', function () {
      STATE.searchQuery = input.value;
      updateArticlesList();
    });
    return el('section', { class: 'lp-block lp-search' }, [input]);
  }

  function renderProducts(block) {
    if (!STATE.products.length) return null;
    var style = block.style === 'compact' ? 'compact' : 'card';
    return el('section', { class: 'lp-block lp-products lp-products--' + style }, [
      el('h2', { class: 'lp-block-title' }, '商品紹介'),
      el('div', { class: 'lp-products-list' }, STATE.products.map(function (p) { return productCard(p, style); })),
    ]);
  }

  function renderImage(block) {
    if (!block.src) return null;
    return el('section', { class: 'lp-block lp-image' }, [
      el('img', { src: block.src, alt: escapeForAttr(block.alt), loading: 'lazy' }),
      block.caption ? el('p', { class: 'lp-image-caption' }, block.caption) : null,
    ]);
  }

  function renderLinks() {
    var links = STATE.config.links || {};
    var entries = Object.keys(links).filter(function (k) { return links[k]; });
    if (!entries.length) return null;
    ensureFontAwesome();
    return el('section', { class: 'lp-block lp-links' }, [
      el('div', { class: 'lp-links-list' }, entries.map(function (key) {
        var label = SNS_LABELS[key] || key;
        var iconClass = SNS_ICON_CLASSES[key] || 'fa-solid fa-link';
        return el('a', {
          class: 'lp-link-button',
          href: links[key],
          target: '_blank',
          rel: 'noopener',
          'aria-label': label,
          title: label,
        }, [el('i', { class: iconClass, 'aria-hidden': 'true' })]);
      })),
    ]);
  }

  function renderHeader() {
    var theme = STATE.config.theme || {};
    var header = theme.header || {};
    var siteName = (STATE.config.meta && STATE.config.meta.siteTitle) || '';
    if (!header.image && !siteName) return null;
    var position = header.logoPosition === 'center' ? 'center' : 'left';
    return el('header', { class: 'lp-header lp-header--' + position }, [
      header.image ? el('img', { class: 'lp-header-logo', src: header.image, alt: escapeForAttr(siteName) }) : null,
      siteName ? el('span', { class: 'lp-header-title' }, siteName) : null,
    ]);
  }

  var RENDERERS = {
    profile: renderProfile,
    featured: renderFeatured,
    collection: renderCollection,
    portfolio: renderPortfolio,
    articles: renderArticles,
    categories: renderCategories,
    search: renderSearch,
    products: renderProducts,
    image: renderImage,
    links: renderLinks,
  };

  function renderFooter() {
    return el('footer', { class: 'lp-footer' }, [
      'Powered by ',
      el('a', { href: 'https://heron-note.github.io/note-no-maeni/', target: '_blank', rel: 'noopener' }, 'noteのまえに'),
    ]);
  }

  // ---------- init ----------

  function init() {
    Promise.all([
      fetchJSON(DATA_BASE + 'config.json', { profile: {}, blocks: [], theme: {}, links: {}, meta: {} }),
      fetchJSON(DATA_BASE + 'articles.json', { articles: [] }),
      fetchJSON(DATA_BASE + 'products.json', { products: [] }),
    ]).then(function (results) {
      var config = results[0], articlesData = results[1], productsData = results[2];

      STATE.config = config;
      STATE.articles = articlesData.articles || [];
      STATE.products = productsData.products || [];

      if (config.meta && config.meta.siteTitle) document.title = config.meta.siteTitle;
      injectStyles(config.theme && config.theme.primaryColor);
      applyFontFamily(config.theme && config.theme.fontFamily);

      var root = document.getElementById('lp-root') || document.body;
      root.innerHTML = '';

      var header = renderHeader();
      if (header) root.appendChild(header);

      var main = el('main', { class: 'lp-main' });
      root.appendChild(main);

      var blocks = (config.blocks || [])
        .filter(function (b) { return b.enabled; })
        .sort(function (a, b) { return (a.order || 0) - (b.order || 0); });

      blocks.forEach(function (block) {
        var renderer = RENDERERS[block.id];
        if (!renderer) return;
        var section = renderer(block);
        if (section) main.appendChild(section);
      });

      root.appendChild(renderFooter());
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
