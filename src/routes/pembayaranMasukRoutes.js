const express = require('express');
const router = express.Router();
const pembayaranMasukController = require('../controllers/pembayaranMasukController');

router.get('/', pembayaranMasukController.getAll);
router.post('/', pembayaranMasukController.create);
router.delete('/:id', pembayaranMasukController.delete);

module.exports = router;
