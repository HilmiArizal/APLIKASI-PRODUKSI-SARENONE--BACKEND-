const mongoose = require('mongoose');

const MarketingSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  namaPromo: { type: String, required: true },
  tipePromo: { type: String, default: 'Diskon' },
  deskripsi: { type: String, default: '' },
  nilaiDiskon: { type: Number, default: 0 },
  tipeNilai: { type: String, default: 'persen' },
  targetProduk: { type: String, default: 'Semua Produk' },
  anggaranMarketing: { type: Number, default: 0 },
  realisasiAnggaran: { type: Number, default: 0 },
  tanggalMulai: { type: String, required: true },
  tanggalSelesai: { type: String, required: true },
  status: { type: String, default: 'Aktif' },
  channel: { type: String, default: '' },
  targetPenjualan: { type: Number, default: 0 },
  hasilPenjualan: { type: Number, default: 0 },
  catatan: { type: String, default: '' },
  createdBy: { type: String, default: '' },
  createdAt: { type: String, default: () => new Date().toISOString() }
}, { timestamps: true });

module.exports = mongoose.model('Marketing', MarketingSchema);
