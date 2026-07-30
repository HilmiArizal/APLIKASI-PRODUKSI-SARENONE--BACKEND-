const mongoose = require('mongoose');

const UtangSupplierSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  noFaktur: { type: String, required: true },
  supplier: { type: String, required: true },
  bahanId: { type: String },
  bahanNama: { type: String },
  jumlah: { type: Number, default: 0 },
  satuan: { type: String, default: 'unit' },
  hargaSatuan: { type: Number, default: 0 },
  totalTagihan: { type: Number, default: 0 },
  jumlahDibayar: { type: Number, default: 0 },
  sisaUtang: { type: Number, default: 0 },
  tanggalBeli: { type: String },
  jatuhTempo: { type: String },
  status: { type: String, default: 'BELUM LUNAS' },
  statusPengiriman: { type: String, default: 'BELUM DITERIMA' },
  jumlahDiterima: { type: Number, default: 0 },
  sisaBelumDiterima: { type: Number, default: 0 },
  catatan: { type: String },
  riwayatBayar: [
    {
      tanggal: String,
      jumlah: Number,
      metode: String,
      keterangan: String
    }
  ],
  riwayatPenerimaan: [
    {
      tanggal: String,
      jumlah: Number,
      penerima: String,
      catatan: String
    }
  ]
}, { timestamps: true });

module.exports = mongoose.model('UtangSupplier', UtangSupplierSchema);
