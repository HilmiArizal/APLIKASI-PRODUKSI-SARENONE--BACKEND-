const fs = require('fs');
const path = require('path');
const Pelanggan = require('../models/Pelanggan');

const DATA_FILE = path.join(__dirname, '../../data/pelanggan.json');

const INITIAL_PELANGGAN = [
  { id: 'cust_1', nama: 'Toko Berkah Frozen', noHp: '081234567890', alamat: 'Jl. Raya Bandung No. 12', tipe: 'Distributor', catatan: 'Pelanggan langganan grosir' },
  { id: 'cust_2', nama: 'Warung Bu Siti', noHp: '085712345678', alamat: 'Komp. Gria Asri Blok C2', tipe: 'Reseller', catatan: 'Ambil mingguan' },
  { id: 'cust_3', nama: 'Resto Sate Barokah', noHp: '081987654321', alamat: 'Jl. Ahmad Yani No. 45', tipe: 'Retail', catatan: 'Restoran mitra' }
];

function readLocalData() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      fs.writeFileSync(DATA_FILE, JSON.stringify(INITIAL_PELANGGAN, null, 2));
      return INITIAL_PELANGGAN;
    }
    const data = fs.readFileSync(DATA_FILE, 'utf8');
    const parsed = JSON.parse(data);
    return parsed.length > 0 ? parsed : INITIAL_PELANGGAN;
  } catch (err) {
    return INITIAL_PELANGGAN;
  }
}

function writeLocalData(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Gagal menulis data pelanggan:', err);
  }
}

exports.getAllPelanggan = async (req, res) => {
  try {
    const list = await Pelanggan.find().sort({ createdAt: -1 });
    if (list && list.length > 0) {
      return res.json({ success: true, data: list });
    }
    const local = readLocalData();
    return res.json({ success: true, data: local });
  } catch (err) {
    const local = readLocalData();
    return res.json({ success: true, data: local });
  }
};

exports.createPelanggan = async (req, res) => {
  try {
    const { nama, noHp, alamat, tipe, catatan } = req.body;
    if (!nama) {
      return res.status(400).json({ success: false, message: 'Nama pelanggan wajib diisi.' });
    }

    try {
      const newPelanggan = new Pelanggan({ nama, noHp, alamat, tipe: tipe || 'Retail', catatan });
      await newPelanggan.save();
      return res.json({ success: true, data: newPelanggan, message: 'Pelanggan berhasil ditambahkan!' });
    } catch {
      const local = readLocalData();
      const newObj = {
        id: `cust_${Date.now()}`,
        nama,
        noHp: noHp || '',
        alamat: alamat || '',
        tipe: tipe || 'Retail',
        catatan: catatan || '',
        createdAt: new Date().toISOString()
      };
      local.unshift(newObj);
      writeLocalData(local);
      return res.json({ success: true, data: newObj, message: 'Pelanggan berhasil ditambahkan!' });
    }
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.updatePelanggan = async (req, res) => {
  try {
    const { id } = req.params;
    const { nama, noHp, alamat, tipe, catatan } = req.body;

    try {
      const updated = await Pelanggan.findByIdAndUpdate(id, { nama, noHp, alamat, tipe, catatan }, { new: true });
      if (updated) return res.json({ success: true, data: updated, message: 'Pelanggan berhasil diperbarui!' });
    } catch { /* ignore mongo error, fallback local */ }

    const local = readLocalData();
    const idx = local.findIndex(item => item.id === id || item._id === id);
    if (idx !== -1) {
      local[idx] = { ...local[idx], nama, noHp, alamat, tipe, catatan };
      writeLocalData(local);
      return res.json({ success: true, data: local[idx], message: 'Pelanggan berhasil diperbarui!' });
    }

    return res.status(404).json({ success: false, message: 'Data pelanggan tidak ditemukan.' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.deletePelanggan = async (req, res) => {
  try {
    const { id } = req.params;

    try {
      await Pelanggan.findByIdAndDelete(id);
    } catch { /* ignore */ }

    const local = readLocalData();
    const filtered = local.filter(item => item.id !== id && item._id !== id);
    writeLocalData(filtered);

    return res.json({ success: true, message: 'Pelanggan berhasil dihapus!' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
