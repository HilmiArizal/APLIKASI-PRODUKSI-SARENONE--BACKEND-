const mongoose = require('mongoose');

const RiwayatProduksiSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  timestamp: { type: String, required: true },
  produkId: { type: String, required: true },
  produkNama: { type: String, required: true },
  jumlahPcs: { type: Number, required: true },
  operator: { type: String, required: true },
  pemotonganBahan: [
    {
      bahanNama: { type: String, required: true },
      jumlah: { type: Number, required: true },
      satuan: { type: String, required: true }
    }
  ]
}, { timestamps: true });

module.exports = mongoose.model('RiwayatProduksi', RiwayatProduksiSchema);
