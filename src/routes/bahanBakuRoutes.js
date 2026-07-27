const express = require('express');
const router = express.Router();
const bahanBakuController = require('../controllers/bahanBakuController');

router.get('/', bahanBakuController.getAll);
router.post('/', bahanBakuController.create);
router.put('/:id', bahanBakuController.update);
router.delete('/:id', bahanBakuController.remove);
router.post('/restock', bahanBakuController.restock);

module.exports = router;
