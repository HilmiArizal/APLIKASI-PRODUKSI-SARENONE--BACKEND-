const express = require('express');
const router = express.Router();
const auditStokController = require('../controllers/auditStokController');

router.get('/', auditStokController.getAuditStokList);
router.post('/', auditStokController.saveAuditStok);
router.post('/delete-batch', auditStokController.deleteAuditStokBatch);
router.delete('/tanggal/:tanggal', auditStokController.deleteAuditStokByDate);
router.delete('/:id', auditStokController.deleteAuditStok);

module.exports = router;
