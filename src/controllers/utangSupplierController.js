/**
 * ============================================================================
 * UTANG SUPPLIER & PEMBELIAN CONTROLLER
 * Domain: Pembelian & Dapur Bahan Baku
 * Features:
 *  1. Registrasi Faktur Pembelian (Purchase Order)
 *  2. Penerimaan & Verifikasi Fisik Barang Gudang (Stok Bertambah Otomatis)
 *  3. Pembayaran / Pelunasan Utang (Transfer/Cash)
 *  4. Dual Storage Priority: MongoDB Cloud + JSON File Backup
 * ============================================================================
 */

const mongoose = require('mongoose');
const UtangSupplier = require('../models/UtangSupplier');
const BahanBaku = require('../models/BahanBaku');
const { readCollection, writeCollection, addAuditLog } = require('../utils/dbHelper');

// ==================== 1. FETCH ALL UTANG / FAKTUR ====================
// GET /api/utang-supplier
exports.getAll = async (req, res) => {
  try {
    let mongoList = [];
    if (mongoose.connection.readyState === 1) {
      try {
        mongoList = await UtangSupplier.find().sort({ createdAt: -1 });
      } catch (e) {}
    }
    const jsonList = readCollection('utangSupplier');
    const finalData = mongoList.length > 0 ? mongoList : jsonList;

    return res.json({ success: true, data: finalData });
  } catch (err) {
    const fallback = readCollection('utangSupplier');
    return res.json({ success: true, data: fallback });
  }
};

