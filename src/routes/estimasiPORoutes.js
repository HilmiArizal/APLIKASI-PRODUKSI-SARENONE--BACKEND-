const express = require('express');
const router = express.Router();
const estimasiPOController = require('../controllers/estimasiPOController');

// GET /api/estimasi-po
router.get('/', estimasiPOController.getAll);

// POST /api/estimasi-po
router.post('/', estimasiPOController.create);

// PATCH /api/estimasi-po/:id/status
router.patch('/:id/status', estimasiPOController.updateStatus);

// DELETE /api/estimasi-po/:id
router.delete('/:id', estimasiPOController.remove);

module.exports = router;
