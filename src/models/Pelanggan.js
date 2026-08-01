const mongoose = require('mongoose');

const pelangganSchema = new mongoose.Schema({
  kode: { type: String, required: true, default: 'C1' },
  nama: { type: String, required: true },
  noHp: { type: String, default: '' },
  alamat: { type: String, default: '' },
  tipe: { type: String, default: 'Retail' }, // Retail, Reseller, Distributor, Agent
  kategoriCustomer: { type: String, default: 'Umum' }, // Top Market, Umum
  sistemPembayaran: { type: String, default: 'COD' }, // COD, CBD, Tempo
  totalPiutang: { type: Number, default: 0 },
  catatan: { type: String, default: '' },
  createdBy: { type: String, default: 'System' },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Pelanggan', pelangganSchema);
