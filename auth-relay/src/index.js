/**
 * note-no-maeni auth-relay
 *
 * GitHub の CORS 制約を回避するための薄い中継サーバー。
 * 秘密情報（client_secret）は一切持たない。GITHUB_CLIENT_ID も機密ではない。
 *
 * エンドポイント:
 *   POST /device/code       -> https://github.com/login/device/code
 *   POST /token             -> https://github.com/login/oauth/access_token
 *   GET  /zipball/:owner/:repo/:ref -> https://api.github.com/repos/:owner/:repo/zipball/:ref
 *
 * device/code・tokenはリクエストボディにclient_idを自動付与してGitHubにそのまま
 * 転送し、レスポンスをそのまま返す（CORSヘッダーのみ追加）。
 *
 * zipballは少し事情が違う。api.github.com自体はCORSに対応しているが、
 * zipballエンドポイントは実体がcodeload.github.comへの302リダイレクトであり、
 * codeload.github.com はブラウザからの任意オリジンのfetch()を許可していない
 * （Access-Control-Allow-Originがrender.githubusercontent.com固定で返る）。
 * そのためブラウザから直接fetchするとCORSでブロックされ、レスポンスが
 * 一切読めない（曖昧に「1件も取得できない」という結果になり、原因の切り分けに
 * 時間がかかった）。curlやNode等、ブラウザのCORS制約を受けないクライアントでは
 * 問題なく取得できてしまうため、そちらだけで検証すると見逃してしまう。
 * ここではWorker側（ブラウザではないのでCORS制約を受けない）でzipballを取得し、
 * 中身をそのままこちらのCORSヘッダー付きでクライアントへ返す。
 * 呼び出し元のAuthorizationヘッダー（ユーザー自身のGitHubトークン）をそのまま
 * GitHubへ転送するだけで、この中継サーバー自体は何の秘密情報も持たない。
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const TARGETS = {
  '/device/code': 'https://github.com/login/device/code',
  '/token': 'https://github.com/login/oauth/access_token',
};

const ZIPBALL_PATTERN = /^\/zipball\/([^/]+)\/([^/]+)\/(.+)$/;

async function handleZipball(request, match) {
  if (request.method !== 'GET') {
    return new Response('Method Not Allowed', { status: 405, headers: CORS_HEADERS });
  }
  const authorization = request.headers.get('Authorization');
  if (!authorization) {
    return new Response('Authorization header required', { status: 401, headers: CORS_HEADERS });
  }

  const [, owner, repo, ref] = match;
  const githubResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}/zipball/${ref}`, {
    headers: {
      Authorization: authorization,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'note-no-maeni-auth-relay',
    },
  });

  return new Response(githubResponse.body, {
    status: githubResponse.status,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': githubResponse.headers.get('content-type') ?? 'application/zip',
    },
  });
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(request.url);

    const zipMatch = url.pathname.match(ZIPBALL_PATTERN);
    if (zipMatch) {
      return handleZipball(request, zipMatch);
    }

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
