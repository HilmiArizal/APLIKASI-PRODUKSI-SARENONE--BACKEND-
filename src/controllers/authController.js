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

    // 1. Direct MongoDB Query
    let user = await User.findOne({
      $or: [
        { username: new RegExp(`^${input}$`, 'i') },
        { email: new RegExp(`^${input}$`, 'i') }
      ]
    });

    // 2. JSON file fallback check if Mongo not yet initialized
    if (!user) {
      const users = readCollection('users');
      user = users.find(u => u.username?.toLowerCase() === input || u.email?.toLowerCase() === input);
    }

    // 3. Strict Password Verification
    if (!user || user.pass !== password) {
      return res.status(401).json({ success: false, message: 'Username/Email atau Password salah, atau belum terdaftar!' });
    }

    if (user.status === 'REJECTED') {
      return res.status(403).json({ success: false, message: 'Pendaftaran akun Anda telah ditolak oleh Super Admin.' });
    }

    addAuditLog(user.name, user.role, 'Login System', `Pengguna ${user.name} (${user.username}) berhasil masuk.`);
    return res.json({ success: true, message: 'Login berhasil!', data: user });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan pada server login.' });
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

    // Check duplicate in MongoDB
    const existingMongo = await User.findOne({
      $or: [
        { username: new RegExp(`^${cleanUsername}$`, 'i') },
        { email: new RegExp(`^${cleanEmail}$`, 'i') }
      ]
    });

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
      requestedRole: requestedRole || 'PRODUK',
      status: 'PENDING',
      provider: 'local',
      catatan: catatan || 'Pendaftaran Pengguna Baru',
      createdAt: timestamp
    };

    // SAVE DIRECTLY TO MONGO DB ATLAS
    const createdMongoUser = await User.create(newUserObj);

    // Sync JSON fallback file
    const users = readCollection('users');
    users.push(newUserObj);
    writeCollection('users', users);

    addAuditLog(name, 'PENDING', 'Registrasi Akun', `Pengguna baru mendaftar (Password Aman): ${name} (${cleanUsername}). Saved to MongoDB Atlas.`);

    return res.status(201).json({
      success: true,
      message: 'Pendaftaran Berhasil! Akun Anda tersimpan di MongoDB Atlas dengan status PENDING. Mohon tunggu persetujuan (ACC) dari Super Admin.',
      data: createdMongoUser
    });
  } catch (err) {
    console.error('Register error:', err);
    return res.status(500).json({ success: false, message: 'Gagal meregistrasi pengguna ke MongoDB: ' + err.message });
  }
};

// GET /api/auth/users (Admin View)
exports.getAllUsers = async (req, res) => {
  try {
    const mongoUsers = await User.find().sort({ createdAt: -1 });
    if (mongoUsers && mongoUsers.length > 0) {
      return res.json({ success: true, data: mongoUsers });
    }
    const users = readCollection('users');
    return res.json({ success: true, data: users });
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

    const mongoUser = await User.findOneAndUpdate(
      { id },
      { role: role || 'PRODUK', status: 'VERIFIED' },
      { returnDocument: 'after' }
    );

    const users = readCollection('users');
    const userIndex = users.findIndex(u => u.id === id);
    if (userIndex !== -1) {
      users[userIndex].role = role || 'PRODUK';
      users[userIndex].status = 'VERIFIED';
      writeCollection('users', users);
    }

    const userName = mongoUser ? mongoUser.name : (users[userIndex] ? users[userIndex].name : '');
    addAuditLog('Super Admin', 'ADMIN', 'ACC User', `Super Admin meng-ACC pendaftaran ${userName} dengan role ${role || 'PRODUK'}.`);

    return res.json({ success: true, message: `Akun ${userName} berhasil di-ACC!`, data: mongoUser || users[userIndex] });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// PUT /api/auth/reject/:id (Tolak & Hapus Akun dari MongoDB Atlas)
exports.rejectUser = async (req, res) => {
  try {
    const { id } = req.params;

    // Delete user directly from MongoDB Atlas when rejected
    const mongoUser = await User.findOneAndDelete({ id });

    let users = readCollection('users');
    const target = users.find(u => u.id === id);
    users = users.filter(u => u.id !== id);
    writeCollection('users', users);

    const userName = mongoUser ? mongoUser.name : (target ? target.name : id);
    addAuditLog('Super Admin', 'ADMIN', 'Tolak & Hapus User', `Super Admin menolak & menghapus akun ${userName} dari MongoDB Atlas.`);

    return res.json({ success: true, message: `Pendaftaran akun ${userName} telah ditolak dan akun berhasil dihapus dari MongoDB Atlas.` });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// DELETE /api/auth/users/:id (Hapus User dari MongoDB Atlas)
exports.deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    const mongoUser = await User.findOneAndDelete({ id });

    let users = readCollection('users');
    const target = users.find(u => u.id === id);
    users = users.filter(u => u.id !== id);
    writeCollection('users', users);

    const userName = mongoUser ? mongoUser.name : (target ? target.name : id);
    addAuditLog('Super Admin', 'ADMIN', 'Hapus User', `Super Admin menghapus pengguna ${userName} dari MongoDB Atlas.`);

    return res.json({ success: true, message: `Akun ${userName} berhasil dihapus dari MongoDB Atlas.` });
  } catch (err) {
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
