const express = require('express');
const router = express.Router();
const emulsiController = require('../controllers/emulsiController');

router.post('/process', emulsiController.processEmulsi);

module.exports = router;
