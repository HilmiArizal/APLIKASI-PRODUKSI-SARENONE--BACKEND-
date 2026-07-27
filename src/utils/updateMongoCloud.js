require('dotenv').config();
const connectDB = require('../config/db');

const User = require('../models/User');
const BahanBaku = require('../models/BahanBaku');
const Produk = require('../models/Produk');
const Resep = require('../models/Resep');
const RiwayatProduksi = require('../models/RiwayatProduksi');
const AuditLog = require('../models/AuditLog');
const KategoriProduk = require('../models/KategoriProduk');
const KategoriBahanBaku = require('../models/KategoriBahanBaku');

const INITIAL_USERS = [
  { id: 'u1', username: 'admin', email: 'admin@sarenone.com', pass: 'admin', name: 'Super Admin Saren One', role: 'ADMIN', status: 'VERIFIED', provider: 'local', createdAt: '2026-07-20 08:00' },
  { id: 'u2', username: 'budibaker', email: 'budi.baker@gmail.com', pass: '123456', name: 'Budi Kurniawan', role: 'PENDING', requestedRole: 'PRODUK', status: 'PENDING', provider: 'local', catatan: 'Staf Produksi Roti', createdAt: '2026-07-24 08:30' },
  { id: 'u3', username: 'sitigudang', email: 'siti.gudang@gmail.com', pass: '123456', name: 'Siti Rahma', role: 'PENDING', requestedRole: 'BAHAN_BAKU', status: 'PENDING', provider: 'local', catatan: 'Staf Gudang Bahan', createdAt: '2026-07-24 09:00' }
];

const INITIAL_KATEGORI_PRODUK = [
  { id: 'kat_1', nama: 'Roti Manis', deskripsi: 'Aneka olahan roti manis isi keju, cokelat, dan selai', createdAt: '2026-07-20 08:00' },
  { id: 'kat_2', nama: 'Kue & Cake', deskripsi: 'Aneka kue bolu, brownies, dan kue tart ulang tahun', createdAt: '2026-07-20 08:00' },
  { id: 'kat_3', nama: 'Pastry & Danish', deskripsi: 'Aneka olahan pastry renyah, butter croissant, dan puff', createdAt: '2026-07-20 08:00' },
  { id: 'kat_4', nama: 'Minuman & Kopi', deskripsi: 'Aneka olahan minuman kopi susu dan teh manis', createdAt: '2026-07-20 08:00' }
];

const INITIAL_KATEGORI_BAHAN = [
  { id: 'kat_bhn_1', nama: 'Bahan Utama', deskripsi: 'Tepung, gandum, beras, dan bahan dasar adonan utama', createdAt: '2026-07-20 08:00' },
  { id: 'kat_bhn_2', nama: 'Pemanis & Perasa', deskripsi: 'Gula, garaman, vanila, pengempuk, dan perasa makanan', createdAt: '2026-07-20 08:00' },
  { id: 'kat_bhn_3', nama: 'Toping & Isian', deskripsi: 'Keju, cokelat compound, kismis, meses, dan selai buah', createdAt: '2026-07-20 08:00' },
  { id: 'kat_bhn_4', nama: 'Olahan Susu & Lemak', deskripsi: 'Mentega, margarin, butter, susu cair, dan whipped cream', createdAt: '2026-07-20 08:00' },
  { id: 'kat_bhn_5', nama: 'Kemasan & Lainnya', deskripsi: 'Box dus roti, kantong plastik, stiker label, dan mika', createdAt: '2026-07-20 08:00' }
];

const INITIAL_BAHAN = [
  { id: 'b1', sku: 'BHN-001', nama: 'Tepung Terigu Cakra', kategori: 'Bahan Utama', stok: 45.5, minStok: 15.0, satuan: 'kg', harga: 13500 },
  { id: 'b2', sku: 'BHN-002', nama: 'Gula Pasir Premium', kategori: 'Pemanis & Perasa', stok: 28.0, minStok: 10.0, satuan: 'kg', harga: 17500 },
  { id: 'b3', sku: 'BHN-003', nama: 'Keju Cheddar Olahan', kategori: 'Toping & Isian', stok: 3.5, minStok: 5.0, satuan: 'kg', harga: 85000 },
  { id: 'b4', sku: 'BHN-004', nama: 'Mentega Butter Anchor', kategori: 'Olahan Susu & Lemak', stok: 12.0, minStok: 5.0, satuan: 'kg', harga: 68000 },
  { id: 'b5', sku: 'BHN-005', nama: 'Cokelat Compound Dark', kategori: 'Toping & Isian', stok: 18.0, minStok: 6.0, satuan: 'kg', harga: 54000 },
  { id: 'b6', sku: 'BHN-006', nama: 'Dus Box Roti Saren One', kategori: 'Kemasan & Lainnya', stok: 180, minStok: 50, satuan: 'pcs', harga: 1200 }
];

