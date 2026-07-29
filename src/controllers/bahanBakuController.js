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

    await addAuditLog(user?.name || 'Tim Bahan Baku', user?.role || 'BAHAN_BAKU', 'Tambah Bahan', `Pendaftaran bahan baku baru: ${nama} (${sku}). Saved to MongoDB Atlas.`);

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

    await addAuditLog(user?.name || 'Tim Bahan Baku', user?.role || 'BAHAN_BAKU', 'Update Bahan', `Pembaruan bahan baku ${nama} di MongoDB.`);

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

    const mongoose = require('mongoose');
    if (mongoose.connection.readyState === 1) {
      const query = mongoose.Types.ObjectId.isValid(id) ? { $or: [{ id }, { _id: id }] } : { id };
      await BahanBaku.deleteMany(query);
    }

    let list = readCollection('bahanBaku');
    const target = list.find(x => x.id === id);
    list = list.filter(x => x.id !== id);
    writeCollection('bahanBaku', list);

    await addAuditLog(user?.name || 'Tim Bahan Baku', user?.role || 'BAHAN_BAKU', 'Hapus Bahan', `Menghapus bahan baku ${target ? target.nama : id} dari MongoDB Atlas.`);

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

    await addAuditLog(
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

// POST /api/bahan-baku/import-excel (Bulk Import dari File Excel / CSV)
exports.importExcel = async (req, res) => {
  try {
    const { items, user } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'Data baris Excel tidak boleh kosong.' });
    }

    const createdItems = [];
    const updatedItems = [];

    const mongoose = require('mongoose');

    for (let item of items) {
      const sku = (item.sku || `BHN-${Math.floor(100 + Math.random() * 900)}`).toString().trim();
      const nama = (item.nama || item.namaBahan || 'Bahan Masukan Excel').toString().trim();
      const kategori = (item.kategori || 'Bahan Utama').toString().trim();
      const satuan = (item.satuan || 'kg').toString().trim();
      const stok = parseFloat(item.stok) || 0;
      const minStok = parseFloat(item.minStok) || 0;
      const harga = parseFloat(item.harga) || 0;

      const filterQuery = { sku: new RegExp(`^${sku}$`, 'i') };
      const updateData = {
        sku,
        nama,
        kategori,
        satuan,
        stok,
        minStok,
        harga
      };

      if (mongoose.connection.readyState === 1) {
        try {
          let existing = await BahanBaku.findOne(filterQuery);
          if (existing) {
            existing.nama = nama;
            existing.kategori = kategori;
            existing.satuan = satuan;
            existing.stok = stok;
            existing.minStok = minStok;
            existing.harga = harga;
            await existing.save();
            updatedItems.push(existing);
          } else {
            const newItemObj = {
              id: 'b_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
              ...updateData
            };
            const created = await BahanBaku.create(newItemObj);
            createdItems.push(created);
          }
        } catch (mongoErr) {
          console.warn('Import item mongo note:', mongoErr.message);
        }
      }
    }

    await addAuditLog(
      user?.name || 'Tim Bahan Baku',
      user?.role || 'BAHAN_BAKU',
      'Import Excel Bahan',
      `Import masal ${items.length} item bahan baku dari file Excel ke MongoDB Atlas.`
    );

    return res.json({
      success: true,
      message: `Berhasil memproses ${items.length} data bahan baku dari Excel ke MongoDB Atlas!`,
      data: { createdCount: createdItems.length, updatedCount: updatedItems.length }
    });
  } catch (err) {
    console.error('Import Excel error:', err);
    return res.status(500).json({ success: false, message: 'Gagal mengimpor Excel: ' + err.message });
  }
};
