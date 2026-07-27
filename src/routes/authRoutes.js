const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

router.post('/login', authController.login);
router.post('/register', authController.register);
router.get('/users', authController.getAllUsers);
router.put('/approve/:id', authController.approveUser);
router.put('/reject/:id', authController.rejectUser);
router.delete('/users/:id', authController.deleteUser);
router.put('/change-password', authController.changePassword);

module.exports = router;
