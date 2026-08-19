const mongoose = require('mongoose');
const AuditLog = require('../models/AuditLog');
const { readCollection, writeCollection } = require('../utils/dbHelper');

// GET /api/audit-log
exports.getAll = async (req, res) => {
  try {
    if (mongoose.connection.readyState === 1) {
      const list = await AuditLog.find().sort({ createdAt: -1 });
      return res.json({ success: true, data: list });
    }
    const fallback = readCollection('auditLog');
    return res.json({ success: true, data: fallback });
  } catch (err) {
    const fallback = readCollection('auditLog');
    return res.json({ success: true, data: fallback });
  }
};

// DELETE /api/audit-log/:id (Super Admin Delete Single Log)
exports.deleteLog = async (req, res) => {
  try {
    const { id } = req.params;
    if (id === 'all' || id === 'clear') {
      return exports.clearAllLogs(req, res);
    }
    if (mongoose.connection.readyState === 1) {
      const query = mongoose.Types.ObjectId.isValid(id) ? { $or: [{ id }, { _id: id }] } : { id };
      await AuditLog.deleteMany(query);
    }
    const logs = readCollection('auditLog');
    const updated = logs.filter(l => l.id !== id);
    writeCollection('auditLog', updated);

    return res.json({ success: true, message: 'Log transaksi berhasil dihapus dari MongoDB Atlas.' });
  } catch (err) {
    console.error('Delete audit log error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// DELETE /api/audit-log/clear/all (Super Admin Clear All Audit Logs)
exports.clearAllLogs = async (req, res) => {
  try {
    if (mongoose.connection.readyState === 1) {
      await AuditLog.deleteMany({});
    }
    writeCollection('auditLog', []);
    return res.json({ success: true, message: 'Seluruh audit log transaksi berhasil dibersihkan dari MongoDB Atlas.' });
  } catch (err) {
    console.error('Clear all audit logs error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/audit-log/export-csv
exports.exportCSV = async (req, res) => {
  try {
    let logs = [];
    if (mongoose.connection.readyState === 1) {
      logs = await AuditLog.find().sort({ createdAt: -1 });
    } else {
      logs = readCollection('auditLog');
    }

    let csv = 'ID,Waktu,User,Role,Aksi,Detail\n';
    logs.forEach(l => {
      csv += `"${l.id}","${l.timestamp}","${l.user}","${l.role}","${l.aksi}","${l.detail.replace(/"/g, '""')}"\n`;
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=saren_one_audit_log_${Date.now()}.csv`);
    return res.status(200).send(csv);
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
