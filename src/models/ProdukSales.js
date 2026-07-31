const mongoose = require('mongoose');

const ProdukSalesSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  sku: { type: String, required: true },
  namaProduk: { type: String, required: true },
  varian: { type: String, default: '' },
  gramasi: { type: String, default: '' },
  kategori: { type: String, default: 'Umum' },
  brand: { type: String, default: 'SAREN ONE' },
  hargaPabrik: { type: Number, default: 0 },
  hargaJual: { type: Number, default: 0 },
  stokReady: { type: Number, default: 0 },
  deskripsi: { type: String, default: '' },
  status: { type: String, default: 'Tersedia' },
  createdBy: { type: String, default: '' },
  createdAt: { type: String, default: () => new Date().toISOString() }
}, { timestamps: true });

module.exports = mongoose.model('ProdukSales', ProdukSalesSchema);
