require('dotenv').config();
const mongoose = require('mongoose');

const connectDB = async () => {
  const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/saren_one_db';

  try {
    const isAtlas = uri.includes('mongodb+srv');
    const options = {
      dbName: 'saren_one_db', // Explicitly specify saren_one_db database
      serverSelectionTimeoutMS: 5000
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
