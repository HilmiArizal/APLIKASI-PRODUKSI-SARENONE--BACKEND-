const KategoriProduk = require('../models/KategoriProduk');
const { readCollection, writeCollection, addAuditLog } = require('../utils/dbHelper');

const DEFAULT_KATEGORI_PRODUK = [
  { id: 'kat_1', nama: 'Roti Manis', deskripsi: 'Aneka olahan roti manis isi keju, cokelat, dan selai', createdAt: '2026-07-20 08:00' },
  { id: 'kat_2', nama: 'Kue & Cake', deskripsi: 'Aneka kue bolu, brownies, dan kue tart ulang tahun', createdAt: '2026-07-20 08:00' },
  { id: 'kat_3', nama: 'Pastry & Danish', deskripsi: 'Aneka olahan pastry renyah, butter croissant, dan puff', createdAt: '2026-07-20 08:00' },
  { id: 'kat_4', nama: 'Minuman & Kopi', deskripsi: 'Aneka olahan minuman kopi susu dan teh manis', createdAt: '2026-07-20 08:00' }
];

// GET /api/kategori-produk
exports.getAll = async (req, res) => {
  try {
    const list = await KategoriProduk.find().sort({ createdAt: 1 });
    return res.json({ success: true, data: list });
  } catch (err) {
    const fallback = readCollection('kategoriProduk');
    return res.json({ success: true, data: fallback });
  }
};

// POST /api/kategori-produk (Tambah Kategori Produk Baru)
exports.create = async (req, res) => {
  try {
    const { nama, deskripsi, user } = req.body;
    if (!nama) {
      return res.status(400).json({ success: false, message: 'Nama kategori produk wajib diisi.' });
    }

    const cleanNama = nama.trim();
    const existing = await KategoriProduk.findOne({ nama: new RegExp(`^${cleanNama}$`, 'i') });
    if (existing) {
      return res.status(400).json({ success: false, message: `Kategori "${cleanNama}" sudah pernah terdaftar di MongoDB Atlas!` });
    }

    const newItem = {
      id: 'kat_' + Date.now(),
      nama: cleanNama,
      deskripsi: deskripsi || 'Kategori produk olahan dapur',
      createdAt: new Date().toISOString()
    };

    const mongoItem = await KategoriProduk.create(newItem);

    const list = readCollection('kategoriProduk');
    list.push(newItem);
    writeCollection('kategoriProduk', list);

    await addAuditLog(user?.name || 'Super Admin', user?.role || 'ADMIN', 'Tambah Kategori', `Pendaftaran kategori produk baru: ${cleanNama}. Saved to MongoDB.`);

    return res.status(201).json({ success: true, message: `Kategori "${cleanNama}" berhasil ditambahkan ke MongoDB Atlas!`, data: mongoItem });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// PUT /api/kategori-produk/:id (Edit Kategori Produk + Cascade Update ke Produk)
exports.update = async (req, res) => {
  try {
    const { id } = req.params;
    const { nama, deskripsi, user } = req.body;
    if (!nama) {
      return res.status(400).json({ success: false, message: 'Nama kategori produk wajib diisi.' });
    }

    const cleanNama = nama.trim();
    const oldCategory = await KategoriProduk.findOne({ id });
    const oldName = oldCategory ? oldCategory.nama : null;

    const mongoItem = await KategoriProduk.findOneAndUpdate(
      { id },
      { nama: cleanNama, deskripsi },
      { returnDocument: 'after' }
    );

    // Cascade update all Produk documents in MongoDB Atlas using the old category name!
    if (oldName && oldName !== cleanNama) {
      await Produk.updateMany({ kategori: oldName }, { kategori: cleanNama });

      let produkList = readCollection('produk');
      produkList = produkList.map(p => p.kategori === oldName ? { ...p, kategori: cleanNama } : p);
      writeCollection('produk', produkList);
    }

    const list = readCollection('kategoriProduk');
    const index = list.findIndex(x => x.id === id);
    if (index !== -1) {
      list[index] = { ...list[index], nama: cleanNama, deskripsi };
      writeCollection('kategoriProduk', list);
    }

    await addAuditLog(user?.name || 'Super Admin', user?.role || 'ADMIN', 'Update Kategori', `Pembaruan kategori produk: "${oldName}" -> "${cleanNama}". Cascaded to MongoDB Atlas products.`);

    return res.json({ success: true, message: `Kategori "${cleanNama}" berhasil diperbarui & disinkronkan ke seluruh produk di MongoDB Atlas!`, data: mongoItem || list[index] });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// DELETE /api/kategori-produk/:id (Hapus Kategori Produk)
exports.remove = async (req, res) => {
  try {
    const { id } = req.params;
    const { user } = req.body;

    const mongoose = require('mongoose');
    if (mongoose.connection.readyState === 1) {
      const query = mongoose.Types.ObjectId.isValid(id) ? { $or: [{ id }, { _id: id }] } : { id };
      await KategoriProduk.deleteMany(query);
    }

    let list = readCollection('kategoriProduk');
    const target = list.find(x => x.id === id);
    list = list.filter(x => x.id !== id);
    writeCollection('kategoriProduk', list);

    const katName = target ? target.nama : id;
    await addAuditLog(user?.name || 'Super Admin', user?.role || 'ADMIN', 'Hapus Kategori', `Menghapus kategori produk: ${katName} dari MongoDB Atlas.`);

    return res.json({ success: true, message: `Kategori "${katName}" berhasil dihapus dari MongoDB Atlas!` });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
