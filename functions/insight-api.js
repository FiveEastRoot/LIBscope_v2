import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { handler } = require('./insight-api.cjs');

export default async function insightApi(request, context) {
  const url = new URL(request.url);
  const queryStringParameters = Object.fromEntries(url.searchParams.entries());
  const headers = Object.fromEntries(request.headers.entries());
  const body = request.method === 'GET' || request.method === 'HEAD'
    ? undefined
    : await request.text();

  const legacyResponse = await handler({
    httpMethod: request.method,
    headers,
    queryStringParameters,
    body,
    path: url.pathname,
    rawUrl: request.url
  }, context);

  return new Response(legacyResponse.body || '', {
    status: legacyResponse.statusCode || 200,
    headers: legacyResponse.headers || {}
  });
}

export const config = {
  path: '/api/insight-api'
};
