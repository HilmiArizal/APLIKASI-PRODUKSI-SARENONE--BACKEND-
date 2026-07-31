const KategoriProdukSales = require('../models/KategoriProdukSales');
const { readCollection, writeCollection, addAuditLog } = require('../utils/dbHelper');
const connectDB = require('../config/db');

const DEFAULT_CATEGORIES = [
  { id: 'kps_1', nama: 'Sosis', deskripsi: 'Kategori berbagai varian sosis', createdBy: 'System' },
  { id: 'kps_2', nama: 'Nugget', deskripsi: 'Kategori berbagai produk nugget', createdBy: 'System' },
  { id: 'kps_3', nama: 'Baso', deskripsi: 'Kategori baso sapi & olahan daging', createdBy: 'System' },
  { id: 'kps_4', nama: 'Roti & Pastry', deskripsi: 'Kategori olahan roti dan kue', createdBy: 'System' },
  { id: 'kps_5', nama: 'Daging Olahan', deskripsi: 'Kategori olahan daging lain', createdBy: 'System' },
  { id: 'kps_6', nama: 'Bumbu & Rempah', deskripsi: 'Kategori bumbu siap pakai', createdBy: 'System' },
  { id: 'kps_7', nama: 'Lainnya', deskripsi: 'Kategori produk umum', createdBy: 'System' }
];

// GET /api/kategori-produk-sales
exports.getAll = async (req, res) => {
  try {
    await connectDB();
    const mongoose = require('mongoose');
    if (mongoose.connection.readyState === 1) {
      let data = await KategoriProdukSales.find().sort({ createdAt: -1 });
      if (data.length === 0) {
        try {
          await KategoriProdukSales.insertMany(DEFAULT_CATEGORIES);
          data = await KategoriProdukSales.find().sort({ createdAt: -1 });
        } catch (e) {}
      }
      return res.json({ success: true, data });
    }
    let data = readCollection('kategoriProdukSales');
    if (data.length === 0) {
      data = DEFAULT_CATEGORIES;
      writeCollection('kategoriProdukSales', data);
    }
    return res.json({ success: true, data });
  } catch (err) {
    let data = readCollection('kategoriProdukSales');
    if (data.length === 0) data = DEFAULT_CATEGORIES;
    return res.json({ success: true, data });
  }
};

// POST /api/kategori-produk-sales
exports.create = async (req, res) => {
  try {
    await connectDB();
    const { nama, deskripsi } = req.body;
    if (!nama) return res.status(400).json({ success: false, message: 'Nama kategori wajib diisi.' });

    const newItem = {
      id: `kps_${Date.now()}`,
      nama,
      deskripsi: deskripsi || '',
      createdBy: 'Super Admin Produk',
      createdAt: new Date().toISOString()
    };

    const mongoose = require('mongoose');
    let created = null;
    if (mongoose.connection.readyState === 1) {
      created = await KategoriProdukSales.create(newItem);
    }

    const list = readCollection('kategoriProdukSales');
    list.unshift(newItem);
    writeCollection('kategoriProdukSales', list);

    addAuditLog('Super Admin Produk', 'ADMIN_PRODUK', 'Tambah Kategori Produk Sales', `Menambah kategori: ${nama}.`);
    return res.json({ success: true, message: `Kategori "${nama}" berhasil ditambahkan!`, data: created || newItem });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// PUT /api/kategori-produk-sales/:id
exports.update = async (req, res) => {
  try {
    await connectDB();
    const { id } = req.params;
    const { nama, deskripsi } = req.body;

    const mongoose = require('mongoose');
    let updated = null;
    if (mongoose.connection.readyState === 1) {
      const query = mongoose.Types.ObjectId.isValid(id) ? { $or: [{ id }, { _id: id }] } : { id };
      updated = await KategoriProdukSales.findOneAndUpdate(query, { $set: { nama, deskripsi } }, { returnDocument: 'after', new: true });
    }

    const list = readCollection('kategoriProdukSales');
    const idx = list.findIndex(b => b.id === id || b._id === id);
    if (idx !== -1) {
      if (nama) list[idx].nama = nama;
      if (deskripsi !== undefined) list[idx].deskripsi = deskripsi;
      writeCollection('kategoriProdukSales', list);
    }

    addAuditLog('Super Admin Produk', 'ADMIN_PRODUK', 'Edit Kategori Produk Sales', `Mengubah kategori: ${nama}.`);
    return res.json({ success: true, message: 'Kategori berhasil diperbarui!', data: updated || list[idx] });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// DELETE /api/kategori-produk-sales/:id
exports.delete = async (req, res) => {
  try {
    await connectDB();
    const { id } = req.params;
    const mongoose = require('mongoose');
    if (mongoose.connection.readyState === 1) {
      const query = mongoose.Types.ObjectId.isValid(id) ? { $or: [{ id }, { _id: id }] } : { id };
      await KategoriProdukSales.deleteMany(query);
    }

    let list = readCollection('kategoriProdukSales');
    list = list.filter(b => b.id !== id && b._id !== id);
    writeCollection('kategoriProdukSales', list);

    addAuditLog('Super Admin Produk', 'ADMIN_PRODUK', 'Hapus Kategori Produk Sales', `Menghapus kategori ID ${id}.`);
    return res.json({ success: true, message: 'Kategori berhasil dihapus.' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
