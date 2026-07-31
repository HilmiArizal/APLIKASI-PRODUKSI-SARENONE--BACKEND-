const BrandProduk = require('../models/BrandProduk');
const { readCollection, writeCollection, addAuditLog } = require('../utils/dbHelper');
const connectDB = require('../config/db');

const DEFAULT_BRANDS = [
  { id: 'brand_1', nama: 'SAREN ONE', deskripsi: 'Daging olahan makanan beku', createdBy: 'System' },
  { id: 'brand_2', nama: 'EAT GOW', deskripsi: 'Daging olahan makanan beku', createdBy: 'System' },
  { id: 'brand_3', nama: 'BEULEUM', deskripsi: 'Daging olahan makanan beku', createdBy: 'System' }
];

// GET /api/brand-produk
exports.getBrandProduk = async (req, res) => {
  try {
    await connectDB();
    const mongoose = require('mongoose');
    if (mongoose.connection.readyState === 1) {
      let brands = await BrandProduk.find().sort({ createdAt: -1 });
      if (brands.length === 0) {
        try {
          await BrandProduk.insertMany(DEFAULT_BRANDS);
          brands = await BrandProduk.find().sort({ createdAt: -1 });
        } catch (e) {}
      }
      return res.json({ success: true, data: brands });
    }
    let brands = readCollection('brandProduk');
    if (brands.length === 0) {
      brands = DEFAULT_BRANDS;
      writeCollection('brandProduk', brands);
    }
    return res.json({ success: true, data: brands });
  } catch (err) {
    let brands = readCollection('brandProduk');
    if (brands.length === 0) brands = DEFAULT_BRANDS;
    return res.json({ success: true, data: brands });
  }
};

// POST /api/brand-produk
exports.createBrandProduk = async (req, res) => {
  try {
    await connectDB();
    const { nama, deskripsi } = req.body;
    if (!nama) return res.status(400).json({ success: false, message: 'Nama brand wajib diisi.' });

    const newBrandData = {
      id: `brand_${Date.now()}`,
      nama,
      deskripsi: deskripsi || '',
      createdBy: 'Super Admin Produk',
      createdAt: new Date().toISOString()
    };

    const mongoose = require('mongoose');
    let created = null;
    if (mongoose.connection.readyState === 1) {
      created = await BrandProduk.create(newBrandData);
    }

    const brands = readCollection('brandProduk');
    brands.unshift(newBrandData);
    writeCollection('brandProduk', brands);

    addAuditLog('Super Admin Produk', 'ADMIN_PRODUK', 'Tambah Brand', `Menambah brand baru: ${nama}.`);
    return res.json({ success: true, message: `Brand "${nama}" berhasil ditambahkan!`, data: created || newBrandData });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// PUT /api/brand-produk/:id
exports.updateBrandProduk = async (req, res) => {
  try {
    await connectDB();
    const { id } = req.params;
    const { nama, deskripsi } = req.body;

    const mongoose = require('mongoose');
    let updated = null;
    if (mongoose.connection.readyState === 1) {
      const query = mongoose.Types.ObjectId.isValid(id) ? { $or: [{ id }, { _id: id }] } : { id };
      updated = await BrandProduk.findOneAndUpdate(query, { $set: { nama, deskripsi } }, { returnDocument: 'after', new: true });
    }

    const brands = readCollection('brandProduk');
    const idx = brands.findIndex(b => b.id === id || b._id === id);
    if (idx !== -1) {
      if (nama) brands[idx].nama = nama;
      if (deskripsi !== undefined) brands[idx].deskripsi = deskripsi;
      writeCollection('brandProduk', brands);
    }

    addAuditLog('Super Admin Produk', 'ADMIN_PRODUK', 'Edit Brand', `Mengubah brand: ${nama}.`);
    return res.json({ success: true, message: 'Brand berhasil diperbarui!', data: updated || brands[idx] });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// DELETE /api/brand-produk/:id
exports.deleteBrandProduk = async (req, res) => {
  try {
    await connectDB();
    const { id } = req.params;
    const mongoose = require('mongoose');
    if (mongoose.connection.readyState === 1) {
      const query = mongoose.Types.ObjectId.isValid(id) ? { $or: [{ id }, { _id: id }] } : { id };
      await BrandProduk.deleteMany(query);
    }

    let brands = readCollection('brandProduk');
    const target = brands.find(b => b.id === id || b._id === id);
    brands = brands.filter(b => b.id !== id && b._id !== id);
    writeCollection('brandProduk', brands);

    addAuditLog('Super Admin Produk', 'ADMIN_PRODUK', 'Hapus Brand', `Menghapus brand ID ${id}.`);
    return res.json({ success: true, message: 'Brand berhasil dihapus.' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
