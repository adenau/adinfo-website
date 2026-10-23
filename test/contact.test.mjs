import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleRequest } from '../worker/index.js';

const env = {
  RESEND_API_KEY: 're_test_only', CONTACT_FROM: 'ADInfo <noreply@email.adinfo.ca>', CONTACT_TO: 'alex@adinfo.ca',
  TURNSTILE_SITE_KEY: 'production-site-key', TURNSTILE_SECRET_KEY: 'production-secret-key',
  ASSETS: { fetch: () => new Response('static page') },
};
const valid = { name: 'Test Visitor', email: 'visitor@example.com', company: 'Example', message: 'I would like to discuss technology leadership.', token: 'valid-token', website: '', submissionId: '81f7b6a0-d4c5-4d3f-9e81-543827da2e1c' };
const request = (data = valid, headers = {}) => new Request('https://www.adinfo.ca/api/contact', {
  method: 'POST', headers: { Origin: 'https://www.adinfo.ca', 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(data),
});
const noNetwork = () => { throw new Error('Unexpected network request'); };
test('static assets and public site key work without exposing secrets', async () => {
  assert.equal(await (await handleRequest(new Request('https://www.adinfo.ca/about/'), env, noNetwork)).text(), 'static page');
  const response = await handleRequest(new Request('https://www.adinfo.ca/api/contact-config'), env, noNetwork);
  assert.deepEqual(await response.json(), { siteKey: env.TURNSTILE_SITE_KEY });
  assert.equal(response.headers.get('cache-control'), 'no-store');
});
test('successful request verifies Turnstile, uses fixed sender/recipient and visitor Reply-To', async () => {
  const calls = [];
  const response = await handleRequest(request({ ...valid, to: 'attacker@example.com' }), env, async (url, options) => {
    calls.push({ url, options });
    return Response.json(url.includes('siteverify') ? { success: true, hostname: 'www.adinfo.ca', action: 'contact' } : { id: 'message-123' });
  });
  assert.equal(response.status, 200);
  assert.equal(calls.length, 2);
  const email = JSON.parse(calls[1].options.body);
  assert.equal(email.from, env.CONTACT_FROM);
  assert.deepEqual(email.to, [env.CONTACT_TO]);
  assert.equal(email.reply_to, valid.email);
  assert.ok(email.text.includes(valid.message));
  assert.equal(calls[1].options.headers['Idempotency-Key'], `contact/${valid.submissionId}`);
});
test('invalid input, cross-origin requests, bots and oversized messages never send', async () => {
  for (const [data, headers, expected] of [
    [{ ...valid, email: 'invalid' }, {}, 400],
    [{ ...valid, name: 'Injected\r\nHeader' }, {}, 400],
    [{ ...valid, name: ['wrong type'] }, {}, 400],
    [{ ...valid, message: 'short' }, {}, 400],
    [{ ...valid, token: '' }, {}, 400],
    [{ ...valid, website: 'spam' }, {}, 400],
    [{ ...valid, submissionId: 'bad' }, {}, 400],
    [valid, { Origin: 'https://other.example' }, 403],
    [valid, { 'Content-Type': 'text/plain' }, 415],
    [{ ...valid, message: 'x'.repeat(17000) }, {}, 413],
  ]) assert.equal((await handleRequest(request(data, headers), env, noNetwork)).status, expected);
});
test('invalid, expired, mismatched host or mismatched action challenges do not send', async () => {
  for (const verification of [
    { success: false },
    { success: true, hostname: 'other.example', action: 'contact' },
    { success: true, hostname: 'www.adinfo.ca', action: 'login' },
  ]) {
    let calls = 0;
    const result = await handleRequest(request(), env, async () => { calls++; return Response.json(verification); });
    assert.equal(result.status, 400);
    assert.equal(calls, 1);
  }
});
test('provider failure and timeout return an error, never a false success or secret', async () => {
  for (const provider of [() => new Response('private provider details', { status: 429 }), () => { throw new Error('private provider details'); }]) {
    const result = await handleRequest(request(), env, async url => url.includes('siteverify') ? Response.json({ success: true, hostname: 'www.adinfo.ca', action: 'contact' }) : provider());
    assert.equal(result.status, 502);
    assert.ok(!(await result.text()).includes('private provider details'));
  }
});
test('missing configuration and production test keys fail closed; local test keys are allowed', async () => {
  assert.equal((await handleRequest(request(), { ...env, RESEND_API_KEY: '' }, noNetwork)).status, 503);
  const localEnv = { ...env, TURNSTILE_SITE_KEY: '1x00000000000000000000AA', TURNSTILE_SECRET_KEY: '1x0000000000000000000000000000000AA' };
  assert.equal((await handleRequest(request(), localEnv, noNetwork)).status, 503);
  assert.equal((await handleRequest(new Request('http://127.0.0.1:8787/api/contact-config'), localEnv, noNetwork)).status, 200);
});
test('unsupported methods and routes have predictable responses', async () => {
  const response = await handleRequest(new Request('https://www.adinfo.ca/api/contact'), env, noNetwork);
  assert.equal(response.status, 405);
  assert.equal(response.headers.get('allow'), 'POST');
  assert.equal((await handleRequest(new Request('https://www.adinfo.ca/api/missing'), env, noNetwork)).status, 404);
});
