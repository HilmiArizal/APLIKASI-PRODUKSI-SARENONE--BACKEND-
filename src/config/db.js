require('dotenv').config();
const mongoose = require('mongoose');
const dns = require('dns');

try {
  dns.setServers(['8.8.8.8', '1.1.1.1', '8.8.4.4']);
  if (dns.setDefaultResultOrder) {
    dns.setDefaultResultOrder('ipv4first');
  }
} catch (e) {
  console.warn('DNS config warning:', e.message);
}

const connectDB = async () => {
  const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/saren_one_db';

  try {
    const isAtlas = uri.includes('mongodb+srv');
    const options = {
      dbName: 'saren_one_db',
      serverSelectionTimeoutMS: 3000
    };

    if (isAtlas) {
      options.tls = true;
      options.tlsAllowInvalidCertificates = true;
    }

    const conn = await mongoose.connect(uri, options);
    console.log(`🍃 MongoDB Connected: ${conn.connection.host} / Database: ${conn.connection.name}`);
    return true;
  } catch (error) {
    console.log(`⚠️ MongoDB connection alert (${error.message}). Server berjalan dalam mode Dual Persistence (File JSON storage).`);
    return false;
  }
};

module.exports = connectDB;
