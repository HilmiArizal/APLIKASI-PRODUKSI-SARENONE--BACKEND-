const express = require('express');
const router = express.Router();
const produksiController = require('../controllers/produksiController');

router.get('/history', produksiController.getHistory);
router.post('/execute', produksiController.executeBatch);
router.delete('/history/:id', produksiController.deleteHistory);

router.get('/hasil', produksiController.getHasilProduksi);
router.post('/hasil', produksiController.saveHasilProduksi);
router.delete('/hasil/:id', produksiController.deleteHasilProduksi);

module.exports = router;
