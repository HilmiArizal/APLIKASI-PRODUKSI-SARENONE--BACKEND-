const express = require('express');
const router = express.Router();
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const ctrl = require('../controllers/absensiController');

router.get('/', ctrl.getAll);
router.get('/rekap', ctrl.getRekap);
router.post('/', upload.single('photo'), ctrl.create);
router.delete('/all', ctrl.clearAll);
router.delete('/:id', ctrl.delete);

module.exports = router;
