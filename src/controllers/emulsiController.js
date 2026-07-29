const mongoose = require('mongoose');
const BahanBaku = require('../models/BahanBaku');
const { readCollection, writeCollection, addAuditLog } = require('../utils/dbHelper');

// POST /api/emulsi/process (Eksekusi Batch Pengolahan Emulsi ISP / TVP)
exports.processEmulsi = async (req, res) => {
  try {
    const { jenisEmulsi, jumlahBatch = 1, user } = req.body;
    if (!jenisEmulsi || !jumlahBatch || jumlahBatch <= 0) {
      return res.status(400).json({ success: false, message: 'Jenis emulsi (ISP/TVP) dan jumlah batch (>0) wajib diisi.' });
    }

    const batchNum = Math.max(1, parseInt(jumlahBatch) || 1);

    let mainQty = 0;
    let waterQty = 0;
    let oilQty = 0;
    let yieldQty = 0;

    let emulsionName = '';
    let emulsionSku = '';

    if (jenisEmulsi === 'ISP') {
      // 1 Batch ISP: 2kg Marksoy + 4kg Air Es + 4 Pouch Minyak (2L) => Yield 20kg Emulsi ISP
      mainQty = 2 * batchNum;
      waterQty = 4 * batchNum;
      oilQty = 4 * batchNum; // 4 pouch (kemasan 2L)
      yieldQty = 20 * batchNum;
      emulsionName = 'Emulsi ISP';
      emulsionSku = 'EML-ISP';
    } else {
      // 1 Batch TVP: 1kg TVP + 3kg Air Es => Yield 3.5kg Emulsi TVP
      mainQty = 1 * batchNum;
      waterQty = 3 * batchNum;
      oilQty = 0;
      yieldQty = 3.5 * batchNum;
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

    // Strictly search for RAW materials (EXCLUDING Emulsi items!)
    let mainBahan = null;
    if (jenisEmulsi === 'ISP') {
      mainBahan = sourceBahanList.find(b => {
        const name = (b.nama || '').toLowerCase();
        const sku = (b.sku || '').toLowerCase();
        return !name.includes('emulsi') && (name.includes('marksoy') || name.includes('isp') || sku.includes('marksoy') || sku.includes('isp'));
      });
    } else {
      mainBahan = sourceBahanList.find(b => {
        const name = (b.nama || '').toLowerCase();
        const sku = (b.sku || '').toLowerCase();
        return !name.includes('emulsi') && (name.includes('tvp') || sku.includes('tvp'));
      });
    }

    let waterBahan = sourceBahanList.find(b => {
      const name = (b.nama || '').toLowerCase();
      const sku = (b.sku || '').toLowerCase();
      return !name.includes('emulsi') && (name.includes('air') || name.includes('es') || sku.includes('air'));
    });

    let oilBahan = jenisEmulsi === 'ISP' ? sourceBahanList.find(b => {
      const name = (b.nama || '').toLowerCase();
      const sku = (b.sku || '').toLowerCase();
      return !name.includes('emulsi') && (name.includes('minyak') || name.includes('lemak') || sku.includes('minyak'));
    }) : null;

    // Check stock sufficiency
    const missing = [];
    const mainMaterialName = jenisEmulsi === 'ISP' ? 'Marksoy / ISP' : 'TVP Granules';

    if (!mainBahan) {
      missing.push(`Bahan Mentah ${mainMaterialName} belum terdaftar di Stok Bahan Baku`);
    } else if (mainBahan.stok < mainQty) {
      missing.push(`${mainBahan.nama} (Butuh: ${mainQty} kg, Stok Tersedia: ${mainBahan.stok} ${mainBahan.satuan})`);
    }

    if (!waterBahan) {
      missing.push(`Bahan Mentah Air Es Batu belum terdaftar di Stok Bahan Baku`);
    } else if (waterBahan.stok < waterQty) {
      missing.push(`${waterBahan.nama} (Butuh: ${waterQty} kg, Stok Tersedia: ${waterBahan.stok} ${waterBahan.satuan})`);
    }

    if (jenisEmulsi === 'ISP' && oilQty > 0) {
      if (!oilBahan) {
        missing.push(`Bahan Mentah Minyak Goreng belum terdaftar di Stok Bahan Baku`);
      } else if (oilBahan.stok < oilQty) {
        missing.push(`${oilBahan.nama} (Butuh: ${oilQty} pouch/L, Stok Tersedia: ${oilBahan.stok} ${oilBahan.satuan})`);
      }
    }

    if (missing.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Stok bahan mentah tidak mencukupi untuk ${batchNum} Batch ${emulsionName}: ${missing.join(', ')}.`
      });
    }

    // Deduct Materials (Update both MongoDB & JSON)
    const deductedDetails = [];
    const deductMaterial = async (target, qtyToDeduct, defaultName, unit) => {
      if (!target) return;
      const name = target.nama || defaultName;
      const u = target.satuan || unit;
      deductedDetails.push(`${name}: -${qtyToDeduct} ${u}`);

      // 1. Update MongoDB Atlas
      if (mongoose.connection.readyState === 1) {
        try {
          const doc = await BahanBaku.findOne({ id: target.id });
          if (doc) {
            doc.stok = Math.max(0, Math.round((doc.stok - qtyToDeduct) * 1000) / 1000);
            await doc.save();
          }
        } catch (e) {}
      }

      // 2. Update local JSON collection
      const jsonList = readCollection('bahanBaku');
      const idx = jsonList.findIndex(b => b.id === target.id || b.sku === target.sku);
      if (idx !== -1) {
        jsonList[idx].stok = Math.max(0, Math.round((jsonList[idx].stok - qtyToDeduct) * 1000) / 1000);
        writeCollection('bahanBaku', jsonList);
      }
    };

    if (mainBahan) await deductMaterial(mainBahan, mainQty, mainMaterialName, 'kg');
    if (waterBahan) await deductMaterial(waterBahan, waterQty, 'Air Es', 'kg');
    if (jenisEmulsi === 'ISP' && oilBahan && oilQty > 0) {
      await deductMaterial(oilBahan, oilQty, 'Minyak Goreng', oilBahan.satuan || 'pouch');
    }

    // Add / Increase Emulsion Stock (+yieldQty) in MongoDB & JSON
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
      `Memproses ${batchNum} Batch ${emulsionName}. Pemotongan mentah: ${deductedDetails.join(', ')}. Menghasilkan +${yieldQty} kg ${emulsionName}.`
    );

    return res.json({
      success: true,
      message: `Pengolahan ${batchNum} Batch ${emulsionName} Berhasil! Stok mentah terpotong & Hasil ${emulsionName} +${yieldQty} kg ditambahkan.`,
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
