const express = require('express');
const router = express.Router();
const { getAll, create, update, delete: deleteItem } = require('../controllers/kategoriProdukSalesController');

router.get('/', getAll);
router.post('/', create);
router.put('/:id', update);
router.delete('/:id', deleteItem);

module.exports = router;
