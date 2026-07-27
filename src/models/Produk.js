const mongoose = require('mongoose');

const ProdukSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  sku: { type: String, required: true },
  nama: { type: String, required: true },
  kategori: { type: String, default: 'Roti Manis' },
  harga: { type: Number, default: 0 },
  stok: { type: Number, default: 0 }
}, { timestamps: true });

module.exports = mongoose.model('Produk', ProdukSchema);
