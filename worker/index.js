// -----------------------------------------------------------------------------
// Shared response helpers and configuration
// -----------------------------------------------------------------------------

const LIMIT = 16_384; // Maximum request body size in bytes (16 KiB).
const unavailable =
  'The contact form is temporarily unavailable. Please reach out on LinkedIn instead.';

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...headers,
    },
  });

const localHost = hostname =>
  ['localhost', '127.0.0.1', '[::1]'].includes(hostname);

function serviceError(url, stage, status, reason = 'upstream_error') {
  // Deliberately exclude credentials, visitor data, and upstream response bodies.
  console.error('Contact service failure', { stage, status, reason });

  // Show diagnostic details locally, but keep production errors generic.
  const detail = localHost(url.hostname)
    ? ` (${stage}: ${status || 'request failed'}, ${reason}; check the Worker terminal.)`
    : '';

  return json(
    {
      error: `Your message could not be sent. Please try again, or reach out on LinkedIn.${detail}`,
    },
    502,
  );
}

function configured(env, url) {
  const names = [
    'RESEND_API_KEY',
    'CONTACT_FROM',
    'CONTACT_TO',
    'TURNSTILE_SITE_KEY',
    'TURNSTILE_SECRET_KEY',
  ];

  if (
    !names.every(name =>
      typeof env[name] === 'string' &&
      env[name].trim() &&
      !env[name].includes('replace_with')
    )
  ) {
    return false;
  }

  // Official Turnstile test keys are permitted only on local development hosts.
  const testKeys =
    /0000000000/.test(env.TURNSTILE_SITE_KEY) ||
    /0000000000/.test(env.TURNSTILE_SECRET_KEY);

  return localHost(url.hostname) || !testKeys;
}

// -----------------------------------------------------------------------------
// Read the request body with a size limit
// -----------------------------------------------------------------------------

async function readJson(request) {
  if (Number(request.headers.get('content-length')) > LIMIT) {
    throw new Error('size');
  }

  const reader = request.body?.getReader();
  if (!reader) {
    throw new Error('body');
  }

  const chunks = [];
  let size = 0;

  // Enforce the limit while streaming, even if Content-Length is absent or wrong.
  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }

    size += value.length;
    if (size > LIMIT) {
      await reader.cancel();
      throw new Error('size');
    }

    chunks.push(value);
  }

  const bytes = new Uint8Array(size);
  let offset = 0;

  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }

  return JSON.parse(new TextDecoder().decode(bytes));
}

// -----------------------------------------------------------------------------
// Request routing and contact form validation
// -----------------------------------------------------------------------------

