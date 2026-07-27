const AuditLog = require('../models/AuditLog');
const { readCollection } = require('../utils/dbHelper');

// GET /api/audit-log
exports.getAll = async (req, res) => {
  try {
    const list = await AuditLog.find().sort({ createdAt: -1 });
    if (list && list.length > 0) return res.json({ success: true, data: list });
    const fallback = readCollection('auditLog');
    return res.json({ success: true, data: fallback });
  } catch (err) {
    const fallback = readCollection('auditLog');
    return res.json({ success: true, data: fallback });
  }
};

// GET /api/audit-log/export-csv
exports.exportCSV = async (req, res) => {
  try {
    let logs = await AuditLog.find().sort({ createdAt: -1 });
    if (!logs || logs.length === 0) logs = readCollection('auditLog');

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
