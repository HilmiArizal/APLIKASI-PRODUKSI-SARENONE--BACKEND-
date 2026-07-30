const Supplier = require('../models/Supplier');
const mongoose = require('mongoose');
const { readCollection, writeCollection, addAuditLog } = require('../utils/jsonDb');

const DEFAULT_SUPPLIERS = [
  { id: 'sup_1', nama: 'PT Marksoy Indonesia', kontak: '0812-3456-7890', alamat: 'Jakarta', catatan: 'Pemasok utama tepung Marksoy & ISP' },
  { id: 'sup_2', nama: 'CV Daging Utama', kontak: '0813-9876-5432', alamat: 'Bandung', catatan: 'Pemasok karkas & daging giling MDM' },
  { id: 'sup_3', nama: 'PT Plastik & Kemasan Nusantara', kontak: '0811-2233-4455', alamat: 'Surabaya', catatan: 'Supplier vacumbag & stiker kemasan' },
  { id: 'sup_4', nama: 'Toko Rempah & Bumbu Berkah', kontak: '0815-6677-8899', alamat: 'Semarang', catatan: 'Pemasok bumbu racikan & minyak' },
  { id: 'sup_5', nama: 'Pabrik Es Batu Kristal Saren', kontak: '0819-0011-2233', alamat: 'Garut', catatan: 'Pemasok air es kristal harian' }
];

// Seed default suppliers if empty
const seedDefaults = () => {
  const current = readCollection('suppliers');
  if (current.length === 0) {
    writeCollection('suppliers', DEFAULT_SUPPLIERS);
  }
};

seedDefaults();

// GET /api/suppliers
exports.getAll = async (req, res) => {
  try {
    let list = [];
    if (mongoose.connection.readyState === 1) {
      try {
        list = await Supplier.find().sort({ nama: 1 });
        if (list.length === 0) {
          await Supplier.insertMany(DEFAULT_SUPPLIERS);
          list = await Supplier.find().sort({ nama: 1 });
        }
      } catch (e) {
        list = readCollection('suppliers');
      }
    } else {
      list = readCollection('suppliers');
      if (list.length === 0) {
        writeCollection('suppliers', DEFAULT_SUPPLIERS);
        list = DEFAULT_SUPPLIERS;
      }
    }
    return res.json({ success: true, data: list });
  } catch (err) {
    const fallback = readCollection('suppliers');
    return res.json({ success: true, data: fallback });
  }
};

// POST /api/suppliers
exports.create = async (req, res) => {
  try {
    const { nama, kontak, alamat, catatan, user } = req.body;
    if (!nama || !nama.trim()) {
      return res.status(400).json({ success: false, message: 'Nama supplier wajib diisi.' });
    }

    const cleanNama = nama.trim();
    const newRecord = {
      id: 'sup_' + Date.now(),
      nama: cleanNama,
      kontak: kontak || '',
      alamat: alamat || '',
      catatan: catatan || ''
    };

    // Mongo
    if (mongoose.connection.readyState === 1) {
      try { await Supplier.create(newRecord); } catch (e) {}
    }

    // JSON
    const list = readCollection('suppliers');
    const existing = list.find(x => x.nama.toLowerCase() === cleanNama.toLowerCase());
    if (existing) {
      return res.status(400).json({ success: false, message: `Supplier "${cleanNama}" sudah ada.` });
    }

    list.unshift(newRecord);
    writeCollection('suppliers', list);

    await addAuditLog(
      user?.name || 'Admin',
      user?.role || 'ADMIN',
      'Tambah Supplier Baru',
      `Menambahkan supplier "${cleanNama}" ke master data.`
    );

    return res.json({ success: true, message: `Supplier "${cleanNama}" berhasil ditambahkan!`, data: newRecord });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// PUT /api/suppliers/:id
exports.update = async (req, res) => {
  try {
    const { id } = req.params;
    const { nama, kontak, alamat, catatan, user } = req.body;
    if (!nama || !nama.trim()) {
      return res.status(400).json({ success: false, message: 'Nama supplier wajib diisi.' });
    }

    const cleanNama = nama.trim();
    let updated = null;

    if (mongoose.connection.readyState === 1) {
      try {
        updated = await Supplier.findOneAndUpdate(
          { $or: [{ id }, { _id: id }] },
          { nama: cleanNama, kontak, alamat, catatan },
          { new: true }
        );
      } catch (e) {}
    }

    const list = readCollection('suppliers');
    const idx = list.findIndex(x => x.id === id);
    if (idx !== -1) {
      list[idx] = { ...list[idx], nama: cleanNama, kontak: kontak || '', alamat: alamat || '', catatan: catatan || '' };
      writeCollection('suppliers', list);
      if (!updated) updated = list[idx];
    }

    if (!updated) {
      return res.status(404).json({ success: false, message: 'Supplier tidak ditemukan.' });
    }

    await addAuditLog(
      user?.name || 'Admin',
      user?.role || 'ADMIN',
      'Edit Supplier',
      `Mengubah data supplier "${cleanNama}".`
    );

    return res.json({ success: true, message: `Data supplier "${cleanNama}" berhasil diperbarui!`, data: updated });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// DELETE /api/suppliers/:id
exports.remove = async (req, res) => {
  try {
    const { id } = req.params;
    const { user } = req.body;

    if (mongoose.connection.readyState === 1) {
      try { await Supplier.deleteMany({ $or: [{ id }, { _id: id }] }); } catch (e) {}
    }

    let list = readCollection('suppliers');
    const target = list.find(x => x.id === id);
    list = list.filter(x => x.id !== id);
    writeCollection('suppliers', list);

    await addAuditLog(
      user?.name || 'Admin',
      user?.role || 'ADMIN',
      'Hapus Supplier',
      `Menghapus supplier "${target ? target.nama : id}" dari master data.`
    );

    return res.json({ success: true, message: 'Supplier berhasil dihapus.' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
