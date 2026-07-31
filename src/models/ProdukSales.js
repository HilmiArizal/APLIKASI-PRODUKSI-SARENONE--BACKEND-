const mongoose = require('mongoose');

const ProdukSalesSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  sku: { type: String, required: true },
  namaProduk: { type: String, required: true },
  varian: { type: String, default: '' },      // Contoh: Rasa Cokelat, Original, Keju Lumer
  gramasi: { type: String, default: '' },     // Contoh: 250gr, 500gr, 1kg, 12 Pcs/Box
  kategori: { type: String, default: 'Umum' },
  brand: { type: String, default: 'Saren One Original' },
  hargaJual: { type: Number, default: 0 },
  stokReady: { type: Number, default: 0 },
  deskripsi: { type: String, default: '' },
  status: { type: String, default: 'Tersedia' }, // Tersedia, Pre-Order, Stok Habis
  createdBy: { type: String, default: '' },
  createdAt: { type: String, default: () => new Date().toISOString() }
}, { timestamps: true });

module.exports = mongoose.model('ProdukSales', ProdukSalesSchema);
