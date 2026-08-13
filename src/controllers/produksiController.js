const mongoose = require('mongoose');
const RiwayatProduksi = require('../models/RiwayatProduksi');
const Produk = require('../models/Produk');
const BahanBaku = require('../models/BahanBaku');
const Resep = require('../models/Resep');
const { readCollection, writeCollection, addAuditLog } = require('../utils/dbHelper');
const { cleanFloat } = require('../utils/numberUtils');

// GET /api/produksi/history (Strict MongoDB Atlas priority)
exports.getHistory = async (req, res) => {
  try {
    if (mongoose.connection.readyState === 1) {
      const mongoList = await RiwayatProduksi.find().sort({ createdAt: -1 });
      return res.json({ success: true, data: mongoList });
    }
    const jsonList = readCollection('riwayatProduksi');
    return res.json({ success: true, data: jsonList });
  } catch (err) {
    console.error('Get production history error:', err);
    const fallback = readCollection('riwayatProduksi');
    return res.json({ success: true, data: fallback });
  }
};

// DELETE /api/produksi/history/:id
exports.deleteHistory = async (req, res) => {
  try {
    const { id } = req.params;
    const { user } = req.body;

    if (mongoose.connection.readyState === 1) {
      const query = mongoose.Types.ObjectId.isValid(id) ? { $or: [{ id }, { _id: id }] } : { id };
      await RiwayatProduksi.deleteMany(query);
    }

    const jsonList = readCollection('riwayatProduksi');
    const filtered = jsonList.filter(item => item.id !== id);
    writeCollection('riwayatProduksi', filtered);

    addAuditLog(
      typeof user === 'string' ? user : (user?.name || 'Super Admin'),
      'ADMIN',
      'Hapus Riwayat Produksi',
      `Menghapus catatan batch produksi (${id}) dari riwayat.`
    );

    return res.json({ success: true, message: `Batch ${id} berhasil dihapus dari riwayat.` });
  } catch (err) {
    console.error('Delete production history error:', err);
    return res.status(500).json({ success: false, message: 'Gagal menghapus riwayat: ' + err.message });
  }
};