// ==================== 5. CLEAR ALL DATA UTANG / PEMBELIAN ====================
// DELETE /api/utang-supplier/clear/all
exports.clearAll = async (req, res) => {
  try {
    if (mongoose.connection.readyState === 1) {
      await UtangSupplier.deleteMany({});
    }
    writeCollection('utangSupplier', []);
    await addAuditLog('SYSTEM', 'SUPER_ADMIN', 'Clear All Pembelian & Utang', 'Seluruh data Pembelian, Penerimaan, dan Utang Supplier berhasil dibersihkan.');
    return res.json({ success: true, message: 'Seluruh data Pembelian, Penerimaan, dan Utang Supplier berhasil dibersihkan!' });
  } catch (err) {
    console.error('Clear all utang supplier error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ==================== 2. CATAT FAKTUR / PEMBELIAN BARU ====================
// POST /api/utang-supplier (Tambah Faktur Pembelian & Utang Baru)
exports.create = async (req, res) => {
  try {
    const { noFaktur, supplier, bahanId, bahanNama, jumlah, satuan, hargaSatuan, dp, jatuhTempo, catatan, autoAddStok, user } = req.body;
    if (!supplier || !noFaktur || !jumlah || jumlah <= 0) {
      return res.status(400).json({ success: false, message: 'Supplier, No Faktur, dan Jumlah Wajib Diisi.' });
    }

    const qty = parseFloat(jumlah) || 0;
    const hg = parseFloat(hargaSatuan) || 0;
    const totalTagihan = qty * hg;
    const dpPaid = parseFloat(dp) || 0;
    const initialDiterima = parseFloat(req.body.jumlahDiterima) || 0;
    const tagihanFisik = initialDiterima * hg;
    const sisaUtang = Math.max(0, tagihanFisik - dpPaid);
    const status = initialDiterima === 0 ? 'MENUNGGU PENERIMAAN' : (sisaUtang === 0 ? 'LUNAS' : (dpPaid > 0 ? 'SEBAGIAN' : 'BELUM LUNAS'));

    const todayStr = new Date().toISOString().split('T')[0];
    const nowStr = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
    const newRecord = {
      id: 'utg_' + Date.now(),
      noFaktur,
      supplier,
      bahanId: bahanId || '',
      bahanNama: bahanNama || 'Bahan Baku',
      jumlah: qty,
      satuan: satuan || 'unit',
      hargaSatuan: hg,
      totalTagihan,
      jumlahDibayar: dpPaid,
      tanggalBeli: req.body.tanggalBeli || req.body.tanggal || todayStr,
      tanggal: req.body.tanggal || req.body.tanggalBeli || todayStr,
      jatuhTempo: jatuhTempo || todayStr,
      status,
      statusPengiriman: initialDiterima >= qty ? 'SUDAH DITERIMA' : (initialDiterima > 0 ? 'SEBAGIAN' : 'BELUM DITERIMA'),
      jumlahDiterima: initialDiterima,
      sisaBelumDiterima: Math.max(0, qty - initialDiterima),
      catatan: catatan || '',
      riwayatBayar: dpPaid > 0 ? [
        {
          tanggal: req.body.tanggal || req.body.tanggalBeli || nowStr,
          jumlah: dpPaid,
          metode: 'Transfer / Cash (DP)',
          keterangan: 'Uang Muka / Pembayaran Awal'
        }
      ] : [],
      riwayatPenerimaan: []
    };

    // 1. Mongo
    if (mongoose.connection.readyState === 1) {
      try { await UtangSupplier.create(newRecord); } catch (e) {}
    }

    // 2. JSON
    const jsonList = readCollection('utangSupplier');
    jsonList.unshift(newRecord);
    writeCollection('utangSupplier', jsonList);

    await addAuditLog(
      user?.name || 'Tim Pembelian',
      user?.role || 'PEMBELIAN',
      'Pembelian & Utang Baru',
      `Faktur ${noFaktur} dari ${supplier}: Total Rencana Rp ${totalTagihan.toLocaleString('id-ID')} (DP: Rp ${dpPaid.toLocaleString('id-ID')}). Utang akan bertambah otomatis saat fisik barang diterima di Penerimaan Bahan Baku.`
    );

    return res.json({ success: true, message: `Faktur Pembelian ${noFaktur} berhasil dicatat! Menunggu penerimaan fisik di gudang.`, data: newRecord });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ==================== 3. VERIFIKASI PENERIMAAN BARANG GUDANG ====================
// POST /api/utang-supplier/:id/receive (Penerimaan Barang Fisik & Verifikasi Stok)
exports.receive = async (req, res) => {
  try {
    const { id } = req.params;
    const { jumlahTerima, penerima, catatan, user } = req.body;
    const terimaQty = parseFloat(jumlahTerima) || 0;

    if (terimaQty <= 0) {
      return res.status(400).json({ success: false, message: 'Jumlah barang yang diterima harus lebih dari 0.' });
    }

    const nowStr = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
    let updatedRecord = null;

    // Helper calculate receive
    const applyReceiveCalc = (rec) => {
      const newDiterima = (rec.jumlahDiterima || 0) + terimaQty;
      const hg = rec.hargaSatuan || 0;
      const tagihanFisik = newDiterima * hg;
      const dpPaid = rec.jumlahDibayar || 0;
      const sisaUtang = Math.max(0, tagihanFisik - dpPaid);
      const sisaBelumDiterima = Math.max(0, rec.jumlah - newDiterima);
      const statusPengiriman = sisaBelumDiterima === 0 ? 'SUDAH DITERIMA' : 'SEBAGIAN';
      const status = sisaUtang === 0 ? (dpPaid >= tagihanFisik && newDiterima > 0 ? 'LUNAS' : 'MENUNGGU PENERIMAAN') : (dpPaid > 0 ? 'SEBAGIAN' : 'BELUM LUNAS');

      rec.jumlahDiterima = newDiterima;
      rec.sisaBelumDiterima = sisaBelumDiterima;
      rec.statusPengiriman = statusPengiriman;
      rec.sisaUtang = sisaUtang;
      rec.status = status;

      if (!rec.riwayatPenerimaan) rec.riwayatPenerimaan = [];
      rec.riwayatPenerimaan.push({
        tanggal: req.body.tanggal || req.body.tanggalTerima || nowStr,
        jumlah: terimaQty,
        penerima: penerima || user?.name || 'Staf Gudang',
        catatan: catatan || 'Penerimaan fisik barang baku'
      });
      return rec;
    };

    // Mongo update
    if (mongoose.connection.readyState === 1) {
      try {
        const queryOr = [{ id }];
        if (mongoose.Types.ObjectId.isValid(id)) queryOr.push({ _id: id });
        const doc = await UtangSupplier.findOne({ $or: queryOr });
        if (doc) {
          applyReceiveCalc(doc);
          await doc.save();
          updatedRecord = doc.toObject ? doc.toObject() : doc;
        }
      } catch (e) {}
    }

    // JSON update
    const jsonList = readCollection('utangSupplier');
    const idx = jsonList.findIndex(x => x.id === id || x._id === id || x.noFaktur === id);
    if (idx !== -1) {
      applyReceiveCalc(jsonList[idx]);
      writeCollection('utangSupplier', jsonList);
      if (!updatedRecord) updatedRecord = jsonList[idx];
    }

    if (!updatedRecord) {
      return res.status(404).json({ success: false, message: 'Faktur pembelian tidak ditemukan.' });
    }

    // ATOMICALLY INCREASE PHYSICAL STOCK IN BAHAN BAKU!
    const targetBahanId = updatedRecord.bahanId;
    const targetBahanNama = updatedRecord.bahanNama;
    if (targetBahanId || targetBahanNama) {
      if (mongoose.connection.readyState === 1) {
        try {
          const queryOrB = [];
          if (targetBahanId) {
            queryOrB.push({ id: targetBahanId }, { sku: targetBahanId });
            if (mongoose.Types.ObjectId.isValid(targetBahanId)) queryOrB.push({ _id: targetBahanId });
          }
          if (targetBahanNama) {
            queryOrB.push({ nama: targetBahanNama });
          }
          const docB = await BahanBaku.findOne({ $or: queryOrB });
          if (docB) {
            docB.stok = Math.round((docB.stok + terimaQty) * 1000) / 1000;
            await docB.save();
          }
        } catch (e) {}
      }
      const bList = readCollection('bahanBaku');
      const idxB = bList.findIndex(x => x.id === targetBahanId || x.sku === targetBahanId || x.nama === targetBahanNama);
      if (idxB !== -1) {
        bList[idxB].stok = Math.round((bList[idxB].stok + terimaQty) * 1000) / 1000;
        writeCollection('bahanBaku', bList);
      }
    }

    const penambahanUtangVal = terimaQty * (updatedRecord.hargaSatuan || 0);

    await addAuditLog(
      user?.name || penerima || 'Staf Gudang',
      user?.role || 'BAHAN_BAKU',
      'Penerimaan Bahan Baku & Penambahan Utang',
      `Penerimaan fisik +${terimaQty} ${updatedRecord.satuan} ${updatedRecord.bahanNama} (Faktur: ${updatedRecord.noFaktur}). Stok gudang bertambah & Utang supplier bertambah +Rp ${penambahanUtangVal.toLocaleString('id-ID')}. Total Sisa Utang: Rp ${(updatedRecord.sisaUtang||0).toLocaleString('id-ID')}.`
    );

    return res.json({
      success: true,
      message: `Penerimaan +${terimaQty} ${updatedRecord.satuan} ${updatedRecord.bahanNama} berhasil! Stok bertambah & Utang bertambah +Rp ${penambahanUtangVal.toLocaleString('id-ID')}!`,
      data: updatedRecord
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ==================== 4. PEMBAYARAN / PELUNASAN UTANG ====================
// POST /api/utang-supplier/:id/pay (Bayar / Cicil Utang Supplier)
exports.pay = async (req, res) => {
  try {
    const { id } = req.params;
    const { jumlahBayar, metode, keterangan, user } = req.body;
    const bayarQty = parseFloat(jumlahBayar) || 0;

    if (bayarQty <= 0) {
      return res.status(400).json({ success: false, message: 'Jumlah pembayaran harus lebih dari 0.' });
    }

    const nowStr = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
    let updatedRecord = null;

    const applyPayCalc = (rec) => {
      const newDibayar = (rec.jumlahDibayar || 0) + bayarQty;
      const hg = rec.hargaSatuan || 0;
      const tagihanFisik = (rec.jumlahDiterima || 0) * hg;
      const sisaUtang = Math.max(0, tagihanFisik - newDibayar);
      const status = sisaUtang === 0 ? (newDibayar >= tagihanFisik && (rec.jumlahDiterima || 0) > 0 ? 'LUNAS' : (rec.jumlahDiterima === 0 ? 'MENUNGGU PENERIMAAN' : 'LUNAS')) : (newDibayar > 0 ? 'SEBAGIAN' : 'BELUM LUNAS');

      rec.jumlahDibayar = newDibayar;
      rec.sisaUtang = sisaUtang;
      rec.status = status;
      if (!rec.riwayatBayar) rec.riwayatBayar = [];
      rec.riwayatBayar.push({
        tanggal: req.body.tanggal || req.body.tanggalBayar || nowStr,
        jumlah: bayarQty,
        metode: metode || 'Transfer Bank',
        keterangan: keterangan || 'Pembayaran Utang Supplier'
      });
      return rec;
    };

    // Mongo update
    if (mongoose.connection.readyState === 1) {
      try {
        const orQuery = [{ id }, { noFaktur: id }];
        if (mongoose.Types.ObjectId.isValid(id)) orQuery.push({ _id: id });
        const doc = await UtangSupplier.findOne({ $or: orQuery });
        if (doc) {
          applyPayCalc(doc);
          await doc.save();
          updatedRecord = doc.toObject ? doc.toObject() : doc;
        }
      } catch (e) { console.error('Mongo pay error:', e.message); }
    }

    // JSON update
    const jsonList = readCollection('utangSupplier');
    const idx = jsonList.findIndex(x => x.id === id || x._id === id || x.noFaktur === id);
    if (idx !== -1) {
      applyPayCalc(jsonList[idx]);
      writeCollection('utangSupplier', jsonList);
      if (!updatedRecord) updatedRecord = jsonList[idx];
    }

    if (!updatedRecord) {
      return res.status(404).json({ success: false, message: `Faktur utang supplier tidak ditemukan. (ID: ${id})` });
    }

    await addAuditLog(
      user?.name || 'Tim Pembelian',
      user?.role || 'PEMBELIAN',
      'Pembayaran Utang Supplier',
      `Pembayaran Rp ${bayarQty.toLocaleString('id-ID')} untuk Faktur ${updatedRecord.noFaktur} (${updatedRecord.supplier}). Sisa Utang: Rp ${updatedRecord.sisaUtang.toLocaleString('id-ID')}.`
    );

    return res.json({ success: true, message: `Pembayaran Rp ${bayarQty.toLocaleString('id-ID')} berhasil dicatat! Status: ${updatedRecord.status}.`, data: updatedRecord });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ==================== 5. REMOVE FAKTUR / CLEAR ALL ====================
// DELETE /api/utang-supplier/:id
exports.remove = async (req, res) => {
  try {
    const { id } = req.params;

    if (id === 'clear' || id === 'all' || id === 'clear-all') {
      if (mongoose.connection.readyState === 1) {
        await UtangSupplier.deleteMany({});
      }
      writeCollection('utangSupplier', []);
      await addAuditLog('SYSTEM', 'SUPER_ADMIN', 'Clear All Pembelian & Utang', 'Seluruh data Pembelian, Penerimaan, dan Utang Supplier berhasil dibersihkan.');
      return res.json({ success: true, message: 'Seluruh data Pembelian, Penerimaan, dan Utang Supplier berhasil dibersihkan 100%!' });
    }
    const { user } = req.body;

    if (mongoose.connection.readyState === 1) {
      try {
        const queryOrDel = [{ id }, { noFaktur: id }];
        if (mongoose.Types.ObjectId.isValid(id)) queryOrDel.push({ _id: id });
        await UtangSupplier.deleteMany({ $or: queryOrDel });
      } catch (e) {}
    }

    let jsonList = readCollection('utangSupplier');
    jsonList = jsonList.filter(x => x.id !== id && x._id !== id && x.noFaktur !== id);
    writeCollection('utangSupplier', jsonList);

    await addAuditLog(
      user?.name || 'Admin',
      user?.role || 'ADMIN',
      'Hapus Faktur Utang',
      `Menghapus catatan faktur utang ID/Faktur "${id}".`
    );

    return res.json({ success: true, message: `Catatan faktur utang berhasil dihapus!` });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// DELETE /api/utang-supplier/clear/all
exports.clearAll = async (req, res) => {
  try {
    if (mongoose.connection.readyState === 1) {
      await UtangSupplier.deleteMany({});
    }
    writeCollection('utangSupplier', []);
    await addAuditLog('SYSTEM', 'SUPER_ADMIN', 'Clear All Pembelian & Utang', 'Seluruh data Pembelian, Penerimaan, dan Utang Supplier berhasil dibersihkan.');
    return res.json({ success: true, message: 'Seluruh data Pembelian, Penerimaan, dan Utang Supplier berhasil dibersihkan!' });
  } catch (err) {
    console.error('Clear all utang supplier error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};
