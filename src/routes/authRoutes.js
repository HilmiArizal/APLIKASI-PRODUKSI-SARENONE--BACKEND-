const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

router.post('/login', authController.login);
router.post('/logout', authController.logout);
router.post('/logout-all-devices', authController.logoutAllDevices);
router.post('/register', authController.register);
router.get('/users', authController.getAllUsers);
router.put('/approve/:id', authController.approveUser);
router.put('/reject/:id', authController.rejectUser);
router.put('/users/:id', authController.updateUser);
router.put('/users/:id/reset-password', authController.resetUserPassword);
router.delete('/users/:id', authController.deleteUser);
router.put('/change-password', authController.changePassword);

module.exports = router;
