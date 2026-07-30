const mongoose = require('mongoose');
const UtangSupplier = require('../models/UtangSupplier');
const BahanBaku = require('../models/BahanBaku');
const { readCollection, writeCollection, addAuditLog } = require('../utils/dbHelper');

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
    const sisaUtang = Math.max(0, totalTagihan - dpPaid);
    const status = sisaUtang === 0 ? 'LUNAS' : (dpPaid > 0 ? 'SEBAGIAN' : 'BELUM LUNAS');

    const todayStr = new Date().toISOString().split('T')[0];
    const nowStr = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
    const isAutoReceived = !!autoAddStok;

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
      sisaUtang,
      tanggalBeli: todayStr,
      jatuhTempo: jatuhTempo || todayStr,
      status,
      statusPengiriman: isAutoReceived ? 'SUDAH DITERIMA' : 'BELUM DITERIMA',
      jumlahDiterima: isAutoReceived ? qty : 0,
      sisaBelumDiterima: isAutoReceived ? 0 : qty,
      catatan: catatan || '',
      riwayatBayar: dpPaid > 0 ? [
        {
          tanggal: nowStr,
          jumlah: dpPaid,
          metode: 'Transfer / Cash (DP)',
          keterangan: 'Uang Muka / Pembayaran Awal'
        }
      ] : [],
      riwayatPenerimaan: isAutoReceived ? [
        {
          tanggal: nowStr,
          jumlah: qty,
          penerima: user?.name || 'Sistem',
          catatan: 'Diterima & terverifikasi langsung saat registrasi faktur'
        }
      ] : []
    };

    // 1. Mongo
    if (mongoose.connection.readyState === 1) {
      try { await UtangSupplier.create(newRecord); } catch (e) {}
    }

    // 2. JSON
    const jsonList = readCollection('utangSupplier');
    jsonList.unshift(newRecord);
    writeCollection('utangSupplier', jsonList);

    // 3. Auto Add Stock if requested
    if (autoAddStok && bahanId) {
      if (mongoose.connection.readyState === 1) {
        try {
          const docBahan = await BahanBaku.findOne({ $or: [{ id: bahanId }, { sku: bahanId }, { _id: bahanId }] });
          if (docBahan) {
            docBahan.stok = Math.round((docBahan.stok + qty) * 1000) / 1000;
            await docBahan.save();
          }
        } catch (e) {}
      }
      const bList = readCollection('bahanBaku');
      const idxB = bList.findIndex(x => x.id === bahanId || x.sku === bahanId);
      if (idxB !== -1) {
        bList[idxB].stok = Math.round((bList[idxB].stok + qty) * 1000) / 1000;
        writeCollection('bahanBaku', bList);
      }
    }

    await addAuditLog(
      user?.name || 'Tim Pembelian',
      user?.role || 'PEMBELIAN',
      'Pembelian & Utang Baru',
      `Faktur ${noFaktur} dari ${supplier}: Total Rp ${totalTagihan.toLocaleString('id-ID')} (DP: Rp ${dpPaid.toLocaleString('id-ID')}, Sisa Utang: Rp ${sisaUtang.toLocaleString('id-ID')}). Status Pengiriman: ${isAutoReceived ? 'Sudah Diterima' : 'Belum Diterima'}.`
    );

    return res.json({ success: true, message: `Faktur Pembelian ${noFaktur} berhasil dicatat!`, data: newRecord });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

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

    // Mongo update
    if (mongoose.connection.readyState === 1) {
      try {
        const doc = await UtangSupplier.findOne({ $or: [{ id }, { _id: id }] });
        if (doc) {
          doc.jumlahDiterima = (doc.jumlahDiterima || 0) + terimaQty;
          doc.sisaBelumDiterima = Math.max(0, doc.jumlah - doc.jumlahDiterima);
          doc.statusPengiriman = doc.sisaBelumDiterima === 0 ? 'SUDAH DITERIMA' : 'SEBAGIAN';
          if (!doc.riwayatPenerimaan) doc.riwayatPenerimaan = [];
          doc.riwayatPenerimaan.push({
            tanggal: nowStr,
            jumlah: terimaQty,
            penerima: penerima || user?.name || 'Staf Gudang',
            catatan: catatan || 'Penerimaan fisik barang baku'
          });
          await doc.save();
          updatedRecord = doc;
        }
      } catch (e) {}
    }

    // JSON update
    const jsonList = readCollection('utangSupplier');
    const idx = jsonList.findIndex(x => x.id === id);
    if (idx !== -1) {
      jsonList[idx].jumlahDiterima = (jsonList[idx].jumlahDiterima || 0) + terimaQty;
      jsonList[idx].sisaBelumDiterima = Math.max(0, jsonList[idx].jumlah - jsonList[idx].jumlahDiterima);
      jsonList[idx].statusPengiriman = jsonList[idx].sisaBelumDiterima === 0 ? 'SUDAH DITERIMA' : 'SEBAGIAN';
      if (!jsonList[idx].riwayatPenerimaan) jsonList[idx].riwayatPenerimaan = [];
      jsonList[idx].riwayatPenerimaan.push({
        tanggal: nowStr,
        jumlah: terimaQty,
        penerima: penerima || user?.name || 'Staf Gudang',
        catatan: catatan || 'Penerimaan fisik barang baku'
      });
      writeCollection('utangSupplier', jsonList);
      if (!updatedRecord) updatedRecord = jsonList[idx];
    }

    if (!updatedRecord) {
      return res.status(404).json({ success: false, message: 'Faktur pembelian tidak ditemukan.' });
    }

    // ATOMICALLY INCREASE PHYSICAL STOCK IN BAHAN BAKU!
    const targetBahanId = updatedRecord.bahanId;
    if (targetBahanId) {
      if (mongoose.connection.readyState === 1) {
        try {
          const docB = await BahanBaku.findOne({ $or: [{ id: targetBahanId }, { sku: targetBahanId }, { _id: targetBahanId }] });
          if (docB) {
            docB.stok = Math.round((docB.stok + terimaQty) * 1000) / 1000;
            await docB.save();
          }
        } catch (e) {}
      }
      const bList = readCollection('bahanBaku');
      const idxB = bList.findIndex(x => x.id === targetBahanId || x.sku === targetBahanId);
      if (idxB !== -1) {
        bList[idxB].stok = Math.round((bList[idxB].stok + terimaQty) * 1000) / 1000;
        writeCollection('bahanBaku', bList);
      }
    }

    await addAuditLog(
      user?.name || penerima || 'Staf Gudang',
      user?.role || 'BAHAN_BAKU',
      'Penerimaan Bahan Baku',
      `Penerimaan fisik +${terimaQty} ${updatedRecord.satuan} ${updatedRecord.bahanNama} dari ${updatedRecord.supplier} (Faktur: ${updatedRecord.noFaktur}). Stok fisik gudang bertambah.`
    );

    return res.json({
      success: true,
      message: `Penerimaan +${terimaQty} ${updatedRecord.satuan} ${updatedRecord.bahanNama} berhasil diverifikasi! Stok gudang bertambah!`,
      data: updatedRecord
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

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

    // Mongo update
    if (mongoose.connection.readyState === 1) {
      try {
        const doc = await UtangSupplier.findOne({ $or: [{ id }, { _id: id }] });
        if (doc) {
          doc.jumlahDibayar += bayarQty;
          doc.sisaUtang = Math.max(0, doc.totalTagihan - doc.jumlahDibayar);
          doc.status = doc.sisaUtang === 0 ? 'LUNAS' : 'SEBAGIAN';
          doc.riwayatBayar.push({
            tanggal: nowStr,
            jumlah: bayarQty,
            metode: metode || 'Transfer Bank',
            keterangan: keterangan || 'Pembayaran Utang Supplier'
          });
          await doc.save();
          updatedRecord = doc;
        }
      } catch (e) {}
    }

    // JSON update
    const jsonList = readCollection('utangSupplier');
    const idx = jsonList.findIndex(x => x.id === id);
    if (idx !== -1) {
      jsonList[idx].jumlahDibayar += bayarQty;
      jsonList[idx].sisaUtang = Math.max(0, jsonList[idx].totalTagihan - jsonList[idx].jumlahDibayar);
      jsonList[idx].status = jsonList[idx].sisaUtang === 0 ? 'LUNAS' : 'SEBAGIAN';
      if (!jsonList[idx].riwayatBayar) jsonList[idx].riwayatBayar = [];
      jsonList[idx].riwayatBayar.push({
        tanggal: nowStr,
        jumlah: bayarQty,
        metode: metode || 'Transfer Bank',
        keterangan: keterangan || 'Pembayaran Utang Supplier'
      });
      writeCollection('utangSupplier', jsonList);
      if (!updatedRecord) updatedRecord = jsonList[idx];
    }

    if (!updatedRecord) {
      return res.status(404).json({ success: false, message: 'Faktur utang supplier tidak ditemukan.' });
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

// DELETE /api/utang-supplier/:id
exports.remove = async (req, res) => {
  try {
    const { id } = req.params;
    const { user } = req.body;

    if (mongoose.connection.readyState === 1) {
      try { await UtangSupplier.deleteMany({ $or: [{ id }, { _id: id }] }); } catch (e) {}
    }

    let jsonList = readCollection('utangSupplier');
    const target = jsonList.find(x => x.id === id);
    jsonList = jsonList.filter(x => x.id !== id);
    writeCollection('utangSupplier', jsonList);

    await addAuditLog(
      user?.name || 'Tim Pembelian',
      user?.role || 'PEMBELIAN',
      'Hapus Utang Supplier',
      `Menghapus catatan utang faktur ${target ? target.noFaktur : id}.`
    );

    return res.json({ success: true, message: 'Data utang supplier berhasil dihapus.' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
