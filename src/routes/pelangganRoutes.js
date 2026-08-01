const express = require('express');
const router = express.Router();
const pelangganController = require('../controllers/pelangganController');

router.get('/', pelangganController.getAllPelanggan);
router.post('/', pelangganController.createPelanggan);
router.post('/bulk', pelangganController.bulkCreatePelanggan);
router.put('/:id', pelangganController.updatePelanggan);
router.delete('/:id', pelangganController.deletePelanggan);

module.exports = router;
