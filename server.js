const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname)); // Melayani file index.html, style.css, app.js secara statis

// Koneksi ke Database SQLite (File: kasir.db)
const dbPath = path.join(__dirname, 'kasir.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Gagal menghubungkan ke database SQLite:', err.message);
  } else {
    console.log('Terhubung ke database SQLite:', dbPath);
    initDatabase();
  }
});

// Helper Crypto Hash SHA-256
function hashPassword(s) {
  return crypto.createHash('sha256').update(s).digest('hex');
}
function makeSalt() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// Inisialisasi Skema Tabel Database
function initDatabase() {
  db.serialize(() => {
    // Tabel Pengaturan Toko
    db.run(`CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    )`);

    // Tabel Pengguna (Kasir & Pemilik)
    db.run(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      u TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'kasir',
      active INTEGER NOT NULL DEFAULT 1,
      salt TEXT NOT NULL,
      h TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Tabel Produk
    db.run(`CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      n TEXT NOT NULL,
      c TEXT DEFAULT '',
      p INTEGER NOT NULL,
      s INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Tabel Transaksi Kasir
    db.run(`CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      no INTEGER NOT NULL,
      ts INTEGER NOT NULL,
      cashier_id INTEGER DEFAULT 0,
      cashier_u TEXT DEFAULT '',
      cashier_name TEXT DEFAULT 'Tidak diketahui',
      sub INTEGER NOT NULL,
      d INTEGER NOT NULL DEFAULT 0,
      tax INTEGER NOT NULL DEFAULT 0,
      total INTEGER NOT NULL,
      m TEXT NOT NULL DEFAULT 'Tunai',
      paid INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Tabel Detail Item Penjualan
    db.run(`CREATE TABLE IF NOT EXISTS transaction_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transaction_id INTEGER NOT NULL,
      product_id INTEGER DEFAULT 0,
      n TEXT NOT NULL,
      q INTEGER NOT NULL,
      p INTEGER NOT NULL,
      FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE
    )`);

    console.log('Semua tabel database SQLite siap digunakan.');
  });
}

// ==================== REST API ENDPOINTS ====================

// 1. Status & Inisialisasi
app.get('/api/status', (req, res) => {
  res.json({ status: 'ok', time: Date.now() });
});

app.get('/api/init', (req, res) => {
  db.get('SELECT value FROM settings WHERE key = ?', ['store_name'], (err, rowStore) => {
    const store = rowStore ? rowStore.value : 'Aplikasi Kasir';
    db.get('SELECT COUNT(*) as count FROM users', [], (err, rowUsers) => {
      res.json({
        store,
        hasUsers: (rowUsers && rowUsers.count > 0)
      });
    });
  });
});

// 2. Pengaturan Nama Toko
app.get('/api/store', (req, res) => {
  db.get('SELECT value FROM settings WHERE key = ?', ['store_name'], (err, row) => {
    res.json({ store: row ? row.value : 'Aplikasi Kasir' });
  });
});

app.post('/api/store', (req, res) => {
  const { store } = req.body;
  if (!store) return res.status(400).json({ error: 'Nama toko wajib diisi' });
  db.run(`INSERT INTO settings (key, value) VALUES ('store_name', ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value`, [store.trim()], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, store: store.trim() });
  });
});

// 3. Autentikasi (Daftar Pemilik Pertama & Login)
app.post('/api/auth/register-first', (req, res) => {
  const { store, name, u, pw } = req.body;
  if (!store || !name || !u || !pw) return res.status(400).json({ error: 'Semua kolom wajib diisi' });
  if (pw.length < 6) return res.status(400).json({ error: 'Kata sandi minimal 6 karakter' });

  db.get('SELECT COUNT(*) as count FROM users', [], (err, row) => {
    if (row && row.count > 0) {
      return res.status(400).json({ error: 'Akun pemilik sudah terdaftar sebelumnya' });
    }
    const salt = makeSalt();
    const h = hashPassword(salt + pw);
    const cleanU = u.trim().toLowerCase();

    db.serialize(() => {
      db.run(`INSERT INTO settings (key, value) VALUES ('store_name', ?)
              ON CONFLICT(key) DO UPDATE SET value = excluded.value`, [store.trim()]);

      db.run(`INSERT INTO users (u, name, role, active, salt, h) VALUES (?, ?, 'owner', 1, ?, ?)`,
        [cleanU, name.trim(), salt, h],
        function(err2) {
          if (err2) return res.status(500).json({ error: err2.message });
          res.json({
            success: true,
            user: { id: this.lastID, u: cleanU, name: name.trim(), role: 'owner' }
          });
        }
      );
    });
  });
});

