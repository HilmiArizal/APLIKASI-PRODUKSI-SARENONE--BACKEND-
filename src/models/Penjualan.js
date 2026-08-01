const mongoose = require('mongoose');

const PenjualanSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  noFaktur: { type: String, required: true, unique: true },
  tanggal: { type: String, required: true },
  pelangganId: { type: String, default: '' },
  namaPelanggan: { type: String, required: true },
  kategoriCustomer: { type: String, default: 'Umum' },
  teleponPelanggan: { type: String, default: '' },
  alamatPelanggan: { type: String, default: '' },
  items: [{
    produkId: String,
    namaProduk: String,
    sku: String,
    brand: String,
    qty: Number,
    hargaModal: Number,
    hargaSatuan: Number,
    feeMarketingItem: Number,
    subtotal: Number
  }],
  totalHarga: { type: Number, default: 0 },
  diskon: { type: Number, default: 0 },
  totalBersih: { type: Number, default: 0 },
  totalFeeMarketing: { type: Number, default: 0 },
  metodePembayaran: { type: String, default: 'Tunai' },
  statusPembayaran: { type: String, default: 'Lunas' },
  catatan: { type: String, default: '' },
  createdBy: { type: String, default: '' },
  createdAt: { type: String, default: () => new Date().toISOString() }
}, { timestamps: true });

module.exports = mongoose.model('Penjualan', PenjualanSchema);
