const mongoose = require('mongoose');

const AbsensiSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  type: { type: String, enum: ['Check-In', 'Check-Out'], required: true },
  time: { type: String, required: true },
  tanggal: { type: String, default: '' },
  latitude: { type: Number, default: null },
  longitude: { type: Number, default: null },
  lokasiNama: { type: String, default: '' },
  photoUrl: { type: String, default: '' },
  timestampRaw: { type: Number, default: () => Date.now() },
  createdAt: { type: String, default: () => new Date().toISOString() }
}, { timestamps: true });

module.exports = mongoose.model('Absensi', AbsensiSchema);
