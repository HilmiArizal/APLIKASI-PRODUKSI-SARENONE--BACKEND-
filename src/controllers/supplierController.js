const Supplier = require('../models/Supplier');
const mongoose = require('mongoose');
const { readCollection, writeCollection, addAuditLog } = require('../utils/dbHelper');

const DEFAULT_SUPPLIERS = [];

// Seed default suppliers if empty
const seedDefaults = () => {
  // Manual input from 0
};

seedDefaults();

// GET /api/suppliers
exports.getAll = async (req, res) => {
  try {
    // Purge sample data from MongoDB Atlas cloud DB
    const sampleNames = [
      'PT Marksoy Indonesia',
      'CV Daging Utama',
      'PT Plastik & Kemasan Nusantara',
      'Toko Rempah & Bumbu Berkah',
      'Pabrik Es Batu Kristal Saren'
    ];

    if (mongoose.connection.readyState === 1) {
      try {
        await Supplier.deleteMany({
          $or: [
            { id: { $in: ['sup_1', 'sup_2', 'sup_3', 'sup_4', 'sup_5'] } },
            { nama: { $in: sampleNames } }
          ]
        });
      } catch (e) {}
    }

    let list = readCollection('suppliers');
    const cleaned = list.filter(x => !['sup_1', 'sup_2', 'sup_3', 'sup_4', 'sup_5'].includes(x.id) && !sampleNames.includes(x.nama));
    if (cleaned.length !== list.length) {
      writeCollection('suppliers', cleaned);
      list = cleaned;
    }

    if (mongoose.connection.readyState === 1) {
      try {
        list = await Supplier.find({
          id: { $nin: ['sup_1', 'sup_2', 'sup_3', 'sup_4', 'sup_5'] },
          nama: { $nin: sampleNames }
        }).sort({ kode: 1, nama: 1 });
      } catch (e) {}
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
    const { kode, nama, kontak, alamat, catatan, user } = req.body;
    if (!nama || !nama.trim()) {
      return res.status(400).json({ success: false, message: 'Nama supplier wajib diisi.' });
    }

    const list = readCollection('suppliers');
    const cleanNama = nama.trim();

    let cleanKode = (kode || '').trim().toUpperCase();
    if (!cleanKode) {
      cleanKode = 'S' + (list.length + 1);
    }

    const newRecord = {
      id: 'sup_' + Date.now(),
      kode: cleanKode,
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
    list.unshift(newRecord);
    writeCollection('suppliers', list);

    await addAuditLog(
      user?.name || 'Admin',
      user?.role || 'ADMIN',
      'Tambah Supplier Baru',
      `Menambahkan supplier "${cleanKode} - ${cleanNama}" ke master data.`
    );

    return res.json({ success: true, message: `Supplier [${cleanKode}] ${cleanNama} berhasil ditambahkan!`, data: newRecord });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// Helper for safe Mongo query without CastError on _id
const buildSupplierQuery = (id) => {
  const targetId = String(id);
  const queryOr = [{ id: targetId }];
  if (mongoose.Types.ObjectId.isValid(targetId)) {
    queryOr.push({ _id: targetId });
  }
  return { $or: queryOr };
};

// PUT /api/suppliers/:id
exports.update = async (req, res) => {
  try {
    const { id } = req.params;
    const { kode, nama, kontak, alamat, catatan, user } = req.body;
    if (!nama || !nama.trim()) {
      return res.status(400).json({ success: false, message: 'Nama supplier wajib diisi.' });
    }

    const list = readCollection('suppliers');
    const targetIdStr = String(id);
    const targetIdx = list.findIndex(x => String(x.id) === targetIdStr || String(x._id) === targetIdStr);
    const target = targetIdx !== -1 ? list[targetIdx] : null;

    let cleanKode = (kode || '').trim().toUpperCase();
    if (!cleanKode) {
      cleanKode = target ? target.kode : ('S' + (list.length + 1));
    }

    const cleanNama = nama.trim();
    let updated = null;

    if (mongoose.connection.readyState === 1) {
      try {
        updated = await Supplier.findOneAndUpdate(
          buildSupplierQuery(id),
          { kode: cleanKode, nama: cleanNama, kontak: kontak || '', alamat: alamat || '', catatan: catatan || '' },
          { new: true }
        );
      } catch (e) {
        console.error('Mongo update supplier error:', e.message);
      }
    }

    if (targetIdx !== -1) {
      list[targetIdx] = {
        ...list[targetIdx],
        kode: cleanKode,
        nama: cleanNama,
        kontak: kontak || '',
        alamat: alamat || '',
        catatan: catatan || ''
      };
      writeCollection('suppliers', list);
      if (!updated) updated = list[targetIdx];
    }

    if (!updated && targetIdx === -1) {
      return res.status(404).json({ success: false, message: 'Supplier tidak ditemukan.' });
    }

    await addAuditLog(
      user?.name || 'Admin',
      user?.role || 'ADMIN',
      'Edit Supplier',
      `Mengubah data supplier "${cleanNama}".`
    );

    return res.json({ success: true, message: `Data supplier "${cleanNama}" berhasil diperbarui!`, data: updated || (targetIdx !== -1 ? list[targetIdx] : null) });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// DELETE /api/suppliers/:id
exports.remove = async (req, res) => {
  try {
    const { id } = req.params;
    const { user } = req.body;
    const targetIdStr = String(id);

    if (mongoose.connection.readyState === 1) {
      try {
        await Supplier.deleteMany(buildSupplierQuery(id));
      } catch (e) {
        console.error('Mongo delete supplier error:', e.message);
      }
    }

    let list = readCollection('suppliers');
    const target = list.find(x => String(x.id) === targetIdStr || String(x._id) === targetIdStr);
    list = list.filter(x => String(x.id) !== targetIdStr && String(x._id) !== targetIdStr);
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
