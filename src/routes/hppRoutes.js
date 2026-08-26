const express = require('express');
const router = express.Router();
const hppController = require('../controllers/hppController');

router.get('/', hppController.getAllHpp);
router.post('/save', hppController.saveHpp);
router.delete('/:id', hppController.deleteHpp);

module.exports = router;
