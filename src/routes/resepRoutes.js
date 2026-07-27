const express = require('express');
const router = express.Router();
const resepController = require('../controllers/resepController');

router.get('/', resepController.getAll);
router.post('/item', resepController.saveItem);
router.delete('/item', resepController.removeItem);

module.exports = router;
