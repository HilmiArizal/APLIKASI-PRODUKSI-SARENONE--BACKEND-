const fs = require('fs');
const path = require('path');
const Pelanggan = require('../models/Pelanggan');

const DATA_FILE = path.join(__dirname, '../../data/pelanggan.json');

const INITIAL_PELANGGAN = [
  { nama: 'Toko Berkah Frozen', noHp: '081234567890', alamat: 'Jl. Raya Bandung No. 12', tipe: 'Distributor', catatan: 'Pelanggan langganan grosir' },
  { nama: 'Warung Bu Siti', noHp: '085712345678', alamat: 'Komp. Gria Asri Blok C2', tipe: 'Reseller', catatan: 'Ambil mingguan' },
  { nama: 'Resto Sate Barokah', noHp: '081987654321', alamat: 'Jl. Ahmad Yani No. 45', tipe: 'Retail', catatan: 'Restoran mitra' }
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
    console.error('Gagal menulis backup pelanggan JSON:', err);
  }
}

exports.getAllPelanggan = async (req, res) => {
  try {
    let list = await Pelanggan.find().sort({ createdAt: -1 });

    // Seed initial pelanggan if database is empty
    if (!list || list.length === 0) {
      await Pelanggan.insertMany(INITIAL_PELANGGAN);
      list = await Pelanggan.find().sort({ createdAt: -1 });
    }

    // Keep JSON file synced
    writeLocalData(list.map(doc => doc.toObject()));

    return res.json({ success: true, data: list });
  } catch (err) {
    const local = readLocalData();
    return res.json({ success: true, data: local });
  }
};

exports.createPelanggan = async (req, res) => {
  const { nama, noHp, alamat, tipe, catatan } = req.body;
  if (!nama) {
    return res.status(400).json({ success: false, message: 'Nama pelanggan wajib diisi.' });
  }

  try {
    const newPelanggan = new Pelanggan({ nama, noHp, alamat, tipe: tipe || 'Retail', catatan });
    await newPelanggan.save();

    // Sync JSON file
    const local = readLocalData();
    local.unshift(newPelanggan.toObject());
    writeLocalData(local);

    return res.json({ success: true, data: newPelanggan, message: 'Pelanggan berhasil ditambahkan ke database! 🎉' });
  } catch (err) {
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
      // Sync JSON
      const local = readLocalData();
      const idx = local.findIndex(item => (item._id && item._id.toString() === id) || item.id === id);
      if (idx !== -1) local[idx] = updated.toObject();
      writeLocalData(local);
      return res.json({ success: true, data: updated, message: 'Data pelanggan berhasil diperbarui di database!' });
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

  return res.json({ success: true, message: 'Pelanggan berhasil dihapus dari database!' });
};
