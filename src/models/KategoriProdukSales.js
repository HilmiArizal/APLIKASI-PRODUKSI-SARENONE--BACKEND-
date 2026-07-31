const mongoose = require('mongoose');

const KategoriProdukSalesSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  nama: { type: String, required: true },
  deskripsi: { type: String, default: '' },
  createdBy: { type: String, default: 'Super Admin Produk' },
  createdAt: { type: String, default: () => new Date().toISOString() }
}, { timestamps: true });

module.exports = mongoose.model('KategoriProdukSales', KategoriProdukSalesSchema);
