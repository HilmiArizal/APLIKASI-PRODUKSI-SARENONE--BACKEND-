const Produk = require('../models/Produk');
const Resep = require('../models/Resep');
const { readCollection, writeCollection, addAuditLog } = require('../utils/dbHelper');

// GET /api/produk
exports.getAll = async (req, res) => {
  try {
    const list = await Produk.find().sort({ createdAt: -1 });
    return res.json({ success: true, data: list });
  } catch (err) {
    const fallback = readCollection('produk');
    return res.json({ success: true, data: fallback });
  }
};

// POST /api/produk
exports.create = async (req, res) => {
  try {
    const { sku, nama, kategori, harga, stok, user } = req.body;
    if (!nama || !sku) {
      return res.status(400).json({ success: false, message: 'SKU dan Nama Produk wajib diisi.' });
    }

    const newId = 'p_' + Date.now();
    const newItem = {
      id: newId,
      sku,
      nama,
      kategori: kategori || 'Roti Manis',
      harga: parseFloat(harga) || 0,
      stok: parseInt(stok) || 0
    };

    const mongoItem = await Produk.create(newItem);

    // Initialize empty recipe in MongoDB
    await Resep.create({ produkId: newId, items: [] });

    // Fallback JSON sync
    const list = readCollection('produk');
    list.push(newItem);
    writeCollection('produk', list);

    const resep = readCollection('resep');
    resep[newId] = [];
    writeCollection('resep', resep);

    await addAuditLog(user?.name || 'Super Admin', user?.role || 'ADMIN', 'Tambah Produk', `Pendaftaran produk baru: ${nama} (${sku}). Saved to MongoDB Atlas.`);

    return res.status(201).json({ success: true, message: 'Produk berhasil ditambahkan ke MongoDB Atlas.', data: mongoItem });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// PUT /api/produk/:id
exports.update = async (req, res) => {
  try {
    const { id } = req.params;
    const { sku, nama, kategori, harga, stok, user } = req.body;

    const mongoItem = await Produk.findOneAndUpdate(
      { id },
      { sku, nama, kategori, harga: parseFloat(harga), stok: parseInt(stok) },
      { returnDocument: 'after' }
    );

    const list = readCollection('produk');
    const index = list.findIndex(x => x.id === id);
    if (index !== -1) {
      list[index] = { ...list[index], sku, nama, kategori, harga, stok };
      writeCollection('produk', list);
    }

    await addAuditLog(user?.name || 'Super Admin', user?.role || 'ADMIN', 'Update Produk', `Pembaruan katalog produk: ${nama} di MongoDB Atlas.`);

    return res.json({ success: true, message: 'Data produk diperbarui di MongoDB Atlas.', data: mongoItem || list[index] });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// DELETE /api/produk/:id
exports.remove = async (req, res) => {
  try {
    const { id } = req.params;
    const { user } = req.body;

    const mongoose = require('mongoose');
    if (mongoose.connection.readyState === 1) {
      const query = mongoose.Types.ObjectId.isValid(id) ? { $or: [{ id }, { _id: id }] } : { id };
      await Produk.deleteMany(query);
      await Resep.deleteMany({ produkId: id });
    }

    let list = readCollection('produk');
    const target = list.find(x => x.id === id);
    list = list.filter(x => x.id !== id);
    writeCollection('produk', list);

    await addAuditLog(user?.name || 'Super Admin', user?.role || 'ADMIN', 'Hapus Produk', `Menghapus produk ${target ? target.nama : id} dari MongoDB Atlas.`);

    return res.json({ success: true, message: 'Produk & resep berhasil dihapus dari MongoDB Atlas.' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
