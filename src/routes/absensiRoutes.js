const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/absensiController');

router.get('/', ctrl.getAll);
router.get('/rekap', ctrl.getRekap);
router.post('/', ctrl.create);
router.delete('/:id', ctrl.delete);

module.exports = router;
