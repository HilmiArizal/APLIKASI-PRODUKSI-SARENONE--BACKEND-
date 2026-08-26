const mongoose = require('mongoose');

const auditStokFisikSchema = new mongoose.Schema({
  tanggal: {
    type: String,
    required: true,
    index: true
  },
  bahanId: {
    type: String,
    required: false
  },
  bahanNama: {
    type: String,
    required: true
  },
  satuan: {
    type: String,
    default: 'kg'
  },
  stokSistem: {
    type: Number,
    required: true,
    default: 0
  },
  stokFisik: {
    type: Number,
    required: true,
    default: 0
  },
  selisihQty: {
    type: Number,
    required: true,
    default: 0
  },
  susutPct: {
    type: Number,
    default: 0
  },
  hargaSatuan: {
    type: Number,
    default: 0
  },
  nilaiSusutRp: {
    type: Number,
    default: 0
  },
  keterangan: {
    type: String,
    default: 'Upload Excel Stok Fisik'
  },
  auditor: {
    type: String,
    default: 'Tim Opname Gudang'
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('AuditStokFisik', auditStokFisikSchema);
