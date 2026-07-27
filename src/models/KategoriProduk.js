const mongoose = require('mongoose');

const kategoriProdukSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  nama: { type: String, required: true },
  deskripsi: { type: String, default: '' },
  createdAt: { type: String }
}, {
  timestamps: true
});

module.exports = mongoose.model('KategoriProduk', kategoriProdukSchema);
