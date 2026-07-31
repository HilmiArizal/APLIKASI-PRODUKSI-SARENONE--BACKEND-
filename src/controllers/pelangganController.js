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
    // Write local backup mirror
    writeLocalData((list || []).map(doc => doc.toObject ? doc.toObject() : doc));
    return res.json({ success: true, data: list || [] });
  } catch (err) {
    const local = readLocalData();
    return res.json({ success: true, data: local || [] });
  }
};

exports.createPelanggan = async (req, res) => {
  const { nama, noHp, alamat, tipe, catatan } = req.body;
  if (!nama || !nama.trim()) {
    return res.status(400).json({ success: false, message: 'Nama pelanggan wajib diisi.' });
  }

  try {
    const newPelanggan = new Pelanggan({ nama: nama.trim(), noHp, alamat, tipe: tipe || 'Retail', catatan });
    await newPelanggan.save();

    const local = readLocalData();
    local.unshift(newPelanggan.toObject());
    writeLocalData(local);

    return res.json({ success: true, data: newPelanggan, message: 'Pelanggan baru berhasil ditambahkan!' });
  } catch (err) {
    const local = readLocalData();
    const newObj = {
      id: `cust_${Date.now()}`,
      nama: nama.trim(),
      noHp: noHp || '',
      alamat: alamat || '',
      tipe: tipe || 'Retail',
      catatan: catatan || '',
      createdAt: new Date().toISOString()
    };
    local.unshift(newObj);
    writeLocalData(local);
    return res.json({ success: true, data: newObj, message: 'Pelanggan baru berhasil ditambahkan!' });
  }
};

exports.updatePelanggan = async (req, res) => {
  const { id } = req.params;
  const { nama, noHp, alamat, tipe, catatan } = req.body;

  try {
    let updated = null;
    if (id && id.match(/^[0-9a-fA-F]{24}$/)) {
      updated = await Pelanggan.findByIdAndUpdate(id, { nama, noHp, alamat, tipe, catatan }, { new: true });
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
    local[idx] = { ...local[idx], nama, noHp, alamat, tipe, catatan };
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
