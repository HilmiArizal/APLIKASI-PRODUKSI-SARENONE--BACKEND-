const mongoose = require('mongoose');

const PembayaranMasukSchema = new mongoose.Schema({
  noBukti: { type: String, required: true, unique: true },
  pelangganId: { type: String, required: true },
  kodePelanggan: { type: String, default: '' },
  namaPelanggan: { type: String, required: true },
  noFaktur: { type: String, default: '' },
  tanggal: { type: String, required: true },
  jumlahBayar: { type: Number, required: true, default: 0 },
  metodePembayaran: { type: String, default: 'Transfer Bank' },
  noReferensi: { type: String, default: '' },
  catatan: { type: String, default: '' },
  createdBy: { type: String, default: 'System' },
  createdAt: { type: String, default: () => new Date().toISOString() }
}, { timestamps: true });

module.exports = mongoose.model('PembayaranMasuk', PembayaranMasukSchema);
