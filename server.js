// Clark Performance — zero-dependency Node.js server.
// Deliberately built with only Node's built-in modules (http, fs, crypto, path)
// so it runs anywhere with no `npm install` step. See README.md for setup.

import http from 'node:http';
import fs from 'node:fs/promises';
import fssync from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadDotEnv(path.join(__dirname, '.env'));

const PORT = process.env.PORT || 3000;
const SITE_URL = (process.env.SITE_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'change-this-password';
const SESSION_SECRET = process.env.ADMIN_SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';

if (ADMIN_PASSWORD === 'change-this-password') {
  console.warn('\n⚠️  ADMIN_PASSWORD is not set — using the default password "change-this-password".');
  console.warn('   Set your own ADMIN_PASSWORD in .env before making the site public.\n');
}
if (!STRIPE_SECRET_KEY) {
  console.warn('ℹ️  STRIPE_SECRET_KEY is not set — the buy button will show an error until payment is connected.');
}

const PUBLIC_DIR = path.join(__dirname, 'public');

// On a host with an attached persistent disk (e.g. Render), set PERSIST_DIR to its mount
// path. All editable content (JSON "database" + uploaded images/videos/PDFs) then lives on
// that disk instead of the app's own ephemeral filesystem, so it survives restarts/redeploys.
// Left unset, everything behaves exactly as before (data/ and public/*/uploads in the repo).
const PERSIST_ROOT = process.env.PERSIST_DIR ? path.resolve(process.env.PERSIST_DIR) : null;

const DATA_DIR = PERSIST_ROOT ? path.join(PERSIST_ROOT, 'data') : path.join(__dirname, 'data');
const UPLOADS_IMG_DIR = PERSIST_ROOT ? path.join(PERSIST_ROOT, 'uploads', 'img') : path.join(PUBLIC_DIR, 'img', 'uploads');
const UPLOADS_VIDEO_DIR = PERSIST_ROOT ? path.join(PERSIST_ROOT, 'uploads', 'video') : path.join(PUBLIC_DIR, 'video', 'uploads');
const UPLOADS_PDF_DIR = path.join(DATA_DIR, 'uploads', 'pdfs');

await fs.mkdir(UPLOADS_IMG_DIR, { recursive: true });
await fs.mkdir(UPLOADS_VIDEO_DIR, { recursive: true });
await fs.mkdir(UPLOADS_PDF_DIR, { recursive: true });

// First boot on a fresh/empty persistent disk: seed it from the repo's default content so the
// site doesn't come up blank (18+ programs, settings, etc. all still need to exist somewhere).
if (PERSIST_ROOT) {
  const repoDataDir = path.join(__dirname, 'data');
  const seededMarker = path.join(DATA_DIR, 'programs.json');
  if (!fssync.existsSync(seededMarker) && fssync.existsSync(repoDataDir)) {
    await fs.cp(repoDataDir, DATA_DIR, { recursive: true });
    console.log('Seeded persistent data directory from repo defaults.');
  }
  const repoImgUploads = path.join(PUBLIC_DIR, 'img', 'uploads');
  if (fssync.existsSync(repoImgUploads) && (await fs.readdir(UPLOADS_IMG_DIR)).length === 0) {
    await fs.cp(repoImgUploads, UPLOADS_IMG_DIR, { recursive: true });
  }
  const repoVideoUploads = path.join(PUBLIC_DIR, 'video', 'uploads');
  if (fssync.existsSync(repoVideoUploads) && (await fs.readdir(UPLOADS_VIDEO_DIR)).length === 0) {
    await fs.cp(repoVideoUploads, UPLOADS_VIDEO_DIR, { recursive: true });
  }
}

/* ---------------- .env loader (no dependency needed) ---------------- */
function loadDotEnv(file) {
  if (!fssync.existsSync(file)) return;
  const content = fssync.readFileSync(file, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

/* ---------------- JSON data helpers ---------------- */
async function readJSON(file, fallback) {
  try {
    const raw = await fs.readFile(path.join(DATA_DIR, file), 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    return fallback;
  }
}
async function writeJSON(file, data) {
  await fs.writeFile(path.join(DATA_DIR, file), JSON.stringify(data, null, 2));
}

/* ---------------- HTTP helpers ---------------- */
function sendJSON(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}
function sendText(res, status, text, contentType = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': contentType });
  res.end(text);
}
async function readRawBody(req, limitBytes = 25 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limitBytes) throw Object.assign(new Error('Payload too large'), { statusCode: 413 });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
async function readJSONBody(req) {
  const buf = await readRawBody(req);
  if (!buf.length) return {};
  try { return JSON.parse(buf.toString('utf8')); } catch { return {}; }
}
function parseCookies(req) {
  const header = req.headers.cookie || '';
  const out = {};
  header.split(';').forEach(part => {
    const idx = part.indexOf('=');
    if (idx === -1) return;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  });
  return out;
}

/* ---------------- Admin session (HMAC-signed cookie, no DB) ---------------- */
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours
function signSession() {
  const payload = JSON.stringify({ exp: Date.now() + SESSION_TTL_MS });
  const b64 = Buffer.from(payload).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(b64).digest('base64url');
  return `${b64}.${sig}`;
}
function verifySession(token) {
  if (!token) return false;
  const [b64, sig] = token.split('.');
  if (!b64 || !sig) return false;
  const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(b64).digest('base64url');
  if (sig.length !== expectedSig.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) return false;
  try {
    const payload = JSON.parse(Buffer.from(b64, 'base64url').toString('utf8'));
    return payload.exp > Date.now();
  } catch { return false; }
}
function requireAdmin(req, res) {
  const cookies = parseCookies(req);
  if (!verifySession(cookies.cp_admin)) {
    sendJSON(res, 401, { error: 'Not logged in' });
    return false;
  }
  return true;
}

/* ---------------- Static file serving ---------------- */
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.avif': 'image/avif', '.ico': 'image/x-icon', '.pdf': 'application/pdf',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime', '.m4v': 'video/x-m4v',
};
// Video/audio elements rely on HTTP Range requests (Chrome sends "Range: bytes=0-" before it
// will even start playback) — without 206 Partial Content support here, <video> tags across the
// site (this hero background, athlete videos in the gallery) fail to load or silently never play.
async function serveStatic(req, res, pathname, baseDir = PUBLIC_DIR) {
  let rel = pathname === '/' ? '/index.html' : pathname;
  const resolved = path.normalize(path.join(baseDir, rel));
  if (!resolved.startsWith(baseDir)) return sendText(res, 403, 'Forbidden');
  try {
    const stat = await fs.stat(resolved);
    if (stat.isDirectory()) return sendText(res, 404, 'Not found');
    const ext = path.extname(resolved).toLowerCase();
    const contentType = MIME[ext] || 'application/octet-stream';
    const range = req.headers.range;
    // HTML/CSS/JS must never be served stale from the browser's cache — this is a site
    // under active editing, and a stale copy makes real changes look like they didn't apply.
    // Large media (images/video/pdf) can still cache normally.
    const noCache = ['.html', '.css', '.js'].includes(ext);
    const cacheHeader = { 'Cache-Control': noCache ? 'no-cache, no-store, must-revalidate' : 'public, max-age=3600' };

    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      const start = match && match[1] ? parseInt(match[1], 10) : 0;
      const end = match && match[2] ? parseInt(match[2], 10) : stat.size - 1;
      if (!match || start > end || end >= stat.size) {
        res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` });
        return res.end();
      }
      res.writeHead(206, {
        'Content-Type': contentType,
        'Content-Length': end - start + 1,
        'Content-Range': `bytes ${start}-${end}/${stat.size}`,
        'Accept-Ranges': 'bytes',
        ...cacheHeader,
      });
      fssync.createReadStream(resolved, { start, end }).pipe(res);
      return;
    }

    res.writeHead(200, { 'Content-Type': contentType, 'Content-Length': stat.size, 'Accept-Ranges': 'bytes', ...cacheHeader });
    fssync.createReadStream(resolved).pipe(res);
  } catch {
    sendText(res, 404, 'Not found');
  }
}

/* ---------------- Uploads (base64 data-URL, no multipart parser needed) ---------------- */
const EXT_BY_MIME = {
  'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/gif': '.gif', 'image/avif': '.avif', 'image/svg+xml': '.svg',
  'application/pdf': '.pdf',
  'video/mp4': '.mp4', 'video/quicktime': '.mov', 'video/webm': '.webm', 'video/x-m4v': '.m4v',
};
// Videos need a much higher body-size ceiling than images/PDFs — the upload endpoint
// reads its own raw body (instead of the shared readJSONBody helper) so it can allow this.
const UPLOAD_MAX_BYTES = 250 * 1024 * 1024; // 250MB
async function handleUpload(req, res) {
  if (!requireAdmin(req, res)) return;
  let body;
  try {
    const raw = await readRawBody(req, UPLOAD_MAX_BYTES);
    body = JSON.parse(raw.toString('utf8'));
  } catch (e) {
    return sendJSON(res, e.statusCode === 413 ? 413 : 400, { error: e.statusCode === 413 ? 'File is too large (max 250MB)' : 'Invalid request' });
  }
  const { dataUrl, kind } = body;
  if (!dataUrl || !dataUrl.startsWith('data:')) return sendJSON(res, 400, { error: 'Invalid file' });
  const match = dataUrl.match(/^data:([^;]+);base64,(.*)$/s);
  if (!match) return sendJSON(res, 400, { error: 'Invalid file data' });
  const mime = match[1];
  const buffer = Buffer.from(match[2], 'base64');
  const ext = EXT_BY_MIME[mime] || '.bin';
  const filename = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`;

  if (kind === 'pdf') {
    if (mime !== 'application/pdf') return sendJSON(res, 400, { error: 'File must be a PDF' });
    await fs.writeFile(path.join(UPLOADS_PDF_DIR, filename), buffer);
    return sendJSON(res, 200, { path: `pdfs/${filename}` }); // internal reference, never served directly
  } else if (kind === 'video') {
    if (!mime.startsWith('video/')) return sendJSON(res, 400, { error: 'File must be a video (mp4, mov or webm)' });
    await fs.writeFile(path.join(UPLOADS_VIDEO_DIR, filename), buffer);
    return sendJSON(res, 200, { path: `/video/uploads/${filename}` });
  } else {
    if (!mime.startsWith('image/')) return sendJSON(res, 400, { error: 'File must be an image' });
    await fs.writeFile(path.join(UPLOADS_IMG_DIR, filename), buffer);
    return sendJSON(res, 200, { path: `/img/uploads/${filename}` });
  }
}

/* ---------------- Stripe (called directly via fetch — no SDK needed) ---------------- */
async function stripeRequest(endpoint, formParams, method = 'POST') {
  const res = await fetch(`https://api.stripe.com/v1/${endpoint}`, {
    method,
    headers: {
      'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: formParams ? formParams.toString() : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw Object.assign(new Error(data.error?.message || 'Stripe-feil'), { statusCode: res.status });
  return data;
}

async function createCheckoutSession(program) {
  const params = new URLSearchParams();
  params.set('mode', 'payment');
  params.set('success_url', `${SITE_URL}/order.html?session_id={CHECKOUT_SESSION_ID}`);
  params.set('cancel_url', `${SITE_URL}/program.html?id=${program.id}`);
  params.set('line_items[0][quantity]', '1');
  params.set('line_items[0][price_data][currency]', 'nok');
  params.set('line_items[0][price_data][unit_amount]', String(Math.round(program.priceNok * 100)));
  params.set('line_items[0][price_data][product_data][name]', program.title);
  params.set('metadata[programId]', program.id);
  return stripeRequest('checkout/sessions', params);
}

function verifyStripeSignature(rawBody, signatureHeader) {
  if (!signatureHeader || !STRIPE_WEBHOOK_SECRET) return false;
  const parts = Object.fromEntries(signatureHeader.split(',').map(p => p.split('=')));
  const signedPayload = `${parts.t}.${rawBody}`;
  const expected = crypto.createHmac('sha256', STRIPE_WEBHOOK_SECRET).update(signedPayload).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(parts.v1));
  } catch { return false; }
}

async function recordOrderFromSession(session) {
  const orders = await readJSON('orders.json', []);
  const existing = orders.find(o => o.stripeSessionId === session.id);
  if (existing) return existing;
  const programs = await readJSON('programs.json', []);
  const programId = session.metadata?.programId;
  const program = programs.find(p => p.id === programId);
  const order = {
    id: crypto.randomUUID(),
    stripeSessionId: session.id,
    programId: program?.id || programId || '',
    programTitle: program?.title || 'Unknown program',
    customerEmail: session.customer_details?.email || session.customer_email || '',
    amountNok: session.amount_total ? session.amount_total / 100 : (program?.priceNok || 0),
    downloadToken: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };
  orders.push(order);
  await writeJSON('orders.json', orders);
  return order;
}

/* ---------------- Router ---------------- */
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const { pathname } = url;
    const method = req.method;

    /* ---- Public read endpoints ---- */
    if (method === 'GET' && pathname === '/api/programs') {
      const programs = await readJSON('programs.json', []);
      return sendJSON(res, 200, programs.filter(p => p.published).map(({ pdfPath, ...rest }) => rest));
    }
    if (method === 'GET' && pathname === '/api/athletes') {
      return sendJSON(res, 200, await readJSON('athletes.json', []));
    }
    if (method === 'GET' && pathname === '/api/about') {
      return sendJSON(res, 200, await readJSON('about.json', {}));
    }
    if (method === 'GET' && pathname === '/api/settings') {
      const s = await readJSON('settings.json', {});
      const { siteName, tagline, contactEmail, instagram, tiktok, heroEyebrow, heroHeadline, heroSubtext, heroVideoPath } = s;
      return sendJSON(res, 200, { siteName, tagline, contactEmail, instagram, tiktok, heroEyebrow, heroHeadline, heroSubtext, heroVideoPath });
    }

    /* ---- Contact form ---- */
    if (method === 'POST' && pathname === '/api/contact') {
      const body = await readJSONBody(req);
      const { name, email, phone, message } = body;
      if (!name || !email || !message) return sendJSON(res, 400, { error: 'Missing fields' });
      const submissions = await readJSON('contact-submissions.json', []);
      submissions.push({ id: crypto.randomUUID(), name, email, phone: phone || '', message, receivedAt: new Date().toISOString() });
      await writeJSON('contact-submissions.json', submissions);
      if (RESEND_API_KEY) {
        const settings = await readJSON('settings.json', {});
        fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: 'Clark Performance <onboarding@resend.dev>',
            to: settings.contactEmail ? [settings.contactEmail] : [],
            subject: `New inquiry from ${name}`,
            text: `From: ${name} (${email})\nPhone: ${phone || '-'}\n\n${message}`,
          }),
        }).catch(err => console.error('Could not send email notification:', err.message));
      }
      return sendJSON(res, 200, { ok: true });
    }

    /* ---- Checkout ---- */
    if (method === 'POST' && pathname === '/api/checkout') {
      if (!STRIPE_SECRET_KEY) return sendJSON(res, 400, { error: 'Payment is not set up yet' });
      const body = await readJSONBody(req);
      const programs = await readJSON('programs.json', []);
      const program = programs.find(p => p.id === body.programId && p.published);
      if (!program) return sendJSON(res, 404, { error: 'Program not found' });
      try {
        const session = await createCheckoutSession(program);
        return sendJSON(res, 200, { url: session.url });
      } catch (e) {
        console.error(e);
        return sendJSON(res, 500, { error: 'Could not start checkout' });
      }
    }

    /* ---- Stripe webhook (needs RAW body for signature check) ---- */
    if (method === 'POST' && pathname === '/api/stripe/webhook') {
      const raw = await readRawBody(req);
      const sig = req.headers['stripe-signature'];
      if (!verifyStripeSignature(raw.toString('utf8'), sig)) return sendText(res, 400, 'Invalid signature');
      const event = JSON.parse(raw.toString('utf8'));
      if (event.type === 'checkout.session.completed') {
        await recordOrderFromSession(event.data.object);
      }
      return sendJSON(res, 200, { received: true });
    }

    /* ---- Order lookup / self-heal if webhook hasn't landed yet ---- */
    if (method === 'GET' && pathname === '/api/order') {
      const sessionId = url.searchParams.get('session_id');
      if (!sessionId) return sendJSON(res, 400, { error: 'Missing session_id' });
      const orders = await readJSON('orders.json', []);
      let order = orders.find(o => o.stripeSessionId === sessionId);
      if (!order && STRIPE_SECRET_KEY) {
        try {
          const session = await stripeRequest(`checkout/sessions/${sessionId}`, null, 'GET');
          if (session.payment_status === 'paid') order = await recordOrderFromSession(session);
        } catch (e) { /* fall through */ }
      }
      if (!order) return sendJSON(res, 202, { status: 'processing' });
      return sendJSON(res, 200, { programTitle: order.programTitle, downloadToken: order.downloadToken, customerEmail: order.customerEmail });
    }

    /* ---- Secure PDF download (only via a valid order token) ---- */
    if (method === 'GET' && pathname.startsWith('/api/download/')) {
      const token = pathname.replace('/api/download/', '');
      const orders = await readJSON('orders.json', []);
      const order = orders.find(o => o.downloadToken === token);
      if (!order) return sendText(res, 404, 'Invalid or expired download link');
      const programs = await readJSON('programs.json', []);
      const program = programs.find(p => p.id === order.programId);
      if (!program?.pdfPath) return sendText(res, 404, 'PDF not uploaded for this program yet. Please contact the seller.');
      const filePath = path.join(DATA_DIR, 'uploads', program.pdfPath);
      try {
        const data = await fs.readFile(filePath);
        res.writeHead(200, {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${program.title.replace(/[^a-z0-9]+/gi, '-')}.pdf"`,
          'Content-Length': data.length,
        });
        return res.end(data);
      } catch {
        return sendText(res, 404, 'File not found');
      }
    }

    /* ---- Admin auth ---- */
    if (method === 'POST' && pathname === '/api/admin/login') {
      const body = await readJSONBody(req);
      if (body.password !== ADMIN_PASSWORD) return sendJSON(res, 401, { error: 'Wrong password' });
      const token = signSession();
      res.setHeader('Set-Cookie', `cp_admin=${token}; HttpOnly; Path=/; Max-Age=${SESSION_TTL_MS / 1000}; SameSite=Lax`);
      return sendJSON(res, 200, { ok: true });
    }
    if (method === 'POST' && pathname === '/api/admin/logout') {
      res.setHeader('Set-Cookie', 'cp_admin=; HttpOnly; Path=/; Max-Age=0');
      return sendJSON(res, 200, { ok: true });
    }
    if (method === 'GET' && pathname === '/api/admin/me') {
      if (!requireAdmin(req, res)) return;
      return sendJSON(res, 200, { ok: true });
    }

    /* ---- Admin: programs ---- */
    if (pathname === '/api/admin/programs' && method === 'GET') {
      if (!requireAdmin(req, res)) return;
      return sendJSON(res, 200, await readJSON('programs.json', []));
    }
    if (pathname.startsWith('/api/admin/programs/') && method === 'PUT') {
      if (!requireAdmin(req, res)) return;
      const id = pathname.split('/').pop();
      const patch = await readJSONBody(req);
      const programs = await readJSON('programs.json', []);
      const idx = programs.findIndex(p => p.id === id);
      if (idx === -1) return sendJSON(res, 404, { error: 'Program not found' });
      const allowed = ['title', 'shortDescription', 'description', 'priceNok', 'published', 'imagePath', 'pdfPath'];
      for (const key of allowed) if (key in patch) programs[idx][key] = patch[key];
      await writeJSON('programs.json', programs);
      return sendJSON(res, 200, programs[idx]);
    }
    if (pathname.startsWith('/api/admin/programs/') && method === 'DELETE') {
      if (!requireAdmin(req, res)) return;
      const id = pathname.split('/').pop();
      let programs = await readJSON('programs.json', []);
      programs = programs.filter(p => p.id !== id);
      await writeJSON('programs.json', programs);
      return sendJSON(res, 200, { ok: true });
    }

    /* ---- Admin: athletes ---- */
    if (pathname === '/api/admin/athletes' && method === 'GET') {
      if (!requireAdmin(req, res)) return;
      return sendJSON(res, 200, await readJSON('athletes.json', []));
    }
    if (pathname === '/api/admin/athletes' && method === 'POST') {
      if (!requireAdmin(req, res)) return;
      const body = await readJSONBody(req);
      const athletes = await readJSON('athletes.json', []);
      const entry = {
        id: crypto.randomUUID(),
        name: body.name || '',
        sport: body.sport || '',
        quote: body.quote || '',
        imagePath: body.imagePath || '/img/placeholder-athlete.svg',
        videoPath: body.videoPath || '',
        videoUrl: body.videoUrl || '',
      };
      athletes.push(entry);
      await writeJSON('athletes.json', athletes);
      return sendJSON(res, 200, entry);
    }
    if (pathname.startsWith('/api/admin/athletes/') && method === 'PUT') {
      if (!requireAdmin(req, res)) return;
      const id = pathname.split('/').pop();
      const patch = await readJSONBody(req);
      const athletes = await readJSON('athletes.json', []);
      const idx = athletes.findIndex(a => a.id === id);
      if (idx === -1) return sendJSON(res, 404, { error: 'Athlete not found' });
      const allowed = ['name', 'sport', 'quote', 'imagePath', 'videoPath', 'videoUrl'];
      for (const key of allowed) if (key in patch) athletes[idx][key] = patch[key];
      await writeJSON('athletes.json', athletes);
      return sendJSON(res, 200, athletes[idx]);
    }
    if (pathname.startsWith('/api/admin/athletes/') && method === 'DELETE') {
      if (!requireAdmin(req, res)) return;
      const id = pathname.split('/').pop();
      let athletes = await readJSON('athletes.json', []);
      athletes = athletes.filter(a => a.id !== id);
      await writeJSON('athletes.json', athletes);
      return sendJSON(res, 200, { ok: true });
    }

    /* ---- Admin: about ---- */
    if (pathname === '/api/admin/about' && method === 'GET') {
      if (!requireAdmin(req, res)) return;
      return sendJSON(res, 200, await readJSON('about.json', {}));
    }
    if (pathname === '/api/admin/about' && method === 'PUT') {
      if (!requireAdmin(req, res)) return;
      const patch = await readJSONBody(req);
      const about = await readJSON('about.json', {});
      Object.assign(about, patch);
      await writeJSON('about.json', about);
      return sendJSON(res, 200, about);
    }

    /* ---- Admin: settings ---- */
    if (pathname === '/api/admin/settings' && method === 'GET') {
      if (!requireAdmin(req, res)) return;
      return sendJSON(res, 200, await readJSON('settings.json', {}));
    }
    if (pathname === '/api/admin/settings' && method === 'PUT') {
      if (!requireAdmin(req, res)) return;
      const patch = await readJSONBody(req);
      const settings = await readJSON('settings.json', {});
      Object.assign(settings, patch);
      await writeJSON('settings.json', settings);
      return sendJSON(res, 200, settings);
    }

    /* ---- Admin: contact submissions & orders (read-only) ---- */
    if (pathname === '/api/admin/contact-submissions' && method === 'GET') {
      if (!requireAdmin(req, res)) return;
      return sendJSON(res, 200, await readJSON('contact-submissions.json', []));
    }
    if (pathname === '/api/admin/orders' && method === 'GET') {
      if (!requireAdmin(req, res)) return;
      return sendJSON(res, 200, await readJSON('orders.json', []));
    }

    /* ---- Admin: upload ---- */
    if (pathname === '/api/admin/upload' && method === 'POST') {
      return handleUpload(req, res);
    }

    /* ---- Uploaded images/videos, when they live on a persistent disk instead of public/ ---- */
    if (method === 'GET' && PERSIST_ROOT && pathname.startsWith('/img/uploads/')) {
      return serveStatic(req, res, pathname.replace('/img/uploads', ''), UPLOADS_IMG_DIR);
    }
    if (method === 'GET' && PERSIST_ROOT && pathname.startsWith('/video/uploads/')) {
      return serveStatic(req, res, pathname.replace('/video/uploads', ''), UPLOADS_VIDEO_DIR);
    }

    /* ---- Fallback: static files ---- */
    if (method === 'GET') return serveStatic(req, res, pathname);

    sendJSON(res, 404, { error: 'Not found' });
  } catch (err) {
    console.error(err);
    sendJSON(res, err.statusCode || 500, { error: err.message || 'Server error' });
  }
});

server.listen(PORT, () => {
  console.log(`\nClark Performance is running at ${SITE_URL}`);
  console.log(`Admin: ${SITE_URL}/admin/login.html\n`);
});
