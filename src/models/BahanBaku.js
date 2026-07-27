const mongoose = require('mongoose');

const BahanBakuSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  sku: { type: String, required: true },
  nama: { type: String, required: true },
  kategori: { type: String, default: 'Bahan Utama' },
  stok: { type: Number, default: 0 },
  minStok: { type: Number, default: 0 },
  satuan: { type: String, default: 'kg' },
  harga: { type: Number, default: 0 }
}, { timestamps: true });

module.exports = mongoose.model('BahanBaku', BahanBakuSchema);
