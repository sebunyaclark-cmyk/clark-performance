let CURRENT_TAB = 'programs';

async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  if (res.status === 401) {
    window.location.href = '/admin/login.html';
    throw new Error('Not logged in');
  }
  return res;
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result); // data:...;base64,....
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function uploadFile(file, kind) {
  const dataUrl = await fileToBase64(file);
  const res = await api('/api/admin/upload', {
    method: 'POST',
    body: JSON.stringify({ filename: file.name, dataUrl, kind }),
  });
  if (!res.ok) throw new Error('Upload failed');
  const data = await res.json();
  return data.path;
}

/* ---------- Programs ---------- */
async function renderPrograms() {
  const main = document.getElementById('main');
  main.innerHTML = '<p>Loading programs...</p>';
  const res = await api('/api/admin/programs');
  const programs = await res.json();
  main.innerHTML = `
    <h2 style="margin-bottom:20px;">Programs</h2>
    <div id="programList"></div>
  `;
  const list = document.getElementById('programList');
  list.innerHTML = programs.map(p => programEditCardHTML(p)).join('');
  programs.forEach(p => wireProgramCard(p));
}

function programEditCardHTML(p) {
  return `
    <div class="admin-card" id="prog-${p.id}">
      <div style="display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap;">
        <img class="thumb-preview" id="prog-thumb-${p.id}" src="${p.imagePath}" alt="" />
        <div style="flex:1;min-width:260px;">
          <h3 style="margin-bottom:6px;">${p.title}</h3>
          <p class="form-note" style="margin-bottom:10px;">${p.category === 'sport' ? p.sport + ' · ' + (p.season === 'in-season' ? 'In-Season' : 'Off-Season') : p.category}</p>

          <div class="form-field">
            <label>Short description (shown on the card)</label>
            <textarea id="short-${p.id}" style="min-height:60px;">${p.shortDescription}</textarea>
          </div>
          <div class="form-field">
            <label>Full description (shown on the program page)</label>
            <textarea id="desc-${p.id}">${p.description}</textarea>
          </div>
          <div class="form-field">
            <label>Price (NOK)</label>
            <input type="number" id="price-${p.id}" value="${p.priceNok}" />
          </div>
          <div class="form-field">
            <label>Replace image</label>
            <input type="file" accept="image/*" id="img-${p.id}" />
          </div>
          <div class="form-field">
            <label>Upload / replace PDF (${p.pdfPath ? 'PDF uploaded' : 'no PDF yet'})</label>
            <input type="file" accept="application/pdf" id="pdf-${p.id}" />
          </div>
          <label style="display:flex;align-items:center;gap:8px;margin-bottom:14px;">
            <input type="checkbox" id="pub-${p.id}" ${p.published ? 'checked' : ''} /> Published (visible on the site)
          </label>
          <div class="admin-row-actions">
            <button class="btn btn-primary" style="padding:10px 18px;" id="save-${p.id}">Save</button>
            <button class="btn btn-outline-dark" style="padding:10px 18px;" id="del-${p.id}">Delete</button>
            <span id="status-${p.id}" class="form-note"></span>
          </div>
        </div>
      </div>
    </div>
  `;
}

function wireProgramCard(p) {
  document.getElementById(`save-${p.id}`).addEventListener('click', async () => {
    const statusEl = document.getElementById(`status-${p.id}`);
    statusEl.textContent = 'Saving...';
    try {
      const patch = {
        shortDescription: document.getElementById(`short-${p.id}`).value,
        description: document.getElementById(`desc-${p.id}`).value,
        priceNok: Number(document.getElementById(`price-${p.id}`).value) || p.priceNok,
        published: document.getElementById(`pub-${p.id}`).checked,
      };
      const imgFile = document.getElementById(`img-${p.id}`).files[0];
      if (imgFile) {
        patch.imagePath = await uploadFile(imgFile, 'image');
        document.getElementById(`prog-thumb-${p.id}`).src = patch.imagePath;
      }
      const pdfFile = document.getElementById(`pdf-${p.id}`).files[0];
      if (pdfFile) {
        patch.pdfPath = await uploadFile(pdfFile, 'pdf');
      }
      const res = await api(`/api/admin/programs/${p.id}`, { method: 'PUT', body: JSON.stringify(patch) });
      if (!res.ok) throw new Error('Save failed');
      statusEl.textContent = 'Saved ✓';
      setTimeout(() => statusEl.textContent = '', 2000);
    } catch (e) {
      statusEl.textContent = e.message;
    }
  });
  document.getElementById(`del-${p.id}`).addEventListener('click', async () => {
    if (!confirm(`Delete "${p.title}"? This can't be undone.`)) return;
    await api(`/api/admin/programs/${p.id}`, { method: 'DELETE' });
    renderPrograms();
  });
}

