const express = require('express');
const router = express.Router();
const resepController = require('../controllers/resepController');

router.get('/', resepController.getAll);
router.post('/', resepController.saveItem);
router.post('/item', resepController.saveItem);
router.delete('/:produkId/:bahanId', resepController.removeItem);
router.delete('/item', resepController.removeItem);

module.exports = router;
