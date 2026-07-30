const express = require('express');
const router = express.Router();
const controller = require('../controllers/utangSupplierController');

router.get('/', controller.getAll);
router.post('/', controller.create);
router.post('/:id/pay', controller.pay);
router.post('/:id/receive', controller.receive);
router.delete('/:id', controller.remove);

module.exports = router;
