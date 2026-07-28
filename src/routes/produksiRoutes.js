const express = require('express');
const router = express.Router();
const produksiController = require('../controllers/produksiController');

router.get('/history', produksiController.getHistory);
router.post('/execute', produksiController.executeBatch);
router.delete('/history/:id', produksiController.deleteHistory);

module.exports = router;
