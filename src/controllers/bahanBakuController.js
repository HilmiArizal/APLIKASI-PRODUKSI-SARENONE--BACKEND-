const mongoose = require('mongoose');
const BahanBaku = require('../models/BahanBaku');
const { readCollection, writeCollection, addAuditLog } = require('../utils/dbHelper');

// Helper auto-seed Sticker Barcode & Sticker Produk if missing
const ensureStickersExist = async (list) => {
  // Purge any old "Sticker Produk Saren One"
  if (mongoose.connection.readyState === 1) {
    try {
      await BahanBaku.deleteMany({
        $or: [
          { nama: /saren one/i }
        ]
      });
    } catch (e) {}
  }
  let jsonList = readCollection('bahanBaku');
  const filteredJson = jsonList.filter(b => !String(b.nama || '').toLowerCase().includes('saren one'));
  if (filteredJson.length !== jsonList.length) {
    writeCollection('bahanBaku', filteredJson);
  }

  list = list.filter(b => !String(b.nama || '').toLowerCase().includes('saren one'));

  const stickers = [
    { sku: 'BB60', nama: 'Sticker Barcode', kategori: 'Bahan Kemasan', satuan: 'pcs', stok: 500, minStok: 100, harga: 200 },
    { sku: 'BB61', nama: 'Sticker Produk', kategori: 'Bahan Kemasan', satuan: 'pcs', stok: 500, minStok: 100, harga: 350 }
  ];

  for (const stk of stickers) {
    const exists = list.some(b => 
      String(b.sku || '').toLowerCase() === stk.sku.toLowerCase() ||
      String(b.nama || '').toLowerCase() === stk.nama.toLowerCase()
    );
    if (!exists) {
      const newItem = { id: 'b_' + Date.now() + Math.floor(Math.random() * 1000), ...stk };
      if (mongoose.connection.readyState === 1) {
        try { await BahanBaku.create(newItem); } catch (e) {}
      }
      let currentJson = readCollection('bahanBaku');
      if (!currentJson.some(b => String(b.sku || '').toLowerCase() === stk.sku.toLowerCase())) {
        currentJson.push(newItem);
        writeCollection('bahanBaku', currentJson);
      }
      list.push(newItem);
    }
  }
  return list;
};

