const mongoose = require('mongoose');

const hppProduksiSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  tanggal: { type: String, required: true }, // YYYY-MM-DD
  produkNama: { type: String, required: true },
  totalBiayaBahan: { type: Number, default: 0 },
  hasilKg: { type: Number, default: 0 },
  hppPerKgNetto: { type: Number, default: 0 },
  hppPerKgWaste: { type: Number, default: 0 },
  marginPct: { type: Number, default: 8 },
  biayaKemasan: { type: Number, default: 550 },
  hpp250g: { type: Number, default: 0 },
  hpp500g: { type: Number, default: 0 },
  hpp900g: { type: Number, default: 0 },
  hpp1000g: { type: Number, default: 0 },
  catatan: { type: String, default: '' },
  operator: { type: String, default: 'Super Admin BB' }
}, { timestamps: true });

module.exports = mongoose.model('HppProduksi', hppProduksiSchema);
