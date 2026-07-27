const mongoose = require('mongoose');

const AuditLogSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  timestamp: { type: String, required: true },
  user: { type: String, required: true },
  role: { type: String, required: true },
  aksi: { type: String, required: true },
  detail: { type: String, required: true }
}, { timestamps: true });

module.exports = mongoose.model('AuditLog', AuditLogSchema);
