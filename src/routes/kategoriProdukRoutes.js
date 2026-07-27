const express = require('express');
const router = express.Router();
const kategoriProdukController = require('../controllers/kategoriProdukController');

router.get('/', kategoriProdukController.getAll);
router.post('/', kategoriProdukController.create);
router.put('/:id', kategoriProdukController.update);
router.delete('/:id', kategoriProdukController.remove);

module.exports = router;
