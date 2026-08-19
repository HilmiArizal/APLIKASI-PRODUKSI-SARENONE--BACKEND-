const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true },
  pass: { type: String, required: true },
  name: { type: String, required: true },
  role: { type: String, default: 'PENDING' },
  requestedRole: { type: String, default: 'PRODUK' },
  status: { type: String, default: 'PENDING' },
  provider: { type: String, default: 'local' },
  catatan: { type: String, default: '' },
  isLoggedIn: { type: Boolean, default: false },
  activeSessionId: { type: String, default: '' },
  lastActiveAt: { type: Date, default: null },
  createdAt: { type: String, default: () => new Date().toISOString() }
}, { timestamps: true });

module.exports = mongoose.model('User', UserSchema);
