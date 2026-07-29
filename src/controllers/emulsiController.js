const mongoose = require('mongoose');
const BahanBaku = require('../models/BahanBaku');
const { readCollection, writeCollection, addAuditLog } = require('../utils/dbHelper');

// POST /api/emulsi/process (Eksekusi Pengolahan Emulsi ISP / TVP)
exports.processEmulsi = async (req, res) => {
  try {
    const { jenisEmulsi, qtyUtama, rasioAir = 5, rasioMinyak = 5, user } = req.body;
    // jenisEmulsi: 'ISP' | 'TVP'
    if (!jenisEmulsi || !qtyUtama || qtyUtama <= 0) {
      return res.status(400).json({ success: false, message: 'Jenis emulsi (ISP/TVP) dan jumlah bahan utama wajib diisi.' });
    }

    const primaryQty = parseFloat(qtyUtama);
    const rAir = rasioAir !== undefined ? parseFloat(rasioAir) : (jenisEmulsi === 'ISP' ? 5 : 3);
    const rMinyak = jenisEmulsi === 'TVP' ? 0 : (rasioMinyak !== undefined ? parseFloat(rasioMinyak) : 5);

    const waterQty = Math.round(primaryQty * rAir * 1000) / 1000;
    const oilQty = jenisEmulsi === 'TVP' ? 0 : Math.round(primaryQty * rMinyak * 1000) / 1000;
    const totalHasilEmulsi = Math.round((primaryQty + waterQty + oilQty) * 1000) / 1000;

    const mainMaterialSearch = jenisEmulsi === 'ISP' ? 'isp' : 'tvp';
    const emulsionName = jenisEmulsi === 'ISP' ? 'Emulsi ISP' : 'Emulsi TVP';
    const emulsionSku = jenisEmulsi === 'ISP' ? 'EML-ISP' : 'EML-TVP';

    let allBahanMongo = [];
    if (mongoose.connection.readyState === 1) {
      try {
        allBahanMongo = await BahanBaku.find();
      } catch (e) {}
    }
    const allBahanJson = readCollection('bahanBaku');
    const sourceBahanList = allBahanMongo.length > 0 ? allBahanMongo : allBahanJson;

    // Find main raw material (ISP Powder / TVP Granules)
    let mainBahan = sourceBahanList.find(b => b.nama.toLowerCase().includes(mainMaterialSearch) || b.sku.toLowerCase().includes(mainMaterialSearch));
    // Find Water/Ice material
    let waterBahan = sourceBahanList.find(b => b.nama.toLowerCase().includes('air') || b.nama.toLowerCase().includes('es') || b.sku.toLowerCase().includes('air'));
    // Find Oil/Fat material (Only for ISP)
    let oilBahan = jenisEmulsi === 'ISP' ? sourceBahanList.find(b => b.nama.toLowerCase().includes('minyak') || b.nama.toLowerCase().includes('lemak') || b.sku.toLowerCase().includes('minyak')) : null;

    // Check stock sufficiency
    const missing = [];
    if (mainBahan && mainBahan.stok < primaryQty) {
      missing.push(`${mainBahan.nama} (Butuh: ${primaryQty} kg, Stok: ${mainBahan.stok} kg)`);
    }
    if (waterBahan && waterBahan.stok < waterQty) {
      missing.push(`${waterBahan.nama} (Butuh: ${waterQty} kg, Stok: ${waterBahan.stok} kg)`);
    }
    if (oilBahan && oilQty > 0 && oilBahan.stok < oilQty) {
      missing.push(`${oilBahan.nama} (Butuh: ${oilQty} kg, Stok: ${oilBahan.stok} kg)`);
    }

    if (missing.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Stok bahan tidak mencukupi untuk pengolahan ${emulsionName}: ${missing.join(', ')}.`
      });
    }

    // Deduct raw materials & add emulsion stock in Mongo / JSON
    const deductedDetails = [];

    // Helper for deduction
    const deductMaterial = async (target, qtyToDeduct, defaultName) => {
      const name = target ? target.nama : defaultName;
      deductedDetails.push(`${name}: -${qtyToDeduct} kg`);

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

    await deductMaterial(mainBahan, primaryQty, `Powder ${jenisEmulsi}`);
    await deductMaterial(waterBahan, waterQty, 'Air / Es Batu');
    await deductMaterial(oilBahan, oilQty, 'Minkay / Lemak');

    // Add or Update Emulsion Stock in BahanBaku
    let emulsionDoc = sourceBahanList.find(b => b.sku === emulsionSku || b.nama.toLowerCase() === emulsionName.toLowerCase());

    if (mongoose.connection.readyState === 1) {
      try {
        let doc = await BahanBaku.findOne({ $or: [{ sku: emulsionSku }, { nama: emulsionName }] });
        if (!doc) {
          doc = new BahanBaku({
            id: 'b_eml_' + Date.now(),
            sku: emulsionSku,
            nama: emulsionName,
            kategori: 'Hasil Emulsi',
            stok: totalHasilEmulsi,
            minStok: 10,
            satuan: 'kg',
            harga: 0
          });
        } else {
          doc.stok = Math.round((doc.stok + totalHasilEmulsi) * 1000) / 1000;
        }
        await doc.save();
      } catch (e) {}
    }

    // Update JSON fallback
    const jsonList = readCollection('bahanBaku');
    let jsonEmulsionIdx = jsonList.findIndex(b => b.sku === emulsionSku || b.nama.toLowerCase() === emulsionName.toLowerCase());
    if (jsonEmulsionIdx !== -1) {
      jsonList[jsonEmulsionIdx].stok = Math.round((jsonList[jsonEmulsionIdx].stok + totalHasilEmulsi) * 1000) / 1000;
    } else {
      jsonList.push({
        id: 'b_eml_' + Date.now(),
        sku: emulsionSku,
        nama: emulsionName,
        kategori: 'Hasil Emulsi',
        stok: totalHasilEmulsi,
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
      `Memproses ${primaryQty} kg ${jenisEmulsi} + ${waterQty} kg Air + ${oilQty} kg Minyak. Menghasilkan +${totalHasilEmulsi} kg ${emulsionName}.`
    );

    return res.json({
      success: true,
      message: `Pengolahan ${emulsionName} Berhasil! Hasil Emulsi +${totalHasilEmulsi} kg ditambahkan ke persediaan.`,
      data: {
        jenisEmulsi,
        primaryQty,
        waterQty,
        oilQty,
        totalHasilEmulsi,
        deductedDetails
      }
    });
  } catch (err) {
    console.error('Process emulsi error:', err);
    return res.status(500).json({ success: false, message: 'Gagal memproses emulsi: ' + err.message });
  }
};
