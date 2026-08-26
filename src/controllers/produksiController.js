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

// DELETE /api/produksi/history/:id (Rollback Batch Produksi & Restore All Raw Material Stocks)
exports.deleteHistory = async (req, res) => {
  try {
    const { id } = req.params;
    const { user } = req.body;

    // 1. Find target production batch log
    let targetBatch = null;
    if (mongoose.connection.readyState === 1) {
      try {
        const query = mongoose.Types.ObjectId.isValid(id) ? { $or: [{ id }, { _id: id }] } : { id };
        targetBatch = await RiwayatProduksi.findOne(query);
      } catch (e) {}
    }

    if (!targetBatch) {
      const historyJson = readCollection('riwayatProduksi');
      targetBatch = historyJson.find(item => item.id === id || item._id === id);
    }

    if (!targetBatch) {
      return res.status(404).json({ success: false, message: 'Riwayat batch produksi tidak ditemukan.' });
    }

    // 2. Restore Raw Materials / Emulsion Stocks (+jumlah)
    const jsonBahanList = readCollection('bahanBaku');
    if (Array.isArray(targetBatch.pemotonganBahan)) {
      for (let item of targetBatch.pemotonganBahan) {
        const restoredQty = Number(item.jumlah) || 0;
        if (restoredQty > 0) {
          // Restore Mongo
          if (mongoose.connection.readyState === 1) {
            try {
              const bDoc = await BahanBaku.findOne({
                $or: [
                  { nama: item.bahanNama },
                  { nama: new RegExp(item.bahanNama.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }
                ]
              });
              if (bDoc) {
                bDoc.stok = Math.round((bDoc.stok + restoredQty) * 1000) / 1000;
                await bDoc.save();
              }
            } catch (e) {}
          }
          // Restore JSON
          const bIdx = jsonBahanList.findIndex(b => b.nama.toLowerCase().trim() === item.bahanNama.toLowerCase().trim());
          if (bIdx !== -1) {
            jsonBahanList[bIdx].stok = Math.round((jsonBahanList[bIdx].stok + restoredQty) * 1000) / 1000;
          }
        }
      }
      writeCollection('bahanBaku', jsonBahanList);
    }

    // 3. Deduct Finished Product Stock (-jumlahPcs)
    const batchQty = Number(targetBatch.jumlahPcs) || 1;
    const jsonProdukList = readCollection('produk');
    if (mongoose.connection.readyState === 1) {
      try {
        const pDoc = await Produk.findOne({
          $or: [
            { id: targetBatch.produkId },
            { nama: targetBatch.produkNama },
            { sku: targetBatch.produkNama }
          ]
        });
        if (pDoc) {
          pDoc.stok = Math.max(0, Math.round((pDoc.stok - batchQty) * 1000) / 1000);
          await pDoc.save();
        }
      } catch (e) {}
    }
    const pIdx = jsonProdukList.findIndex(p => p.id === targetBatch.produkId || p.nama === targetBatch.produkNama || p.sku === targetBatch.produkNama);
    if (pIdx !== -1) {
      jsonProdukList[pIdx].stok = Math.max(0, Math.round((jsonProdukList[pIdx].stok - batchQty) * 1000) / 1000);
      writeCollection('produk', jsonProdukList);
    }

    // 4. Delete Batch Log Entry
    if (mongoose.connection.readyState === 1) {
      try {
        const query = mongoose.Types.ObjectId.isValid(id) ? { $or: [{ id }, { _id: id }] } : { id };
        await RiwayatProduksi.deleteMany(query);
      } catch (e) {}
    }

    const historyJson = readCollection('riwayatProduksi');
    const filtered = historyJson.filter(item => item.id !== id && item._id !== id);
    writeCollection('riwayatProduksi', filtered);

    // 5. Add Audit Log Entry
    await addAuditLog(
      typeof user === 'string' ? user : (user?.name || 'Super Admin'),
      'ADMIN',
      'Rollback Batch Produksi',
      `Membatalkan & Rollback Batch Produksi ${targetBatch.produkNama} (${batchQty} Batch, ID: ${targetBatch.id}). Seluruh stok bahan mentah/emulsi dikembalikan, stok produk jadi dikurangi -${batchQty} Batch.`
    );

    return res.json({
      success: true,
      message: `Rollback Batch Produksi ${targetBatch.id} Berhasil! Seluruh bahan baku/emulsi dikembalikan & stok produk jadi ${targetBatch.produkNama} dikurangi -${batchQty} Batch.`,
      data: { id, produkNama: targetBatch.produkNama, batchQty }
    });
  } catch (err) {
    console.error('Delete/Rollback production history error:', err);
    return res.status(500).json({ success: false, message: 'Gagal membatalkan batch produksi: ' + err.message });
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
      `Eksekusi produksi ${targetQty} Batch ${produkNama} (${batchId}). Stok bahan baku terpotong otomatis.`,
      todayStr
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
