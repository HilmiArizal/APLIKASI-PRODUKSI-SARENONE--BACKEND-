const RiwayatProduksi = require('../models/RiwayatProduksi');
const Produk = require('../models/Produk');
const BahanBaku = require('../models/BahanBaku');
const Resep = require('../models/Resep');
const { readCollection, writeCollection, addAuditLog } = require('../utils/dbHelper');

// GET /api/produksi/history
exports.getHistory = async (req, res) => {
  try {
    const list = await RiwayatProduksi.find().sort({ createdAt: -1 });
    if (list && list.length > 0) return res.json({ success: true, data: list });
    const fallback = readCollection('riwayatProduksi');
    return res.json({ success: true, data: fallback });
  } catch (err) {
    const fallback = readCollection('riwayatProduksi');
    return res.json({ success: true, data: fallback });
  }
};

// POST /api/produksi/execute (Process Batch Production & Auto Deduct Raw Materials in MongoDB Atlas)
exports.executeBatch = async (req, res) => {
  try {
    const { produkId, targetQty, user } = req.body;
    if (!produkId || !targetQty || targetQty <= 0) {
      return res.status(400).json({ success: false, message: 'produkId dan targetQty (>0) wajib diisi.' });
    }

    const produk = await Produk.findOne({ id: produkId });
    const resepDoc = await Resep.findOne({ produkId });
    const formula = resepDoc ? resepDoc.items : [];

    if (!produk) {
      return res.status(404).json({ success: false, message: 'Produk tidak ditemukan.' });
    }

    if (!formula || formula.length === 0) {
      return res.status(400).json({ success: false, message: 'Produk ini belum memiliki resep BOM.' });
    }

    // 1. Verify Raw Material Inventory Sufficiency in MongoDB
    for (let item of formula) {
      const b = await BahanBaku.findOne({ id: item.bahanId });
      const needed = item.takaran * targetQty;
      if (!b || b.stok < needed) {
        return res.status(400).json({
          success: false,
          message: `Stok bahan baku ${b ? b.nama : 'terkait'} tidak mencukupi di MongoDB! Butuh: ${needed.toFixed(2)}, Ada: ${b ? b.stok : 0}`
        });
      }
    }

    // 2. Perform Stock Deductions & Record Consumed List in MongoDB
    const pemotonganBahan = [];
    for (let item of formula) {
      const b = await BahanBaku.findOne({ id: item.bahanId });
      if (b) {
        const usedQty = Math.round(item.takaran * targetQty * 1000) / 1000;
        pemotonganBahan.push({
          bahanNama: b.nama,
          jumlah: usedQty,
          satuan: b.satuan
        });

        b.stok = Math.max(0, Math.round((b.stok - usedQty) * 1000) / 1000);
        await b.save();
      }
    }

    // 3. Increase Product Stock in MongoDB
    produk.stok += targetQty;
    await produk.save();

    // 4. Record Batch Entry in MongoDB
    const now = new Date();
    const timestamp = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    const batchId = `BATCH-${now.getFullYear()}-${Math.floor(100 + Math.random() * 900)}`;

    const newBatch = {
      id: batchId,
      timestamp,
      produkId,
      produkNama: produk.nama,
      jumlahPcs: targetQty,
      operator: user?.name || 'Tim Produk',
      pemotonganBahan
    };

    const mongoBatch = await RiwayatProduksi.create(newBatch);

    // Fallback JSON Sync
    const history = readCollection('riwayatProduksi');
    history.unshift(newBatch);
    writeCollection('riwayatProduksi', history);

    addAuditLog(
      user?.name || 'Tim Produk',
      user?.role || 'PRODUK',
      'Produksi Batch',
      `Eksekusi produksi ${targetQty} Pcs ${produk.nama} (${batchId}). Saved to MongoDB Atlas.`
    );

    return res.json({
      success: true,
      message: `Berhasil! Batch ${batchId} (+${targetQty} Pcs ${produk.nama}) tersimpan di MongoDB & stok bahan baku terpotong.`,
      data: mongoBatch
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