app.post('/api/auth/login', (req, res) => {
  const { u, pw } = req.body;
  if (!u || !pw) return res.status(400).json({ error: 'Username dan kata sandi wajib diisi' });

  db.get('SELECT * FROM users WHERE u = ?', [u.trim().toLowerCase()], (err, user) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!user) return res.status(401).json({ error: 'Username atau kata sandi salah' });
    if (user.active === 0) return res.status(403).json({ error: 'Akun ini telah dinonaktifkan. Hubungi pemilik toko.' });

    if (user.h === hashPassword(user.salt + pw)) {
      res.json({
        success: true,
        user: { id: user.id, u: user.u, name: user.name, role: user.role }
      });
    } else {
      res.status(401).json({ error: 'Username atau kata sandi salah' });
    }
  });
});

// 4. Manajemen Akun Pengguna
app.get('/api/users', (req, res) => {
  db.all('SELECT id, u, name, role, active, created_at FROM users ORDER BY role DESC, id ASC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows.map(r => ({ ...r, active: r.active === 1 })));
  });
});

app.post('/api/users', (req, res) => {
  const { name, u, pw, role } = req.body;
  if (!name || !u || !pw || !role) return res.status(400).json({ error: 'Semua kolom wajib diisi' });
  if (pw.length < 6) return res.status(400).json({ error: 'Kata sandi minimal 6 karakter' });
  const cleanU = u.trim().toLowerCase();

  const salt = makeSalt();
  const h = hashPassword(salt + pw);

  db.run('INSERT INTO users (u, name, role, active, salt, h) VALUES (?, ?, ?, 1, ?, ?)',
    [cleanU, name.trim(), role, salt, h],
    function(err) {
      if (err) {
        if (err.message.includes('UNIQUE')) return res.status(400).json({ error: 'Username sudah digunakan' });
        return res.status(500).json({ error: err.message });
      }
      res.json({ success: true, id: this.lastID });
    }
  );
});

app.put('/api/users/:id/toggle', (req, res) => {
  const id = req.params.id;
  db.get('SELECT * FROM users WHERE id = ?', [id], (err, user) => {
    if (err || !user) return res.status(404).json({ error: 'Pengguna tidak ditemukan' });
    if (user.role === 'owner' && user.active === 1) {
      db.get('SELECT COUNT(*) as activeOwners FROM users WHERE role = ? AND active = 1', ['owner'], (err2, row) => {
        if (row && row.activeOwners <= 1) {
          return res.status(400).json({ error: 'Minimal harus ada satu akun pemilik yang aktif' });
        }
        updateStatus();
      });
    } else {
      updateStatus();
    }

    function updateStatus() {
      const nextActive = user.active === 1 ? 0 : 1;
      db.run('UPDATE users SET active = ? WHERE id = ?', [nextActive, id], (err3) => {
        if (err3) return res.status(500).json({ error: err3.message });
        res.json({ success: true, active: nextActive === 1 });
      });
    }
  });
});

