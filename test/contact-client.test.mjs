import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const source = await fs.readFile('src/assets/contact.js', 'utf8');
async function setup(response) {
  const listeners = {};
  const form = { addEventListener: (event, callback) => { listeners[event] = callback; }, reportValidity: () => true, setAttribute() {}, removeAttribute() {}, querySelectorAll: () => [], reset() {} };
  const button = { disabled: true, hidden: false };
  const status = { textContent: '', setAttribute() {}, focus() {} };
  let callbacks;
  const context = {
    document: {
      querySelector: selector => ({ '#contact-form': form, '#send-message': button, '#form-status': status })[selector],
      createElement: () => ({}), head: { append: script => script.onload() },
    },
    crypto: { randomUUID: () => '81f7b6a0-d4c5-4d3f-9e81-543827da2e1c' },
    AbortSignal, FormData: class { *[Symbol.iterator]() { yield ['message', 'A test message']; } },
    fetch: async url => url.endsWith('contact-config') ? Response.json({ siteKey: 'test' }) : response(),
    window: { turnstile: { render: (_, options) => { callbacks = options; return 0; }, reset: () => callbacks.callback('new-token'), remove() {} } },
  };
  vm.runInNewContext(source, context);
  await new Promise(resolve => setImmediate(resolve));
  callbacks.callback('initial-token');
  return { callbacks, status, button, submit: () => listeners.submit({ preventDefault() {} }) };
}
test('502 remains visible after Turnstile automatically passes again', async () => {
  const ui = await setup(() => Response.json({ error: 'Your message could not be sent.' }, { status: 502 }));
  await ui.submit();
  assert.equal(ui.status.textContent, 'Your message could not be sent.');
  assert.equal(ui.button.hidden, false);
  assert.equal(ui.button.disabled, false);
  ui.callbacks.callback('another-token');
  ui.callbacks['expired-callback']();
  assert.equal(ui.status.textContent, 'Your message could not be sent.');
});
test('Turnstile cannot overwrite sending or confirmed delivery states', async () => {
  let finish;
  const ui = await setup(() => new Promise(resolve => { finish = resolve; }));
  const submission = ui.submit();
  ui.callbacks.callback('another-token');
  assert.match(ui.status.textContent, /Sending/);
  assert.equal(ui.button.disabled, true);
  finish(Response.json({ message: 'Message sent.' }));
  await submission;
  ui.callbacks.callback('late-token');
  ui.callbacks['error-callback']();
  assert.equal(ui.status.textContent, 'Message sent.');
  assert.equal(ui.button.hidden, true);
});
