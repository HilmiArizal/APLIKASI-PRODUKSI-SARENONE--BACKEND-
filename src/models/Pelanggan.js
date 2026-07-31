const mongoose = require('mongoose');

const pelangganSchema = new mongoose.Schema({
  nama: { type: String, required: true },
  noHp: { type: String, default: '' },
  alamat: { type: String, default: '' },
  tipe: { type: String, default: 'Retail' },
  catatan: { type: String, default: '' },
  createdBy: { type: String, default: 'System' },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Pelanggan', pelangganSchema);