/* ---------- Athletes ---------- */
function mediaFieldsHTML(prefix) {
  return `
    <div class="form-field"><label>Image</label><input type="file" accept="image/*" id="${prefix}Img" /></div>
    <div class="form-field">
      <label>Video – link (YouTube/Vimeo/Instagram, optional)</label>
      <input type="url" id="${prefix}VideoUrl" placeholder="https://youtube.com/watch?v=..." />
    </div>
    <div class="form-field">
      <label>Video – or upload a file (mp4/mov/webm, optional, up to ~250MB)</label>
      <input type="file" accept="video/*" id="${prefix}VideoFile" />
    </div>
    <p class="form-note">If a video is added (link or file) it's shown instead of the image on the card. The image is still used as a thumbnail/preview here in the panel.</p>
  `;
}

async function renderAthletes() {
  const main = document.getElementById('main');
  main.innerHTML = '<p>Loading...</p>';
  const res = await api('/api/admin/athletes');
  const athletes = await res.json();
  main.innerHTML = `
    <h2 style="margin-bottom:20px;">Athletes (images and video for marketing)</h2>
    <div class="admin-card">
      <h3>Add a new athlete</h3>
      <div class="form-field"><label>Name</label><input id="newAthName" /></div>
      <div class="form-field"><label>Sport</label><input id="newAthSport" /></div>
      <div class="form-field"><label>Quote</label><textarea id="newAthQuote"></textarea></div>
      ${mediaFieldsHTML('new')}
      <button class="btn btn-primary" id="addAthBtn">Add</button>
      <span id="addAthStatus" class="form-note"></span>
    </div>
    <div id="athleteList"></div>
  `;
  const list = document.getElementById('athleteList');
  list.innerHTML = athletes.map(a => `
    <div class="admin-card" id="ath-${a.id}">
      <div style="display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap;">
        <img class="thumb-preview" id="ath-thumb-${a.id}" src="${a.imagePath}" alt="" />
        <div style="flex:1;min-width:220px;">
          <h3>${a.name}</h3>
          <p class="form-note">${a.sport}${a.videoPath || a.videoUrl ? ' · video added' : ''}</p>
          <p>${a.quote}</p>
          <div class="admin-row-actions">
            <button class="btn btn-outline-dark" style="padding:8px 14px;" data-edit="${a.id}">Edit</button>
            <button class="btn btn-outline-dark" style="padding:8px 14px;" data-del="${a.id}">Delete</button>
          </div>
        </div>
      </div>
      <div id="ath-edit-${a.id}" style="display:none;margin-top:16px;border-top:1px solid #E7E8EA;padding-top:16px;">
        <div class="form-field"><label>Name</label><input id="edit${a.id}Name" value="${a.name}" /></div>
        <div class="form-field"><label>Sport</label><input id="edit${a.id}Sport" value="${a.sport}" /></div>
        <div class="form-field"><label>Quote</label><textarea id="edit${a.id}Quote">${a.quote}</textarea></div>
        ${mediaFieldsHTML('edit' + a.id)}
        <button class="btn btn-primary" style="padding:10px 18px;" id="edit${a.id}SaveBtn">Save changes</button>
        <span id="edit${a.id}Status" class="form-note"></span>
      </div>
    </div>
  `).join('') || '<p>No athletes added yet.</p>';

  list.querySelectorAll('[data-del]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this athlete?')) return;
      await api(`/api/admin/athletes/${btn.dataset.del}`, { method: 'DELETE' });
      renderAthletes();
    });
  });
  list.querySelectorAll('[data-edit]').forEach(btn => {
    btn.addEventListener('click', () => {
      const panel = document.getElementById(`ath-edit-${btn.dataset.edit}`);
      panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    });
  });

  athletes.forEach(a => {
    const saveBtn = document.getElementById(`edit${a.id}SaveBtn`);
    if (!saveBtn) return;
    saveBtn.addEventListener('click', async () => {
      const prefix = `edit${a.id}`;
      const status = document.getElementById(`${prefix}Status`);
      status.textContent = 'Saving...';
      try {
        const patch = {
          name: document.getElementById(`${prefix}Name`).value,
          sport: document.getElementById(`${prefix}Sport`).value,
          quote: document.getElementById(`${prefix}Quote`).value,
        };
        const imgFile = document.getElementById(`${prefix}Img`).files[0];
        if (imgFile) {
          patch.imagePath = await uploadFile(imgFile, 'image');
          document.getElementById(`ath-thumb-${a.id}`).src = patch.imagePath;
        }
        const videoUrl = document.getElementById(`${prefix}VideoUrl`).value;
        if (videoUrl) { patch.videoUrl = videoUrl; patch.videoPath = ''; }
        const videoFile = document.getElementById(`${prefix}VideoFile`).files[0];
        if (videoFile) {
          status.textContent = 'Uploading video (this can take a moment)...';
          patch.videoPath = await uploadFile(videoFile, 'video');
          patch.videoUrl = '';
        }
        const res = await api(`/api/admin/athletes/${a.id}`, { method: 'PUT', body: JSON.stringify(patch) });
        if (!res.ok) throw new Error('Save failed');
        status.textContent = 'Saved ✓';
        setTimeout(() => renderAthletes(), 800);
      } catch (e) {
        status.textContent = e.message;
      }
    });
  });

  document.getElementById('addAthBtn').addEventListener('click', async () => {
    const status = document.getElementById('addAthStatus');
    status.textContent = 'Saving...';
    try {
      const name = document.getElementById('newAthName').value;
      const sport = document.getElementById('newAthSport').value;
      const quote = document.getElementById('newAthQuote').value;
      const file = document.getElementById('newImg').files[0];
      let imagePath = '/img/placeholder-athlete.svg';
      if (file) imagePath = await uploadFile(file, 'image');
      let videoUrl = document.getElementById('newVideoUrl').value || '';
      let videoPath = '';
      const videoFile = document.getElementById('newVideoFile').files[0];
      if (videoFile) {
        status.textContent = 'Uploading video (this can take a moment)...';
        videoPath = await uploadFile(videoFile, 'video');
        videoUrl = '';
      }
      const res = await api('/api/admin/athletes', {
        method: 'POST',
        body: JSON.stringify({ name, sport, quote, imagePath, videoUrl, videoPath }),
      });
      if (!res.ok) throw new Error('Could not add athlete');
      renderAthletes();
    } catch (e) {
      status.textContent = e.message;
    }
  });
}

