const mongoose = require('mongoose');

const ResepSchema = new mongoose.Schema({
  produkId: { type: String, required: true, unique: true },
  items: [
    {
      bahanId: { type: String, required: true },
      takaran: { type: Number, required: true }
    }
  ]
}, { timestamps: true });

module.exports = mongoose.model('Resep', ResepSchema);