// GET /api/bahan-baku
exports.getAll = async (req, res) => {
  try {
    let list = await BahanBaku.find().sort({ createdAt: -1 });
    list = await ensureStickersExist(list);
    return res.json({ success: true, data: list });
  } catch (err) {
    let fallback = readCollection('bahanBaku');
    fallback = await ensureStickersExist(fallback);
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

// POST /api/bahan-baku/pemakaian-kemasan
exports.useKemasan = async (req, res) => {
  try {
    const { bahanId, sku, nama, jumlah, keterangan, user } = req.body;
    if ((!bahanId && !sku && !nama) || !jumlah || jumlah <= 0) {
      return res.status(400).json({ success: false, message: 'Bahan kemasan dan jumlah pemakaian (>0) wajib diisi.' });
    }

    const qtyToDeduct = parseFloat(jumlah);
    const searchIdStr = String(bahanId || sku || nama || '').trim().toLowerCase();
    const searchSkuStr = String(sku || '').trim().toLowerCase();
    const searchNamaStr = String(nama || '').trim().toLowerCase();

    let allBahanMongo = [];
    if (mongoose.connection.readyState === 1) {
      try { allBahanMongo = await BahanBaku.find(); } catch (e) {}
    }
    const allBahanJson = readCollection('bahanBaku');
    const combinedList = [...allBahanMongo, ...allBahanJson];

    let targetBahan = combinedList.find(b => {
      const bId = String(b.id || '').trim().toLowerCase();
      const bSku = String(b.sku || '').trim().toLowerCase();
      const bMongoId = String(b._id || '').trim().toLowerCase();
      const bNama = String(b.nama || '').trim().toLowerCase();

      return (
        (searchIdStr && (bId === searchIdStr || bSku === searchIdStr || bMongoId === searchIdStr || bNama === searchIdStr)) ||
        (searchSkuStr && bSku === searchSkuStr) ||
        (searchNamaStr && bNama === searchNamaStr) ||
        (bSku && searchIdStr.includes(bSku)) ||
        (bNama && (searchIdStr.includes(bNama) || bNama.includes(searchIdStr)))
      );
    });

    if (!targetBahan && combinedList.length > 0) {
      // Emergency fallback to first packaging item in database
      targetBahan = combinedList.find(b => {
        const kat = (b.kategori || '').toLowerCase();
        const nm = (b.nama || '').toLowerCase();
        return kat.includes('kemasan') || nm.includes('vacum') || nm.includes('casing') || nm.includes('plastik');
      }) || combinedList[0];
    }

    if (!targetBahan) {
      return res.status(404).json({ success: false, message: 'Bahan kemasan tidak ditemukan di database.' });
    }

    if (targetBahan.stok < qtyToDeduct) {
      return res.status(400).json({
        success: false,
        message: `Stok ${targetBahan.nama} tidak mencukupi. Butuh: ${qtyToDeduct} ${targetBahan.satuan}, Stok Tersedia: ${targetBahan.stok} ${targetBahan.satuan}.`
      });
    }

    // 1. Update MongoDB Atlas
    if (mongoose.connection.readyState === 1) {
      try {
        const queryOr = [];
        if (targetBahan.id) queryOr.push({ id: targetBahan.id });
        if (targetBahan.sku) queryOr.push({ sku: targetBahan.sku });
        if (targetBahan._id) queryOr.push({ _id: targetBahan._id });
        if (mongoose.Types.ObjectId.isValid(bahanId)) queryOr.push({ _id: bahanId });

        if (queryOr.length > 0) {
          const doc = await BahanBaku.findOne({ $or: queryOr });
          if (doc) {
            doc.stok = Math.max(0, Math.round((doc.stok - qtyToDeduct) * 1000) / 1000);
            await doc.save();
          }
        }
      } catch (e) {}
    }

    // 2. Update local JSON
    const jsonList = readCollection('bahanBaku');
    const idx = jsonList.findIndex(b => {
      const bId = String(b.id || '').trim().toLowerCase();
      const bSku = String(b.sku || '').trim().toLowerCase();
      const targetId = String(targetBahan.id || '').trim().toLowerCase();
      const targetSku = String(targetBahan.sku || '').trim().toLowerCase();
      return bId === searchIdStr || bSku === searchIdStr || bId === targetId || bSku === targetSku;
    });

    if (idx !== -1) {
      jsonList[idx].stok = Math.max(0, Math.round((jsonList[idx].stok - qtyToDeduct) * 1000) / 1000);
      writeCollection('bahanBaku', jsonList);
    }

    // Audit log for primary item
    await addAuditLog(
      user?.name || 'Tim Bahan Baku',
      user?.role || 'BAHAN_BAKU',
      'Pemakaian Bahan Kemasan',
      `Pemakaian ${qtyToDeduct} ${targetBahan.satuan} ${targetBahan.nama}. Keterangan: ${keterangan || 'Pengemasan Produksi'}.`
    );

    // AUTO-DEDUCT STICKERS ONLY IF VACUMBAG WAS USED (RESTOCK / EDIT WILL NOT TRIGGER THIS)
    const isVacumbag = (targetBahan.nama || '').toLowerCase().includes('vacum');
    if (isVacumbag) {
      try {
        const stickersToDeduct = combinedList.filter(b => {
          const nm = (b.nama || '').toLowerCase();
          const isStk = nm.includes('sticker') || nm.includes('stiker') || nm.includes('barcode');
          return isStk && (b.id !== targetBahan.id && b.sku !== targetBahan.sku);
        });

        for (const stk of stickersToDeduct) {
          // 1. Update Mongo
          if (mongoose.connection.readyState === 1) {
            try {
              const queryOr = [];
              if (stk.id) queryOr.push({ id: stk.id });
              if (stk.sku) queryOr.push({ sku: stk.sku });
              if (stk._id) queryOr.push({ _id: stk._id });

              if (queryOr.length > 0) {
                const docStk = await BahanBaku.findOne({ $or: queryOr });
                if (docStk) {
                  docStk.stok = Math.max(0, Math.round((docStk.stok - qtyToDeduct) * 1000) / 1000);
                  await docStk.save();
                }
              }
            } catch (e) {}
          }

          // 2. Update JSON
          const jsonListStk = readCollection('bahanBaku');
          const idxStk = jsonListStk.findIndex(b =>
            String(b.id || '').toLowerCase() === String(stk.id || '').toLowerCase() ||
            String(b.sku || '').toLowerCase() === String(stk.sku || '').toLowerCase()
          );
          if (idxStk !== -1) {
            jsonListStk[idxStk].stok = Math.max(0, Math.round((jsonListStk[idxStk].stok - qtyToDeduct) * 1000) / 1000);
            writeCollection('bahanBaku', jsonListStk);
          }

          // Audit log for auto sticker deduction
          await addAuditLog(
            user?.name || 'Tim Bahan Baku',
            user?.role || 'BAHAN_BAKU',
            'Pemakaian Bahan Kemasan',
            `Pemakaian ${qtyToDeduct} ${stk.satuan} ${stk.nama}. Keterangan: Otomatis Terpotong Seiring Pemakaian ${targetBahan.nama}.`
          );
        }
      } catch (stkErr) {
        console.warn('Auto deduct sticker note:', stkErr.message);
      }
    }

    return res.json({
      success: true,
      message: `Pemakaian ${qtyToDeduct} ${targetBahan.satuan} ${targetBahan.nama} berhasil dicatat! ${isVacumbag ? 'Stok Sticker Barcode & Sticker Produk otomatis ikut terpotong.' : ''}`,
      data: {
        bahanId,
        nama: targetBahan.nama,
        jumlah: qtyToDeduct,
        satuan: targetBahan.satuan,
        sisaStok: Math.max(0, Math.round((targetBahan.stok - qtyToDeduct) * 1000) / 1000)
      }
    });
  } catch (err) {
    console.error('Use kemasan error:', err);
    return res.status(500).json({ success: false, message: 'Gagal mencatat pemakaian kemasan: ' + err.message });
  }
};