/* ---------- About ---------- */
function aboutSectionCardHTML(s, idx) {
  return `
    <div class="admin-card" id="about-sec-${idx}">
      <h3>Section ${idx + 1}</h3>
      <img class="thumb-preview" id="secThumb${idx}" src="${s.imagePath || '/img/placeholder-athlete.svg'}" style="margin-bottom:14px;" />
      <div class="form-field"><label>Title</label><input id="secTitle${idx}" value="${s.title || ''}" /></div>
      <div class="form-field"><label>Description (optional)</label><textarea id="secText${idx}" style="min-height:60px;">${s.text || ''}</textarea></div>
      <div class="form-field"><label>Image</label><input type="file" accept="image/*" id="secImg${idx}" /></div>
      <div class="form-field"><label>Video – link (YouTube/Vimeo, optional)</label><input type="url" id="secVideoUrl${idx}" value="${s.videoUrl || ''}" placeholder="https://youtube.com/watch?v=..." /></div>
      <div class="form-field"><label>Video – or upload a file (optional)</label><input type="file" accept="video/*" id="secVideoFile${idx}" /></div>
      <p class="form-note">If a video is added (link or file) it's shown instead of the image on the About page.</p>
    </div>
  `;
}

async function renderAbout() {
  const main = document.getElementById('main');
  main.innerHTML = '<p>Loading...</p>';
  const res = await api('/api/admin/about');
  const about = await res.json();
  const sections = about.sections && about.sections.length ? about.sections : new Array(6).fill({});
  main.innerHTML = `
    <h2 style="margin-bottom:20px;">About Me</h2>
    <div class="admin-card">
      <img class="thumb-preview" id="aboutThumb" src="${about.imagePath}" style="width:140px;height:140px;margin-bottom:14px;" />
      <div class="form-field"><label>Image</label><input type="file" accept="image/*" id="aboutImg" /></div>
      <div class="form-field"><label>Heading</label><input id="aboutHeading" value="${about.heading}" /></div>
      <div class="form-field"><label>Short intro</label><textarea id="aboutIntro" style="min-height:60px;">${about.intro}</textarea></div>
      <div class="form-field"><label>Body text</label><textarea id="aboutBody">${about.body}</textarea></div>
    </div>

    <h2 style="margin:28px 0 16px;">Background &amp; Experience (6 sections)</h2>
    <div id="aboutSectionList">
      ${sections.map((s, idx) => aboutSectionCardHTML(s, idx)).join('')}
    </div>

    <div class="admin-card">
      <button class="btn btn-primary" id="saveAboutBtn">Save All</button>
      <span id="aboutStatus" class="form-note"></span>
    </div>
  `;
  document.getElementById('saveAboutBtn').addEventListener('click', async () => {
    const status = document.getElementById('aboutStatus');
    status.textContent = 'Saving...';
    try {
      const patch = {
        heading: document.getElementById('aboutHeading').value,
        intro: document.getElementById('aboutIntro').value,
        body: document.getElementById('aboutBody').value,
      };
      const file = document.getElementById('aboutImg').files[0];
      if (file) {
        patch.imagePath = await uploadFile(file, 'image');
        document.getElementById('aboutThumb').src = patch.imagePath;
      }

      const newSections = [];
      for (let idx = 0; idx < sections.length; idx++) {
        const existing = sections[idx] || {};
        const section = {
          id: existing.id || `section-${idx}`,
          title: document.getElementById(`secTitle${idx}`).value,
          text: document.getElementById(`secText${idx}`).value,
          imagePath: existing.imagePath || '',
          videoPath: existing.videoPath || '',
          videoUrl: document.getElementById(`secVideoUrl${idx}`).value || '',
        };
        const imgFile = document.getElementById(`secImg${idx}`).files[0];
        if (imgFile) {
          section.imagePath = await uploadFile(imgFile, 'image');
        }
        if (section.videoUrl) section.videoPath = '';
        const videoFile = document.getElementById(`secVideoFile${idx}`).files[0];
        if (videoFile) {
          status.textContent = `Uploading video for section ${idx + 1} (this can take a moment)...`;
          section.videoPath = await uploadFile(videoFile, 'video');
          section.videoUrl = '';
        }
        newSections.push(section);
      }
      patch.sections = newSections;

      const res = await api('/api/admin/about', { method: 'PUT', body: JSON.stringify(patch) });
      if (!res.ok) throw new Error('Save failed');
      status.textContent = 'Saved ✓';
      setTimeout(() => renderAbout(), 900);
    } catch (e) {
      status.textContent = e.message;
    }
  });
}

