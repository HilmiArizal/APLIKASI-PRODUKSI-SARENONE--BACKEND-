const express = require('express');
const router = express.Router();
const controller = require('../controllers/utangSupplierController');

// Dedicated Clear Routes (Must be BEFORE :id)
router.delete('/clear/all', controller.clearAll);
router.delete('/clear-all', controller.clearAll);
router.post('/clear-all', controller.clearAll);

router.get('/', controller.getAll);
router.post('/', controller.create);
router.post('/:id/pay', controller.pay);
router.post('/:id/receive', controller.receive);
router.delete('/:id', controller.remove);

module.exports = router;
