const User = require('../models/User');

const INITIAL_USERS = [
  { id: 'u1', username: 'admin', email: 'admin@sarenone.com', pass: 'admin', name: 'Super Admin Saren One', role: 'ADMIN', status: 'VERIFIED', provider: 'local', createdAt: '2026-07-20 08:00' }
];

async function seedMongoDB() {
  try {
    const userCount = await User.countDocuments();
    if (userCount === 0) {
      await User.insertMany(INITIAL_USERS);
      console.log('🌱 Super Admin account inserted to MongoDB Atlas!');
    }

    // Wipe legacy sample suppliers
    const Supplier = require('../models/Supplier');
    await Supplier.deleteMany({
      $or: [
        { id: { $in: ['sup_1', 'sup_2', 'sup_3', 'sup_4', 'sup_5'] } },
        { nama: { $in: ['PT Marksoy Indonesia', 'CV Daging Utama', 'PT Plastik & Kemasan Nusantara', 'Toko Rempah & Bumbu Berkah', 'Pabrik Es Batu Kristal Saren'] } }
      ]
    });

    console.log('✨ MongoDB Atlas database ready!');
  } catch (err) {
    console.error('Error seeding MongoDB:', err.message);
  }
}

module.exports = seedMongoDB;
