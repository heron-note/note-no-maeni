/**
 * note-no-maeni auth-relay
 *
 * GitHub OAuth Device Flow の CORS 制約を回避するための薄い中継サーバー。
 * 秘密情報（client_secret）は一切持たない。GITHUB_CLIENT_ID も機密ではない。
 *
 * エンドポイント:
 *   POST /device/code  -> https://github.com/login/device/code
 *   POST /token        -> https://github.com/login/oauth/access_token
 *
 * どちらもリクエストボディに client_id を自動付与して GitHub にそのまま転送し、
 * レスポンスをそのまま返す（CORSヘッダーのみ追加）。
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const TARGETS = {
  '/device/code': 'https://github.com/login/device/code',
  '/token': 'https://github.com/login/oauth/access_token',
};

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const target = TARGETS[url.pathname];

    if (!target) {
      return new Response('Not Found', { status: 404, headers: CORS_HEADERS });
    }
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405, headers: CORS_HEADERS });
    }
    if (!env.GITHUB_CLIENT_ID) {
      return new Response('Server misconfigured: GITHUB_CLIENT_ID is not set', { status: 500, headers: CORS_HEADERS });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      body = {};
    }
    body.client_id = env.GITHUB_CLIENT_ID;

    const githubResponse = await fetch(target, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const text = await githubResponse.text();
    return new Response(text, {
      status: githubResponse.status,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  },
};
