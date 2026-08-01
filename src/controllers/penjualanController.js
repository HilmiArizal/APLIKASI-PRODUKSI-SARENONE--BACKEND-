const Penjualan = require('../models/Penjualan');
const Pelanggan = require('../models/Pelanggan');
const { readCollection, writeCollection, addAuditLog } = require('../utils/dbHelper');

const getWIBTimestamp = () => {
  const now = new Date();
  const wib = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  return `${wib.getFullYear()}-${String(wib.getMonth()+1).padStart(2,'0')}-${String(wib.getDate()).padStart(2,'0')} ${String(wib.getHours()).padStart(2,'0')}:${String(wib.getMinutes()).padStart(2,'0')}`;
};

// GET /api/penjualan
exports.getAll = async (req, res) => {
  try {
    const mongoose = require('mongoose');
    if (mongoose.connection.readyState === 1) {
      const data = await Penjualan.find().sort({ createdAt: -1 });
      return res.json({ success: true, data });
    }
    const data = readCollection('penjualan');
    return res.json({ success: true, data });
  } catch (err) {
    const data = readCollection('penjualan');
    return res.json({ success: true, data });
  }
};

// POST /api/penjualan
exports.create = async (req, res) => {
  try {
    const mongoose = require('mongoose');
    const { user, ...body } = req.body;
    const now = getWIBTimestamp();
    const newId = 'PJL-' + Date.now();
    const noFaktur = 'INV-' + now.replace(/[-: ]/g, '').substring(0, 12);

    const newData = {
      id: newId,
      noFaktur: body.noFaktur || noFaktur,
      tanggal: body.tanggal || now,
      pelangganId: body.pelangganId || '',
      namaPelanggan: body.namaPelanggan,
      kategoriCustomer: body.kategoriCustomer || 'Umum',
      teleponPelanggan: body.teleponPelanggan || '',
      alamatPelanggan: body.alamatPelanggan || '',
      items: body.items || [],
      totalHarga: body.totalHarga || 0,
      diskon: body.diskon || 0,
      totalBersih: body.totalBersih || 0,
      metodePembayaran: body.metodePembayaran || 'Tunai',
      statusPembayaran: body.statusPembayaran || 'Lunas',
      catatan: body.catatan || '',
      createdBy: user?.name || 'Tim Penjualan',
      createdAt: now
    };

    if (mongoose.connection.readyState === 1) {
      await Penjualan.create(newData);

      // If Tempo or credit sale, update Customer's active piutang in MongoDB
      if (body.pelangganId && (body.statusPembayaran === 'Tempo' || body.metodePembayaran === 'Tempo')) {
        const query = mongoose.Types.ObjectId.isValid(body.pelangganId) ? { $or: [{ _id: body.pelangganId }, { id: body.pelangganId }] } : { nama: body.namaPelanggan };
        await Pelanggan.findOneAndUpdate(query, { $inc: { totalPiutang: body.totalBersih || 0 } });
      }
    }
    const list = readCollection('penjualan');
    list.unshift(newData);
    writeCollection('penjualan', list);

    addAuditLog(user?.name || 'Tim Penjualan', user?.role || 'TIM_PENJUALAN', 'Catat Penjualan', `Penjualan ${newData.noFaktur} ke ${newData.namaPelanggan} (${newData.kategoriCustomer}), Total Rp ${newData.totalBersih.toLocaleString('id-ID')}`);

    return res.status(201).json({ success: true, message: 'Penjualan berhasil dicatat!', data: newData });
  } catch (err) {
    console.error('Create penjualan error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// PUT /api/penjualan/:id
exports.update = async (req, res) => {
  try {
    const mongoose = require('mongoose');
    const { id } = req.params;
    const { user, ...body } = req.body;

    if (mongoose.connection.readyState === 1) {
      const query = mongoose.Types.ObjectId.isValid(id) ? { $or: [{ id }, { _id: id }] } : { id };
      await Penjualan.findOneAndUpdate(query, body);
    }
    const list = readCollection('penjualan');
    const idx = list.findIndex(d => d.id === id);
    if (idx !== -1) { list[idx] = { ...list[idx], ...body }; writeCollection('penjualan', list); }

    return res.json({ success: true, message: 'Penjualan berhasil diperbarui!' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// DELETE /api/penjualan/:id
exports.delete = async (req, res) => {
  try {
    const mongoose = require('mongoose');
    const { id } = req.params;
    const { user } = req.body;

    if (mongoose.connection.readyState === 1) {
      const query = mongoose.Types.ObjectId.isValid(id) ? { $or: [{ id }, { _id: id }] } : { id };
      await Penjualan.deleteOne(query);
    }
    let list = readCollection('penjualan');
    const target = list.find(d => d.id === id);
    list = list.filter(d => d.id !== id);
    writeCollection('penjualan', list);

    addAuditLog(user?.name || 'Admin', user?.role || 'TIM_PENJUALAN', 'Hapus Penjualan', `Hapus penjualan: ${target?.noFaktur || id}`);
    return res.json({ success: true, message: 'Penjualan berhasil dihapus!' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