// POST /api/produksi/execute (Process Batch Production & Auto Deduct Raw Materials)
exports.executeBatch = async (req, res) => {
  try {
    const { produkId, targetQty, user } = req.body;
    if (!produkId || !targetQty || targetQty <= 0) {
      return res.status(400).json({ success: false, message: 'produkId dan targetQty (>0) wajib diisi.' });
    }

    // 1. Find Product (MongoDB Atlas or JSON Fallback)
    let mongoProduk = null;
    if (mongoose.connection.readyState === 1) {
      try {
        mongoProduk = await Produk.findOne({ id: produkId });
      } catch (e) {
        console.warn('Mongo find produk note:', e.message);
      }
    }
    const jsonProdukList = readCollection('produk');
    let jsonProduk = jsonProdukList.find(p => p.id === produkId);

    const produkNama = mongoProduk ? mongoProduk.nama : (jsonProduk ? jsonProduk.nama : produkId);

    // 2. Find Recipe Formula
    let formula = [];
    if (mongoose.connection.readyState === 1) {
      try {
        const mongoResep = await Resep.findOne({ produkId });
        if (mongoResep && mongoResep.items && mongoResep.items.length > 0) {
          formula = mongoResep.items;
        }
      } catch (e) {
        console.warn('Mongo find resep note:', e.message);
      }
    }

    if (formula.length === 0) {
      const jsonResepObj = readCollection('resep');
      formula = jsonResepObj[produkId] || [];
    }

    if (formula.length === 0) {
      return res.status(400).json({
        success: false,
        message: `Produk ${produkNama} belum memiliki formula resep (BOM) terdaftar!`
      });
    }

    // 3. Check Raw Materials Stock Sufficiency
    const jsonBahanList = readCollection('bahanBaku');
    const insufficientItems = [];

    for (let item of formula) {
      let bMongo = null;
      if (mongoose.connection.readyState === 1) {
        try {
          bMongo = await BahanBaku.findOne({ id: item.bahanId });
        } catch (e) {
          console.warn('Mongo find bahan note:', e.message);
        }
      }
      const bJson = jsonBahanList.find(b => b.id === item.bahanId);
      const bNama = bMongo ? bMongo.nama : (bJson ? bJson.nama : item.bahanId);
      const currentStok = bMongo ? bMongo.stok : (bJson ? bJson.stok : 0);
      const needQty = cleanFloat(item.takaran * targetQty);

      if (currentStok < needQty) {
        insufficientItems.push(`${bNama} (Butuh: ${needQty}, Stok: ${currentStok})`);
      }
    }

    if (insufficientItems.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Stok bahan baku tidak mencukupi untuk produksi ${targetQty} Batch: ${insufficientItems.join(', ')}.`
      });
    }

    // 4. Deduct Raw Materials Stock & Record Pemotongan
    const pemotonganBahan = [];

    for (let item of formula) {
      let bMongo = null;
      if (mongoose.connection.readyState === 1) {
        try {
          bMongo = await BahanBaku.findOne({ id: item.bahanId });
        } catch (e) {
          console.warn('Mongo find bahan note:', e.message);
        }
      }
      let bJsonIndex = jsonBahanList.findIndex(b => b.id === item.bahanId);
      
      const usedQty = cleanFloat(item.takaran * targetQty);
      const bahanNama = bMongo ? bMongo.nama : (jsonBahanList[bJsonIndex] ? jsonBahanList[bJsonIndex].nama : 'Bahan Mentah');
      const satuan = bMongo ? bMongo.satuan : (jsonBahanList[bJsonIndex] ? jsonBahanList[bJsonIndex].satuan : 'kg');

      pemotonganBahan.push({
        bahanNama,
        jumlah: usedQty,
        satuan
      });

      // Deduct Mongo
      if (bMongo) {
        bMongo.stok = Math.max(0, Math.round((bMongo.stok - usedQty) * 1000) / 1000);
        await bMongo.save();
      }

      // Deduct JSON
      if (bJsonIndex !== -1) {
        jsonBahanList[bJsonIndex].stok = Math.max(0, Math.round((jsonBahanList[bJsonIndex].stok - usedQty) * 1000) / 1000);
      }
    }
    writeCollection('bahanBaku', jsonBahanList);

    // 5. Increase Product Stock (Mongo + JSON)
    if (mongoProduk) {
      mongoProduk.stok = (mongoProduk.stok || 0) + Number(targetQty);
      await mongoProduk.save();
    }
    if (jsonProduk) {
      jsonProduk.stok = (jsonProduk.stok || 0) + Number(targetQty);
      writeCollection('produk', jsonProdukList);
    }

    // 6. Record Batch Entry
    const now = new Date();
    const todayStr = req.body.tanggal || `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
    const timeStr = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    const timestamp = `${todayStr} ${timeStr}`;
    const dateNum = todayStr.replace(/-/g, '');
    const batchId = `BATCH-${dateNum}-${Math.floor(100 + Math.random() * 900)}`;

    const newBatch = {
      id: batchId,
      timestamp,
      tanggal: todayStr,
      produkId,
      produkNama,
      jumlahPcs: Number(targetQty),
      operator: typeof user === 'string' ? user : (user?.name || 'Tim Produk'),
      pemotonganBahan
    };

    if (mongoose.connection.readyState === 1) {
      try {
        await RiwayatProduksi.create(newBatch);
      } catch (e) {
        console.warn('Mongo batch log write note:', e.message);
      }
    }

    const history = readCollection('riwayatProduksi');
    history.unshift(newBatch);
    writeCollection('riwayatProduksi', history);

    await addAuditLog(
      typeof user === 'string' ? user : (user?.name || 'Tim Bahan Baku'),
      'BAHAN_BAKU',
      'Produksi Batch',
      `Eksekusi produksi ${targetQty} Batch ${produkNama} (${batchId}). Stok bahan baku terpotong otomatis.`
    );

    return res.json({
      success: true,
      message: `Eksekusi Produksi Berhasil! Batch ${batchId} (+${targetQty} Batch ${produkNama}) telah dicatat & stok bahan baku terpotong otomatis.`,
      data: newBatch
    });
  } catch (err) {
    console.error('Execute batch error:', err);
    return res.status(500).json({ success: false, message: 'Gagal mengeksekusi produksi: ' + err.message });
  }
};
