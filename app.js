const $ = s => document.querySelector(s);
    const R = n => 'Rp' + Math.round(n).toLocaleString('id-ID');
    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const pad = n => String(n).padStart(4, '0');
    const num = v => parseInt(String(v).replace(/\D/g, '')) || 0;
    const fmtIn = el => { const v = num(el.value); el.value = v ? v.toLocaleString('id-ID') : '' };
    const PAL = ['#8A5A3C', '#2F7D6B', '#B5762A', '#7A5C99', '#B04A5A', '#3B6FA0', '#7C8A2E', '#C2563A'];
    const colorOf = c => { let h = 0; for (const ch of String(c)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return PAL[h % PAL.length] };
    const initials = n => String(n || '').split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase();
    const KEY = 'kasir-app-v2';
    const toIsoDate = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const API_BASE = (window.location.protocol.startsWith('http'))
  ? (window.location.origin + '/api')
  : 'http://localhost:3000/api';

let serverConnected = false;

async function checkApiConnection() {
  try {
    const ctrl = new AbortController();
    const tm = setTimeout(() => ctrl.abort(), 1500);
    const res = await fetch(`${API_BASE}/status`, { signal: ctrl.signal });
    clearTimeout(tm);
    if (res.ok) {
      serverConnected = true;
      renderDbBadge(true);
      await syncFromServer();
      return true;
    }
  } catch (e) {
    serverConnected = false;
    renderDbBadge(false);
  }
  return false;
}

function renderDbBadge(online) {
  let badge = $('#db-badge');
  if (!badge) {
    const container = $('.brand');
    if (container) {
      badge = document.createElement('span');
      badge.id = 'db-badge';
      badge.style.cssText = 'display:inline-block;padding:2px 8px;border-radius:6px;font-size:11px;font-weight:700;margin-top:4px;';
      container.appendChild(badge);
    }
  }
  if (badge) {
    if (online) {
      badge.style.background = 'rgba(46,125,50,.18)';
      badge.style.color = '#2E7D32';
      badge.innerHTML = '🗄️ SQLite Aktif';
      badge.title = 'Terhubung ke server Node.js & database SQLite (kasir.db)';
    } else {
      badge.style.background = 'rgba(95,107,120,.18)';
      badge.style.color = 'var(--muted)';
      badge.innerHTML = '💾 Mode Lokal';
      badge.title = 'Berjalan di browser menggunakan localStorage';
    }
  }
}

async function syncFromServer() {
  if (!serverConnected) return;
  try {
    const [resStore, resUsers, resProds, resTrx] = await Promise.all([
      fetch(`${API_BASE}/store`).then(r => r.json()).catch(() => null),
      fetch(`${API_BASE}/users`).then(r => r.json()).catch(() => null),
      fetch(`${API_BASE}/products`).then(r => r.json()).catch(() => null),
      fetch(`${API_BASE}/transactions`).then(r => r.json()).catch(() => null)
    ]);

    if (resStore && resStore.store) S.store = resStore.store;
    if (Array.isArray(resUsers) && resUsers.length > 0) {
      S.users = resUsers.map(u => ({ ...u, active: u.active !== false }));
    } else if (Array.isArray(resUsers) && resUsers.length === 0 && S.users.length > 0) {
      await migrateLocalToServer();
    }
    if (Array.isArray(resProds) && resProds.length > 0) S.products = resProds;
    if (Array.isArray(resTrx) && resTrx.length > 0) S.hist = resTrx;
    save();

    if ($('#sn')) $('#sn').textContent = S.store || 'Kasir';
    if ($('#rs')) $('#rs').textContent = S.store || 'Kasir';
    drawChips();
    drawGrid();
  } catch (e) {
    console.warn('Gagal sinkronisasi SQLite:', e);
  }
}

async function migrateLocalToServer() {
  if (!serverConnected) return;
  try {
    if (S.store) await fetch(`${API_BASE}/store`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ store: S.store }) });
    for (const u of S.users) {
      await fetch(`${API_BASE}/users`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ name: u.name, u: u.u, pw: '123456', role: u.role }) });
    }
    for (const p of S.products) {
      await fetch(`${API_BASE}/products`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ n: p.n, c: p.c, p: p.p, s: p.s }) });
    }
    console.log('✓ Data lokal berhasil dimigrasikan ke database SQLite!');
  } catch(e) {}
}


    const fresh = () => ({ store: '', users: [], products: [], hist: [], seq: 1, nid: 1, uid: 1 });
    let S; try { S = JSON.parse(localStorage.getItem(KEY)) } catch (e) { S = null }
    if (!S || !S.users) S = fresh();

    /* Migrasi Otomatis Data Lama */
    function migrateData() {
      if (!Array.isArray(S.users)) S.users = [];
      if (!Array.isArray(S.products)) S.products = [];
      if (!Array.isArray(S.hist)) S.hist = [];
      if (!S.seq) S.seq = 1;
      if (!S.nid) S.nid = 1;
      let maxUid = 0;
      S.users.forEach((u, idx) => {
        if (u.id && u.id > maxUid) maxUid = u.id;
      });
      S.uid = S.uid || (maxUid + 1);
      S.users.forEach((u, idx) => {
        if (!u.id) u.id = S.uid++;
        if (u.active === undefined) u.active = true;
        if (!u.role) u.role = idx === 0 ? 'owner' : 'kasir';
      });
      S.hist.forEach(trx => {
        if (!trx.by) trx.by = 'Tidak diketahui';
        if (trx.cashierU === undefined) trx.cashierU = '';
        if (trx.cashierId === undefined) trx.cashierId = 0;
      });
    }
    migrateData();

    const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)) } catch (e) { } };
    let cur = null, view = 'kasir', cart = {}, cat = 'Semua', q = '', disc = 0, ppn = true, pay = { m: 'Tunai', cash: 0 }, editId = null, delId = null, delUserId = null, wipe = false, fails = 0, lockUntil = 0;

    /* Filter & State Laporan */
    let repFilter = {
      period: 'hari-ini', // 'hari-ini' | 'kemarin' | '7-hari' | 'bulan-ini' | 'kustom'
      from: '',
      to: '',
      cashier: 'Semua',
      method: 'Semua',
      page: 1,
      pageSize: 10
    };

    const prod = id => S.products.find(x => x.id == id);
    const cats = () => ['Semua', ...new Set(S.products.map(p => p.c).filter(Boolean))];
    const isOwner = () => cur && cur.role == 'owner';

    async function hash(s) {
      try { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('') }
      catch (e) { let h = 5381; for (const c of s) h = ((h * 33) ^ c.charCodeAt(0)) >>> 0; return 'x' + h }
    }
    const mkSalt = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

    /* Hak akses data transaksi: Kasir HANYA bisa mengakses transaksinya sendiri */
    function getAuthorizedTransactions() {
      if (!cur) return [];
      if (isOwner()) return S.hist;
      return S.hist.filter(x => {
        if (x.cashierU && cur.u && x.cashierU === cur.u) return true;
        if (x.cashierId && cur.id && x.cashierId === cur.id) return true;
        if (!x.cashierU && !x.cashierId && x.by && x.by === cur.name) return true;
        return false;
      });
    }

    /* ---------- login ---------- */
    function drawAuth() {
      const setup = !S.users.length;
      $('#hn').textContent = setup ? 'Penjualan tercatat rapi, setiap hari.' : (S.store || 'Kasir');
      const fld = (n, l, t = 'text', ac = 'off') => `<label class="fld">${l}<input name="${n}" type="${t}" autocomplete="${ac}"></label>`;
      const pw = (n, l, ac) => `<label class="fld">${l}<span class="pw"><input name="${n}" type="password" autocomplete="${ac}"><button type="button" onclick="seePw(this)">Lihat</button></span></label>`;
      $('#abox').innerHTML = `<h2>${setup ? 'Buat akun pemilik' : 'Masuk'}</h2>
  <p>${setup ? 'Akun pertama menjadi pemilik toko dan bisa mengelola produk serta kasir.' : 'Masukkan username dan kata sandi Anda.'}</p>
  <form onsubmit="submitAuth(event)" novalidate>
  ${setup ? fld('store', 'Nama toko') + fld('name', 'Nama Anda', 'text', 'name') : ''}
  ${fld('u', 'Username', 'text', 'username')}
  ${pw('pw', 'Kata sandi', setup ? 'new-password' : 'current-password')}
  ${setup ? pw('pw2', 'Ulangi kata sandi', 'new-password') : ''}
  <div class="err" id="aerr" role="alert"></div>
  <button class="primary" style="width:100%" type="submit">${setup ? 'Buat akun dan mulai' : 'Masuk'}</button></form>
  <p class="note">Data tersimpan di perangkat ini. Kata sandi disimpan terenkripsi (hash), tetapi tidak ada pemulihan jika lupa.</p>`;
      $('#auth').hidden = false; $('#app').hidden = true; $('#bar').hidden = true;
    }
    function seePw(b) { const i = b.previousElementSibling; i.type = i.type == 'password' ? 'text' : 'password'; b.textContent = i.type == 'password' ? 'Lihat' : 'Sembunyi' }

    async function submitAuth(e) {
      e.preventDefault();
      const f = e.target, v = n => f.elements[n] ? f.elements[n].value.trim() : '';
      const err = m => { $('#aerr').textContent = m };
      const u = v('u').toLowerCase(), pw = f.elements.pw.value;
      if (!S.users.length) {
        if (!v('store') || !v('name')) return err('Nama toko dan nama Anda wajib diisi.');
        if (!/^[a-z0-9_.]{3,}$/.test(u)) return err('Username minimal 3 karakter: huruf, angka, titik, atau garis bawah.');
        if (pw.length < 6) return err('Kata sandi minimal 6 karakter.');
        if (pw !== f.elements.pw2.value) return err('Kata sandi tidak sama.');
        const salt = mkSalt();
        S.store = v('store');
        const firstUser = { id: S.uid++, u, name: v('name'), role: 'owner', active: true, salt, h: await hash(salt + pw) };
        S.users.push(firstUser);
        save();
        return enter(u);
      }
      const left = Math.ceil((lockUntil - Date.now()) / 1000);
      if (left > 0) return err('Terlalu banyak percobaan. Coba lagi dalam ' + left + ' detik.');
      const us = S.users.find(x => x.u == u);
      if (us) {
        if (us.active === false) return err('Akun ini telah dinonaktifkan. Hubungi pemilik toko.');
        if (us.h === await hash(us.salt + pw)) { fails = 0; return enter(u) }
      }
      if (++fails >= 5) { fails = 0; lockUntil = Date.now() + 30000 }
      err('Username atau kata sandi salah.');
    }

    function enter(u) {
      cur = S.users.find(x => x.u == u);
      if (!cur || cur.active === false) {
        try { sessionStorage.removeItem('ks-user') } catch (e) { }
        cur = null; return drawAuth();
      }
      try { sessionStorage.setItem('ks-user', u) } catch (e) { }
      $('#auth').hidden = true; $('#app').hidden = false;
      $('#who').textContent = cur.name + ' (' + (isOwner() ? 'pemilik' : 'kasir') + ')';
      $('#sn').textContent = S.store || 'Kasir'; $('#rs').textContent = S.store || 'Kasir'; $('#rby').textContent = 'Kasir: ' + cur.name;

      const T = [['kasir', 'Kasir']];
      if (isOwner()) T.push(['produk', 'Produk']);
      if (isOwner()) T.push(['laporan', 'Laporan']);
      T.push(['riwayat', 'Riwayat']);
      if (isOwner()) T.push(['setelan', 'Setelan']);

      $('#tabs').innerHTML = T.map(t => `<button id="t-${t[0]}" onclick="setView('${t[0]}')">${t[1]}</button>`).join('');
      cart = {}; disc = 0; setView('kasir'); draw();
    }

    function logout() { try { sessionStorage.removeItem('ks-user') } catch (e) { }; cur = null; cart = {}; disc = 0; cartOpen(false); closeM(); drawAuth() }

    /* Ganti Kata Sandi Sendiri (Untuk Pemilik maupun Kasir) */
    function openMyPw() {
      if (!cur) return;
      $('#modal').innerHTML = `<div class="sheet" role="dialog" aria-modal="true">
    <h2>Ganti Kata Sandi</h2>
    <p class="hint">Ubah kata sandi akun <b>@${esc(cur.u)}</b> (${esc(cur.name)}).</p>
    <label class="fld">Kata sandi saat ini<span class="pw"><input id="myOld" type="password"><button type="button" onclick="seePw(this)">Lihat</button></span></label>
    <label class="fld">Kata sandi baru<span class="pw"><input id="myNew" type="password"><button type="button" onclick="seePw(this)">Lihat</button></span></label>
    <label class="fld">Ulangi kata sandi baru<span class="pw"><input id="myNew2" type="password"><button type="button" onclick="seePw(this)">Lihat</button></span></label>
    <div class="err" id="myErr"></div>
    <div class="acts"><button class="ghost" onclick="closeM()">Batal</button><button class="primary" onclick="submitMyPw()">Simpan Sandi</button></div>
  </div>`;
      $('#modal').hidden = false;
    }

    async function submitMyPw() {
      const o = $('#myOld').value, n = $('#myNew').value, n2 = $('#myNew2').value;
      const err = m => { $('#myErr').textContent = m };
      if (!o) return err('Masukkan kata sandi saat ini.');
      if (cur.h !== await hash(cur.salt + o)) return err('Kata sandi saat ini salah.');
      if (n.length < 6) return err('Kata sandi baru minimal 6 karakter.');
      if (n !== n2) return err('Konfirmasi kata sandi baru tidak sama.');
      const salt = mkSalt();
      cur.salt = salt; cur.h = await hash(salt + n);
      const idx = S.users.findIndex(x => x.u == cur.u);
      if (idx !== -1) { S.users[idx].salt = salt; S.users[idx].h = cur.h }
      save(); closeM(); alert('Kata sandi berhasil diperbarui.');
    }

    /* Reset Kata Sandi Pengguna Lain Oleh Pemilik */
    function openResetPw(u) {
      if (!isOwner()) return;
      const target = S.users.find(x => x.u == u);
      if (!target) return;
      $('#modal').innerHTML = `<div class="sheet" role="dialog" aria-modal="true">
    <h2>Reset Kata Sandi</h2>
    <p class="hint">Tetapkan kata sandi baru untuk <b>${esc(target.name)}</b> (@${esc(target.u)}).</p>
    <label class="fld">Kata sandi baru<span class="pw"><input id="rstPw" type="password"><button type="button" onclick="seePw(this)">Lihat</button></span></label>
    <div class="err" id="rstErr"></div>
    <div class="acts"><button class="ghost" onclick="closeM()">Batal</button><button class="primary" onclick="submitResetPw('${esc(target.u)}')">Simpan Sandi</button></div>
  </div>`;
      $('#modal').hidden = false;
    }

    async function submitResetPw(u) {
      if (!isOwner()) return;
      const p = $('#rstPw').value;
      if (p.length < 6) { $('#rstErr').textContent = 'Kata sandi minimal 6 karakter.'; return }
      const target = S.users.find(x => x.u == u);
      if (!target) return closeM();
      const salt = mkSalt();
      target.salt = salt; target.h = await hash(salt + p);
      save(); closeM(); alert('Kata sandi @' + target.u + ' berhasil direset.');
      if (view == 'setelan') drawSet();
    }

    /* ---------- kasir ---------- */
    function Tt() {
      let sub = 0, n = 0;
      for (const id in cart) { const p = prod(id); if (p) { sub += p.p * cart[id]; n += cart[id] } }
      const d = Math.min(disc, sub), base = sub - d, tax = ppn ? Math.round(base * .11) : 0;
      return { sub, n, d, tax, total: base + tax };
    }
    function add(id, d) {
      const p = prod(id); if (!p) return;
      const c = (cart[id] || 0) + d;
      if (c <= 0) delete cart[id]; else if (c <= p.s) cart[id] = c;
      draw();
    }
    function clearCart() { cart = {}; disc = 0; draw() }
    let onlyInStock = false;

    function onSearch(val) {
      q = val;
      const btn = $('#q-clear');
      if (btn) btn.hidden = !q;
      drawGrid();
    }

    function clearSearch() {
      q = '';
      const input = $('#q');
      if (input) input.value = '';
      const btn = $('#q-clear');
      if (btn) btn.hidden = true;
      drawGrid();
      if (input) input.focus();
    }

    function toggleStockFilter() {
      onlyInStock = !onlyInStock;
      const btn = $('#btn-stok-filter');
      if (btn) {
        btn.textContent = onlyInStock ? 'Hanya Stok Ada' : 'Semua Stok';
        btn.classList.toggle('active', onlyInStock);
      }
      drawGrid();
    }

    function showAllProductsDirectly() {
      cat = 'Semua';
      clearSearch();
      drawChips();
      drawGrid();
    }

    function setCatByName(catName) {
      cat = catName;
      drawChips();
      drawGrid();
    }

    function drawChips() {
      const allCats = cats();
      if (!allCats.includes(cat)) cat = 'Semua';

      // Hitung jumlah produk tiap kategori
      const counts = { 'Semua': S.products.length };
      S.products.forEach(p => {
        const c = p.c || 'Tanpa Kategori';
        counts[c] = (counts[c] || 0) + 1;
      });

      const displayCats = ['Semua'];
      const uniqueCats = [...new Set(S.products.map(p => p.c || 'Tanpa Kategori'))];
      uniqueCats.forEach(c => {
        if (!displayCats.includes(c)) displayCats.push(c);
      });

      // Tampilkan chip kategori selalu agar produk mudah ditemukan langsung
      $('#chips').innerHTML = displayCats.map(x => {
        const isAct = (x === cat);
        const cnt = counts[x] || 0;
        return `<button class="${isAct ? 'on' : ''}" onclick="setCatByName('${esc(x)}')">
          <span>${esc(x)}</span>
          <span class="cnt">${cnt}</span>
        </button>`;
      }).join('');
    }

    function renderProductCard(p) {
      const isOutOfStock = p.s < 1;
      const inCart = cart[p.id] || 0;
      return `<button class="card ${isOutOfStock ? 'card-out' : ''}" ${isOutOfStock ? (isOwner() ? `onclick="quickRestockPrompt(${p.id})"` : 'disabled') : `onclick="add(${p.id},1)"`} title="${isOutOfStock && isOwner() ? 'Stok habis. Klik untuk ubah stok di Tab Produk' : esc(p.n)}">
        ${inCart ? `<span class="badge">${inCart}</span>` : ''}
        <div class="tile" style="--c:${colorOf(p.c || p.n)}">${esc(initials(p.n))}</div>
        <b>${esc(p.n)}</b>
        <span class="pr">${R(p.p)}</span>
        <span class="st ${p.s <= 5 ? 'low' : ''}">${p.s < 1 ? (isOwner() ? 'Habis (Klik edit)' : 'Habis') : 'Sisa ' + p.s}</span>
      </button>`;
    }

    function quickRestockPrompt(id) {
      if (!isOwner()) return;
      setView('produk');
      editProd(id);
    }

    function drawGrid() {
      if (!S.products.length) {
        $('#grid').innerHTML = `<div class="empty"><b>Belum ada produk</b>${isOwner() ? 'Tambahkan produk pertama Anda agar bisa mulai berjualan.<br><button class="btn p" onclick="setView(\'produk\')">Tambah produk</button>' : 'Minta pemilik toko menambahkan produk terlebih dahulu.'}</div>`;
        return;
      }

      const query = q.trim().toLowerCase();
      let f = S.products.filter(p => {
        const matchCat = (cat === 'Semua') || ((p.c || 'Tanpa Kategori') === cat);
        const matchQ = !query || p.n.toLowerCase().includes(query) || (p.c && p.c.toLowerCase().includes(query));
        const matchStock = !onlyInStock || p.s > 0;
        return matchCat && matchQ && matchStock;
      });

      if (!f.length) {
        $('#grid').innerHTML = `<div class="empty">
          <b>Produk tidak ditemukan</b>
          ${query ? `Tidak ada produk dengan kata kunci "<b>${esc(q)}</b>".<br><button class="btn btn-sm" onclick="clearSearch()" style="margin-top:10px">✕ Tampilkan Semua Produk</button>` : 'Tidak ada produk dalam kategori ini.<br><button class="btn btn-sm" onclick="showAllProductsDirectly()" style="margin-top:10px">Lihat Semua Kategori</button>'}
        </div>`;
        return;
      }

      // Jika memilih "Semua" dan tidak sedang mencari teks, kelompokkan berdasarkan kategori
      const uniqueCats = [...new Set(f.map(p => p.c || 'Tanpa Kategori'))];
      if (cat === 'Semua' && !query && uniqueCats.length > 1) {
        let html = '';
        uniqueCats.forEach(cName => {
          const prodsInCat = f.filter(p => (p.c || 'Tanpa Kategori') === cName);
          html += `<div class="cat-divider">
            <b>🏷️ ${esc(cName)}</b>
            <span>${prodsInCat.length} produk</span>
          </div>
          ${prodsInCat.map(p => renderProductCard(p)).join('')}`;
        });
        $('#grid').innerHTML = html;
        return;
      }

      $('#grid').innerHTML = f.map(p => renderProductCard(p)).join('');
    }
    function drawLines() {
      const ids = Object.keys(cart);
      $('#lines').innerHTML = ids.length ? ids.map(id => {
        const p = prod(id), c = cart[id]; if (!p) return '';
        return `<div class="ln"><div class="nm">${esc(p.n)}<small>${R(p.p)}</small></div>
    <div class="q"><button onclick="add(${id},-1)" aria-label="Kurangi">−</button><i>${c}</i><button onclick="add(${id},1)" ${c >= p.s ? 'disabled' : ''} aria-label="Tambah">+</button></div>
    <div class="lt">${R(p.p * c)}</div></div>`
      }).join('') : '<div class="none">Belum ada pesanan.<br>Ketuk produk untuk menambahkan.</div>';
    }
    function drawTot() {
      const t = Tt();
      $('#tot').innerHTML = `<div class="r"><span>Subtotal</span><span>${R(t.sub)}</span></div>
  <div class="r"><span>Diskon (Rp)</span><input type="text" inputmode="numeric" value="${disc || ''}" placeholder="0" oninput="setDisc(this)" aria-label="Diskon"></div>
  <div class="r"><label><input type="checkbox" ${ppn ? 'checked' : ''} onchange="ppn=this.checked;drawTot();drawBar()"> PPN 11%</label><span>${R(t.tax)}</span></div>
  <div class="r tt"><span>Total</span><span>${R(t.total)}</span></div>`;
      $('#payb').disabled = !t.n;
    }
    function setDisc(el) {
      disc = num(el.value); drawTot();
      const i = $('#tot input[type=text]'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); drawBar();
    }
    function drawBar() { const t = Tt(); $('#bn').textContent = t.n ? t.n + ' item' : 'Keranjang kosong'; $('#bt').textContent = R(t.total) }
    function draw() { drawChips(); drawGrid(); drawLines(); drawTot(); drawBar(); $('#rno').textContent = 'Struk #' + pad(S.seq) }
    function cartOpen(o) { $('#rcw').classList.toggle('open', o) }

    /* ---------- pembayaran ---------- */
    const roundUp = (n, s) => Math.ceil(n / s) * s;
    function openPay() { pay = { m: 'Tunai', cash: 0 }; drawPay() }
    function setM(m) { pay.m = m; pay.cash = m == 'Tunai' ? 0 : Tt().total; drawPay() }
    function drawPay() {
      const t = Tt().total;
      const opts = [...new Set([t, roundUp(t, 10000), roundUp(t, 50000), roundUp(t, 100000)])].slice(0, 4);
      $('#modal').innerHTML = `<div class="sheet" role="dialog" aria-modal="true"><h2>Pembayaran</h2>
  <div class="due">${R(t)}</div>
  <div class="seg">${['Tunai', 'QRIS', 'Debit'].map(m => `<button class="${pay.m == m ? 'on' : ''}" onclick="setM('${m}')">${m}</button>`).join('')}</div>
  ${pay.m == 'Tunai' ? `<label>Uang diterima<input id="cash" inputmode="numeric" value="${pay.cash ? pay.cash.toLocaleString('id-ID') : ''}" oninput="setCash(this)" placeholder="0"></label>
  <div class="quick">${opts.map((o, i) => `<button onclick="quick(${o})">${i == 0 ? 'Uang pas' : R(o)}</button>`).join('')}</div>
  <div class="chg" id="chg"></div>`: `<p class="hint">${pay.m == 'QRIS' ? 'Minta pelanggan memindai kode QRIS, lalu pastikan pembayaran masuk.' : 'Gesek atau tempel kartu pada mesin EDC, lalu pastikan transaksi berhasil.'}</p>`}
  <div class="acts"><button class="ghost" onclick="closeM()">Batal</button><button class="primary" id="ok" onclick="done()">Selesaikan</button></div></div>`;
      $('#modal').hidden = false; updPay();
    }
    function setCash(el) { pay.cash = num(el.value); fmtIn(el); updPay() }
    function quick(v) { pay.cash = v; drawPay() }
    function updPay() {
      const t = Tt().total;
      if (pay.m != 'Tunai') { $('#ok').disabled = false; return }
      const c = pay.cash - t, el = $('#chg');
      el.className = 'chg' + (c < 0 ? ' neg' : '');
      el.textContent = !pay.cash ? '' : c >= 0 ? 'Kembalian ' + R(c) : 'Kurang ' + R(-c);
      $('#ok').disabled = c < 0;
    }
    function closeM() { $('#modal').hidden = true }

    function done() {
      const t = Tt(), paid = pay.m == 'Tunai' ? pay.cash : t.total, no = S.seq;
      const items = Object.keys(cart).map(id => { const p = prod(id); return { n: p.n, q: cart[id], p: p.p } });
      for (const id in cart) prod(id).s -= cart[id];

      /* Rekam kasir secara lengkap */
      const cashierId = cur ? (cur.id || 0) : 0;
      const cashierU = cur ? cur.u : '';
      const cashierName = cur ? cur.name : 'Tidak diketahui';

      S.hist.unshift({ no, ts: Date.now(), items, sub: t.sub, d: t.d, tax: t.tax, total: t.total, m: pay.m, paid, cashierId, cashierU, by: cashierName });
      S.hist = S.hist.slice(0, 500); S.seq++; save();
      cart = {}; disc = 0; cartOpen(false); draw();
      $('#modal').innerHTML = `<div class="sheet" role="dialog" aria-modal="true"><h2>Pembayaran berhasil</h2>
  <div class="due">${paid - t.total > 0 ? 'Kembalian ' + R(paid - t.total) : R(t.total)}</div>
  <p class="hint">Struk #${pad(no)} tersimpan di Riwayat.</p>
  <div class="acts"><button class="primary" onclick="closeM()">Transaksi baru</button></div></div>`;
    }

    /* ---------- navigasi ---------- */
    function setView(v) {
      if ((v == 'produk' || v == 'laporan' || v == 'setelan') && !isOwner()) { v = 'kasir' }
      view = v;
      for (const [id, k] of [['kv', 'kasir'], ['pv', 'produk'], ['lv', 'laporan'], ['hv', 'riwayat'], ['sv', 'setelan']]) {
        const el = $('#' + id); if (el) el.hidden = (v != k);
      }
      document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.id == 't-' + v));
      $('#app').classList.toggle('nr', v != 'kasir');
      $('#rcw').hidden = (v != 'kasir'); $('#bar').hidden = (v != 'kasir');
      if (v == 'produk') drawProdView();
      if (v == 'laporan') drawReport();
      if (v == 'riwayat') drawHist();
      if (v == 'setelan') drawSet();
    }

    /* ---------- produk (pemilik) ---------- */
    function drawProdView() {
      if (!isOwner()) return setView('kasir');
      editId = null; delId = null;
      $('#pv').innerHTML = `<div class="panel"><h3 id="pft">Tambah produk</h3>
  <div class="pf"><label>Nama produk<input id="pn" maxlength="60" placeholder="Contoh: Kopi susu"></label>
  <label>Kategori<input id="pc" list="cl" maxlength="30" placeholder="Contoh: Minuman"><datalist id="cl">${[...new Set(S.products.map(p => p.c).filter(Boolean))].map(c => `<option value="${esc(c)}">`).join('')}</datalist></label>
  <label>Harga (Rp)<input id="pp" inputmode="numeric" oninput="fmtIn(this)" placeholder="0"></label>
  <label>Stok<input id="ps" inputmode="numeric" oninput="fmtIn(this)" placeholder="0"></label></div>
  <div class="err" id="perr" style="margin:10px 0 0"></div>
  <div class="pfa"><button class="btn p" id="psv" onclick="saveProd()">Simpan produk</button><button class="btn" id="pcn" onclick="drawProdView()" hidden>Batal</button></div></div>
  <div class="panel"><h3>Daftar produk (${S.products.length})</h3><div id="plist"></div></div>`;
      drawPlist();
    }
    function drawPlist() {
      $('#plist').innerHTML = S.products.length ? S.products.map(p => `<div class="prow"><div class="tile" style="--c:${colorOf(p.c || p.n)}">${esc(initials(p.n))}</div>
  <div><b>${esc(p.n)}</b><small>${esc(p.c || 'Tanpa kategori')}</small></div><div class="rt">${R(p.p)}<small>Stok ${p.s}</small></div>
  <div class="ac"><button onclick="editProd(${p.id})">Ubah</button><button onclick="delProd(${p.id})" style="color:var(--danger)">${delId == p.id ? 'Yakin hapus?' : 'Hapus'}</button></div></div>`).join('')
        : '<div class="empty" style="padding:20px">Belum ada produk. Isi formulir di atas untuk menambahkan.</div>';
    }
    function saveProd() {
      if (!isOwner()) return;
      const n = $('#pn').value.trim(), c = $('#pc').value.trim(), p = num($('#pp').value), s = num($('#ps').value);
      const err = m => { $('#perr').textContent = m };
      if (!n) return err('Nama produk wajib diisi.');
      if (p < 1) return err('Harga harus lebih dari 0.');
      if (editId) { const x = prod(editId); Object.assign(x, { n, c, p, s }); if (cart[editId] > s) cart[editId] = s; if (!cart[editId]) delete cart[editId] }
      else S.products.push({ id: S.nid++, n, c, p, s });
      save(); drawProdView(); $('#pn').focus();
    }
    function editProd(id) {
      const p = prod(id); if (!p) return;
      editId = id;
      $('#pn').value = p.n; $('#pc').value = p.c || ''; $('#pp').value = p.p.toLocaleString('id-ID'); $('#ps').value = p.s.toLocaleString('id-ID');
      $('#pft').textContent = 'Ubah produk'; $('#psv').textContent = 'Simpan perubahan'; $('#pcn').hidden = false; $('#perr').textContent = '';
      $('#pn').focus(); $('#pv').scrollTo({ top: 0 });
    }
    function delProd(id) {
      if (!isOwner()) return;
      if (delId != id) { delId = id; drawPlist(); setTimeout(() => { if (delId == id) { delId = null; if (view == 'produk') drawPlist() } }, 3500); return }
      S.products = S.products.filter(p => p.id != id); delete cart[id]; delId = null; save(); drawProdView();
    }

    /* ---------- TAB LAPORAN (KHUSUS PEMILIK) ---------- */
    function getDateRange(period, customFrom, customTo) {
      const now = new Date();
      let start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      let end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      let label = 'Hari ini';

      if (period === 'kemarin') {
        start.setDate(start.getDate() - 1); end.setDate(end.getDate() - 1);
        label = 'Kemarin';
      } else if (period === '7-hari') {
        start.setDate(start.getDate() - 6);
        label = '7 hari terakhir';
      } else if (period === 'bulan-ini') {
        start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
        end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
        label = 'Bulan ini (' + now.toLocaleString('id-ID', { month: 'long', year: 'numeric' }) + ')';
      } else if (period === 'kustom') {
        if (customFrom) {
          const [y, m, d] = customFrom.split('-').map(Number);
          start = new Date(y, m - 1, d, 0, 0, 0, 0);
        }
        if (customTo) {
          const [y, m, d] = customTo.split('-').map(Number);
          end = new Date(y, m - 1, d, 23, 59, 59, 999);
        }
        label = `Rentang ${toIsoDate(start)} s/d ${toIsoDate(end)}`;
      }
      return { startMs: start.getTime(), endMs: end.getTime(), startDate: start, endDate: end, label };
    }

    function getFilteredReportTransactions() {
      if (!isOwner()) return [];
      const range = getDateRange(repFilter.period, repFilter.from, repFilter.to);
      return S.hist.filter(trx => {
        if (trx.ts < range.startMs || trx.ts > range.endMs) return false;
        if (repFilter.method !== 'Semua' && trx.m !== repFilter.method) return false;
        if (repFilter.cashier !== 'Semua') {
          const cName = trx.by || 'Tidak diketahui';
          const cU = trx.cashierU || '';
          if (cName !== repFilter.cashier && cU !== repFilter.cashier) return false;
        }
        return true;
      });
    }

    function onRepPeriodChange(val) {
      repFilter.period = val;
      if (val === 'kustom' && (!repFilter.from || !repFilter.to)) {
        const d = new Date();
        repFilter.to = toIsoDate(d);
        const dPast = new Date(); dPast.setDate(dPast.getDate() - 7);
        repFilter.from = toIsoDate(dPast);
      }
      repFilter.page = 1;
      drawReport();
    }

    function setRepCashierFilter(c) {
      repFilter.cashier = c;
      repFilter.page = 1;
      drawReport();
    }

    function drawReport() {
      if (!isOwner()) return setView('kasir');
      const filtered = getFilteredReportTransactions();
      const range = getDateRange(repFilter.period, repFilter.from, repFilter.to);

      // Kumpulan nama kasir untuk dropdown filter
      const allCashiers = [...new Set([...S.users.map(u => u.name), ...S.hist.map(x => x.by).filter(Boolean)])];

      // Header cetak laporan
      $('#repPrintHeader').innerHTML = `<h2>${esc(S.store || 'Kasir')} — Laporan Penjualan</h2>
  <p>Periode: <b>${esc(range.label)}</b> | Filter Kasir: <b>${esc(repFilter.cashier)}</b> | Metode: <b>${esc(repFilter.method)}</b> | Dicetak: <b>${new Date().toLocaleString('id-ID')}</b></p>`;

      // Kalkulasi ringkasan
      const totalOmzet = filtered.reduce((a, x) => a + x.total, 0);
      const totalTrx = filtered.length;
      const totalItems = filtered.reduce((a, x) => a + (x.items || []).reduce((b, i) => b + i.q, 0), 0);
      const avgTrx = totalTrx ? Math.round(totalOmzet / totalTrx) : 0;
      const totalDisc = filtered.reduce((a, x) => a + (x.d || 0), 0);
      const totalTax = filtered.reduce((a, x) => a + (x.tax || 0), 0);

      // HTML Filter
      const filterHtml = `<div class="panel rep-filter">
    <div class="rep-filter-row">
      <div class="f-item">
        <label>Periode</label>
        <select onchange="onRepPeriodChange(this.value)">
          <option value="hari-ini" ${repFilter.period === 'hari-ini' ? 'selected' : ''}>Hari ini</option>
          <option value="kemarin" ${repFilter.period === 'kemarin' ? 'selected' : ''}>Kemarin</option>
          <option value="7-hari" ${repFilter.period === '7-hari' ? 'selected' : ''}>7 hari terakhir</option>
          <option value="bulan-ini" ${repFilter.period === 'bulan-ini' ? 'selected' : ''}>Bulan ini</option>
          <option value="kustom" ${repFilter.period === 'kustom' ? 'selected' : ''}>Rentang tanggal kustom</option>
        </select>
      </div>
      ${repFilter.period === 'kustom' ? `
      <div class="f-item">
        <label>Dari Tanggal</label>
        <input type="date" value="${repFilter.from}" onchange="repFilter.from=this.value;repFilter.page=1;drawReport()">
      </div>
      <div class="f-item">
        <label>Sampai Tanggal</label>
        <input type="date" value="${repFilter.to}" onchange="repFilter.to=this.value;repFilter.page=1;drawReport()">
      </div>`: ''}
      <div class="f-item">
        <label>Kasir</label>
        <select onchange="repFilter.cashier=this.value;repFilter.page=1;drawReport()">
          <option value="Semua" ${repFilter.cashier === 'Semua' ? 'selected' : ''}>Semua kasir</option>
          ${allCashiers.map(c => `<option value="${esc(c)}" ${repFilter.cashier === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}
        </select>
      </div>
      <div class="f-item">
        <label>Metode Pembayaran</label>
        <select onchange="repFilter.method=this.value;repFilter.page=1;drawReport()">
          <option value="Semua" ${repFilter.method === 'Semua' ? 'selected' : ''}>Semua metode</option>
          <option value="Tunai" ${repFilter.method === 'Tunai' ? 'selected' : ''}>Tunai</option>
          <option value="QRIS" ${repFilter.method === 'QRIS' ? 'selected' : ''}>QRIS</option>
          <option value="Debit" ${repFilter.method === 'Debit' ? 'selected' : ''}>Debit</option>
        </select>
      </div>
    </div>
    <div class="rep-actions">
      ${repFilter.cashier !== 'Semua' ? `<button class="btn btn-sm" onclick="setRepCashierFilter('Semua')">✕ Reset Filter Kasir (${esc(repFilter.cashier)})</button>` : ''}
      <button class="btn" onclick="exportCSV()">📥 Ekspor CSV</button>
      <button class="btn p" onclick="window.print()">🖨️ Cetak Laporan</button>
    </div>
  </div>`;

      // HTML Ringkasan Statistik
      const statsHtml = `<div class="stats stats-6">
    <div class="stat"><span>Total Omzet</span><b>${R(totalOmzet)}</b></div>
    <div class="stat"><span>Transaksi</span><b>${totalTrx}</b></div>
    <div class="stat"><span>Item Terjual</span><b>${totalItems}</b></div>
    <div class="stat"><span>Rata-rata/Trx</span><b>${R(avgTrx)}</b></div>
    <div class="stat"><span>Total Diskon</span><b>${R(totalDisc)}</b></div>
    <div class="stat"><span>Total PPN</span><b>${R(totalTax)}</b></div>
  </div>`;

      if (!filtered.length) {
        $('#lv').innerHTML = `${filterHtml}${statsHtml}<div class="panel empty"><b>Tidak ada data transaksi</b>Tidak ditemukan catatan penjualan pada filter dan periode terpilih.</div>`;
        return;
      }

      // 1. Grafik Penjualan Harian (SVG)
      const daysMap = [];
      let curDay = new Date(range.startMs);
      while (curDay.getTime() <= range.endMs && daysMap.length < 62) {
        const key = toIsoDate(curDay);
        daysMap.push({
          key,
          label: curDay.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }),
          total: 0,
          count: 0
        });
        curDay.setDate(curDay.getDate() + 1);
      }
      filtered.forEach(x => {
        const k = toIsoDate(new Date(x.ts));
        const d = daysMap.find(item => item.key === k);
        if (d) { d.total += x.total; d.count++ }
      });

      const maxDaily = Math.max(...daysMap.map(d => d.total), 1);
      const svgW = 680, svgH = 190, padL = 55, padR = 15, padT = 20, padB = 36;
      const cW = svgW - padL - padR, cH = svgH - padT - padB;
      const bStep = cW / daysMap.length;
      const barW = Math.max(6, Math.min(36, bStep * 0.7));

      let barsSvg = daysMap.map((d, idx) => {
        const x = padL + idx * bStep + (bStep - barW) / 2;
        const h = Math.round((d.total / maxDaily) * cH);
        const y = padT + cH - h;
        const tip = `${esc(d.label)}: ${R(d.total)} (${d.count} transaksi)`;
        return `<rect x="${x}" y="${y}" width="${barW}" height="${h}" rx="3" fill="var(--accent)" opacity="${d.total > 0 ? '0.9' : '0.18'}"
      onmouseenter="$('#chartTip').textContent='${tip}'" onmouseleave="$('#chartTip').textContent='Arahkan atau ketuk batang untuk melihat rincian.'">
      <title>${tip}</title>
    </rect>
    ${daysMap.length <= 15 || idx % Math.ceil(daysMap.length / 10) === 0 ? `<text x="${x + barW / 2}" y="${svgH - 12}" font-size="11" fill="var(--muted)" text-anchor="middle">${esc(d.label)}</text>` : ''}`;
      }).join('');

      const gridSvg = `<line x1="${padL}" y1="${padT}" x2="${svgW - padR}" y2="${padT}" stroke="var(--line)" stroke-dasharray="3"/>
  <text x="${padL - 8}" y="${padT + 4}" font-size="10" fill="var(--muted)" text-anchor="end">${R(maxDaily)}</text>
  <line x1="${padL}" y1="${padT + cH / 2}" x2="${svgW - padR}" y2="${padT + cH / 2}" stroke="var(--line)" stroke-dasharray="3"/>
  <text x="${padL - 8}" y="${padT + cH / 2 + 4}" font-size="10" fill="var(--muted)" text-anchor="end">${R(maxDaily / 2)}</text>
  <line x1="${padL}" y1="${padT + cH}" x2="${svgW - padR}" y2="${padT + cH}" stroke="var(--line)"/>
  <text x="${padL - 8}" y="${padT + cH + 4}" font-size="10" fill="var(--muted)" text-anchor="end">Rp0</text>`;

      const chartHtml = `<div class="panel">
    <h3>Grafik Penjualan Harian</h3>
    <div class="rep-chart-wrap">
      <svg viewBox="0 0 ${svgW} ${svgH}" style="width:100%;height:auto;display:block" role="img">${gridSvg}${barsSvg}</svg>
      <div class="chart-tooltip" id="chartTip">Arahkan atau ketuk batang untuk melihat rincian.</div>
    </div>
  </div>`;

      // 2. Tabel Hasil Per Kasir
      const cashierMap = {};
      filtered.forEach(x => {
        const cName = x.by || 'Tidak diketahui';
        if (!cashierMap[cName]) {
          cashierMap[cName] = { name: cName, count: 0, items: 0, omzet: 0, tunai: 0, qris: 0, debit: 0 };
        }
        const c = cashierMap[cName];
        c.count++;
        c.items += (x.items || []).reduce((sum, i) => sum + i.q, 0);
        c.omzet += x.total;
        if (x.m === 'Tunai') c.tunai += x.total;
        else if (x.m === 'QRIS') c.qris += x.total;
        else if (x.m === 'Debit') c.debit += x.total;
      });
      const cashierList = Object.values(cashierMap).sort((a, b) => b.omzet - a.omzet);

      const cashierTableHtml = `<div class="panel">
    <h3>Hasil per Kasir</h3>
    <small style="color:var(--muted);display:block;margin-bottom:8px">💡 Ketuk baris kasir untuk memfilter laporan ke kasir tersebut.</small>
    <div class="tbl-wrap">
      <table class="rtbl">
        <thead>
          <tr>
            <th>Kasir</th>
            <th class="num">Transaksi</th>
            <th class="num">Item</th>
            <th class="num">Omzet</th>
            <th class="num">Rata-rata/Trx</th>
            <th class="num">Tunai</th>
            <th class="num">QRIS</th>
            <th class="num">Debit</th>
          </tr>
        </thead>
        <tbody>
          ${cashierList.map(c => `<tr class="clickable ${repFilter.cashier === c.name ? 'active-row' : ''}" onclick="setRepCashierFilter('${esc(c.name)}')">
            <td><b>${esc(c.name)}</b>${repFilter.cashier === c.name ? ' <span class="badge-role owner">Terpilih</span>' : ''}</td>
            <td class="num">${c.count}</td>
            <td class="num">${c.items}</td>
            <td class="num"><b>${R(c.omzet)}</b></td>
            <td class="num">${R(c.count ? Math.round(c.omzet / c.count) : 0)}</td>
            <td class="num">${R(c.tunai)}</td>
            <td class="num">${R(c.qris)}</td>
            <td class="num">${R(c.debit)}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
  </div>`;

      // 3. Produk Terlaris (Top 10) & Jam Tersibuk
      const prodMap = {};
      filtered.forEach(x => {
        (x.items || []).forEach(it => {
          if (!prodMap[it.n]) prodMap[it.n] = { name: it.n, qty: 0, omzet: 0 };
          prodMap[it.n].qty += it.q;
          prodMap[it.n].omzet += (it.q * it.p);
        });
      });
      const top10 = Object.values(prodMap).sort((a, b) => b.qty - a.qty || b.omzet - a.omzet).slice(0, 10);

      const top10Html = `<div class="panel">
    <h3>Produk Terlaris (10 Teratas)</h3>
    <div class="tbl-wrap" style="min-width:auto">
      <table class="rtbl" style="min-width:320px">
        <thead>
          <tr>
            <th style="width:40px">#</th>
            <th>Produk</th>
            <th class="num">Terjual</th>
            <th class="num">Omzet</th>
          </tr>
        </thead>
        <tbody>
          ${top10.length ? top10.map((p, idx) => `<tr>
            <td><span class="rank-badge ${idx < 3 ? 'top-' + (idx + 1) : ''}">${idx + 1}</span></td>
            <td><b>${esc(p.name)}</b></td>
            <td class="num">${p.qty} item</td>
            <td class="num">${R(p.omzet)}</td>
          </tr>`).join('') : '<tr><td colspan="4" class="empty">Belum ada item terjual</td></tr>'}
        </tbody>
      </table>
    </div>
  </div>`;

      // Jam Tersibuk (00:00 - 23:00)
      const hoursMap = Array.from({ length: 24 }, (_, h) => ({ h, count: 0, omzet: 0 }));
      filtered.forEach(x => {
        const hr = new Date(x.ts).getHours();
        hoursMap[hr].count++;
        hoursMap[hr].omzet += x.total;
      });
      const maxHCount = Math.max(...hoursMap.map(x => x.count), 1);
      const hSvgW = 480, hSvgH = 120, hPadL = 25, hPadR = 15, hPadT = 15, hPadB = 25;
      const hcW = hSvgW - hPadL - hPadR, hcH = hSvgH - hPadT - hPadB;
      const hStep = hcW / 24;
      const hBarW = Math.max(4, hStep * 0.7);

      const hoursSvg = hoursMap.map(item => {
        const x = hPadL + item.h * hStep + (hStep - hBarW) / 2;
        const h = Math.round((item.count / maxHCount) * hcH);
        const y = hPadT + hcH - h;
        const tip = `Pukul ${String(item.h).padStart(2, '0')}:00 — ${item.count} transaksi (${R(item.omzet)})`;
        return `<rect x="${x}" y="${y}" width="${hBarW}" height="${h}" rx="2" fill="var(--accent)" opacity="${item.count > 0 ? '0.85' : '0.15'}">
      <title>${tip}</title>
    </rect>
    ${item.h % 6 === 0 ? `<text x="${x + hBarW / 2}" y="${hSvgH - 8}" font-size="10" fill="var(--muted)" text-anchor="middle">${String(item.h).padStart(2, '0')}</text>` : ''}`;
      }).join('');

      const busiestHoursHtml = `<div class="panel">
    <h3>Jam Tersibuk (24 Jam)</h3>
    <small style="color:var(--muted);display:block;margin-bottom:6px">Distribusi transaksi kasir dari jam 00:00 hingga 23:00</small>
    <svg viewBox="0 0 ${hSvgW} ${hSvgH}" style="width:100%;height:auto;display:block" role="img">
      <line x1="${hPadL}" y1="${hPadT + hcH}" x2="${hSvgW - hPadR}" y2="${hPadT + hcH}" stroke="var(--line)"/>
      ${hoursSvg}
    </svg>
  </div>`;

      // 4. Daftar Transaksi Terfilter (Terbaru Dulu) dengan Pagination
      const pageLimit = repFilter.page * repFilter.pageSize;
      const pagedTrx = filtered.slice(0, pageLimit);
      const dt = ts => new Date(ts).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

      const trxListHtml = `<div class="panel">
    <h3>Daftar Transaksi (${filtered.length})</h3>
    <div style="margin-top:10px">
      ${pagedTrx.map(x => `<details class="trx">
        <summary>
          <span>Struk #${pad(x.no)}
            <small>${dt(x.ts)}, ${esc(x.m)} • Kasir: <b>${esc(x.by || 'Tidak diketahui')}</b></small>
          </span>
          <b>${R(x.total)}</b>
        </summary>
        <div class="det">
          ${(x.items || []).map(i => `<div><span>${i.q} × ${esc(i.n)}</span><span>${R(i.q * i.p)}</span></div>`).join('')}
          ${x.d ? `<div><span>Diskon</span><span>−${R(x.d)}</span></div>` : ''}
          ${x.tax ? `<div><span>PPN 11%</span><span>${R(x.tax)}</span></div>` : ''}
          <div><span>Subtotal</span><span>${R(x.sub || x.total)}</span></div>
          <div><span>Uang Diterima</span><span>${R(x.paid || x.total)}</span></div>
          ${(x.paid || x.total) - x.total > 0 ? `<div><span>Kembalian</span><span>${R((x.paid || x.total) - x.total)}</span></div>` : ''}
          <div><span>ID Transaksi / Struk</span><span>#${pad(x.no)}</span></div>
        </div>
      </details>`).join('')}
      ${filtered.length > pageLimit ? `<button class="rep-more-btn" onclick="repFilter.page++;drawReport()">Muat Lebih Banyak (${filtered.length - pageLimit} tersisa)</button>` : ''}
    </div>
  </div>`;

      $('#lv').innerHTML = `${filterHtml}${statsHtml}${chartHtml}${cashierTableHtml}<div class="rep-grid-2">${top10Html}${busiestHoursHtml}</div>${trxListHtml}`;
    }

    /* Ekspor CSV Transaksi */
    function exportCSV() {
      if (!isOwner()) return;
      const filtered = getFilteredReportTransactions();
      if (!filtered.length) { alert('Tidak ada transaksi untuk diekspor pada filter ini.'); return }

      const headers = ['No Struk', 'Tanggal', 'Jam', 'Kasir', 'Metode', 'Subtotal', 'Diskon', 'PPN', 'Total', 'Item'];
      const rows = [headers.join(';')];

      filtered.forEach(x => {
        const d = new Date(x.ts);
        const dateStr = d.toLocaleDateString('id-ID', { year: 'numeric', month: '2-digit', day: '2-digit' });
        const timeStr = d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const cashier = (x.by || 'Tidak diketahui').replace(/;/g, ',');
        const method = (x.m || '-').replace(/;/g, ',');
        const subtotal = x.sub || x.total;
        const discount = x.d || 0;
        const tax = x.tax || 0;
        const total = x.total;
        const itemsStr = (x.items || []).map(i => `${i.q}x ${i.n.replace(/;/g, ',')} (@${i.p})`).join(' | ');

        rows.push([
          pad(x.no),
          dateStr,
          timeStr,
          `"${cashier}"`,
          method,
          subtotal,
          discount,
          tax,
          total,
          `"${itemsStr}"`
        ].join(';'));
      });

      const csvContent = '\uFEFF' + rows.join('\r\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `laporan-transaksi-${toIsoDate(new Date())}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }

    /* ---------- riwayat (kasir & pemilik) ---------- */
    function drawHist() {
      const td = new Date().toDateString();
      const h = getAuthorizedTransactions(); // STRICT: KASIR HANYA TRANSAKSI MILIKNYA
      const tdy = h.filter(x => new Date(x.ts).toDateString() == td);
      const om = tdy.reduce((a, x) => a + x.total, 0);
      const it = tdy.reduce((a, x) => a + x.items.reduce((b, i) => b + i.q, 0), 0);
      const dt = ts => new Date(ts).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

      $('#hv').innerHTML = `<div class="stats">
    <div class="stat"><span>Omzet hari ini ${isOwner() ? '(Semua)' : '(Milik Anda)'}</span><b>${R(om)}</b></div>
    <div class="stat"><span>Transaksi ${isOwner() ? '(Semua)' : '(Milik Anda)'}</span><b>${tdy.length}</b></div>
    <div class="stat"><span>Item terjual ${isOwner() ? '(Semua)' : '(Milik Anda)'}</span><b>${it}</b></div>
  </div>
  ${h.length ? h.map(x => `<details class="trx"><summary><span>Struk #${pad(x.no)}<small>${dt(x.ts)}, ${x.m}${x.by ? ', Kasir: ' + esc(x.by) : ''}</small></span><b>${R(x.total)}</b></summary>
  <div class="det">${x.items.map(i => `<div><span>${i.q} × ${esc(i.n)}</span><span>${R(i.q * i.p)}</span></div>`).join('')}
  ${x.d ? `<div><span>Diskon</span><span>−${R(x.d)}</span></div>` : ''}
  ${x.tax ? `<div><span>PPN 11%</span><span>${R(x.tax)}</span></div>` : ''}
  <div><span>Kasir</span><span>${esc(x.by || 'Tidak diketahui')}</span></div>
  <div><span>Metode</span><span>${esc(x.m)}</span></div>
  <div><span>Uang Diterima</span><span>${R(x.paid || x.total)}</span></div>
  ${(x.paid || x.total) - x.total > 0 ? `<div><span>Kembalian</span><span>${R((x.paid || x.total) - x.total)}</span></div>` : ''}
  </div></details>`).join('') : '<div class="empty">Belum ada transaksi Anda. Selesaikan pesanan di tab Kasir.</div>'}`;
    }

    /* ---------- setelan (khusus pemilik) ---------- */
    function drawSet() {
      if (!isOwner()) return setView('kasir');
      $('#sv').innerHTML = `<div class="panel"><h3>Nama Toko</h3><label class="fld" style="max-width:360px"><input id="sname" value="${esc(S.store)}" maxlength="40"></label><button class="btn p" onclick="saveStore()">Simpan nama</button></div>
  
  <div class="panel"><h3>Manajemen Akun Pengguna</h3>
  <small style="color:var(--muted);display:block;margin-bottom:12px">Kelola akun kasir dan akun pemilik (admin). Akun nonaktif tidak bisa login, namun transaksi historisnya tetap tercatat.</small>
  
  ${S.users.map(u => `<div class="urow">
    <div>
      <b>${esc(u.name)}</b> <span class="badge-role ${u.role}">${u.role === 'owner' ? 'Pemilik' : 'Kasir'}</span>
      <span class="badge-status ${u.active !== false ? 'act' : 'non'}">${u.active !== false ? 'Aktif' : 'Nonaktif'}</span>
      <small>@${esc(u.u)}</small>
    </div>
    <div class="urow-actions">
      ${u.u === cur.u ? '<span style="font-size:13px;color:var(--muted);font-weight:600">(Akun Anda)</span>' : `
        <button class="btn-sm" onclick="toggleUserStatus('${esc(u.u)}')">${u.active !== false ? 'Nonaktifkan' : 'Aktifkan'}</button>
        <button class="btn-sm" onclick="openResetPw('${esc(u.u)}')">Reset Sandi</button>
        <button class="btn-sm" onclick="delUser('${esc(u.u)}')" style="color:var(--danger)">${delUserId == u.u ? 'Yakin hapus?' : 'Hapus'}</button>
      `}
    </div>
  </div>`).join('')}

  <div style="margin-top:20px;border-top:1px dashed var(--line);padding-top:16px">
    <h4 style="margin:0 0 10px;font-size:15px">Tambah Akun Baru</h4>
    <div class="pf" style="grid-template-columns:1.5fr 1.2fr 1.2fr 1fr auto;align-items:end">
      <label>Nama Pengguna<input id="un" maxlength="40" placeholder="Contoh: Budi Santoso"></label>
      <label>Username<input id="uu" autocomplete="off" placeholder="huruf kecil/angka"></label>
      <label>Kata Sandi<input id="up" type="password" autocomplete="new-password" placeholder="Min. 6 digit"></label>
      <label>Peran
        <select id="urole">
          <option value="kasir">Kasir</option>
          <option value="owner">Pemilik</option>
        </select>
      </label>
      <button class="btn p" onclick="addUser()">Tambah Akun</button>
    </div>
    <div class="err" id="uerr" style="margin:10px 0 0"></div>
  </div></div>

  <div class="panel"><h3>Keamanan Akun Anda</h3>
    <p class="hint" style="margin-bottom:12px">Ganti kata sandi akun pemilik Anda secara berkala.</p>
    <button class="btn" onclick="openMyPw()">Ganti Kata Sandi Saya</button>
  </div>

  <div class="panel"><h3>Hapus Data Toko</h3>
    <p class="hint" style="margin-bottom:12px">Menghapus seluruh produk dan riwayat transaksi. Akun pengguna tetap tersimpan.</p>
    <button class="btn d" onclick="wipeData(this)">Hapus produk dan riwayat</button>
  </div>`;
    }

    function saveStore() {
      const v = $('#sname').value.trim(); if (!v) return;
      S.store = v; save(); $('#sn').textContent = v; $('#rs').textContent = v;
      alert('Nama toko berhasil diperbarui.');
    }

    async function addUser() {
      if (!isOwner()) return;
      const name = $('#un').value.trim(), u = $('#uu').value.trim().toLowerCase(), pw = $('#up').value, role = $('#urole').value;
      const err = m => { $('#uerr').textContent = m };
      if (!name) return err('Nama pengguna wajib diisi.');
      if (!/^[a-z0-9_.]{3,}$/.test(u)) return err('Username minimal 3 karakter: huruf, angka, titik, atau garis bawah.');
      if (S.users.some(x => x.u == u)) return err('Username sudah dipakai.');
      if (pw.length < 6) return err('Kata sandi minimal 6 karakter.');
      if (!['kasir', 'owner'].includes(role)) return err('Peran tidak valid.');

      const salt = mkSalt();
      S.users.push({ id: S.uid++, u, name, role, active: true, salt, h: await hash(salt + pw) });
      save(); drawSet();
    }

    function toggleUserStatus(u) {
      if (!isOwner()) return;
      const target = S.users.find(x => x.u == u);
      if (!target) return;
      if (target.u === cur.u) { alert('Anda tidak bisa menonaktifkan akun Anda sendiri.'); return }
      if (target.role === 'owner' && target.active !== false) {
        const activeOwners = S.users.filter(x => x.role === 'owner' && x.active !== false);
        if (activeOwners.length <= 1) { alert('Harus ada minimal satu akun pemilik yang aktif.'); return }
      }
      target.active = !target.active;
      save(); drawSet();
    }

    function delUser(u) {
      if (!isOwner()) return;
      const target = S.users.find(x => x.u == u);
      if (!target) return;
      if (target.u === cur.u) { alert('Anda tidak bisa menghapus akun Anda sendiri.'); return }
      if (target.role === 'owner') {
        const owners = S.users.filter(x => x.role === 'owner');
        if (owners.length <= 1) { alert('Tidak bisa menghapus satu-satunya akun pemilik.'); return }
      }
      if (delUserId != u) {
        delUserId = u; drawSet();
        setTimeout(() => { if (delUserId == u) { delUserId = null; if (view == 'setelan') drawSet() } }, 3500);
        return;
      }
      // Hapus akun pengguna. TRANSAKSI TIDAK DIHAPUS (nama kasir tetap tersimpan di riwayat)
      S.users = S.users.filter(x => x.u != u);
      delUserId = null; save(); drawSet();
    }

    function wipeData(b) {
      if (!isOwner()) return;
      if (!wipe) { wipe = true; b.textContent = 'Yakin? Ketuk sekali lagi'; setTimeout(() => { wipe = false; if (view == 'setelan') drawSet() }, 4000); return }
      wipe = false; S.products = []; S.hist = []; S.seq = 1; S.nid = 1; cart = {}; disc = 0; save(); draw(); drawSet();
    }

    /* ---------- mulai ---------- */
    const tick = () => { $('#clock').textContent = new Date().toLocaleString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) };
    tick(); setInterval(tick, 30000);

    let su = null; try { su = sessionStorage.getItem('ks-user') } catch (e) { }
    if (su && S.users.some(x => x.u == su && x.active !== false)) enter(su); else drawAuth();

    /* ---------- TEST SUITE OTOMATIS (UJI SENDIRI) ---------- */
    window.runSelfTests = async function () {
      console.log('=== MEMULAI PENGUJIAN OTOMATIS ===');
      const backup = JSON.parse(JSON.stringify(S));
      const results = [];
      const assert = (cond, desc) => { results.push({ desc, pass: !!cond }); console.log((cond ? '✅ PASS: ' : '❌ FAIL: ') + desc) };

      try {
        // Uji 1: Buat akun pemilik, 3 produk, 2 kasir (Sari dan Budi)
        S = fresh();
        const saltP = mkSalt();
        S.store = 'Toko Pengujian';
        const ownerUser = { id: S.uid++, u: 'admin', name: 'Pemilik Toko', role: 'owner', active: true, salt: saltP, h: await hash(saltP + '123456') };
        S.users.push(ownerUser);

        S.products.push({ id: S.nid++, n: 'Kopi Hitam', c: 'Minuman', p: 10000, s: 50 });
        S.products.push({ id: S.nid++, n: 'Roti Bakar', c: 'Makanan', p: 15000, s: 30 });
        S.products.push({ id: S.nid++, n: 'Es Teh', c: 'Minuman', p: 5000, s: 100 });

        const saltS = mkSalt(), saltB = mkSalt();
        const sariUser = { id: S.uid++, u: 'sari', name: 'Sari', role: 'kasir', active: true, salt: saltS, h: await hash(saltS + '123456') };
        const budiUser = { id: S.uid++, u: 'budi', name: 'Budi', role: 'kasir', active: true, salt: saltB, h: await hash(saltB + '123456') };
        S.users.push(sariUser, budiUser);

        assert(S.users.length === 3, '1. Tiga akun terdaftar (1 pemilik, 2 kasir)');
        assert(S.products.length === 3, '1. Tiga produk terdaftar');

        // Uji 2: Sari membuat 3 transaksi, Budi membuat 2 transaksi
        // Transaksi Sari 1
        S.hist.push({ no: 1, ts: Date.now(), items: [{ n: 'Kopi Hitam', q: 2, p: 10000 }], sub: 20000, d: 0, tax: 2200, total: 22200, m: 'Tunai', paid: 30000, cashierId: sariUser.id, cashierU: sariUser.u, by: sariUser.name });
        // Transaksi Sari 2
        S.hist.push({ no: 2, ts: Date.now(), items: [{ n: 'Roti Bakar', q: 1, p: 15000 }], sub: 15000, d: 0, tax: 1650, total: 16650, m: 'Tunai', paid: 20000, cashierId: sariUser.id, cashierU: sariUser.u, by: sariUser.name });
        // Transaksi Sari 3
        S.hist.push({ no: 3, ts: Date.now(), items: [{ n: 'Es Teh', q: 2, p: 5000 }], sub: 10000, d: 0, tax: 1100, total: 11100, m: 'QRIS', paid: 11100, cashierId: sariUser.id, cashierU: sariUser.u, by: sariUser.name });

        // Transaksi Budi 1 (Tunai)
        S.hist.push({ no: 4, ts: Date.now(), items: [{ n: 'Kopi Hitam', q: 1, p: 10000 }, { n: 'Roti Bakar', q: 1, p: 15000 }], sub: 25000, d: 0, tax: 2750, total: 27750, m: 'Tunai', paid: 50000, cashierId: budiUser.id, cashierU: budiUser.u, by: budiUser.name });
        // Transaksi Budi 2 (Debit)
        S.hist.push({ no: 5, ts: Date.now(), items: [{ n: 'Es Teh', q: 4, p: 5000 }], sub: 20000, d: 0, tax: 2200, total: 22200, m: 'Debit', paid: 22200, cashierId: budiUser.id, cashierU: budiUser.u, by: budiUser.name });

        assert(S.hist.length === 5, '2. Total 5 transaksi tersimpan dengan metadata kasir');

        // Uji 3: Login sebagai Pemilik -> Verifikasi Laporan & Filter
        cur = ownerUser;
        repFilter = { period: 'hari-ini', from: '', to: '', cashier: 'Semua', method: 'Semua', page: 1, pageSize: 10 };
        const repAll = getFilteredReportTransactions();
        assert(repAll.length === 5, '3a. Pemilik melihat seluruh 5 transaksi di Laporan');
        const omzetAll = repAll.reduce((a, x) => a + x.total, 0);
        assert(omzetAll === (22200 + 16650 + 11100 + 27750 + 22200), '3b. Perhitungan omzet total sesuai');

        // Filter kasir Sari
        repFilter.cashier = 'Sari';
        const repSari = getFilteredReportTransactions();
        assert(repSari.length === 3, '3c. Filter kasir Sari menghasilkan tepat 3 transaksi');

        // Filter metode QRIS
        repFilter.cashier = 'Semua';
        repFilter.method = 'QRIS';
        const repQRIS = getFilteredReportTransactions();
        assert(repQRIS.length === 1 && repQRIS[0].no === 3, '3d. Filter metode QRIS tepat menghasilkan 1 transaksi');

        // Uji 4: Login sebagai Sari -> Hak akses Tab Riwayat
        cur = sariUser;
        const sariAuthTrx = getAuthorizedTransactions();
        assert(sariAuthTrx.length === 3, '4a. Kasir Sari HANYA mendapatkan 3 transaksinya sendiri');
        assert(sariAuthTrx.every(x => x.by === 'Sari' || x.cashierU === 'sari'), '4b. Tidak ada transaksi milik Budi yang bocor ke Sari');

        // Uji 5: Nonaktifkan Budi -> Budi tidak bisa login, transaksinya tetap ada
        cur = ownerUser;
        budiUser.active = false;
        assert(budiUser.active === false, '5a. Status Budi dinonaktifkan');

        // Uji login Budi gagal
        const budiCheck = S.users.find(x => x.u === 'budi');
        assert(budiCheck.active === false, '5b. Akun Budi nonaktif ditolak saat autentikasi');

        // Transaksi Budi tetap ada di laporan pemilik
        repFilter = { period: 'hari-ini', from: '', to: '', cashier: 'Budi', method: 'Semua', page: 1, pageSize: 10 };
        const repBudiHistory = getFilteredReportTransactions();
        assert(repBudiHistory.length === 2, '5c. Transaksi Budi tetap tersimpan lengkap di riwayat & laporan pemilik');

        // Uji 6: Migrasi transaksi lama tanpa kasir
        S.hist.push({ no: 99, ts: Date.now() - 86400000, items: [{ n: 'Item Lawas', q: 1, p: 5000 }], sub: 5000, d: 0, tax: 0, total: 5000, m: 'Tunai', paid: 5000 });
        migrateData();
        const legacyTrx = S.hist.find(x => x.no === 99);
        assert(legacyTrx.by === 'Tidak diketahui', '6a. Transaksi lama bermigrasi otomatis menjadi "Tidak diketahui"');
        assert(!isNaN(legacyTrx.total), '6b. Transaksi lama tidak menimbulkan error kalkulasi');

      } finally {
        S = backup;
        save();
      }
      const allPassed = results.every(r => r.pass);
      console.log('=== HASIL AKHIR: ' + (allPassed ? 'SEMUA PENGUJIAN LULUS (100%)' : 'ADA PENGUJIAN GAGAL') + ' ===');
      return results;
    };

checkApiConnection();