/* ---------- Contact submissions (read-only) ---------- */
async function renderContact() {
  const main = document.getElementById('main');
  main.innerHTML = '<p>Loading...</p>';
  const res = await api('/api/admin/contact-submissions');
  const items = await res.json();
  main.innerHTML = `
    <h2 style="margin-bottom:20px;">Inquiries</h2>
    <table class="admin-table">
      <thead><tr><th>Date</th><th>Name</th><th>Email</th><th>Phone</th><th>Message</th></tr></thead>
      <tbody>
        ${items.slice().reverse().map(i => `
          <tr>
            <td>${new Date(i.receivedAt).toLocaleString('en-US')}</td>
            <td>${i.name}</td>
            <td>${i.email}</td>
            <td>${i.phone || ''}</td>
            <td>${i.message}</td>
          </tr>
        `).join('') || '<tr><td colspan="5">No inquiries yet.</td></tr>'}
      </tbody>
    </table>
  `;
}

/* ---------- Orders (read-only) ---------- */
async function renderOrders() {
  const main = document.getElementById('main');
  main.innerHTML = '<p>Loading...</p>';
  const res = await api('/api/admin/orders');
  const items = await res.json();
  main.innerHTML = `
    <h2 style="margin-bottom:20px;">Orders</h2>
    <table class="admin-table">
      <thead><tr><th>Date</th><th>Program</th><th>Email</th><th>Amount</th></tr></thead>
      <tbody>
        ${items.slice().reverse().map(i => `
          <tr>
            <td>${new Date(i.createdAt).toLocaleString('en-US')}</td>
            <td>${(i.items || []).map(it => it.programTitle).join(', ') || i.programTitle || ''}</td>
            <td>${i.customerEmail || ''}</td>
            <td>${i.amountNok || ''} NOK</td>
          </tr>
        `).join('') || '<tr><td colspan="4">No orders yet. Orders will show up here once payment (Stripe) is set up and a customer has purchased.</td></tr>'}
      </tbody>
    </table>
  `;
}

