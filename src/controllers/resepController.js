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

    const qty = parseFloat(takaran);

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

    addAuditLog(
      typeof user === 'string' ? user : (user?.name || 'Tim Produk'),
      'PRODUK',
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

    return res.json({
      success: true,
      message: 'Takaran bahan berhasil dihapus dari database.',
      data: resepJSON[produkId] || []
    });
  } catch (err) {
    console.error('Remove resep error:', err);
    return res.status(500).json({ success: false, message: 'Gagal menghapus resep: ' + err.message });
  }
};
