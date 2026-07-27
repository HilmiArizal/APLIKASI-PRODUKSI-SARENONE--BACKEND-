const BahanBaku = require('../models/BahanBaku');
const { readCollection, writeCollection, addAuditLog } = require('../utils/dbHelper');

// GET /api/bahan-baku
exports.getAll = async (req, res) => {
  try {
    const list = await BahanBaku.find().sort({ createdAt: -1 });
    return res.json({ success: true, data: list });
  } catch (err) {
    const fallback = readCollection('bahanBaku');
    return res.json({ success: true, data: fallback });
  }
};

// POST /api/bahan-baku (Create Bahan Baku di MongoDB)
exports.create = async (req, res) => {
  try {
    const { sku, nama, kategori, satuan, stok, minStok, harga, user } = req.body;
    if (!nama || !sku) {
      return res.status(400).json({ success: false, message: 'SKU dan Nama Bahan Baku wajib diisi.' });
    }

    const newItem = {
      id: 'b_' + Date.now(),
      sku,
      nama,
      kategori: kategori || 'Bahan Utama',
      satuan: satuan || 'kg',
      stok: parseFloat(stok) || 0,
      minStok: parseFloat(minStok) || 0,
      harga: parseFloat(harga) || 0
    };

    const mongoItem = await BahanBaku.create(newItem);

    const list = readCollection('bahanBaku');
    list.push(newItem);
    writeCollection('bahanBaku', list);

    addAuditLog(user?.name || 'Tim Bahan Baku', user?.role || 'BAHAN_BAKU', 'Tambah Bahan', `Pendaftaran bahan baku baru: ${nama} (${sku}). Saved to MongoDB Atlas.`);

    return res.status(201).json({ success: true, message: 'Bahan baku tersimpan di MongoDB Atlas.', data: mongoItem });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// PUT /api/bahan-baku/:id (Update Bahan Baku di MongoDB)
exports.update = async (req, res) => {
  try {
    const { id } = req.params;
    const { sku, nama, kategori, satuan, stok, minStok, harga, user } = req.body;

    const mongoItem = await BahanBaku.findOneAndUpdate(
      { id },
      { sku, nama, kategori, satuan, stok: parseFloat(stok), minStok: parseFloat(minStok), harga: parseFloat(harga) },
      { returnDocument: 'after' }
    );

    const list = readCollection('bahanBaku');
    const index = list.findIndex(x => x.id === id);
    if (index !== -1) {
      list[index] = { ...list[index], sku, nama, kategori, satuan, stok, minStok, harga };
      writeCollection('bahanBaku', list);
    }

    addAuditLog(user?.name || 'Tim Bahan Baku', user?.role || 'BAHAN_BAKU', 'Update Bahan', `Pembaruan bahan baku ${nama} di MongoDB.`);

    return res.json({ success: true, message: 'Data bahan baku diperbarui di MongoDB Atlas.', data: mongoItem || list[index] });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// DELETE /api/bahan-baku/:id (Delete Bahan Baku di MongoDB)
exports.remove = async (req, res) => {
  try {
    const { id } = req.params;
    const { user } = req.body;

    await BahanBaku.findOneAndDelete({ id });

    let list = readCollection('bahanBaku');
    const target = list.find(x => x.id === id);
    list = list.filter(x => x.id !== id);
    writeCollection('bahanBaku', list);

    addAuditLog(user?.name || 'Tim Bahan Baku', user?.role || 'BAHAN_BAKU', 'Hapus Bahan', `Menghapus bahan baku ${target ? target.nama : id} dari MongoDB.`);

    return res.json({ success: true, message: 'Bahan baku berhasil dihapus dari MongoDB Atlas.' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/bahan-baku/restock (Restock Stok Masuk Supplier di MongoDB)
exports.restock = async (req, res) => {
  try {
    const { bahanId, jumlah, supplier, catatan, user } = req.body;
    if (!bahanId || !jumlah) {
      return res.status(400).json({ success: false, message: 'Bahan ID dan Jumlah wajib diisi.' });
    }

    const qty = parseFloat(jumlah);

    let item = await BahanBaku.findOne({ id: bahanId });
    if (item) {
      item.stok += qty;
      await item.save();
    }

    const list = readCollection('bahanBaku');
    const index = list.findIndex(x => x.id === bahanId);
    if (index !== -1) {
      list[index].stok += qty;
      writeCollection('bahanBaku', list);
    }

    const itemNama = item ? item.nama : (list[index] ? list[index].nama : 'Bahan Baku');
    const itemSatuan = item ? item.satuan : (list[index] ? list[index].satuan : 'unit');

    addAuditLog(
      user?.name || 'Tim Bahan Baku',
      user?.role || 'BAHAN_BAKU',
      'Restock Bahan',
      `Stok masuk ${itemNama} +${qty} ${itemSatuan} dari ${supplier || 'Supplier'}. ${catatan ? '(' + catatan + ')' : ''}`
    );

    return res.json({ success: true, message: 'Restock bahan baku berhasil disimpan di MongoDB Atlas.', data: item || list[index] });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
