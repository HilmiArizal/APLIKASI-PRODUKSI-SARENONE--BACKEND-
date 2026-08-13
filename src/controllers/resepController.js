const mongoose = require('mongoose');
const Resep = require('../models/Resep');
const Produk = require('../models/Produk');
const BahanBaku = require('../models/BahanBaku');
const { readCollection, writeCollection, addAuditLog } = require('../utils/dbHelper');

// GET /api/resep (Fetch all recipes with Mongo & JSON Sync)
exports.getAll = async (req, res) => {
  let mongoResepObj = {};
  if (mongoose.connection.readyState === 1) {
    try {
      const list = await Resep.find();
      if (list && list.length > 0) {
        list.forEach(r => {
          if (r.produkId) mongoResepObj[r.produkId] = r.items || [];
        });
      }
    } catch (err) {
      console.warn('Mongo getAll resep note:', err.message);
    }
  }

  const jsonResep = readCollection('resep');
  const finalResepObj = { ...jsonResep, ...mongoResepObj };

  return res.json({ success: true, data: finalResepObj });
};

// POST /api/resep & POST /api/resep/item (Save / Update Recipe Item)
exports.saveItem = async (req, res) => {
  try {
    const { produkId, bahanId, takaran, user } = req.body;
    if (!produkId || !bahanId || takaran === undefined) {
      return res.status(400).json({ success: false, message: 'produkId, bahanId, dan takaran wajib diisi.' });
    }

    const qty = Number(Math.round((parseFloat(takaran) || 0) + 'e6') + 'e-6');

    // 1. ALWAYS Update JSON Fallback File first to guarantee zero data loss
    const resepJSON = readCollection('resep');
    if (!resepJSON[produkId]) resepJSON[produkId] = [];
    const indexJSON = resepJSON[produkId].findIndex(item => item.bahanId === bahanId);
    if (indexJSON !== -1) {
      resepJSON[produkId][indexJSON].takaran = qty;
    } else {
      resepJSON[produkId].push({ bahanId, takaran: qty });
    }
    writeCollection('resep', resepJSON);

    // 2. Try Updating MongoDB Atlas if connected
    let isSavedMongo = false;
    if (mongoose.connection.readyState === 1) {
      try {
        let doc = await Resep.findOne({ produkId });
        if (!doc) {
          doc = new Resep({ produkId, items: [] });
        }

        const itemIdx = doc.items.findIndex(i => i.bahanId === bahanId);
        if (itemIdx !== -1) {
          doc.items[itemIdx].takaran = qty;
        } else {
          doc.items.push({ bahanId, takaran: qty });
        }

        await doc.save();
        isSavedMongo = true;
      } catch (mongoErr) {
        console.warn('Mongo resep save note:', mongoErr.message);
      }
    }

    // Audit Logging
    const jsonProduk = readCollection('produk').find(p => p.id === produkId);
    const jsonBahan = readCollection('bahanBaku').find(b => b.id === bahanId);
    const pNama = jsonProduk ? jsonProduk.nama : produkId;
    const bNama = jsonBahan ? jsonBahan.nama : bahanId;

    await addAuditLog(
      typeof user === 'string' ? user : (user?.name || 'Tim Bahan Baku'),
      'BAHAN_BAKU',
      'Update Resep BOM',
      `Menambahkan takaran bahan ${bNama} (${qty}) untuk produk ${pNama}.`
    );

    return res.json({
      success: true,
      message: `Takaran resep ${bNama} (${qty}) berhasil disimpan ke database!`,
      data: resepJSON[produkId]
    });
  } catch (err) {
    console.error('Save resep error:', err);
    return res.status(500).json({ success: false, message: 'Gagal menyimpan resep: ' + err.message });
  }
};

