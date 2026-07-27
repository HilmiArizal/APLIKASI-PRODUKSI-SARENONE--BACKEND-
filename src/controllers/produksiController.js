const RiwayatProduksi = require('../models/RiwayatProduksi');
const Produk = require('../models/Produk');
const BahanBaku = require('../models/BahanBaku');
const Resep = require('../models/Resep');
const { readCollection, writeCollection, addAuditLog } = require('../utils/dbHelper');

// GET /api/produksi/history
exports.getHistory = async (req, res) => {
  try {
    const mongoose = require('mongoose');
    let mongoList = [];
    if (mongoose.connection.readyState === 1) {
      try {
        mongoList = await RiwayatProduksi.find().sort({ createdAt: -1 });
      } catch (e) {
        console.warn('Mongo history note:', e.message);
      }
    }
    const jsonList = readCollection('riwayatProduksi');
    
    const mergedMap = new Map();
    [...jsonList, ...mongoList].forEach(item => {
      if (item && item.id) mergedMap.set(item.id, item);
    });
    const finalHistory = Array.from(mergedMap.values()).sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));

    return res.json({ success: true, data: finalHistory });
  } catch (err) {
    const fallback = readCollection('riwayatProduksi');
    return res.json({ success: true, data: fallback });
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
    let mongoProduk = await Produk.findOne({ id: produkId });
    const jsonProdukList = readCollection('produk');
    let jsonProduk = jsonProdukList.find(p => p.id === produkId);

    const produkNama = mongoProduk ? mongoProduk.nama : (jsonProduk ? jsonProduk.nama : 'Produk');

    if (!mongoProduk && !jsonProduk) {
      return res.status(404).json({ success: false, message: 'Produk tidak ditemukan.' });
    }

    // 2. Find Recipe Formula (MongoDB Atlas or JSON Fallback)
    let formula = [];
    const resepDoc = await Resep.findOne({ produkId });
    if (resepDoc && resepDoc.items && resepDoc.items.length > 0) {
      formula = resepDoc.items;
    } else {
      const jsonResep = readCollection('resep');
      formula = jsonResep[produkId] || [];
    }

    if (!formula || formula.length === 0) {
      return res.status(400).json({
        success: false,
        message: `Produk "${produkNama}" belum memiliki takaran resep BOM. Silakan atur takaran bahan baku di tab Katalog Resep terlebih dahulu!`
      });
    }

    // 3. Check Raw Material Stock Sufficiency (Mongo + JSON)
    const jsonBahanList = readCollection('bahanBaku');

    for (let item of formula) {
      let bMongo = await BahanBaku.findOne({ id: item.bahanId });
      let bJson = jsonBahanList.find(b => b.id === item.bahanId);
      
      const bahanNama = bMongo ? bMongo.nama : (bJson ? bJson.nama : 'Bahan Mentah');
      const currentStok = bMongo ? bMongo.stok : (bJson ? bJson.stok : 0);
      const needed = Math.round(item.takaran * targetQty * 1000) / 1000;

      if (currentStok < needed) {
        return res.status(400).json({
          success: false,
          message: `Stok bahan baku "${bahanNama}" tidak mencukupi untuk produksi ${targetQty} Pcs! Dibutuhkan: ${needed} ${bMongo?.satuan || bJson?.satuan || ''}, Stok Tersedia: ${currentStok}`
        });
      }
    }

    // 4. Perform Raw Material Deductions in Mongo & JSON
    const pemotonganBahan = [];

    for (let item of formula) {
      let bMongo = await BahanBaku.findOne({ id: item.bahanId });
      let bJsonIndex = jsonBahanList.findIndex(b => b.id === item.bahanId);
      
      const usedQty = Math.round(item.takaran * targetQty * 1000) / 1000;
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
    const timestamp = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    const batchId = `BATCH-${now.getFullYear()}-${Math.floor(100 + Math.random() * 900)}`;

    const newBatch = {
      id: batchId,
      timestamp,
      produkId,
      produkNama,
      jumlahPcs: Number(targetQty),
      operator: user?.name || 'Tim Produk',
      pemotonganBahan
    };

    try {
      await RiwayatProduksi.create(newBatch);
    } catch (e) {
      console.warn('Mongo batch log write note:', e.message);
    }

    const history = readCollection('riwayatProduksi');
    history.unshift(newBatch);
    writeCollection('riwayatProduksi', history);

    addAuditLog(
      user?.name || 'Tim Produk',
      user?.role || 'PRODUK',
      'Produksi Batch',
      `Eksekusi produksi ${targetQty} Pcs ${produkNama} (${batchId}). Stok bahan baku terpotong & stok produk bertambah.`
    );

    return res.json({
      success: true,
      message: `Eksekusi Produksi Berhasil! Batch ${batchId} (+${targetQty} Pcs ${produkNama}) telah dicatat & stok bahan baku terpotong otomatis.`,
      data: newBatch
    });
  } catch (err) {
    console.error('Execute batch error:', err);
    return res.status(500).json({ success: false, message: 'Gagal mengeksekusi produksi: ' + err.message });
  }
};
