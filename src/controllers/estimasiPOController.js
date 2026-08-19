/**
 * ============================================================================
 * ESTIMASI PO (PURCHASE ORDER & PRODUCTION DEMAND ESTIMATION) CONTROLLER
 * Domain: Tim Penjualan (Input) & Super Admin / Tim Produk (Review & Execute)
 * Features:
 *  1. Registrasi Estimasi PO dari Tim Penjualan / Sales
 *  2. Review Demand & Status Approval (SUBMITTED, APPROVED, DIPROSES, SELESAI, DIBATALKAN)
 *  3. Dual Storage Priority: MongoDB Cloud + JSON File Backup
 * ============================================================================
 */

const mongoose = require('mongoose');
const EstimasiPO = require('../models/EstimasiPO');
const { readCollection, writeCollection, addAuditLog } = require('../utils/dbHelper');

// ==================== 1. FETCH ALL ESTIMASI PO ====================
// GET /api/estimasi-po
exports.getAll = async (req, res) => {
  try {
    let mongoList = [];
    if (mongoose.connection.readyState === 1) {
      try {
        mongoList = await EstimasiPO.find().sort({ createdAt: -1 });
      } catch (e) {
        console.warn('Fetch mongo estimasi PO note:', e.message);
      }
    }

    const jsonList = readCollection('estimasiPO');
    const finalData = mongoList.length > 0 ? mongoList : jsonList;

    return res.json({ success: true, data: finalData });
  } catch (err) {
    const fallback = readCollection('estimasiPO');
    return res.json({ success: true, data: fallback });
  }
};

// ==================== 2. CREATE NEW ESTIMASI PO ====================
// POST /api/estimasi-po
exports.create = async (req, res) => {
  try {
    const { noEstimasi, tanggalEstimasi, pelangganNama, salesName, items, catatan, user } = req.body;

    if (!pelangganNama || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'Pelanggan/Klien dan minimal 1 item produk wajib diisi!' });
    }

    const todayStr = new Date().toISOString().split('T')[0];
    const poNum = noEstimasi || `EST-${todayStr.replace(/-/g, '')}-${Math.floor(100 + Math.random() * 900)}`;

    const newRecord = {
      id: 'est_' + Date.now(),
      noEstimasi: poNum,
      tanggalEstimasi: tanggalEstimasi || todayStr,
      pelangganNama: pelangganNama.trim(),
      salesName: salesName || user?.name || 'Tim Penjualan',
      items: items.map(it => ({
        produkId: it.produkId || '',
        produkNama: it.produkNama || 'Produk',
        produkSku: it.produkSku || '',
        jumlahPcs: Number(it.jumlahPcs) || 0,
        catatanItem: it.catatanItem || ''
      })).filter(it => it.jumlahPcs > 0),
      catatan: catatan || '',
      status: 'SUBMITTED'
    };

    if (newRecord.items.length === 0) {
      return res.status(400).json({ success: false, message: 'Jumlah Pcs item harus lebih dari 0!' });
    }

    // 1. Save Mongo
    if (mongoose.connection.readyState === 1) {
      try {
        await EstimasiPO.create(newRecord);
      } catch (e) {
        console.warn('Mongo create EstimasiPO note:', e.message);
      }
    }

    // 2. Save JSON
    const jsonList = readCollection('estimasiPO');
    jsonList.unshift(newRecord);
    writeCollection('estimasiPO', jsonList);

    const totalPcs = newRecord.items.reduce((acc, curr) => acc + curr.jumlahPcs, 0);

    await addAuditLog(
      user?.name || newRecord.salesName,
      user?.role || 'TIM_PENJUALAN',
      'Pengajuan Estimasi PO Baru',
      `Estimasi PO ${newRecord.noEstimasi} untuk ${newRecord.pelangganNama}: Total ${totalPcs} pcs dari ${newRecord.items.length} jenis produk.`
    );

    return res.json({
      success: true,
      message: `Estimasi PO ${newRecord.noEstimasi} berhasil diajukan ke Tim Produk!`,
      data: newRecord
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ==================== 3. UPDATE STATUS ESTIMASI PO ====================
// PATCH /api/estimasi-po/:id/status
exports.updateStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, user } = req.body;

    const validStatuses = ['SUBMITTED', 'APPROVED', 'DIPROSES', 'SELESAI', 'DIBATALKAN'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Status estimasi PO tidak valid.' });
    }

    let updatedRecord = null;

    // Mongo Update
    if (mongoose.connection.readyState === 1) {
      try {
        const queryOr = [{ id }, { noEstimasi: id }];
        if (mongoose.Types.ObjectId.isValid(id)) queryOr.push({ _id: id });
        const doc = await EstimasiPO.findOne({ $or: queryOr });
        if (doc) {
          doc.status = status;
          await doc.save();
          updatedRecord = doc.toObject ? doc.toObject() : doc;
        }
      } catch (e) {}
    }

    // JSON Update
    const jsonList = readCollection('estimasiPO');
    const idx = jsonList.findIndex(x => x.id === id || x._id === id || x.noEstimasi === id);
    if (idx !== -1) {
      jsonList[idx].status = status;
      writeCollection('estimasiPO', jsonList);
      if (!updatedRecord) updatedRecord = jsonList[idx];
    }

    if (!updatedRecord) {
      return res.status(404).json({ success: false, message: 'Estimasi PO tidak ditemukan.' });
    }

    await addAuditLog(
      user?.name || 'Super Admin Produk',
      user?.role || 'ADMIN_PRODUK',
      'Update Status Estimasi PO',
      `Estimasi PO ${updatedRecord.noEstimasi} (${updatedRecord.pelangganNama}) diperbarui statusnya menjadi: ${status}.`
    );

    return res.json({
      success: true,
      message: `Status Estimasi PO ${updatedRecord.noEstimasi} berhasil diubah ke ${status}!`,
      data: updatedRecord
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ==================== 4. DELETE ESTIMASI PO ====================
// DELETE /api/estimasi-po/:id
exports.remove = async (req, res) => {
  try {
    const { id } = req.params;
    const { user } = req.body;

    if (mongoose.connection.readyState === 1) {
      try {
        const queryOrDel = [{ id }, { noEstimasi: id }];
        if (mongoose.Types.ObjectId.isValid(id)) queryOrDel.push({ _id: id });
        await EstimasiPO.deleteMany({ $or: queryOrDel });
      } catch (e) {}
    }

    let jsonList = readCollection('estimasiPO');
    jsonList = jsonList.filter(x => x.id !== id && x._id !== id && x.noEstimasi !== id);
    writeCollection('estimasiPO', jsonList);

    await addAuditLog(
      user?.name || 'Admin',
      user?.role || 'ADMIN',
      'Hapus Estimasi PO',
      `Menghapus dokumen Estimasi PO ID/No "${id}".`
    );

    return res.json({ success: true, message: `Estimasi PO berhasil dihapus!` });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