// DELETE /api/resep/:produkId/:bahanId & DELETE /api/resep/item
exports.removeItem = async (req, res) => {
  try {
    const produkId = req.params.produkId || req.body.produkId;
    const bahanId = req.params.bahanId || req.body.bahanId;
    const itemIndex = req.body.itemIndex;
    const user = req.body.user;

    if (!produkId) {
      return res.status(400).json({ success: false, message: 'produkId wajib diisi.' });
    }

    // 1. ALWAYS Delete from JSON Fallback File first
    const resepJSON = readCollection('resep');
    if (resepJSON[produkId]) {
      if (bahanId) {
        resepJSON[produkId] = resepJSON[produkId].filter(i => i.bahanId !== bahanId);
      } else if (itemIndex !== undefined && resepJSON[produkId][itemIndex]) {
        resepJSON[produkId].splice(itemIndex, 1);
      }
      writeCollection('resep', resepJSON);
    }

    // 2. Try Deleting from MongoDB Atlas if connected
    if (mongoose.connection.readyState === 1) {
      try {
        let doc = await Resep.findOne({ produkId });
        if (doc && doc.items) {
          if (bahanId) {
            doc.items = doc.items.filter(i => i.bahanId !== bahanId);
          } else if (itemIndex !== undefined && doc.items[itemIndex]) {
            doc.items.splice(itemIndex, 1);
          }
          await doc.save();
        }
      } catch (mongoErr) {
        console.warn('Mongo resep delete note:', mongoErr.message);
      }
    }

    await addAuditLog(
      typeof user === 'string' ? user : (user?.name || 'Tim Bahan Baku'),
      'BAHAN_BAKU',
      'Hapus Takaran Resep',
      `Menghapus bahan ${bNama} dari formulasi resep ${pNama}.`
    );

    return res.json({
      success: true,
      message: `Bahan ${bNama} berhasil dihapus dari resep.`,
      data: resepJSON[produkId]
    });
  } catch (err) {
    console.error('Remove resep item error:', err);
    return res.status(500).json({ success: false, message: 'Gagal menghapus resep item: ' + err.message });
  }
};

// POST /api/resep/import-excel (Bulk Import Resep / BOM Formula dari Excel)
exports.importExcel = async (req, res) => {
  try {
    const { items, user } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'Data baris Excel Resep tidak boleh kosong.' });
    }

    const mongoose = require('mongoose');

    let allProduk = [];
    let allBahan = [];

    if (mongoose.connection.readyState === 1) {
      try {
        allProduk = await Produk.find();
        allBahan = await BahanBaku.find();
      } catch (e) {}
    }

    if (allProduk.length === 0) allProduk = readCollection('produk');
    if (allBahan.length === 0) allBahan = readCollection('bahanBaku');

    let processedCount = 0;

    const cleanFloat = (val) => {
      const num = parseFloat(val);
      if (isNaN(num)) return 0;
      return Number(Math.round(num + 'e6') + 'e-6');
    };

    for (let item of items) {
      const produkSearch = (item.produkSku || item.produkNama || '').toString().trim().toLowerCase();
      const bahanSearch = (item.bahanSku || item.bahanNama || '').toString().trim().toLowerCase();
      const takaran = cleanFloat(item.takaran);

      if (!produkSearch || !bahanSearch || takaran <= 0) continue;

      const targetProduk = allProduk.find(p =>
        (p.sku && p.sku.toLowerCase() === produkSearch) ||
        (p.nama && p.nama.toLowerCase() === produkSearch) ||
        (p.id && p.id.toLowerCase() === produkSearch)
      );

      const targetBahan = allBahan.find(b =>
        (b.sku && b.sku.toLowerCase() === bahanSearch) ||
        (b.nama && b.nama.toLowerCase() === bahanSearch) ||
        (b.id && b.id.toLowerCase() === bahanSearch)
      );

      if (!targetProduk || !targetBahan) continue;

      const produkId = targetProduk.id;
      const bahanId = targetBahan.id;

      if (mongoose.connection.readyState === 1) {
        try {
          let doc = await Resep.findOne({ produkId });
          if (!doc) doc = new Resep({ produkId, items: [] });

          const idx = doc.items.findIndex(i => i.bahanId === bahanId);
          if (idx !== -1) {
            doc.items[idx].takaran = takaran;
          } else {
            doc.items.push({ bahanId, takaran });
          }
          await doc.save();
        } catch (e) {}
      }

      const resepJSON = readCollection('resep');
      if (!resepJSON[produkId]) resepJSON[produkId] = [];
      const jsonIdx = resepJSON[produkId].findIndex(i => i.bahanId === bahanId);
      if (jsonIdx !== -1) {
        resepJSON[produkId][jsonIdx].takaran = takaran;
      } else {
        resepJSON[produkId].push({ bahanId, takaran });
      }
      writeCollection('resep', resepJSON);

      processedCount++;
    }

    await addAuditLog(
      user?.name || 'Tim Bahan Baku',
      user?.role || 'BAHAN_BAKU',
      'Import Excel Resep BOM',
      `Berhasil memproses & mengimpor ${processedCount} takaran resep formulasi produk dari Excel.`
    );

    return res.json({
      success: true,
      message: `Berhasil memproses ${processedCount} baris formulasi resep (BOM) dari Excel ke MongoDB Atlas!`,
      data: { processedCount }
    });
  } catch (err) {
    console.error('Import Excel Resep error:', err);
    return res.status(500).json({ success: false, message: 'Gagal mengimpor Excel Resep: ' + err.message });
  }
};
