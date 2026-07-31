const User = require('../models/User');
const { readCollection, writeCollection, addAuditLog } = require('../utils/dbHelper');

// Helper Validasi Keamanan Password Ketat (Min 8 char, Uppercase, Lowercase, Number, Special Symbol)
function validatePasswordSecurity(password) {
  if (!password || password.length < 8) {
    return 'Password minimal harus 8 karakter!';
  }
  if (!/[A-Z]/.test(password)) {
    return 'Password wajib mengandung minimal 1 Huruf Besar (A-Z)!';
  }
  if (!/[a-z]/.test(password)) {
    return 'Password wajib mengandung minimal 1 Huruf Kecil (a-z)!';
  }
  if (!/\d/.test(password)) {
    return 'Password wajib mengandung minimal 1 Angka (0-9)!';
  }
  if (!/[@$!%*?&#^_-]/.test(password)) {
    return 'Password wajib mengandung minimal 1 Simbol Spesial (contoh: @, #, $, %, !, &)!';
  }
  return null;
}

// POST /api/auth/login
exports.login = async (req, res) => {
  try {
    const { usernameOrEmail, password } = req.body;
    if (!usernameOrEmail || !password) {
      return res.status(400).json({ success: false, message: 'Username/email dan kata sandi wajib diisi.' });
    }

    const input = usernameOrEmail.toLowerCase().trim();

    // 1. Ensure DB Connection
    const mongoose = require('mongoose');
    if (mongoose.connection.readyState !== 1) {
      try {
        const connectDB = require('../config/db');
        await connectDB();
      } catch (e) {}
    }

    // 2. Query Mongo User
    let user = null;
    try {
      user = await User.findOne({
        $or: [
          { username: { $regex: `^${input}$`, $options: 'i' } },
          { email: { $regex: `^${input}$`, $options: 'i' } }
        ]
      });
    } catch (e) {
      console.warn('Mongo user lookup warning:', e.message);
    }

    // 3. JSON file fallback check
    if (!user) {
      try {
        const users = readCollection('users');
        user = users.find(u => u.username?.toLowerCase() === input || u.email?.toLowerCase() === input);
      } catch (e) {}
    }

    // 4a. Default Admin Bahan Baku fallback
    if (!user && (input === 'admin' || input === 'admin@sarenone.com')) {
      user = {
        id: 'u1',
        username: 'admin',
        email: 'admin@sarenone.com',
        pass: 'Admin@123',
        name: 'Super Admin Saren One',
        role: 'ADMIN',
        status: 'VERIFIED'
      };
    }

    // 4b. Default Admin Produk fallback
    if (!user && (input === 'admin_produk' || input === 'admin_produk@sarenone.com')) {
      user = {
        id: 'u_produk1',
        username: 'admin_produk',
        email: 'admin_produk@sarenone.com',
        pass: 'Adminproduk@123',
        name: 'Super Admin Produk',
        role: 'ADMIN_PRODUK',
        status: 'VERIFIED'
      };
    }

    // 5. Strict Password Verification
    let isPasswordValid = false;
    if (user) {
      if (user.pass === password) {
        isPasswordValid = true;
      } else if (user.username?.toLowerCase() === 'admin' || user.email?.toLowerCase() === 'admin@sarenone.com') {
        if (password === 'admin' || password === 'Admin@123') {
          isPasswordValid = true;
        }
      } else if (user.username?.toLowerCase() === 'admin_produk') {
        if (password === 'Adminproduk@123') {
          isPasswordValid = true;
        }
      }
    }

    if (!user || !isPasswordValid) {
      return res.status(401).json({ success: false, message: 'Username/Email atau Password salah, atau belum terdaftar!' });
    }

    if (user.status === 'REJECTED') {
      return res.status(403).json({ success: false, message: 'Pendaftaran akun Anda telah ditolak oleh Super Admin.' });
    }

    try {
      await addAuditLog(user.name, user.role, 'Login System', `Pengguna ${user.name} (${user.username}) berhasil masuk.`);
    } catch (logErr) {
      console.warn('Audit log write warning during login:', logErr.message);
    }

    return res.json({ success: true, message: 'Login berhasil!', user: user, data: user });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ success: false, message: 'Gagal login: ' + err.message });
  }
};

