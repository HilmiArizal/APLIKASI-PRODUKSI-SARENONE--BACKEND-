const KategoriBahanBaku = require('../models/KategoriBahanBaku');
const { readCollection, writeCollection, addAuditLog } = require('../utils/dbHelper');

const DEFAULT_KATEGORI_BAHAN = [
  { id: 'kat_bhn_1', nama: 'Bahan Utama', deskripsi: 'Tepung, gandum, beras, dan bahan dasar adonan utama', createdAt: '2026-07-20 08:00' },
  { id: 'kat_bhn_2', nama: 'Pemanis & Perasa', deskripsi: 'Gula, garaman, vanila, pengempuk, dan perasa makanan', createdAt: '2026-07-20 08:00' },
  { id: 'kat_bhn_3', nama: 'Toping & Isian', deskripsi: 'Keju, cokelat compound, kismis, meses, dan selai buah', createdAt: '2026-07-20 08:00' },
  { id: 'kat_bhn_4', nama: 'Olahan Susu & Lemak', deskripsi: 'Mentega, margarin, butter, susu cair, dan whipped cream', createdAt: '2026-07-20 08:00' },
  { id: 'kat_bhn_5', nama: 'Kemasan & Lainnya', deskripsi: 'Box dus roti, kantong plastik, stiker label, dan mika', createdAt: '2026-07-20 08:00' }
];

// GET /api/kategori-bahan-baku
exports.getAll = async (req, res) => {
  try {
    const list = await KategoriBahanBaku.find().sort({ createdAt: 1 });
    return res.json({ success: true, data: list });
  } catch (err) {
    const fallback = readCollection('kategoriBahanBaku');
    return res.json({ success: true, data: fallback });
  }
};

// POST /api/kategori-bahan-baku (Tambah Kategori Bahan Baku Baru)
exports.create = async (req, res) => {
  try {
    const { nama, deskripsi, user } = req.body;
    if (!nama) {
      return res.status(400).json({ success: false, message: 'Nama kategori bahan baku wajib diisi.' });
    }

    const cleanNama = nama.trim();
    const existing = await KategoriBahanBaku.findOne({ nama: new RegExp(`^${cleanNama}$`, 'i') });
    if (existing) {
      return res.status(400).json({ success: false, message: `Kategori "${cleanNama}" sudah pernah terdaftar di MongoDB Atlas!` });
    }

    const newItem = {
      id: 'kat_bhn_' + Date.now(),
      nama: cleanNama,
      deskripsi: deskripsi || 'Kategori bahan mentah dapur',
      createdAt: new Date().toISOString()
    };

    const mongoItem = await KategoriBahanBaku.create(newItem);

    const list = readCollection('kategoriBahanBaku');
    list.push(newItem);
    writeCollection('kategoriBahanBaku', list);

    await addAuditLog(user?.name || 'Super Admin', user?.role || 'ADMIN', 'Tambah Kategori Bahan', `Pendaftaran kategori bahan baku baru: ${cleanNama}. Saved to MongoDB.`);

    return res.status(201).json({ success: true, message: `Kategori "${cleanNama}" berhasil ditambahkan ke MongoDB Atlas!`, data: mongoItem });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// PUT /api/kategori-bahan-baku/:id (Edit Kategori Bahan Baku + Cascade Update ke Bahan Baku)
exports.update = async (req, res) => {
  try {
    const { id } = req.params;
    const { nama, deskripsi, user } = req.body;
    if (!nama) {
      return res.status(400).json({ success: false, message: 'Nama kategori bahan baku wajib diisi.' });
    }

    const cleanNama = nama.trim();
    const oldCategory = await KategoriBahanBaku.findOne({ id });
    const oldName = oldCategory ? oldCategory.nama : null;

    const mongoItem = await KategoriBahanBaku.findOneAndUpdate(
      { id },
      { nama: cleanNama, deskripsi },
      { returnDocument: 'after' }
    );

    // Cascade update all BahanBaku documents in MongoDB Atlas using the old category name!
    if (oldName && oldName !== cleanNama) {
      await BahanBaku.updateMany({ kategori: oldName }, { kategori: cleanNama });

      let bahanList = readCollection('bahanBaku');
      bahanList = bahanList.map(b => b.kategori === oldName ? { ...b, kategori: cleanNama } : b);
      writeCollection('bahanBaku', bahanList);
    }

    const list = readCollection('kategoriBahanBaku');
    const index = list.findIndex(x => x.id === id);
    if (index !== -1) {
      list[index] = { ...list[index], nama: cleanNama, deskripsi };
      writeCollection('kategoriBahanBaku', list);
    }

    await addAuditLog(user?.name || 'Super Admin', user?.role || 'ADMIN', 'Update Kategori Bahan', `Pembaruan kategori bahan baku: "${oldName}" -> "${cleanNama}". Cascaded to MongoDB Atlas materials.`);

    return res.json({ success: true, message: `Kategori "${cleanNama}" berhasil diperbarui & disinkronkan ke seluruh bahan baku di MongoDB Atlas!`, data: mongoItem || list[index] });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// DELETE /api/kategori-bahan-baku/:id (Hapus Kategori Bahan Baku)
exports.remove = async (req, res) => {
  try {
    const { id } = req.params;
    const { user } = req.body;

    const mongoose = require('mongoose');
    if (mongoose.connection.readyState === 1) {
      const query = mongoose.Types.ObjectId.isValid(id) ? { $or: [{ id }, { _id: id }] } : { id };
      await KategoriBahanBaku.deleteMany(query);
    }

    let list = readCollection('kategoriBahanBaku');
    const target = list.find(x => x.id === id);
    list = list.filter(x => x.id !== id);
    writeCollection('kategoriBahanBaku', list);

    const katName = target ? target.nama : id;
    await addAuditLog(user?.name || 'Super Admin', user?.role || 'ADMIN', 'Hapus Kategori Bahan', `Menghapus kategori bahan baku: ${katName} dari MongoDB Atlas.`);

    return res.json({ success: true, message: `Kategori "${katName}" berhasil dihapus dari MongoDB Atlas!` });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
