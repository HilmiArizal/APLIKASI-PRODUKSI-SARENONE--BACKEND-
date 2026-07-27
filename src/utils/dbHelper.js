const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../../data');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// DEFAULT INITIAL DATASEST
const INITIAL_DATA = {
  users: [
    { id: 'u1', username: 'admin', email: 'admin@sarenone.com', pass: 'admin', name: 'Super Admin Saren One', role: 'ADMIN', status: 'VERIFIED', provider: 'local', createdAt: '2026-07-20 08:00' },
    { id: 'u2', username: 'budibaker', email: 'budi.baker@gmail.com', pass: '123456', name: 'Budi Kurniawan', role: 'PENDING', requestedRole: 'PRODUK', status: 'PENDING', provider: 'local', catatan: 'Staf Produksi Roti', createdAt: '2026-07-24 08:30' },
    { id: 'u3', username: 'sitigudang', email: 'siti.gudang@gmail.com', pass: '123456', name: 'Siti Rahma', role: 'PENDING', requestedRole: 'BAHAN_BAKU', status: 'PENDING', provider: 'local', catatan: 'Staf Gudang Bahan', createdAt: '2026-07-24 09:00' }
  ],
  bahanBaku: [
    { id: 'b1', sku: 'BHN-001', nama: 'Tepung Terigu Cakra', kategori: 'Bahan Utama', stok: 45.5, minStok: 15.0, satuan: 'kg', harga: 13500 },
    { id: 'b2', sku: 'BHN-002', nama: 'Gula Pasir Premium', kategori: 'Pemanis & Perasa', stok: 28.0, minStok: 10.0, satuan: 'kg', harga: 17500 },
    { id: 'b3', sku: 'BHN-003', nama: 'Keju Cheddar Olahan', kategori: 'Toping & Isian', stok: 3.5, minStok: 5.0, satuan: 'kg', harga: 85000 },
    { id: 'b4', sku: 'BHN-004', nama: 'Mentega Butter Anchor', kategori: 'Olahan Susu & Lemak', stok: 12.0, minStok: 5.0, satuan: 'kg', harga: 68000 },
    { id: 'b5', sku: 'BHN-005', nama: 'Cokelat Compound Dark', kategori: 'Toping & Isian', stok: 18.0, minStok: 6.0, satuan: 'kg', harga: 54000 },
    { id: 'b6', sku: 'BHN-006', nama: 'Dus Box Roti Saren One', kategori: 'Kemasan & Lainnya', stok: 180, minStok: 50, satuan: 'pcs', harga: 1200 }
  ],
  produk: [
    { id: 'p1', sku: 'PRD-001', nama: 'Roti Keju Spesial', kategori: 'Roti Manis', stok: 35, harga: 16000 },
    { id: 'p2', sku: 'PRD-002', nama: 'Brownies Cokelat Lumer', kategori: 'Kue & Cake', stok: 18, harga: 48000 },
    { id: 'p3', sku: 'PRD-003', nama: 'Croissant Butter Original', kategori: 'Pastry & Danish', stok: 24, harga: 22000 }
  ],
  resep: {
    'p1': [
      { bahanId: 'b1', takaran: 0.08 },
      { bahanId: 'b2', takaran: 0.02 },
      { bahanId: 'b3', takaran: 0.03 },
      { bahanId: 'b4', takaran: 0.02 },
      { bahanId: 'b6', takaran: 1 }
    ],
    'p2': [
      { bahanId: 'b1', takaran: 0.12 },
      { bahanId: 'b2', takaran: 0.08 },
      { bahanId: 'b5', takaran: 0.10 },
      { bahanId: 'b4', takaran: 0.05 }
    ],
    'p3': [
      { bahanId: 'b1', takaran: 0.10 },
      { bahanId: 'b4', takaran: 0.06 },
      { bahanId: 'b2', takaran: 0.01 }
    ]
  },
  auditLog: [
    { id: 'LOG-101', timestamp: '2026-07-24 07:30', user: 'Tim Bahan Baku', role: 'BAHAN_BAKU', aksi: 'Stok Masuk', detail: 'Restock Tepung Terigu +20.0 kg (Supplier PT Boga Utama)' },
    { id: 'LOG-102', timestamp: '2026-07-24 08:15', user: 'Tim Produk', role: 'PRODUK', aksi: 'Produksi Batch', detail: 'Produksi 25 Pcs Roti Keju Spesial (Batch #PRD-2026-01). Stok bahan baku otomatis dipotong.' }
  ],
  riwayatProduksi: [
    {
      id: 'BATCH-2026-001',
      timestamp: '2026-07-24 08:15',
      produkId: 'p1',
      produkNama: 'Roti Keju Spesial',
      jumlahPcs: 25,
      operator: 'Tim Produk',
      pemotonganBahan: [
        { bahanNama: 'Tepung Terigu Cakra', jumlah: 2.0, satuan: 'kg' },
        { bahanNama: 'Gula Pasir Premium', jumlah: 0.5, satuan: 'kg' },
        { bahanNama: 'Keju Cheddar Olahan', jumlah: 0.75, satuan: 'kg' },
        { bahanNama: 'Mentega Butter Anchor', jumlah: 0.5, satuan: 'kg' },
        { bahanNama: 'Dus Box Roti Saren One', jumlah: 25, satuan: 'pcs' }
      ]
    }
  ]
};

function readCollection(collectionName) {
  const filePath = path.join(DATA_DIR, `${collectionName}.json`);
  if (!fs.existsSync(filePath)) {
    const defaultContent = INITIAL_DATA[collectionName] || [];
    fs.writeFileSync(filePath, JSON.stringify(defaultContent, null, 2));
    return defaultContent;
  }
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content);
  } catch (err) {
    return INITIAL_DATA[collectionName] || [];
  }
}

function writeCollection(collectionName, data) {
  const filePath = path.join(DATA_DIR, `${collectionName}.json`);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function addAuditLog(user, role, aksi, detail) {
  const logs = readCollection('auditLog');
  const now = new Date();
  const timestamp = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
  
  const newLog = {
    id: 'LOG-' + Math.floor(100 + Math.random() * 900),
    timestamp,
    user: user || 'System',
    role: role || 'ADMIN',
    aksi,
    detail
  };

  const updated = [newLog, ...logs].slice(0, 100);
  writeCollection('auditLog', updated);
  return newLog;
}

module.exports = {
  readCollection,
  writeCollection,
  addAuditLog
};
