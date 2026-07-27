const express = require('express');
const router = express.Router();
const kategoriBahanBakuController = require('../controllers/kategoriBahanBakuController');

router.get('/', kategoriBahanBakuController.getAll);
router.post('/', kategoriBahanBakuController.create);
router.put('/:id', kategoriBahanBakuController.update);
router.delete('/:id', kategoriBahanBakuController.remove);

module.exports = router;