const INITIAL_PRODUK = [
  { id: 'p1', sku: 'PRD-001', nama: 'Roti Keju Spesial', kategori: 'Roti Manis', stok: 35, harga: 16000 },
  { id: 'p2', sku: 'PRD-002', nama: 'Brownies Cokelat Lumer', kategori: 'Kue & Cake', stok: 18, harga: 48000 },
  { id: 'p3', sku: 'PRD-003', nama: 'Croissant Butter Original', kategori: 'Pastry & Danish', stok: 24, harga: 22000 }
];

const INITIAL_RESEP = [
  { produkId: 'p1', items: [{ bahanId: 'b1', takaran: 0.08 }, { bahanId: 'b2', takaran: 0.02 }, { bahanId: 'b3', takaran: 0.03 }, { bahanId: 'b4', takaran: 0.02 }, { bahanId: 'b6', takaran: 1 }] },
  { produkId: 'p2', items: [{ bahanId: 'b1', takaran: 0.12 }, { bahanId: 'b2', takaran: 0.08 }, { bahanId: 'b5', takaran: 0.10 }, { bahanId: 'b4', takaran: 0.05 }] },
  { produkId: 'p3', items: [{ bahanId: 'b1', takaran: 0.10 }, { bahanId: 'b4', takaran: 0.06 }, { bahanId: 'b2', takaran: 0.01 }] }
];

const INITIAL_LOGS = [
  { id: 'LOG-101', timestamp: '2026-07-24 07:30', user: 'Tim Bahan Baku', role: 'BAHAN_BAKU', aksi: 'Stok Masuk', detail: 'Restock Tepung Terigu +20.0 kg (Supplier PT Boga Utama)' },
  { id: 'LOG-102', timestamp: '2026-07-24 08:15', user: 'Tim Produk', role: 'PRODUK', aksi: 'Produksi Batch', detail: 'Produksi 25 Pcs Roti Keju Spesial (Batch #PRD-2026-01). Stok bahan baku otomatis dipotong.' }
];

async function updateAllCollections() {
  const isConnected = await connectDB();
  if (!isConnected) {
    console.error('❌ Failed to connect to MongoDB Atlas Cloud!');
    process.exit(1);
  }

  console.log('🚀 Syncing & Updating MongoDB Atlas Cloud "saren_one_db"...');

  // Upsert Users
  for (const item of INITIAL_USERS) {
    await User.findOneAndUpdate({ id: item.id }, item, { upsert: true, returnDocument: 'after' });
  }

  // Upsert KategoriProduk
  for (const item of INITIAL_KATEGORI_PRODUK) {
    await KategoriProduk.findOneAndUpdate({ id: item.id }, item, { upsert: true, returnDocument: 'after' });
  }

  // Upsert KategoriBahanBaku
  for (const item of INITIAL_KATEGORI_BAHAN) {
    await KategoriBahanBaku.findOneAndUpdate({ id: item.id }, item, { upsert: true, returnDocument: 'after' });
  }

  // Upsert BahanBaku
  for (const item of INITIAL_BAHAN) {
    await BahanBaku.findOneAndUpdate({ id: item.id }, item, { upsert: true, returnDocument: 'after' });
  }

  // Upsert Produk
  for (const item of INITIAL_PRODUK) {
    await Produk.findOneAndUpdate({ id: item.id }, item, { upsert: true, returnDocument: 'after' });
  }

  // Upsert Resep
  for (const item of INITIAL_RESEP) {
    await Resep.findOneAndUpdate({ produkId: item.produkId }, item, { upsert: true, returnDocument: 'after' });
  }

  // Upsert AuditLog
  for (const item of INITIAL_LOGS) {
    await AuditLog.findOneAndUpdate({ id: item.id }, item, { upsert: true, returnDocument: 'after' });
  }

  console.log('✅ ALL COLLECTIONS IN MONGODB ATLAS CLOUD "saren_one_db" SUCCESSFULLY UPDATED!');
  process.exit(0);
}

updateAllCollections();
