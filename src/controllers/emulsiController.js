const mongoose = require('mongoose');
const BahanBaku = require('../models/BahanBaku');
const { readCollection, writeCollection, addAuditLog } = require('../utils/dbHelper');

// POST /api/emulsi/process (Eksekusi Batch Pengolahan Emulsi ISP / TVP)
exports.processEmulsi = async (req, res) => {
  try {
    const { jenisEmulsi, jumlahBatch = 1, user } = req.body;
    // jenisEmulsi: 'ISP' | 'TVP'
    if (!jenisEmulsi || !jumlahBatch || jumlahBatch <= 0) {
      return res.status(400).json({ success: false, message: 'Jenis emulsi (ISP/TVP) dan jumlah batch (>0) wajib diisi.' });
    }

    const batchNum = Math.max(1, parseInt(jumlahBatch) || 1);

    let mainQty = 0;
    let waterQty = 0;
    let oilQty = 0;
    let yieldQty = 0;

    let mainMaterialSearch = '';
    let emulsionName = '';
    let emulsionSku = '';

    if (jenisEmulsi === 'ISP') {
      // 1 Batch ISP: 2kg Marksoy + 4kg Air Es + 4 Pouch Minyak (2L) => Yield 20kg Emulsi ISP
      mainQty = 2 * batchNum;
      waterQty = 4 * batchNum;
      oilQty = 4 * batchNum; // 4 pouch (kemasan 2L)
      yieldQty = 20 * batchNum;
      mainMaterialSearch = 'marksoy';
      emulsionName = 'Emulsi ISP';
      emulsionSku = 'EML-ISP';
    } else {
      // 1 Batch TVP: 1kg TVP + 3kg Air Es => Yield 3.5kg Emulsi TVP
      mainQty = 1 * batchNum;
      waterQty = 3 * batchNum;
      oilQty = 0;
      yieldQty = 3.5 * batchNum;
      mainMaterialSearch = 'tvp';
      emulsionName = 'Emulsi TVP';
      emulsionSku = 'EML-TVP';
    }

    // Search materials in database
    let allBahanMongo = [];
    if (mongoose.connection.readyState === 1) {
      try { allBahanMongo = await BahanBaku.find(); } catch (e) {}
    }
    const allBahanJson = readCollection('bahanBaku');
    const sourceBahanList = allBahanMongo.length > 0 ? allBahanMongo : allBahanJson;

    // Find main raw material
    let mainBahan = sourceBahanList.find(b =>
      b.nama.toLowerCase().includes(mainMaterialSearch) ||
      b.nama.toLowerCase().includes('isp') ||
      b.sku.toLowerCase().includes(mainMaterialSearch)
    );
    let waterBahan = sourceBahanList.find(b => b.nama.toLowerCase().includes('air') || b.nama.toLowerCase().includes('es') || b.sku.toLowerCase().includes('air'));
    let oilBahan = jenisEmulsi === 'ISP' ? sourceBahanList.find(b => b.nama.toLowerCase().includes('minyak') || b.nama.toLowerCase().includes('lemak') || b.sku.toLowerCase().includes('minyak')) : null;

    // Check stock
    const missing = [];
    if (mainBahan && mainBahan.stok < mainQty) {
      missing.push(`${mainBahan.nama} (Butuh: ${mainQty} kg, Stok: ${mainBahan.stok} ${mainBahan.satuan})`);
    }
    if (waterBahan && waterBahan.stok < waterQty) {
      missing.push(`${waterBahan.nama} (Butuh: ${waterQty} kg, Stok: ${waterBahan.stok} ${waterBahan.satuan})`);
    }
    if (oilBahan && oilQty > 0 && oilBahan.stok < oilQty) {
      missing.push(`${oilBahan.nama} (Butuh: ${oilQty} pouch/L, Stok: ${oilBahan.stok} ${oilBahan.satuan})`);
    }

    if (missing.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Stok bahan baku tidak mencukupi untuk ${batchNum} Batch ${emulsionName}: ${missing.join(', ')}.`
      });
    }

    // Deduct
    const deductedDetails = [];
    const deductMaterial = async (target, qtyToDeduct, defaultName, unit) => {
      const name = target ? target.nama : defaultName;
      const u = target ? target.satuan : unit;
      deductedDetails.push(`${name}: -${qtyToDeduct} ${u}`);

      if (mongoose.connection.readyState === 1 && target) {
        try {
          const doc = await BahanBaku.findOne({ id: target.id });
          if (doc) {
            doc.stok = Math.max(0, Math.round((doc.stok - qtyToDeduct) * 1000) / 1000);
            await doc.save();
          }
        } catch (e) {}
      }
    };

    const mainName = jenisEmulsi === 'ISP' ? 'Marksoy / ISP' : 'TVP';
    await deductMaterial(mainBahan, mainQty, mainName, 'kg');
    await deductMaterial(waterBahan, waterQty, 'Air Es', 'kg');
    if (jenisEmulsi === 'ISP' && oilQty > 0) {
      await deductMaterial(oilBahan, oilQty, 'Minyak Goreng (2L)', oilBahan?.satuan || 'pouch');
    }

    // Add or Update Emulsion Stock in BahanBaku
    if (mongoose.connection.readyState === 1) {
      try {
        let doc = await BahanBaku.findOne({ $or: [{ sku: emulsionSku }, { nama: emulsionName }] });
        if (!doc) {
          doc = new BahanBaku({
            id: 'b_eml_' + Date.now(),
            sku: emulsionSku,
            nama: emulsionName,
            kategori: 'Hasil Emulsi',
            stok: yieldQty,
            minStok: 10,
            satuan: 'kg',
            harga: 0
          });
        } else {
          doc.stok = Math.round((doc.stok + yieldQty) * 1000) / 1000;
        }
        await doc.save();
      } catch (e) {}
    }

    // Update JSON fallback
    const jsonList = readCollection('bahanBaku');
    let jsonEmulsionIdx = jsonList.findIndex(b => b.sku === emulsionSku || b.nama.toLowerCase() === emulsionName.toLowerCase());
    if (jsonEmulsionIdx !== -1) {
      jsonList[jsonEmulsionIdx].stok = Math.round((jsonList[jsonEmulsionIdx].stok + yieldQty) * 1000) / 1000;
    } else {
      jsonList.push({
        id: 'b_eml_' + Date.now(),
        sku: emulsionSku,
        nama: emulsionName,
        kategori: 'Hasil Emulsi',
        stok: yieldQty,
        minStok: 10,
        satuan: 'kg',
        harga: 0
      });
    }
    writeCollection('bahanBaku', jsonList);

    await addAuditLog(
      user?.name || 'Tim Bahan Baku',
      user?.role || 'BAHAN_BAKU',
      `Pengolahan ${emulsionName}`,
      `Memproses ${batchNum} Batch ${emulsionName}. Menghasilkan +${yieldQty} kg ${emulsionName}.`
    );

    return res.json({
      success: true,
      message: `Pengolahan ${batchNum} Batch ${emulsionName} Berhasil! Hasil Emulsi +${yieldQty} kg ditambahkan ke persediaan.`,
      data: {
        jenisEmulsi,
        batchNum,
        yieldQty,
        deductedDetails
      }
    });
  } catch (err) {
    console.error('Process batch emulsi error:', err);
    return res.status(500).json({ success: false, message: 'Gagal memproses emulsi: ' + err.message });
  }
};