app.put('/api/users/:id/reset-password', (req, res) => {
  const id = req.params.id;
  const { newPw } = req.body;
  if (!newPw || newPw.length < 6) return res.status(400).json({ error: 'Kata sandi minimal 6 karakter' });

  const salt = makeSalt();
  const h = hashPassword(salt + newPw);

  db.run('UPDATE users SET salt = ?, h = ? WHERE id = ?', [salt, h, id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

app.put('/api/users/change-password', (req, res) => {
  const { userId, oldPw, newPw } = req.body;
  if (!oldPw || !newPw || newPw.length < 6) return res.status(400).json({ error: 'Kata sandi baru minimal 6 karakter' });

  db.get('SELECT * FROM users WHERE id = ?', [userId], (err, user) => {
    if (err || !user) return res.status(404).json({ error: 'Pengguna tidak ditemukan' });
    if (user.h !== hashPassword(user.salt + oldPw)) {
      return res.status(400).json({ error: 'Kata sandi lama tidak sesuai' });
    }

    const salt = makeSalt();
    const h = hashPassword(salt + newPw);
    db.run('UPDATE users SET salt = ?, h = ? WHERE id = ?', [salt, h, userId], (err2) => {
      if (err2) return res.status(500).json({ error: err2.message });
      res.json({ success: true });
    });
  });
});

app.delete('/api/users/:id', (req, res) => {
  const id = req.params.id;
  db.get('SELECT * FROM users WHERE id = ?', [id], (err, user) => {
    if (err || !user) return res.status(404).json({ error: 'Pengguna tidak ditemukan' });
    if (user.role === 'owner') {
      db.get('SELECT COUNT(*) as ownerCount FROM users WHERE role = ?', ['owner'], (err2, row) => {
        if (row && row.ownerCount <= 1) {
          return res.status(400).json({ error: 'Tidak bisa menghapus satu-satunya akun pemilik' });
        }
        deleteIt();
      });
    } else {
      deleteIt();
    }

    function deleteIt() {
      db.run('DELETE FROM users WHERE id = ?', [id], (err3) => {
        if (err3) return res.status(500).json({ error: err3.message });
        res.json({ success: true });
      });
    }
  });
});

// 5. Manajemen Produk
app.get('/api/products', (req, res) => {
  db.all('SELECT id, n, c, p, s FROM products ORDER BY n ASC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/products', (req, res) => {
  const { n, c, p, s } = req.body;
  if (!n || p < 1) return res.status(400).json({ error: 'Nama dan harga produk wajib diisi dengan benar' });

  db.run('INSERT INTO products (n, c, p, s) VALUES (?, ?, ?, ?)',
    [n.trim(), (c || '').trim(), parseInt(p) || 0, parseInt(s) || 0],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, id: this.lastID });
    }
  );
});

app.put('/api/products/:id', (req, res) => {
  const id = req.params.id;
  const { n, c, p, s } = req.body;
  if (!n || p < 1) return res.status(400).json({ error: 'Nama dan harga produk wajib diisi dengan benar' });

  db.run('UPDATE products SET n = ?, c = ?, p = ?, s = ? WHERE id = ?',
    [n.trim(), (c || '').trim(), parseInt(p) || 0, parseInt(s) || 0, id],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    }
  );
});

app.delete('/api/products/:id', (req, res) => {
  const id = req.params.id;
  db.run('DELETE FROM products WHERE id = ?', [id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// 6. Transaksi Kasir
app.get('/api/transactions', (req, res) => {
  const { cashierU } = req.query;
  let sql = `SELECT t.*, 
             json_group_array(json_object('n', ti.n, 'q', ti.q, 'p', ti.p)) as items_json
             FROM transactions t
             LEFT JOIN transaction_items ti ON t.id = ti.transaction_id`;
  const params = [];
  if (cashierU) {
    sql += ` WHERE t.cashier_u = ?`;
    params.push(cashierU);
  }
  sql += ` GROUP BY t.id ORDER BY t.ts DESC LIMIT 300`;

  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const result = rows.map(r => ({
      no: r.no,
      ts: r.ts,
      cashierId: r.cashier_id,
      cashierU: r.cashier_u,
      by: r.cashier_name,
      sub: r.sub,
      d: r.d,
      tax: r.tax,
      total: r.total,
      m: r.m,
      paid: r.paid,
      items: JSON.parse(r.items_json || '[]').filter(it => it.n != null)
    }));
    res.json(result);
  });
});

app.post('/api/transactions', (req, res) => {
  const { items, sub, d, tax, total, m, paid, cashierId, cashierU, cashierName } = req.body;
  if (!items || !items.length) return res.status(400).json({ error: 'Keranjang belanja kosong' });

  db.get('SELECT COALESCE(MAX(no), 0) + 1 as nextNo FROM transactions', [], (err, row) => {
    const nextNo = row ? row.nextNo : 1;
    const nowTs = Date.now();

    db.serialize(() => {
      db.run('BEGIN TRANSACTION');

      const insertTrx = db.prepare(`INSERT INTO transactions 
        (no, ts, cashier_id, cashier_u, cashier_name, sub, d, tax, total, m, paid) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

      insertTrx.run([nextNo, nowTs, cashierId || 0, cashierU || '', cashierName || 'Tidak diketahui', sub, d || 0, tax || 0, total, m || 'Tunai', paid || total], function(err2) {
        if (err2) {
          db.run('ROLLBACK');
          return res.status(500).json({ error: err2.message });
        }

        const trxId = this.lastID;
        const insertItem = db.prepare('INSERT INTO transaction_items (transaction_id, product_id, n, q, p) VALUES (?, ?, ?, ?, ?)');
        const updateStock = db.prepare('UPDATE products SET s = s - ? WHERE id = ?');

        items.forEach(it => {
          insertItem.run([trxId, it.id || 0, it.n, it.q, it.p]);
          if (it.id) {
            updateStock.run([it.q, it.id]);
          }
        });

        insertItem.finalize();
        updateStock.finalize();

        db.run('COMMIT', (err3) => {
          if (err3) return res.status(500).json({ error: err3.message });
          res.json({ success: true, no: nextNo, ts: nowTs });
        });
      });
      insertTrx.finalize();
    });
  });
});

// 7. Reset Data Toko
app.post('/api/store/reset', (req, res) => {
  db.serialize(() => {
    db.run('DELETE FROM transaction_items');
    db.run('DELETE FROM transactions');
    db.run('DELETE FROM products');
    res.json({ success: true });
  });
});

// Mulai Server
app.listen(PORT, () => {
  console.log(`===============================================`);
  console.log(`🚀 Server Kasir POS berjalan di: http://localhost:${PORT}`);
  console.log(`📁 File Database SQLite: ${dbPath}`);
  console.log(`===============================================`);
});
