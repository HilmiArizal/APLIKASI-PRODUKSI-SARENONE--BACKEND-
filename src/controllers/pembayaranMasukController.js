const PembayaranMasuk = require('../models/PembayaranMasuk');
const Pelanggan = require('../models/Pelanggan');
const Penjualan = require('../models/Penjualan');
const { readCollection, writeCollection, addAuditLog } = require('../utils/dbHelper');

const getWIBTimestamp = () => {
  const now = new Date();
  const wib = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  return `${wib.getFullYear()}-${String(wib.getMonth()+1).padStart(2,'0')}-${String(wib.getDate()).padStart(2,'0')} ${String(wib.getHours()).padStart(2,'0')}:${String(wib.getMinutes()).padStart(2,'0')}`;
};

// GET /api/pembayaran-masuk
exports.getAll = async (req, res) => {
  try {
    const mongoose = require('mongoose');
    if (mongoose.connection.readyState === 1) {
      const data = await PembayaranMasuk.find().sort({ createdAt: -1 });
      return res.json({ success: true, data });
    }
    const data = readCollection('pembayaranMasuk');
    return res.json({ success: true, data });
  } catch (err) {
    const data = readCollection('pembayaranMasuk');
    return res.json({ success: true, data });
  }
};

// POST /api/pembayaran-masuk
exports.create = async (req, res) => {
  try {
    const mongoose = require('mongoose');
    const { user, ...body } = req.body;
    const now = getWIBTimestamp();
    const newId = 'PAY-' + Date.now();
    const noBukti = 'PAY-' + now.replace(/[-: ]/g, '').substring(0, 12);
    const amount = Number(body.jumlahBayar) || 0;

    if (!body.namaPelanggan || amount <= 0) {
      return res.status(400).json({ success: false, message: 'Nama pelanggan & jumlah pembayaran wajib diisi!' });
    }

    const newData = {
      id: newId,
      noBukti: body.noBukti || noBukti,
      pelangganId: body.pelangganId || '',
      kodePelanggan: body.kodePelanggan || '',
      namaPelanggan: body.namaPelanggan,
      noFaktur: body.noFaktur || '',
      tanggal: body.tanggal || now,
      jumlahBayar: amount,
      metodePembayaran: body.metodePembayaran || 'Transfer Bank',
      noReferensi: body.noReferensi || '',
      catatan: body.catatan || '',
      createdBy: user?.name || 'Tim Penjualan',
      createdAt: now
    };

    if (mongoose.connection.readyState === 1) {
      await PembayaranMasuk.create(newData);

      // Reduce Customer's active piutang in MongoDB Atlas
      if (body.pelangganId) {
        const query = mongoose.Types.ObjectId.isValid(body.pelangganId)
          ? { $or: [{ _id: body.pelangganId }, { id: body.pelangganId }] }
          : { nama: body.namaPelanggan };
        
        await Pelanggan.findOneAndUpdate(query, { $inc: { totalPiutang: -amount } });
      }

      // If linked to specific invoice, update statusPembayaran
      if (body.noFaktur) {
        await Penjualan.findOneAndUpdate({ noFaktur: body.noFaktur }, { statusPembayaran: 'Lunas' });
      }
    }

    const list = readCollection('pembayaranMasuk');
    list.unshift(newData);
    writeCollection('pembayaranMasuk', list);

    // Also update local json pelanggan backup
    if (body.pelangganId) {
      const pList = readCollection('pelanggan');
      const idx = pList.findIndex(p => p.id === body.pelangganId || (p._id && p._id.toString() === body.pelangganId) || p.nama === body.namaPelanggan);
      if (idx !== -1) {
        pList[idx].totalPiutang = Math.max(0, (Number(pList[idx].totalPiutang) || 0) - amount);
        writeCollection('pelanggan', pList);
      }
    }

    addAuditLog(user?.name || 'Tim Penjualan', user?.role || 'TIM_PENJUALAN', 'Catat Pembayaran Masuk', `Pembayaran masuk ${newData.noBukti} dari ${newData.namaPelanggan} sebesar Rp ${amount.toLocaleString('id-ID')}`);

    return res.status(201).json({ success: true, message: 'Pembayaran masuk berhasil dicatat!', data: newData });
  } catch (err) {
    console.error('Create pembayaran masuk error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// DELETE /api/pembayaran-masuk/:id
exports.delete = async (req, res) => {
  try {
    const mongoose = require('mongoose');
    const { id } = req.params;
    const { user } = req.body;

    let target = null;
    if (mongoose.connection.readyState === 1) {
      const query = mongoose.Types.ObjectId.isValid(id) ? { $or: [{ id }, { _id: id }] } : { id };
      target = await PembayaranMasuk.findOne(query);
      if (target) {
        await PembayaranMasuk.deleteOne(query);
        // Revert piutang amount
        if (target.pelangganId && target.jumlahBayar) {
          const pQuery = mongoose.Types.ObjectId.isValid(target.pelangganId)
            ? { $or: [{ _id: target.pelangganId }, { id: target.pelangganId }] }
            : { nama: target.namaPelanggan };
          await Pelanggan.findOneAndUpdate(pQuery, { $inc: { totalPiutang: target.jumlahBayar } });
        }
      }
    }

    let list = readCollection('pembayaranMasuk');
    if (!target) target = list.find(d => d.id === id);
    list = list.filter(d => d.id !== id);
    writeCollection('pembayaranMasuk', list);

    addAuditLog(user?.name || 'Admin', user?.role || 'TIM_PENJUALAN', 'Hapus Pembayaran Masuk', `Hapus pembayaran: ${target?.noBukti || id}`);
    return res.json({ success: true, message: 'Pembayaran masuk berhasil dihapus!' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
