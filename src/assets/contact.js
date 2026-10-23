const form = document.querySelector('#contact-form');
const button = document.querySelector('#send-message');
const status = document.querySelector('#form-status');
let token = '';
let widget;
let submitting = false;
let deliveryState = 'idle';
let submissionId = crypto.randomUUID();
const update = (message, error = false) => {
  status.textContent = message;
  status.setAttribute('role', error ? 'alert' : 'status');
};
const resetChallenge = () => {
  token = '';
  button.disabled = true;
  if (widget !== undefined) window.turnstile.reset(widget);
};
form.addEventListener('input', () => { if (!submitting) submissionId = crypto.randomUUID(); });
async function prepare() {
  try {
    const response = await fetch('/api/contact-config', { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error('configuration');
    const { siteKey } = await response.json();
    if (!siteKey) throw new Error('configuration');
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.onload = resolve;
      script.onerror = reject;
      document.head.append(script);
    });
    widget = window.turnstile.render('#turnstile-widget', {
      sitekey: siteKey, action: 'contact', size: 'flexible', theme: 'light',
      callback: value => {
        if (deliveryState === 'sent') return;
        token = value;
        button.disabled = submitting;
        if (deliveryState === 'idle') update('Spam check passed. Your message has not been sent yet.');
      },
      'expired-callback': () => {
        if (deliveryState === 'sent') return;
        resetChallenge();
        if (deliveryState === 'idle') update('The spam check expired. Please complete it again.');
      },
      'error-callback': () => {
        if (deliveryState === 'sent') return;
        token = ''; button.disabled = true;
        if (deliveryState === 'idle') update('The spam check could not load. Please refresh, or reach out on LinkedIn.', true);
      },
    });
  } catch {
    update('The form is currently unavailable. Please reach out on LinkedIn using the link alongside it.', true);
  }
}
form.addEventListener('submit', async event => {
  event.preventDefault();
  if (submitting || !form.reportValidity()) return;
  if (!token) { update('Please complete the spam check before sending.', true); return; }
  submitting = true;
  deliveryState = 'sending';
  button.disabled = true;
  form.setAttribute('aria-busy', 'true');
  update('Sending your message…');
  const fields = Object.fromEntries(new FormData(form));
  const inputs = [...form.querySelectorAll('input, textarea')];
  inputs.forEach(input => { input.disabled = true; });
  try {
    const response = await fetch('/api/contact', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...fields, token, submissionId }), signal: AbortSignal.timeout(25000),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Your message could not be sent. Please try again.');
    if (typeof result.message !== 'string' || !result.message) throw new Error('We could not confirm delivery. Please retry, or reach out on LinkedIn.');
    deliveryState = 'sent';
    form.reset();
    submissionId = crypto.randomUUID();
    update(result.message);
    // Keep the confirmation visible after a successful submission.
    token = '';
    if (widget !== undefined) window.turnstile.remove(widget);
    widget = undefined;
    button.hidden = true;
    status.focus();
  } catch (error) {
    deliveryState = 'failed';
    update(error.name === 'TimeoutError' || error instanceof TypeError ? 'We could not confirm delivery. Please retry, or reach out on LinkedIn.' : error.message, true);
    resetChallenge();
    status.focus();
  } finally {
    submitting = false;
    inputs.forEach(input => { input.disabled = false; });
    if (token && !button.hidden) button.disabled = false;
    form.removeAttribute('aria-busy');
  }
});
prepare();
