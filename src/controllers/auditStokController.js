const AuditStokFisik = require('../models/AuditStokFisik');
const AuditLog = require('../models/AuditLog');

// GET /api/audit-stok - Fetch Audit Logs with optional month filter (e.g. ?bulan=2026-08)
exports.getAuditStokList = async (req, res) => {
  try {
    const { bulan } = req.query;
    let query = {};
    if (bulan) {
      query.tanggal = { $regex: `^${bulan}` };
    }

    const list = await AuditStokFisik.find(query).sort({ tanggal: -1, createdAt: -1 });
    return res.status(200).json({
      success: true,
      data: list
    });
  } catch (error) {
    console.error('Error in getAuditStokList:', error);
    return res.status(500).json({
      success: false,
      message: 'Gagal mengambil data riwayat stok fisik',
      error: error.message
    });
  }
};

// POST /api/audit-stok - Save Physical Stock Snapshot (Single or Batch Array from Excel)
// NOTE: System BOM stock is NOT altered!
exports.saveAuditStok = async (req, res) => {
  try {
    // If request body is an Array (Bulk Upload from Excel)
    if (Array.isArray(req.body)) {
      const recordsToInsert = req.body.map(item => ({
        tanggal: item.tanggal,
        bahanId: item.bahanId ? String(item.bahanId) : null,
        bahanNama: item.bahanNama,
        satuan: item.satuan || 'kg',
        stokSistem: Number(item.stokSistem) || 0,
        stokFisik: Number(item.stokFisik) || 0,
        selisihQty: Number(item.selisihQty) || 0,
        susutPct: Number(item.susutPct) || 0,
        hargaSatuan: Number(item.hargaSatuan) || 0,
        nilaiSusutRp: Number(item.nilaiSusutRp) || 0,
        keterangan: item.keterangan || 'Upload Excel Stok Fisik',
        auditor: item.auditor || 'Tim Opname Gudang'
      }));

      const inserted = await AuditStokFisik.insertMany(recordsToInsert);

      // Log activity
      try {
        const logEntry = new AuditLog({
          user: req.body[0]?.auditor || 'System User',
          action: 'UPLOAD_STOK_FISIK_EXCEL',
          details: `Upload Excel Stok Fisik: ${inserted.length} item bahan baku tercatat pertanggal ${req.body[0]?.tanggal || 'hari ini'}. Stok BOM Sistem tidak diubah.`
        });
        await logEntry.save();
      } catch (e) {}

      return res.status(201).json({
        success: true,
        message: `Berhasil mengupload ${inserted.length} data stok fisik ke database!`,
        data: inserted
      });
    }

    // Single Record Save
    const {
      tanggal,
      bahanId,
      bahanNama,
      satuan,
      stokSistem,
      stokFisik,
      selisihQty,
      susutPct,
      hargaSatuan,
      nilaiSusutRp,
      keterangan,
      auditor
    } = req.body;

    if (!tanggal || !bahanNama || stokFisik === undefined || stokFisik === null) {
      return res.status(400).json({
        success: false,
        message: 'Tanggal, nama bahan, dan stok fisik wajib diisi!'
      });
    }

    const newAudit = new AuditStokFisik({
      tanggal,
      bahanId,
      bahanNama,
      satuan: satuan || 'kg',
      stokSistem: Number(stokSistem) || 0,
      stokFisik: Number(stokFisik) || 0,
      selisihQty: Number(selisihQty) || 0,
      susutPct: Number(susutPct) || 0,
      hargaSatuan: Number(hargaSatuan) || 0,
      nilaiSusutRp: Number(nilaiSusutRp) || 0,
      keterangan: keterangan || 'Catatan Opname Fisik',
      auditor: auditor || 'Tim Opname Gudang'
    });

    const savedRecord = await newAudit.save();

    // RECORD TO AUDIT LOG
    try {
      const logEntry = new AuditLog({
        user: auditor || 'System User',
        action: 'CATAT_STOK_FISIK',
        details: `Pencatatan Stok Fisik ${bahanNama} (${tanggal}): Stok Sistem ${stokSistem} ${satuan} vs Stok Fisik ${stokFisik} ${satuan} (Selisih: ${selisihQty} ${satuan}). Stok BOM Sistem tidak diubah.`
      });
      await logEntry.save();
    } catch (e) {}

    return res.status(201).json({
      success: true,
      message: `Data stok fisik ${bahanNama} (${tanggal}) berhasil dicatat! (Stok BOM Sistem Tetap Utuh).`,
      data: savedRecord
    });
  } catch (error) {
    console.error('Error in saveAuditStok:', error);
    return res.status(500).json({
      success: false,
      message: 'Gagal menyimpan data stok fisik',
      error: error.message
    });
  }
};

// DELETE /api/audit-stok/:id - Delete Audit Log
exports.deleteAuditStok = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await AuditStokFisik.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: 'Data riwayat stok fisik tidak ditemukan!'
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Data riwayat stok fisik berhasil dihapus'
    });
  } catch (error) {
    console.error('Error in deleteAuditStok:', error);
    return res.status(500).json({
      success: false,
      message: 'Gagal menghapus data stok fisik',
      error: error.message
    });
  }
};

// DELETE /api/audit-stok/tanggal/:tanggal - Delete All Audit Logs for a specific date
exports.deleteAuditStokByDate = async (req, res) => {
  try {
    const { tanggal } = req.params;
    if (!tanggal) {
      return res.status(400).json({
        success: false,
        message: 'Tanggal wajib ditentukan!'
      });
    }

    const result = await AuditStokFisik.deleteMany({ tanggal });

    // Log activity
    try {
      const logEntry = new AuditLog({
        user: 'User App',
        action: 'DELETE_STOK_FISIK_BY_DATE',
        details: `Hapus massal stok fisik: ${result.deletedCount} data opname pertanggal ${tanggal} berhasil dihapus.`
      });
      await logEntry.save();
    } catch (e) {}

    return res.status(200).json({
      success: true,
      deletedCount: result.deletedCount,
      message: `Berhasil menghapus ${result.deletedCount} data riwayat stok fisik pertanggal ${tanggal}.`
    });
  } catch (error) {
    console.error('Error in deleteAuditStokByDate:', error);
    return res.status(500).json({
      success: false,
      message: 'Gagal menghapus massal data stok fisik',
      error: error.message
    });
  }
};

// POST /api/audit-stok/delete-batch - Delete multiple records by Array of IDs
exports.deleteAuditStokBatch = async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Daftar ID yang ingin dihapus wajib diisi!'
      });
    }

    const mongoose = require('mongoose');
    const validObjectIds = [];
    const rawStringIds = [];

    ids.forEach(rawId => {
      if (!rawId) return;
      const strId = String(rawId).trim();
      rawStringIds.push(strId);
      if (mongoose.Types.ObjectId.isValid(strId)) {
        validObjectIds.push(new mongoose.Types.ObjectId(strId));
      }
    });

    const queryConditions = [{ id: { $in: rawStringIds } }];
    if (validObjectIds.length > 0) {
      queryConditions.push({ _id: { $in: validObjectIds } });
    }

    const result = await AuditStokFisik.deleteMany({ $or: queryConditions });

    return res.status(200).json({
      success: true,
      deletedCount: result.deletedCount,
      message: `Berhasil menghapus ${result.deletedCount} data riwayat stok fisik.`
    });
  } catch (error) {
    console.error('Error in deleteAuditStokBatch:', error);
    return res.status(500).json({
      success: false,
      message: 'Gagal menghapus batch data stok fisik',
      error: error.message
    });
  }
};
