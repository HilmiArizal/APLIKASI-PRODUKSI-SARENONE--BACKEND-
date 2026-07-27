const Resep = require('../models/Resep');
const Produk = require('../models/Produk');
const BahanBaku = require('../models/BahanBaku');
const { readCollection, writeCollection, addAuditLog } = require('../utils/dbHelper');

// GET /api/resep
exports.getAll = async (req, res) => {
  try {
    const list = await Resep.find();
    const resepObj = {};
    list.forEach(r => {
      resepObj[r.produkId] = r.items || [];
    });
    return res.json({ success: true, data: resepObj });
  } catch (err) {
    const fallback = readCollection('resep');
    return res.json({ success: true, data: fallback });
  }
};

// POST /api/resep/item
exports.saveItem = async (req, res) => {
  try {
    const { produkId, bahanId, takaran, user } = req.body;
    if (!produkId || !bahanId || takaran === undefined) {
      return res.status(400).json({ success: false, message: 'produkId, bahanId, dan takaran wajib diisi.' });
    }

    const qty = parseFloat(takaran);

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

    // Fallback JSON sync
    const resep = readCollection('resep');
    if (!resep[produkId]) resep[produkId] = [];
    const index = resep[produkId].findIndex(item => item.bahanId === bahanId);
    if (index !== -1) resep[produkId][index].takaran = qty;
    else resep[produkId].push({ bahanId, takaran: qty });
    writeCollection('resep', resep);

    const p = await Produk.findOne({ id: produkId });
    const b = await BahanBaku.findOne({ id: bahanId });

    addAuditLog(user?.name || 'Tim Produk', user?.role || 'PRODUK', 'Update Resep', `Menambahkan ${b ? b.nama : ''} (${qty}) ke resep ${p ? p.nama : ''}. Saved to MongoDB.`);

    return res.json({ success: true, message: 'Formula resep diperbarui di MongoDB.', data: doc.items });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// DELETE /api/resep/item
exports.removeItem = async (req, res) => {
  try {
    const { produkId, itemIndex, user } = req.body;

    let doc = await Resep.findOne({ produkId });
    if (doc && doc.items[itemIndex] !== undefined) {
      doc.items.splice(itemIndex, 1);
      await doc.save();
    }

    const resep = readCollection('resep');
    if (resep[produkId] && resep[produkId][itemIndex] !== undefined) {
      resep[produkId].splice(itemIndex, 1);
      writeCollection('resep', resep);
    }

    return res.json({ success: true, message: 'Item resep dihapus dari MongoDB.', data: doc ? doc.items : [] });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
