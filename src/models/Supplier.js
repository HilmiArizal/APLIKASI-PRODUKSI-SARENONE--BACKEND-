const mongoose = require('mongoose');

const SupplierSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  nama: { type: String, required: true, unique: true },
  kontak: { type: String, default: '' },
  alamat: { type: String, default: '' },
  catatan: { type: String, default: '' }
}, { timestamps: true });

module.exports = mongoose.model('Supplier', SupplierSchema);
