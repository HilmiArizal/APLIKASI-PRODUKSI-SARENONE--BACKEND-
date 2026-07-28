const express = require('express');
const router = express.Router();
const auditLogController = require('../controllers/auditLogController');

router.get('/', auditLogController.getAll);
router.get('/export-csv', auditLogController.exportCSV);
router.delete('/clear/all', auditLogController.clearAllLogs);
router.delete('/:id', auditLogController.deleteLog);

module.exports = router;
