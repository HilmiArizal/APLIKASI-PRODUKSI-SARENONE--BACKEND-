const express = require('express');
const router = express.Router();
const produkController = require('../controllers/produkController');

router.get('/kemasan-map', produkController.getKemasanMap);
router.post('/kemasan-map', produkController.saveKemasanMap);
router.get('/', produkController.getAll);
router.post('/', produkController.create);
router.put('/:id', produkController.update);
router.delete('/:id', produkController.remove);

module.exports = router;
