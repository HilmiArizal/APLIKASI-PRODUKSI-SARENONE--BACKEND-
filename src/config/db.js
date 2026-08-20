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

// Global cached connection for Vercel Serverless Functions
let cached = global.mongoose;
if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

const connectDB = async () => {
  if (cached.conn && mongoose.connection.readyState === 1) {
    return true;
  }

  const uri = process.env.MONGO_URI || 'mongodb+srv://hilmiarizal36_db_user:bqdn5dbDRSias57Z@cluster0.dwunpou.mongodb.net/?appName=Cluster0';

  if (!cached.promise) {
    const isAtlas = uri.includes('mongodb+srv');
    const options = {
      dbName: 'saren_one_db',
      serverSelectionTimeoutMS: 5000,
      maxPoolSize: 2, // STRICT MAX 2 CONNECTIONS PER VERCEL LAMBDA (prevents 500/500 limit spike)
      minPoolSize: 0, // Allow connections to scale down to zero when idle
      maxIdleTimeMS: 10000, // Automatically release connections idle for >10 seconds
      socketTimeoutMS: 20000
    };

    if (isAtlas) {
      options.tls = true;
      options.tlsAllowInvalidCertificates = true;
    }

    cached.promise = mongoose.connect(uri, options).then((m) => {
      console.log(`🍃 MongoDB Connected: ${m.connection.host} / Database: ${m.connection.name}`);
      return m;
    }).catch((err) => {
      cached.promise = null;
      console.log(`⚠️ MongoDB connection alert (${err.message}). Dual Persistence (File JSON) aktif.`);
      throw err;
    });
  }

  try {
    cached.conn = await cached.promise;
    return true;
  } catch (error) {
    return false;
  }
};

module.exports = connectDB;
