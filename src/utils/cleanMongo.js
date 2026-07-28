require('dotenv').config({ path: __dirname + '/../../.env' });
const mongoose = require('mongoose');
const dns = require('dns');

try {
  dns.setServers(['8.8.8.8', '1.1.1.1', '8.8.4.4']);
  if (dns.setDefaultResultOrder) {
    dns.setDefaultResultOrder('ipv4first');
  }
} catch (e) {}

const AuditLog = require('../models/AuditLog');
const RiwayatProduksi = require('../models/RiwayatProduksi');
const BahanBaku = require('../models/BahanBaku');
const Produk = require('../models/Produk');
const Resep = require('../models/Resep');
const KategoriProduk = require('../models/KategoriProduk');
const KategoriBahanBaku = require('../models/KategoriBahanBaku');

async function cleanMongo() {
  try {
    const uri = process.env.MONGO_URI;
    console.log('Connecting to Mongo URI...');
    await mongoose.connect(uri, {
      dbName: 'saren_one_db',
      serverSelectionTimeoutMS: 5000,
      tls: true,
      tlsAllowInvalidCertificates: true
    });

    console.log('Connected to MongoDB Atlas!');
    
    // Clear dummy audit logs LOG-101 & LOG-102
    const res = await AuditLog.deleteMany({ id: { $in: ['LOG-101', 'LOG-102'] } });
    console.log(`Cleaned ${res.deletedCount} dummy audit logs from MongoDB Atlas!`);

    const allLogs = await AuditLog.find();
    console.log('Current remaining MongoDB Atlas AuditLogs count:', allLogs.length);

    await mongoose.disconnect();
    console.log('Disconnected!');
  } catch (err) {
    console.error('Clean Mongo error:', err.message);
  }
}

cleanMongo();
