const mongoose = require('mongoose');

const ItemEstimasiSchema = new mongoose.Schema({
  produkId: { type: String, required: true },
  produkNama: { type: String, required: true },
  produkSku: { type: String, default: '' },
  jumlahPcs: { type: Number, required: true, default: 0 },
  catatanItem: { type: String, default: '' }
}, { _id: false });

const EstimasiPOSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  noEstimasi: { type: String, required: true },
  tanggalEstimasi: { type: String, required: true },
  pelangganNama: { type: String, required: true },
  salesName: { type: String, required: true },
  items: [ItemEstimasiSchema],
  catatan: { type: String, default: '' },
  status: {
    type: String,
    enum: ['SUBMITTED', 'APPROVED', 'DIPROSES', 'SELESAI', 'DIBATALKAN'],
    default: 'SUBMITTED'
  }
}, { timestamps: true });

module.exports = mongoose.model('EstimasiPO', EstimasiPOSchema);