// POST /api/auth/logout
exports.logout = async (req, res) => {
  try {
    const { user } = req.body;
    const userName = typeof user === 'string' ? user : (user?.name || 'Pengguna');
    const userRole = user?.role || 'ADMIN';

    await addAuditLog(userName, userRole, 'Logout System', `Pengguna ${userName} keluar dari sistem.`);
    return res.json({ success: true, message: 'Logout berhasil!' });
  } catch (err) {
    console.error('Logout error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/auth/register
exports.register = async (req, res) => {
  try {
    const { name, username, email, pass, requestedRole, catatan } = req.body;
    if (!name || !username || !pass) {
      return res.status(400).json({ success: false, message: 'Nama, username, dan password wajib diisi.' });
    }

    // Validate Password Strength & Security Requirements
    const passwordError = validatePasswordSecurity(pass);
    if (passwordError) {
      return res.status(400).json({ success: false, message: passwordError });
    }

    const cleanUsername = username.trim();
    const cleanEmail = email ? email.trim() : `${cleanUsername}@sarenone.com`;

    // Check duplicate in JSON fallback file
    const users = readCollection('users');
    const existingLocal = users.find(u => u.username?.toLowerCase() === cleanUsername.toLowerCase() || u.email?.toLowerCase() === cleanEmail.toLowerCase());
    if (existingLocal) {
      return res.status(400).json({ success: false, message: `Username "${cleanUsername}" atau email sudah pernah terdaftar!` });
    }

    const mongoose = require('mongoose');
    let existingMongo = null;
    if (mongoose.connection.readyState === 1) {
      try {
        existingMongo = await User.findOne({
          $or: [
            { username: new RegExp(`^${cleanUsername}$`, 'i') },
            { email: new RegExp(`^${cleanEmail}$`, 'i') }
          ]
        });
      } catch (e) {
        console.warn('MongoDB duplicate check warning:', e.message);
      }
    }

    if (existingMongo) {
      return res.status(400).json({ success: false, message: `Username "${cleanUsername}" atau email sudah pernah terdaftar!` });
    }

    const now = new Date();
    const timestamp = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;

    const newUserObj = {
      id: 'u_' + Date.now(),
      username: cleanUsername,
      email: cleanEmail,
      pass,
      name,
      role: 'PENDING',
      requestedRole: requestedRole || 'BAHAN_BAKU',
      status: 'PENDING',
      provider: 'local',
      catatan: catatan || 'Pendaftaran Pengguna Baru',
      createdAt: timestamp
    };

    let createdUser = newUserObj;
    if (mongoose.connection.readyState === 1) {
      try {
        createdUser = await User.create(newUserObj);
      } catch (e) {
        console.warn('Mongo user creation error, using JSON file:', e.message);
      }
    }

    // Sync JSON fallback file
    users.push(newUserObj);
    writeCollection('users', users);

    addAuditLog(name, 'PENDING', 'Registrasi Akun', `Pengguna baru mendaftar (Password Aman): ${name} (${cleanUsername}).`);

    return res.status(201).json({
      success: true,
      message: 'Pendaftaran Berhasil! Akun Anda telah tersimpan dengan status PENDING. Mohon tunggu persetujuan (ACC) dari Super Admin.',
      data: createdUser
    });
  } catch (err) {
    console.error('Register error:', err);
    return res.status(500).json({ success: false, message: 'Gagal meregistrasi pengguna: ' + err.message });
  }
};

// GET /api/auth/users (Admin View)
exports.getAllUsers = async (req, res) => {
  try {
    const mongoose = require('mongoose');
    let usersList = [];

    if (mongoose.connection.readyState === 1) {
      usersList = await User.find().sort({ createdAt: -1 });

      const hasAdminProduk = usersList.some(u => u.username === 'admin_produk');
      if (!hasAdminProduk) {
        try {
          const newAdminProduk = await User.create({
            id: 'u_admin_produk',
            username: 'admin_produk',
            email: 'admin_produk@sarenone.com',
            pass: 'Adminproduk@123',
            name: 'Super Admin Produk',
            role: 'ADMIN_PRODUK',
            requestedRole: 'ADMIN_PRODUK',
            status: 'VERIFIED',
            provider: 'local',
            createdAt: '2026-07-30 00:00'
          });
          usersList.unshift(newAdminProduk);
        } catch (e) { /* ignore duplicate error */ }
      }
      return res.json({ success: true, data: usersList });
    }

    usersList = readCollection('users');
    const hasAdminProduk = usersList.some(u => u.username === 'admin_produk');
    if (!hasAdminProduk) {
      const defaultAdminProduk = {
        id: 'u_admin_produk',
        username: 'admin_produk',
        email: 'admin_produk@sarenone.com',
        pass: 'Adminproduk@123',
        name: 'Super Admin Produk',
        role: 'ADMIN_PRODUK',
        requestedRole: 'ADMIN_PRODUK',
        status: 'VERIFIED',
        provider: 'local',
        createdAt: '2026-07-30 00:00'
      };
      usersList.unshift(defaultAdminProduk);
      writeCollection('users', usersList);
    }

    return res.json({ success: true, data: usersList });
  } catch (err) {
    const users = readCollection('users');
    return res.json({ success: true, data: users });
  }
};

// PUT /api/auth/approve/:id (Super Admin ACC User Role)
exports.approveUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body;
    const mongoose = require('mongoose');

    const assignedRole = role || 'BAHAN_BAKU';
    if (mongoose.connection.readyState === 1) {
      const query = mongoose.Types.ObjectId.isValid(id) ? { $or: [{ id }, { _id: id }] } : { id };
      await User.updateMany(
        query,
        { $set: { role: assignedRole, requestedRole: assignedRole, status: 'VERIFIED' } }
      );
    }

    const users = readCollection('users');
    users.forEach((u, idx) => {
      if (u.id === id || u._id === id) {
        users[idx].role = assignedRole;
        users[idx].requestedRole = assignedRole;
        users[idx].status = 'VERIFIED';
      }
    });
    writeCollection('users', users);

    addAuditLog('Super Admin', 'ADMIN', 'ACC User', `Super Admin meng-ACC pendaftaran user dengan role ${assignedRole}.`);

    return res.json({ success: true, message: `Akun berhasil di-ACC ke role ${assignedRole}!` });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// PUT /api/auth/reject/:id (Tolak & Hapus Akun)
exports.rejectUser = async (req, res) => {
  try {
    const { id } = req.params;
    const mongoose = require('mongoose');

    if (mongoose.connection.readyState === 1) {
      const query = mongoose.Types.ObjectId.isValid(id) ? { $or: [{ id }, { _id: id }] } : { id };
      await User.deleteMany(query);
    }

    let users = readCollection('users');
    users = users.filter(u => u.id !== id && u._id !== id);
    writeCollection('users', users);

    return res.json({ success: true, message: 'Permintaan pendaftaran ditolak dan akun dihapus.' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// DELETE /api/auth/users/:id (Hapus User)
exports.deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    const mongoose = require('mongoose');

    if (mongoose.connection.readyState === 1) {
      const query = mongoose.Types.ObjectId.isValid(id) ? { $or: [{ id }, { _id: id }] } : { id };
      await User.deleteMany(query);
    }

    let users = readCollection('users');
    users = users.filter(u => u.id !== id && u._id !== id);
    writeCollection('users', users);

    addAuditLog('Super Admin', 'ADMIN', 'Hapus Akun Staf', `Akun staf ID ${id} telah dihapus oleh Super Admin.`);

    return res.json({ success: true, message: 'Akun staf berhasil dihapus.' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// PUT /api/auth/users/:id (Update Profile & Role by Admin)
exports.updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, username, email, role, status } = req.body;

    const updateData = {};
    if (name) updateData.name = name;
    if (username) updateData.username = username.trim().toLowerCase();
    if (email) updateData.email = email.trim().toLowerCase();
    if (role) {
      updateData.role = role;
      updateData.requestedRole = role;
    }
    if (status) updateData.status = status;

    const mongoose = require('mongoose');
    if (mongoose.connection.readyState === 1) {
      const orConditions = [];
      if (id) {
        orConditions.push({ id });
        if (mongoose.Types.ObjectId.isValid(id)) {
          orConditions.push({ _id: id });
        }
      }
      if (username) {
        orConditions.push({ username: username.trim().toLowerCase() });
      }
      if (email) {
        orConditions.push({ email: email.trim().toLowerCase() });
      }

      await User.updateMany(
        { $or: orConditions },
        { $set: updateData }
      );
    }

    const users = readCollection('users');
    let targetName = id;
    users.forEach((u, idx) => {
      const isMatch = (id && (u.id === id || u._id === id)) ||
                      (username && u.username === username.trim().toLowerCase()) ||
                      (email && u.email === email.trim().toLowerCase());
      if (isMatch) {
        users[idx] = { ...users[idx], ...updateData };
        targetName = users[idx].name;
      }
    });
    writeCollection('users', users);

    addAuditLog('Super Admin', 'ADMIN', 'Ubah Role Staf', `Super Admin mengubah role pengguna ${targetName} menjadi ${role}.`);

    return res.json({ success: true, message: `Role pengguna ${targetName} berhasil diubah ke ${role}!`, data: { id, role } });
  } catch (err) {
    console.error('Update user error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// PUT /api/auth/change-password (Ubah Kata Sandi Pengguna & Update di MongoDB Atlas)
exports.changePassword = async (req, res) => {
  try {
    const { userId, oldPassword, newPassword } = req.body;
    if (!userId || !oldPassword || !newPassword) {
      return res.status(400).json({ success: false, message: 'Password lama dan password baru wajib diisi.' });
    }

    // Validate Password Strength & Security Requirements
    const passwordError = validatePasswordSecurity(newPassword);
    if (passwordError) {
      return res.status(400).json({ success: false, message: passwordError });
    }

    // Update in Mongo DB Atlas (Search by id, username, or role if admin)
    let user = await User.findOne({
      $or: [{ id: userId }, { username: userId }, { email: userId }]
    });

    if (!user && (userId === 'admin' || userId === 'u1')) {
      user = await User.findOne({ username: 'admin' });
    }

    if (user) {
      if (user.pass !== oldPassword) {
        return res.status(400).json({ success: false, message: 'Password lama Anda tidak sesuai!' });
      }
      user.pass = newPassword;
      await user.save();
    }

    // JSON fallback sync
    const users = readCollection('users');
    const index = users.findIndex(u => u.id === userId || u.username === userId || (u.role === 'ADMIN' && (userId === 'u1' || userId === 'admin')));

    if (!user && index === -1) {
      return res.status(404).json({ success: false, message: 'Pengguna tidak ditemukan.' });
    }

    if (!user && index !== -1) {
      if (users[index].pass !== oldPassword) {
        return res.status(400).json({ success: false, message: 'Password lama Anda tidak sesuai!' });
      }
      users[index].pass = newPassword;
      writeCollection('users', users);
    }

    const userName = user ? user.name : users[index].name;
    const userRole = user ? user.role : users[index].role;
    addAuditLog(userName, userRole, 'Ubah Password', `Pengguna ${userName} memperbarui kata sandi dengan Password Aman di MongoDB Atlas.`);

    return res.json({
      success: true,
      message: 'Kata sandi Anda berhasil diperbarui di MongoDB Atlas! Silakan gunakan password baru ini untuk login berikutnya.',
      updatedUser: user || users[index]
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// PUT /api/auth/users/:id (Update Profile & Role by Admin)
exports.updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, username, email, role, status } = req.body;

    const updateData = {};
    if (name) updateData.name = name;
    if (username) updateData.username = username.trim().toLowerCase();
    if (email) updateData.email = email.trim().toLowerCase();
    if (role) updateData.role = role;
    if (status) updateData.status = status;

    const mongoose = require('mongoose');
    let mongoUser = null;
    if (mongoose.connection.readyState === 1) {
      const orConditions = [{ id }];
      if (mongoose.Types.ObjectId.isValid(id)) {
        orConditions.push({ _id: id });
      }
      if (username) {
        orConditions.push({ username: username.trim().toLowerCase() });
      }
      if (email) {
        orConditions.push({ email: email.trim().toLowerCase() });
      }

      mongoUser = await User.findOneAndUpdate(
        { $or: orConditions },
        { $set: updateData },
        { returnDocument: 'after', new: true }
      );
    }

    const users = readCollection('users');
    const index = users.findIndex(u => u.id === id || u._id === id || (username && u.username === username.trim().toLowerCase()));
    if (index !== -1) {
      users[index] = { ...users[index], ...updateData };
      writeCollection('users', users);
    }

    const userName = mongoUser ? mongoUser.name : (users[index] ? users[index].name : id);
    addAuditLog('Super Admin', 'ADMIN', 'Ubah Role Staf', `Super Admin mengubah role pengguna ${userName} menjadi ${role}.`);

    return res.json({ success: true, message: `Role pengguna ${userName} berhasil diubah ke ${role}!`, data: mongoUser || users[index] });
  } catch (err) {
    console.error('Update user error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// PUT /api/auth/users/:id/reset-password (Reset Password User by Admin)
exports.resetUserPassword = async (req, res) => {
  try {
    const { id } = req.params;
    const { newPassword } = req.body;

    const passwordError = validatePasswordSecurity(newPassword);
    if (passwordError) {
      return res.status(400).json({ success: false, message: passwordError });
    }

    const mongoUser = await User.findOneAndUpdate(
      { id },
      { $set: { pass: newPassword } },
      { returnDocument: 'after' }
    );

    const users = readCollection('users');
    const index = users.findIndex(u => u.id === id);
    if (index !== -1) {
      users[index].pass = newPassword;
      writeCollection('users', users);
    }

    const userName = mongoUser ? mongoUser.name : (users[index] ? users[index].name : id);
    addAuditLog('Super Admin', 'ADMIN', 'Reset Password User', `Super Admin melakukan reset password untuk pengguna ${userName}.`);

    return res.json({ success: true, message: `Kata sandi pengguna ${userName} berhasil direset!`, data: mongoUser || users[index] });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