/* ---------- Settings ---------- */
async function renderSettings() {
  const main = document.getElementById('main');
  main.innerHTML = '<p>Loading...</p>';
  const res = await api('/api/admin/settings');
  const s = await res.json();
  main.innerHTML = `
    <h2 style="margin-bottom:20px;">Settings</h2>
    <div class="admin-card">
      <div class="form-field"><label>Business name</label><input id="setName" value="${s.siteName}" /></div>
      <div class="form-field"><label>Tagline</label><input id="setTagline" value="${s.tagline || ''}" /></div>
      <div class="form-field"><label>Contact email</label><input id="setEmail" value="${s.contactEmail || ''}" /></div>
      <div class="form-field"><label>Instagram link</label><input id="setInsta" value="${s.instagram || ''}" placeholder="https://www.instagram.com/yourhandle/" /></div>
      <div class="form-field"><label>TikTok link</label><input id="setTiktok" value="${s.tiktok || ''}" placeholder="https://www.tiktok.com/@yourhandle" /></div>
      <button class="btn btn-primary" id="saveSettingsBtn">Save</button>
      <span id="settingsStatus" class="form-note"></span>
    </div>
    <div class="admin-card">
      <h3>Homepage hero</h3>
      <p class="form-note" style="margin-top:-4px;">The big section at the very top of the homepage.</p>
      <div class="form-field"><label>Small label above the headline</label><input id="setHeroEyebrow" value="${s.heroEyebrow || ''}" /></div>
      <div class="form-field"><label>Headline</label><input id="setHeroHeadline" value="${s.heroHeadline || ''}" /></div>
      <div class="form-field"><label>Subtext</label><textarea id="setHeroSubtext" style="min-height:70px;">${s.heroSubtext || ''}</textarea></div>
      <div class="form-field">
        <label>Background video</label>
        <p class="form-note" style="margin:0 0 6px;">${s.heroVideoPath ? 'Currently using a custom uploaded video.' : 'Currently using the default video.'}</p>
        <input type="file" accept="video/mp4,video/webm,video/quicktime" id="setHeroVideo" />
        ${s.heroVideoPath ? '<label style="display:flex;align-items:center;gap:6px;margin-top:8px;font-weight:400;text-transform:none;letter-spacing:0;"><input type="checkbox" id="setHeroVideoReset" /> Remove custom video and use the default one again</label>' : ''}
      </div>
      <button class="btn btn-primary" id="saveHeroBtn">Save</button>
      <span id="heroStatus" class="form-note"></span>
    </div>
    <div class="admin-card">
      <h3>Payment &amp; integrations</h3>
      <p class="form-note">Stripe (payment) and MCP/AI design tools are connected via environment variables on the server, not here in the panel. See the README.md that shipped with the site for the exact steps when you're ready to add them.</p>
    </div>
  `;
  document.getElementById('saveSettingsBtn').addEventListener('click', async () => {
    const status = document.getElementById('settingsStatus');
    status.textContent = 'Saving...';
    const patch = {
      siteName: document.getElementById('setName').value,
      tagline: document.getElementById('setTagline').value,
      contactEmail: document.getElementById('setEmail').value,
      instagram: document.getElementById('setInsta').value,
      tiktok: document.getElementById('setTiktok').value,
    };
    const r = await api('/api/admin/settings', { method: 'PUT', body: JSON.stringify(patch) });
    status.textContent = r.ok ? 'Saved ✓' : 'Error saving';
    setTimeout(() => status.textContent = '', 2000);
  });
  document.getElementById('saveHeroBtn').addEventListener('click', async () => {
    const status = document.getElementById('heroStatus');
    status.textContent = 'Saving...';
    try {
      const patch = {
        heroEyebrow: document.getElementById('setHeroEyebrow').value,
        heroHeadline: document.getElementById('setHeroHeadline').value,
        heroSubtext: document.getElementById('setHeroSubtext').value,
      };
      const resetBox = document.getElementById('setHeroVideoReset');
      const file = document.getElementById('setHeroVideo').files[0];
      if (file) {
        patch.heroVideoPath = await uploadFile(file, 'video');
      } else if (resetBox && resetBox.checked) {
        patch.heroVideoPath = '';
      }
      const res = await api('/api/admin/settings', { method: 'PUT', body: JSON.stringify(patch) });
      if (!res.ok) throw new Error('Save failed');
      status.textContent = 'Saved ✓';
      setTimeout(() => renderSettings(), 900);
    } catch (e) {
      status.textContent = e.message;
    }
  });
}

const TABS = {
  programs: renderPrograms,
  athletes: renderAthletes,
  about: renderAbout,
  contact: renderContact,
  orders: renderOrders,
  settings: renderSettings,
};

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('#sidebar button').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#sidebar button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      TABS[btn.dataset.tab]();
    });
  });
  document.getElementById('logoutBtn').addEventListener('click', async () => {
    await api('/api/admin/logout', { method: 'POST' });
    window.location.href = '/admin/login.html';
  });
  renderPrograms();
});