// Tests supply fetchApi to exercise the handler without calling external services.
export async function handleRequest(request, env, fetchApi = fetch) {
  const url = new URL(request.url);

  // Pages, images, and other non-API requests use the static asset binding.
  if (!url.pathname.startsWith('/api/')) {
    return env.ASSETS.fetch(request);
  }

  if (!['/api/contact', '/api/contact-config'].includes(url.pathname)) {
    return json({ error: 'Not found.' }, 404);
  }

  const method = url.pathname === '/api/contact-config' ? 'GET' : 'POST';

  if (request.method !== method) {
    return json({ error: 'Method not allowed.' }, 405, { Allow: method });
  }

  if (!configured(env, url)) {
    return json({ error: unavailable }, 503);
  }

  // The browser needs only the public site key to render its Turnstile widget.
  if (method === 'GET') {
    return json({ siteKey: env.TURNSTILE_SITE_KEY });
  }

  if (request.headers.get('origin') !== url.origin) {
    return json({ error: 'Please submit the form from this website.' }, 403);
  }

  if (
    request.headers.get('content-type')?.split(';')[0].trim() !==
    'application/json'
  ) {
    return json({ error: 'Expected a JSON form submission.' }, 415);
  }

  let data;

  try {
    data = await readJson(request);
  } catch (error) {
    return json(
      {
        error: error.message === 'size'
          ? 'Your message is too large.'
          : 'Unable to read the form. Please try again.',
      },
      error.message === 'size' ? 413 : 400,
    );
  }

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return json({ error: 'Invalid form submission.' }, 400);
  }

  // The hidden website field is a honeypot: legitimate visitors leave it empty.
  if (data.website) {
    return json({ error: 'Unable to accept this submission.' }, 400);
  }

  const fields = {};

  for (const name of ['name', 'email', 'company', 'message', 'token']) {
    if (data[name] !== undefined && typeof data[name] !== 'string') {
      return json({ error: 'Invalid form fields.' }, 400);
    }

    fields[name] = (data[name] || '').trim();
  }

  if (
    !fields.name ||
    fields.name.length > 100 ||
    /[\r\n\x00-\x1f]/.test(fields.name)
  ) {
    return json({ error: 'Enter your name (up to 100 characters).' }, 400);
  }

  if (
    fields.email.length > 254 ||
    !/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(fields.email)
  ) {
    return json({ error: 'Enter a valid email address.' }, 400);
  }

  if (
    fields.company.length > 150 ||
    /[\r\n\x00-\x1f]/.test(fields.company)
  ) {
    return json(
      { error: 'Company must be a single line of up to 150 characters.' },
      400,
    );
  }

  if (fields.message.length < 10 || fields.message.length > 5000) {
    return json({ error: 'Enter a message between 10 and 5,000 characters.' }, 400);
  }

  if (!fields.token || fields.token.length > 2048) {
    return json({ error: 'Please complete the spam check and try again.' }, 400);
  }

  // A UUID v4 identifies the submission for Resend's idempotency key.
  if (
    typeof data.submissionId !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(data.submissionId)
  ) {
    return json({ error: 'Please reload the form and try again.' }, 400);
  }

  // ---------------------------------------------------------------------------
  // Verify the Turnstile token before attempting email delivery
  // ---------------------------------------------------------------------------

  let stage = 'turnstile';

  try {
    const verification = await fetchApi(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(10000),
        body: JSON.stringify({
          secret: env.TURNSTILE_SECRET_KEY,
          response: fields.token,
          remoteip: request.headers.get('cf-connecting-ip') || undefined,
        }),
      },
    );

    if (!verification.ok) {
      return serviceError(url, stage, verification.status);
    }

    const result = await verification.json();
    const localTesting =
      localHost(url.hostname) && /0000000000/.test(env.TURNSTILE_SITE_KEY);

    // Production tokens must belong to this hostname and the contact action.
    if (
      !result.success ||
      (!localTesting &&
        (result.hostname !== url.hostname || result.action !== 'contact'))
    ) {
      return json(
        { error: 'The spam check expired or failed. Please try again.' },
        400,
      );
    }

    // -------------------------------------------------------------------------
    // Send the inquiry through Resend
    // -------------------------------------------------------------------------

    stage = 'resend';

    const response = await fetchApi('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': `contact/${data.submissionId}`,
      },
      signal: AbortSignal.timeout(10000),
      body: JSON.stringify({
        from: env.CONTACT_FROM,
        to: [env.CONTACT_TO],
        reply_to: fields.email,
        subject: `ADInfo inquiry from ${fields.name}`,
        text: `Name: ${fields.name}\nEmail: ${fields.email}\nCompany: ${fields.company || 'Not provided'}\n\n${fields.message}`,
      }),
    });

    if (!response.ok) {
      const failure = await response.json().catch(() => ({}));

      // Classify known provider errors without exposing raw messages or addresses.
      const message = typeof failure.message === 'string'
        ? failure.message.toLowerCase()
        : '';

      const reason = /domain.*not verified/.test(message)
        ? 'sender_domain_not_verified'
        : /only send testing emails/.test(message)
          ? 'testing_recipient_restriction'
          : /api key.*(invalid|restricted|permission)|restricted.*api key|not authorized|access.*(denied|restricted)/.test(message)
            ? 'api_key_not_authorized'
            : 'upstream_error';

      return serviceError(url, stage, response.status, reason);
    }

    // Require a provider receipt before telling the visitor their message was sent.
    const receipt = await response.json();

    if (!receipt.id) {
      return serviceError(url, stage, response.status, 'missing_receipt');
    }

    return json({
      message: 'Thanks for reaching out. Your message has been sent to Alexandre.',
    });
  } catch (error) {
    const reason = error.name === 'TimeoutError'
      ? 'timeout'
      : error instanceof SyntaxError
        ? 'invalid_response'
        : 'network_error';

    return serviceError(url, stage, null, reason);
  }
}

// -----------------------------------------------------------------------------
// Cloudflare Worker entry point
// -----------------------------------------------------------------------------

export default {
  fetch: (request, env) => handleRequest(request, env),
};
