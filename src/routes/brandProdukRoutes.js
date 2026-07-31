const express = require('express');
const router = express.Router();
const { getBrandProduk, createBrandProduk, updateBrandProduk, deleteBrandProduk } = require('../controllers/brandProdukController');

router.get('/', getBrandProduk);
router.post('/', createBrandProduk);
router.put('/:id', updateBrandProduk);
router.delete('/:id', deleteBrandProduk);

module.exports = router;
