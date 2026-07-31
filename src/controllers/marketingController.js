const Marketing = require('../models/Marketing');
const { readCollection, writeCollection, addAuditLog } = require('../utils/dbHelper');

const getWIBTimestamp = () => {
  const now = new Date();
  const wib = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  return `${wib.getFullYear()}-${String(wib.getMonth()+1).padStart(2,'0')}-${String(wib.getDate()).padStart(2,'0')} ${String(wib.getHours()).padStart(2,'0')}:${String(wib.getMinutes()).padStart(2,'0')}`;
};

// GET /api/marketing
exports.getAll = async (req, res) => {
  try {
    const mongoose = require('mongoose');
    if (mongoose.connection.readyState === 1) {
      const data = await Marketing.find().sort({ createdAt: -1 });
      return res.json({ success: true, data });
    }
    const data = readCollection('marketing');
    return res.json({ success: true, data });
  } catch (err) {
    const data = readCollection('marketing');
    return res.json({ success: true, data });
  }
};

// POST /api/marketing
exports.create = async (req, res) => {
  try {
    const mongoose = require('mongoose');
    const { user, ...body } = req.body;
    const now = getWIBTimestamp();
    const newId = 'MKT-' + Date.now();

    const newData = {
      id: newId,
      namaPromo: body.namaPromo,
      tipePromo: body.tipePromo || 'Diskon',
      deskripsi: body.deskripsi || '',
      nilaiDiskon: body.nilaiDiskon || 0,
      tipeNilai: body.tipeNilai || 'persen',
      targetProduk: body.targetProduk || 'Semua Produk',
      anggaranMarketing: body.anggaranMarketing || 0,
      realisasiAnggaran: body.realisasiAnggaran || 0,
      tanggalMulai: body.tanggalMulai,
      tanggalSelesai: body.tanggalSelesai,
      status: body.status || 'Aktif',
      channel: body.channel || '',
      targetPenjualan: body.targetPenjualan || 0,
      hasilPenjualan: body.hasilPenjualan || 0,
      catatan: body.catatan || '',
      createdBy: user?.name || 'Tim Marketing',
      createdAt: now
    };

    if (mongoose.connection.readyState === 1) {
      await Marketing.create(newData);
    }
    const list = readCollection('marketing');
    list.unshift(newData);
    writeCollection('marketing', list);

    addAuditLog(user?.name || 'Tim Marketing', user?.role || 'TIM_MARKETING', 'Buat Program Marketing', `Program: ${newData.namaPromo} (${newData.tipePromo}) — ${newData.tanggalMulai} s/d ${newData.tanggalSelesai}`);

    return res.status(201).json({ success: true, message: 'Program marketing berhasil dibuat!', data: newData });
  } catch (err) {
    console.error('Create marketing error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// PUT /api/marketing/:id
exports.update = async (req, res) => {
  try {
    const mongoose = require('mongoose');
    const { id } = req.params;
    const { user, ...body } = req.body;

    if (mongoose.connection.readyState === 1) {
      const query = mongoose.Types.ObjectId.isValid(id) ? { $or: [{ id }, { _id: id }] } : { id };
      await Marketing.findOneAndUpdate(query, body);
    }
    const list = readCollection('marketing');
    const idx = list.findIndex(d => d.id === id);
    if (idx !== -1) { list[idx] = { ...list[idx], ...body }; writeCollection('marketing', list); }

    return res.json({ success: true, message: 'Program marketing berhasil diperbarui!' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// DELETE /api/marketing/:id
exports.delete = async (req, res) => {
  try {
    const mongoose = require('mongoose');
    const { id } = req.params;
    const { user } = req.body;

    if (mongoose.connection.readyState === 1) {
      const query = mongoose.Types.ObjectId.isValid(id) ? { $or: [{ id }, { _id: id }] } : { id };
      await Marketing.deleteOne(query);
    }
    let list = readCollection('marketing');
    const target = list.find(d => d.id === id);
    list = list.filter(d => d.id !== id);
    writeCollection('marketing', list);

    addAuditLog(user?.name || 'Admin', user?.role || 'ADMIN_PRODUK', 'Hapus Program Marketing', `Hapus program: ${target?.namaPromo || id}`);
    return res.json({ success: true, message: 'Program marketing berhasil dihapus!' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
