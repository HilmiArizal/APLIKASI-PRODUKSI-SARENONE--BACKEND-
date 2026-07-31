const ProdukSales = require('../models/ProdukSales');
const { readCollection, writeCollection, addAuditLog } = require('../utils/dbHelper');

const getWIBTimestamp = () => {
  const now = new Date();
  const wib = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  return `${wib.getFullYear()}-${String(wib.getMonth()+1).padStart(2,'0')}-${String(wib.getDate()).padStart(2,'0')} ${String(wib.getHours()).padStart(2,'0')}:${String(wib.getMinutes()).padStart(2,'0')}`;
};

// GET /api/produk-sales
exports.getAll = async (req, res) => {
  try {
    const mongoose = require('mongoose');
    if (mongoose.connection.readyState === 1) {
      const data = await ProdukSales.find().sort({ createdAt: -1 });
      return res.json({ success: true, data });
    }
    const data = readCollection('produkSales');
    return res.json({ success: true, data });
  } catch (err) {
    const data = readCollection('produkSales');
    return res.json({ success: true, data });
  }
};

// POST /api/produk-sales
exports.create = async (req, res) => {
  try {
    const mongoose = require('mongoose');
    const { user, ...body } = req.body;
    const now = getWIBTimestamp();
    const newId = 'PSL-' + Date.now();
    const sku = body.sku || ('SKU-' + String(Math.floor(100 + Math.random() * 900)));

    const newData = {
      id: newId,
      sku,
      namaProduk: body.namaProduk,
      varian: body.varian || '',
      gramasi: body.gramasi || '',
      kategori: body.kategori || 'Umum',
      hargaJual: parseFloat(body.hargaJual) || 0,
      stokReady: parseFloat(body.stokReady) || 0,
      deskripsi: body.deskripsi || '',
      status: body.status || 'Tersedia',
      createdBy: user?.name || 'Super Admin Produk',
      createdAt: now
    };

    if (mongoose.connection.readyState === 1) {
      await ProdukSales.create(newData);
    }
    const list = readCollection('produkSales');
    list.unshift(newData);
    writeCollection('produkSales', list);

    addAuditLog(user?.name || 'Super Admin Produk', user?.role || 'ADMIN_PRODUK', 'Tambah Katalog Produk Jual', `Produk: ${newData.namaProduk} (Varian: ${newData.varian}, Gramasi: ${newData.gramasi}) — Rp ${newData.hargaJual.toLocaleString('id-ID')}`);

    return res.status(201).json({ success: true, message: 'Produk katalog berhasil ditambahkan!', data: newData });
  } catch (err) {
    console.error('Create produk sales error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// PUT /api/produk-sales/:id
exports.update = async (req, res) => {
  try {
    const mongoose = require('mongoose');
    const { id } = req.params;
    const { user, ...body } = req.body;

    if (mongoose.connection.readyState === 1) {
      const query = mongoose.Types.ObjectId.isValid(id) ? { $or: [{ id }, { _id: id }] } : { id };
      await ProdukSales.findOneAndUpdate(query, body);
    }
    const list = readCollection('produkSales');
    const idx = list.findIndex(d => d.id === id);
    if (idx !== -1) { list[idx] = { ...list[idx], ...body }; writeCollection('produkSales', list); }

    addAuditLog(user?.name || 'Super Admin Produk', user?.role || 'ADMIN_PRODUK', 'Update Katalog Produk Jual', `Update produk: ${body.namaProduk || id}`);

    return res.json({ success: true, message: 'Produk katalog berhasil diperbarui!' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// DELETE /api/produk-sales/:id
exports.delete = async (req, res) => {
  try {
    const mongoose = require('mongoose');
    const { id } = req.params;
    const { user } = req.body;

    if (mongoose.connection.readyState === 1) {
      const query = mongoose.Types.ObjectId.isValid(id) ? { $or: [{ id }, { _id: id }] } : { id };
      await ProdukSales.deleteOne(query);
    }
    let list = readCollection('produkSales');
    const target = list.find(d => d.id === id);
    list = list.filter(d => d.id !== id);
    writeCollection('produkSales', list);

    addAuditLog(user?.name || 'Admin', user?.role || 'ADMIN_PRODUK', 'Hapus Produk Katalog Jual', `Hapus produk: ${target?.namaProduk || id}`);
    return res.json({ success: true, message: 'Produk katalog berhasil dihapus!' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
