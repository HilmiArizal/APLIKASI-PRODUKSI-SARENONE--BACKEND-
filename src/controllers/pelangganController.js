const fs = require('fs');
const path = require('path');
const Pelanggan = require('../models/Pelanggan');

const DATA_FILE = path.join(__dirname, '../../data/pelanggan.json');

function readLocalData() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      return [];
    }
    const data = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(data) || [];
  } catch (err) {
    return [];
  }
}

function writeLocalData(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Gagal menulis backup pelanggan JSON:', err);
  }
}

exports.getAllPelanggan = async (req, res) => {
  try {
    const list = await Pelanggan.find().sort({ createdAt: -1 });
    writeLocalData((list || []).map(doc => doc.toObject ? doc.toObject() : doc));
    return res.json({ success: true, data: list || [] });
  } catch (err) {
    const local = readLocalData();
    return res.json({ success: true, data: local || [] });
  }
};

exports.createPelanggan = async (req, res) => {
  const { kode, nama, noHp, alamat, tipe, kategoriCustomer, sistemPembayaran, totalPiutang, catatan } = req.body;
  if (!nama || !nama.trim()) {
    return res.status(400).json({ success: false, message: 'Nama pelanggan wajib diisi.' });
  }

  try {
    const count = await Pelanggan.countDocuments();
    const autoKode = kode?.trim() || `C${count + 1}`;

    const newPelanggan = new Pelanggan({
      kode: autoKode,
      nama: nama.trim(),
      noHp: noHp || '',
      alamat: alamat || '',
      tipe: tipe || 'Retail',
      kategoriCustomer: kategoriCustomer || 'Umum',
      sistemPembayaran: sistemPembayaran || 'COD',
      totalPiutang: Number(totalPiutang) || 0,
      catatan: catatan || ''
    });
    await newPelanggan.save();

    const local = readLocalData();
    local.unshift(newPelanggan.toObject());
    writeLocalData(local);

    return res.json({ success: true, data: newPelanggan, message: 'Pelanggan baru berhasil ditambahkan!' });
  } catch (err) {
    const local = readLocalData();
    const autoKode = kode?.trim() || `C${local.length + 1}`;
    const newObj = {
      id: `cust_${Date.now()}`,
      kode: autoKode,
      nama: nama.trim(),
      noHp: noHp || '',
      alamat: alamat || '',
      tipe: tipe || 'Retail',
      kategoriCustomer: kategoriCustomer || 'Umum',
      sistemPembayaran: sistemPembayaran || 'COD',
      totalPiutang: Number(totalPiutang) || 0,
      catatan: catatan || '',
      createdAt: new Date().toISOString()
    };
    local.unshift(newObj);
    writeLocalData(local);
    return res.json({ success: true, data: newObj, message: 'Pelanggan baru berhasil ditambahkan!' });
  }
};

exports.bulkCreatePelanggan = async (req, res) => {
  const { customers } = req.body;
  if (!Array.isArray(customers) || customers.length === 0) {
    return res.status(400).json({ success: false, message: 'Data pelanggan tidak valid.' });
  }

  try {
    const count = await Pelanggan.countDocuments();
    const createdDocs = [];

    for (let i = 0; i < customers.length; i++) {
      const item = customers[i];
      if (!item.nama || !item.nama.trim()) continue;

      const autoKode = item.kode?.trim() || `C${count + i + 1}`;
      const doc = new Pelanggan({
        kode: autoKode,
        nama: item.nama.trim(),
        noHp: item.noHp || '',
        alamat: item.alamat || '',
        tipe: item.tipe || 'Retail',
        kategoriCustomer: item.kategoriCustomer || 'Umum',
        sistemPembayaran: item.sistemPembayaran || 'COD',
        totalPiutang: Number(item.totalPiutang) || 0,
        catatan: item.catatan || ''
      });
      await doc.save();
      createdDocs.push(doc.toObject());
    }

    const local = readLocalData();
    const updatedLocal = [...createdDocs, ...local];
    writeLocalData(updatedLocal);

    return res.json({ success: true, count: createdDocs.length, data: createdDocs, message: `${createdDocs.length} pelanggan berhasil di-import!` });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.updatePelanggan = async (req, res) => {
  const { id } = req.params;
  const { kode, nama, noHp, alamat, tipe, kategoriCustomer, sistemPembayaran, totalPiutang, catatan } = req.body;

  try {
    let updated = null;
    const payload = { kode, nama, noHp, alamat, tipe, kategoriCustomer, sistemPembayaran, totalPiutang: Number(totalPiutang) || 0, catatan };

    if (id && id.match(/^[0-9a-fA-F]{24}$/)) {
      updated = await Pelanggan.findByIdAndUpdate(id, payload, { new: true });
    }

    if (updated) {
      const local = readLocalData();
      const idx = local.findIndex(item => (item._id && item._id.toString() === id) || item.id === id);
      if (idx !== -1) local[idx] = updated.toObject();
      writeLocalData(local);
      return res.json({ success: true, data: updated, message: 'Data pelanggan berhasil diperbarui!' });
    }
  } catch (err) { /* fallback local */ }

  const local = readLocalData();
  const idx = local.findIndex(item => item.id === id || (item._id && item._id.toString() === id));
  if (idx !== -1) {
    local[idx] = { ...local[idx], kode, nama, noHp, alamat, tipe, kategoriCustomer, sistemPembayaran, totalPiutang: Number(totalPiutang) || 0, catatan };
    writeLocalData(local);
    return res.json({ success: true, data: local[idx], message: 'Data pelanggan berhasil diperbarui!' });
  }

  return res.status(404).json({ success: false, message: 'Data pelanggan tidak ditemukan.' });
};

exports.deletePelanggan = async (req, res) => {
  const { id } = req.params;

  try {
    if (id && id.match(/^[0-9a-fA-F]{24}$/)) {
      await Pelanggan.findByIdAndDelete(id);
    }
  } catch (err) { /* ignore */ }

  const local = readLocalData();
  const filtered = local.filter(item => item.id !== id && (item._id && item._id.toString() !== id));
  writeLocalData(filtered);

  return res.json({ success: true, message: 'Pelanggan berhasil dihapus!' });
};
