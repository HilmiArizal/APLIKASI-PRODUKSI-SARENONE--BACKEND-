const HppProduksi = require('../models/HppProduksi');
const AuditLog = require('../models/AuditLog');
const { addAuditLog } = require('../utils/dbHelper');

// GET all HPP records
exports.getAllHpp = async (req, res) => {
  try {
    const list = await HppProduksi.find().sort({ tanggal: -1, createdAt: -1 }).lean();
    res.json({ success: true, data: list });
  } catch (error) {
    console.error('Error getAllHpp:', error);
    res.status(500).json({ success: false, message: 'Gagal mengambil data HPP.' });
  }
};

// SAVE or UPDATE HPP record for a specific date and product
exports.saveHpp = async (req, res) => {
  try {
    const {
      tanggal,
      produkNama,
      totalBiayaBahan,
      hasilKg,
      hppPerKgNetto,
      hppPerKgWaste,
      marginPct = 8,
      biayaKemasan = 550,
      hpp250g,
      hpp500g,
      hpp900g,
      hpp1000g,
      catatan = '',
      user = 'Super Admin BB',
      role = 'ADMIN'
    } = req.body;

    if (!tanggal || !produkNama) {
      return res.status(400).json({ success: false, message: 'Tanggal dan Produk Nama wajib diisi.' });
    }

    const hppId = `HPP-${tanggal.replace(/-/g, '')}-${produkNama.replace(/\s+/g, '').toUpperCase().substring(0, 5)}`;

    const payload = {
      id: hppId,
      tanggal,
      produkNama,
      totalBiayaBahan: Number(totalBiayaBahan) || 0,
      hasilKg: Number(hasilKg) || 0,
      hppPerKgNetto: Number(hppPerKgNetto) || 0,
      hppPerKgWaste: Number(hppPerKgWaste) || 0,
      marginPct: Number(marginPct) || 8,
      biayaKemasan: Number(biayaKemasan) || 550,
      hpp250g: Number(hpp250g) || 0,
      hpp500g: Number(hpp500g) || 0,
      hpp900g: Number(hpp900g) || 0,
      hpp1000g: Number(hpp1000g) || 0,
      catatan,
      operator: user
    };

    const savedDoc = await HppProduksi.findOneAndUpdate(
      { tanggal, produkNama },
      { $set: payload },
      { returnDocument: 'after', upsert: true }
    );

    // Write audit log
    await addAuditLog(
      user,
      role,
      `Simpan HPP Produksi ${produkNama}`,
      `Menyimpan HPP ${produkNama} tanggal ${tanggal}: Hasil ${hasilKg} KG, Total Biaya Rp ${totalBiayaBahan}, HPP 1KG (Inc Waste 8%): Rp ${hppPerKgWaste}.`,
      tanggal
    );

    res.json({
      success: true,
      message: `Berhasil menyimpan HPP ${produkNama} untuk tanggal ${tanggal}.`,
      data: savedDoc
    });
  } catch (error) {
    console.error('Error saveHpp:', error);
    res.status(500).json({ success: false, message: 'Gagal menyimpan data HPP: ' + error.message });
  }
};

// DELETE HPP record
exports.deleteHpp = async (req, res) => {
  try {
    const { id } = req.params;
    await HppProduksi.deleteOne({ $or: [{ id }, { _id: id }] });
    res.json({ success: true, message: 'Data HPP berhasil dihapus.' });
  } catch (error) {
    console.error('Error deleteHpp:', error);
    res.status(500).json({ success: false, message: 'Gagal menghapus data HPP.' });
  }
};
