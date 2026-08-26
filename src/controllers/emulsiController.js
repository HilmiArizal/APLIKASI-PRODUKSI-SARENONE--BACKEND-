const mongoose = require('mongoose');
const BahanBaku = require('../models/BahanBaku');
const AuditLog = require('../models/AuditLog');
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
      // 1 Batch TVP: 1kg TVP + 3kg Air Biasa (Tanpa Air Es & Tanpa Minyak) => Yield 4kg Emulsi TVP
      mainQty = 1 * batchNum;
      waterQty = 0; // Air biasa, tidak memotong stok Air Es
      oilQty = 0;
      yieldQty = 4 * batchNum;
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

    let waterBahan = jenisEmulsi === 'ISP' ? sourceBahanList.find(b => {
      const name = (b.nama || '').toLowerCase();
      const sku = (b.sku || '').toLowerCase();
      return !name.includes('emulsi') && (name.includes('air') || name.includes('es') || sku.includes('air'));
    }) : null;

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

    if (jenisEmulsi === 'ISP' && waterQty > 0) {
      if (!waterBahan) {
        missing.push(`Bahan Mentah Air Es Batu belum terdaftar di Stok Bahan Baku`);
      } else if (waterBahan.stok < waterQty) {
        missing.push(`${waterBahan.nama} (Butuh: ${waterQty} kg, Stok Tersedia: ${waterBahan.stok} ${waterBahan.satuan})`);
      }
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
      `Memproses ${batchNum} Batch ${emulsionName}. Pemotongan mentah: ${deductedDetails.join(', ')}. Menghasilkan +${yieldQty} kg ${emulsionName}.`,
      req.body.tanggal || req.body.tanggalProses
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

// POST /api/emulsi/rollback (Rollback / Pembatalan Batch Pengolahan Emulsi - Super Admin Only)
exports.rollbackEmulsi = async (req, res) => {
  try {
    const { logId, user } = req.body;

    if (!logId) {
      return res.status(400).json({ success: false, message: 'ID log pengolahan emulsi (logId) wajib dikirim.' });
    }

    // Find target log entry
    let targetLog = null;
    let AuditLog = null;
    if (mongoose.connection.readyState === 1) {
      try {
        AuditLog = require('../models/AuditLog');
        targetLog = await AuditLog.findOne({ id: logId });
      } catch (e) {}
    }

    if (!targetLog) {
      const logsJson = readCollection('auditLog');
      targetLog = logsJson.find(l => l.id === logId);
    }

    if (!targetLog) {
      return res.status(404).json({ success: false, message: 'Log pengolahan emulsi tidak ditemukan.' });
    }

    const detailText = targetLog.detail || '';
    const isISP = detailText.toLowerCase().includes('isp') || (targetLog.aksi || '').toLowerCase().includes('isp');
    const isTVP = detailText.toLowerCase().includes('tvp') || (targetLog.aksi || '').toLowerCase().includes('tvp');

    if (!isISP && !isTVP) {
      return res.status(400).json({ success: false, message: 'Log ini bukan transaksi pengolahan emulsi.' });
    }

    const jenisEmulsi = isISP ? 'ISP' : 'TVP';
    const emulsionName = isISP ? 'Emulsi ISP' : 'Emulsi TVP';
    const emulsionSku = isISP ? 'EML-ISP' : 'EML-TVP';

    // Parse batch number and exact quantities from detailText
    const batchMatch = detailText.match(/(\d+)\s*Batch/i);
    const batchNum = batchMatch ? parseInt(batchMatch[1], 10) : 1;

    const yieldMatch = detailText.match(/Menghasilkan\s*\+(\d+(?:\.\d+)?)\s*kg/i);
    const yieldQty = yieldMatch ? parseFloat(yieldMatch[1]) : ((isISP ? 20 : 4) * batchNum);

    const mainQtyMatch = detailText.match(/(?:Marksoy|TVP|ISP)[^:-]*:\s*-(\d+(?:\.\d+)?)/i);
    const mainQty = mainQtyMatch ? parseFloat(mainQtyMatch[1]) : ((isISP ? 2 : 1) * batchNum);

    const waterQtyMatch = detailText.match(/Air\s*Es[^:-]*:\s*-(\d+(?:\.\d+)?)/i);
    const waterQty = waterQtyMatch ? parseFloat(waterQtyMatch[1]) : ((isISP ? 4 : 0) * batchNum);

    const oilQtyMatch = detailText.match(/Minyak[^:-]*:\s*-(\d+(?:\.\d+)?)/i);
    const oilQty = oilQtyMatch ? parseFloat(oilQtyMatch[1]) : ((isISP ? 4 : 0) * batchNum);

    // Fetch materials list
    let allBahanMongo = [];
    if (mongoose.connection.readyState === 1) {
      try { allBahanMongo = await BahanBaku.find(); } catch (e) {}
    }
    const allBahanJson = readCollection('bahanBaku');
    const sourceBahanList = allBahanMongo.length > 0 ? allBahanMongo : allBahanJson;

    const restoreStock = async (bahanObjOrIdentifier, qtyToAdd) => {
      if (!bahanObjOrIdentifier || qtyToAdd === 0) return;

      let identifier = typeof bahanObjOrIdentifier === 'string' ? bahanObjOrIdentifier : (bahanObjOrIdentifier?.sku || bahanObjOrIdentifier?.nama || bahanObjOrIdentifier?.id);
      let targetId = typeof bahanObjOrIdentifier === 'object' ? bahanObjOrIdentifier?.id : null;

      if (mongoose.connection.readyState === 1) {
        try {
          let doc = null;
          if (targetId) {
            doc = await BahanBaku.findOne({ id: targetId });
          }
          if (!doc) {
            doc = await BahanBaku.findOne({
              $or: [
                { nama: identifier },
                { sku: identifier },
                { nama: new RegExp('^' + String(identifier).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i') }
              ]
            });
          }
          if (doc) {
            doc.stok = Math.max(0, Math.round((doc.stok + qtyToAdd) * 1000) / 1000);
            await doc.save();
          }
        } catch (e) {
          console.error('restoreStock mongo error:', e);
        }
      }

      const jsonList = readCollection('bahanBaku');
      const idx = jsonList.findIndex(b => (targetId && b.id === targetId) || b.sku === identifier || b.nama.toLowerCase() === String(identifier).toLowerCase());
      if (idx !== -1) {
        jsonList[idx].stok = Math.max(0, Math.round((jsonList[idx].stok + qtyToAdd) * 1000) / 1000);
        writeCollection('bahanBaku', jsonList);
      }
    };

    // 1. Deduct created emulsion stock (-yieldQty)
    await restoreStock(emulsionName, -yieldQty);

    // 2. Restore raw materials (+mainQty, +waterQty, +oilQty)
    let mainBahan = sourceBahanList.find(b => {
      const name = (b.nama || '').toLowerCase();
      const sku = (b.sku || '').toLowerCase();
      return !name.includes('emulsi') && (isISP ? (name.includes('marksoy') || name.includes('isp') || sku.includes('isp')) : (name.includes('tvp') || sku.includes('tvp')));
    });

    let waterBahan = isISP ? sourceBahanList.find(b => {
      const name = (b.nama || '').toLowerCase();
      return !name.includes('emulsi') && (name.includes('air') || name.includes('es'));
    }) : null;

    let oilBahan = isISP ? sourceBahanList.find(b => {
      const name = (b.nama || '').toLowerCase();
      return !name.includes('emulsi') && (name.includes('minyak') || name.includes('lemak'));
    }) : null;

    if (mainBahan) await restoreStock(mainBahan, mainQty);
    if (waterBahan && waterQty > 0) await restoreStock(waterBahan, waterQty);
    if (oilBahan && oilQty > 0) await restoreStock(oilBahan, oilQty);

    // 3. Delete target log from MongoDB & JSON
    if (mongoose.connection.readyState === 1) {
      try {
        await AuditLog.deleteOne({ id: logId });
      } catch (e) {
        console.error('AuditLog.deleteOne error:', e);
      }
    }
    const logsJson = readCollection('auditLog');
    const filteredJsonLogs = logsJson.filter(l => l.id !== logId);
    writeCollection('auditLog', filteredJsonLogs);

    // Add Audit Log for Rollback action
    await addAuditLog(
      user?.name || 'Super Admin',
      user?.role || 'ADMIN',
      `Rollback Emulsi ${jenisEmulsi}`,
      `Membatalkan & Rollback ${batchNum} Batch ${emulsionName} (${logId}). Stok mentah dikembalikan, stok ${emulsionName} dikurangi -${yieldQty} kg.`
    );

    return res.json({
      success: true,
      message: `Rollback ${batchNum} Batch ${emulsionName} Berhasil! Stok mentah dikembalikan & stok ${emulsionName} dikurangi -${yieldQty} kg.`,
      data: { logId, jenisEmulsi, batchNum, yieldQty }
    });
  } catch (err) {
    console.error('Rollback emulsi error:', err);
    return res.status(500).json({ success: false, message: 'Gagal melakukan rollback emulsi: ' + err.message });
  }
};
