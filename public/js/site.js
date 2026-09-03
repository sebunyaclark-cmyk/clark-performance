// Shared site chrome: header + footer, injected into #site-header / #site-footer.
// Keeps every page free of duplicated markup.

const NAV_LINKS = [
  { href: '/index.html', label: 'Home', key: 'home' },
  { href: '/programs.html', label: 'Programs', key: 'programs' },
  { href: '/about.html', label: 'About', key: 'about' },
  { href: '/athletes.html', label: 'Athletes', key: 'athletes' },
  { href: '/contact.html', label: 'Contact', key: 'contact' },
];

/* ---------- Shopping cart (stored client-side, per browser, until checkout) ---------- */
const CART_KEY = 'cp_cart';

function getCart() {
  try {
    const raw = localStorage.getItem(CART_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}
function saveCart(cart) {
  try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch { /* storage unavailable */ }
  updateCartBadge();
}
function addToCart(program) {
  const cart = getCart();
  if (cart.some(item => item.id === program.id)) return cart; // one of each program
  cart.push({ id: program.id, title: program.title, priceNok: program.priceNok, imagePath: program.imagePath });
  saveCart(cart);
  return cart;
}
function removeFromCart(id) {
  const cart = getCart().filter(item => item.id !== id);
  saveCart(cart);
  return cart;
}
function clearCart() { saveCart([]); }
function cartTotal(cart) { return cart.reduce((sum, item) => sum + (item.priceNok || 0), 0); }
function updateCartBadge() {
  const badge = document.getElementById('cartBadge');
  if (!badge) return;
  const count = getCart().length;
  badge.textContent = String(count);
  badge.style.display = count > 0 ? 'flex' : 'none';
}

function renderHeader() {
  const mount = document.getElementById('site-header');
  if (!mount) return;
  const active = document.body.dataset.page || '';
  mount.innerHTML = `
    <header class="site-header">
      <div class="container">
        <a class="brand" href="/index.html">
          <img src="/img/logo.png" alt="Clark Performance" />
        </a>
        <button class="nav-toggle" id="navToggle" aria-label="Meny">&#9776;</button>
        <nav class="nav" id="mainNav">
          ${NAV_LINKS.map(l => `<a href="${l.href}" class="${l.key === active ? 'active' : ''}">${l.label}</a>`).join('')}
          <a href="/cart.html" class="cart-link ${active === 'cart' ? 'active' : ''}" aria-label="Cart">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="9" cy="21" r="1.3" fill="currentColor" stroke="none"/><circle cx="19" cy="21" r="1.3" fill="currentColor" stroke="none"/><path d="M2.5 3h2.4l2.2 12.2a2 2 0 0 0 2 1.6h8.4a2 2 0 0 0 2-1.6L21 7H6"/></svg>
            <span id="cartBadge" class="cart-badge"></span>
          </a>
        </nav>
      </div>
    </header>
  `;
  const toggle = document.getElementById('navToggle');
  const nav = document.getElementById('mainNav');
  toggle.addEventListener('click', () => nav.classList.toggle('open'));
  updateCartBadge();
}

async function renderFooter() {
  const mount = document.getElementById('site-footer');
  if (!mount) return;
  let settings = { siteName: 'Clark Performance', contactEmail: '', instagram: '' };
  try {
    const res = await fetch('/api/settings');
    if (res.ok) settings = await res.json();
  } catch (e) { /* fall back to defaults */ }

  mount.innerHTML = `
    <footer class="site-footer">
      <div class="container">
        <div class="footer-grid">
          <div>
            <img src="/img/logo.png" alt="${settings.siteName}" style="height:36px;margin-bottom:14px;" />
            <p style="max-width:360px;">${settings.tagline || ''}</p>
          </div>
          <div>
            <h4>Navigate</h4>
            ${NAV_LINKS.map(l => `<a href="${l.href}">${l.label}</a>`).join('')}
          </div>
          <div>
            <h4>Contact</h4>
            <a href="/contact.html">Contact Form</a>
            <div style="margin-top:10px;">${socialIconsHTML(settings)}</div>
          </div>
        </div>
        <div class="footer-bottom">
          <span>&copy; ${new Date().getFullYear()} ${settings.siteName}. All rights reserved.</span>
          <a href="/admin/login.html" style="opacity:.5;">Admin</a>
        </div>
      </div>
    </footer>
  `;
}

// Small inline icon set (Instagram / TikTok) so the site never depends on an external icon font/CDN.
function socialIconsHTML(settings) {
  if (!settings) return '';
  const items = [];
  if (settings.instagram) {
    items.push(`
      <a href="${settings.instagram}" target="_blank" rel="noopener" aria-label="Instagram" class="social-icon">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8">
          <rect x="3" y="3" width="18" height="18" rx="5" />
          <circle cx="12" cy="12" r="4.2" />
          <circle cx="17.3" cy="6.7" r="1.1" fill="currentColor" stroke="none" />
        </svg>
      </a>`);
  }
  if (settings.tiktok) {
    items.push(`
      <a href="${settings.tiktok}" target="_blank" rel="noopener" aria-label="TikTok" class="social-icon">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
          <path d="M16.5 3c.4 2.1 1.9 3.7 4 4v3a7 7 0 0 1-4-1.3v6.7a5.8 5.8 0 1 1-5.8-5.8c.3 0 .6 0 .9.05v3.1a2.7 2.7 0 1 0 1.9 2.6V3h3z" />
        </svg>
      </a>`);
  }
  return items.length ? `<div class="social-icons">${items.join('')}</div>` : '';
}

function formatPrice(nok) {
  return nok.toLocaleString('en-US') + ' NOK';
}

function seasonLabel(season) {
  if (season === 'in-season') return 'In-Season';
  if (season === 'off-season') return 'Off-Season';
  return '';
}

function programCardHTML(p) {
  const badge = p.category === 'sport' ? `${p.sport} · ${seasonLabel(p.season)}`
    : p.category === 'beginner' ? 'Beginner'
    : 'General';
  return `
    <a class="card" href="/program.html?id=${encodeURIComponent(p.id)}">
      <div class="card-media"><img src="${p.imagePath}" alt="${p.title}" loading="lazy" /></div>
      <div class="card-body">
        <span class="card-badge">${badge}</span>
        <h3>${p.title}</h3>
        <p>${p.shortDescription}</p>
        <div class="card-footer">
          <span class="price">${formatPrice(p.priceNok)}</span>
          <span class="btn btn-outline-dark" style="padding:8px 16px;">View Program</span>
        </div>
      </div>
    </a>
  `;
}

function athleteCardHTML(a) {
  const media = a.videoPath
    ? `<video src="${a.videoPath}" controls preload="metadata" style="width:100%;height:100%;object-fit:cover;"></video>`
    : a.videoUrl
    ? `<div class="video-embed-wrap"><iframe src="${toEmbedUrl(a.videoUrl)}" allowfullscreen loading="lazy"></iframe></div>`
    : `<img src="${a.imagePath}" alt="${a.name}" />`;
  return `
    <div class="athlete-card">
      <div class="athlete-media">
        ${media}
        <div class="quote-mark">&ldquo;</div>
      </div>
      <div class="athlete-body">
        <p class="quote">${a.quote}</p>
        <div class="athlete-name">${a.name}</div>
        <div class="athlete-sport">${a.sport}</div>
      </div>
    </div>
  `;
}

// Turns a normal YouTube/Vimeo link into its embeddable form.
function toEmbedUrl(url) {
  try {
    const u = new URL(url);
    if (u.hostname.includes('youtube.com') && u.searchParams.get('v')) {
      return `https://www.youtube.com/embed/${u.searchParams.get('v')}`;
    }
    if (u.hostname === 'youtu.be') {
      return `https://www.youtube.com/embed/${u.pathname.slice(1)}`;
    }
    if (u.hostname.includes('vimeo.com')) {
      const id = u.pathname.split('/').filter(Boolean).pop();
      return `https://player.vimeo.com/video/${id}`;
    }
    return url;
  } catch {
    return url;
  }
}

// Subtle fade-up reveal for each section as it scrolls into view.
function initScrollReveal() {
  // .hero-inner has its own dedicated staggered entrance animation (see .hero-inner > * in
  // styles.css), so it's excluded here to avoid stacking two fade-ins on the same content.
  // Containers that hold a .grid are also excluded: those grids get their own per-card
  // stagger via initGridReveal, and a whole-container ratio-based reveal on a tall grid
  // (many cards) would need a very deep scroll before crossing the intersection threshold,
  // hiding unrelated content like a filter bar that sits in the same container.
  const targets = Array.from(document.querySelectorAll('.section > .container')).filter(
    (el) => !el.querySelector('.grid')
  );
  if (!targets.length) return;
  if (!('IntersectionObserver' in window)) {
    targets.forEach((el) => el.classList.add('reveal', 'is-visible'));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      });
    },
    { threshold: 0, rootMargin: '0px 0px -18% 0px' }
  );
  targets.forEach((el) => {
    el.classList.add('reveal');
    io.observe(el);
  });
}

// Staggered fade-up for the children of a grid/list (program cards, athlete cards, about
// timeline items) as they scroll into view — call this again any time a container's content
// is replaced (e.g. after a filter re-render), it just re-observes the current children.
function initGridReveal(container) {
  if (!container) return;
  const items = Array.from(container.children).filter((el) => el.nodeType === 1);
  if (!items.length) return;
  if (!('IntersectionObserver' in window)) {
    items.forEach((el) => el.classList.add('reveal-item', 'is-visible'));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      });
    },
    { threshold: 0, rootMargin: '0px 0px -12% 0px' }
  );
  items.forEach((el, i) => {
    el.classList.add('reveal-item');
    el.style.transitionDelay = `${Math.min(i, 8) * 0.08}s`;
    io.observe(el);
  });
}

// Small shadow under the sticky header once the page has scrolled a bit.
function initHeaderScrollShadow() {
  const header = document.querySelector('.site-header');
  if (!header) return;
  const onScroll = () => header.classList.toggle('scrolled', window.scrollY > 8);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

document.addEventListener('DOMContentLoaded', () => {
  renderHeader();
  renderFooter();
  initScrollReveal();
  initHeaderScrollShadow();
});
