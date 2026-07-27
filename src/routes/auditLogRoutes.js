const express = require('express');
const router = express.Router();
const auditLogController = require('../controllers/auditLogController');

router.get('/', auditLogController.getAll);
router.get('/export-csv', auditLogController.exportCSV);

module.exports = router;
