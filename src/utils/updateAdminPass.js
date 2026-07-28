require('dotenv').config({ path: __dirname + '/../../.env' });
const mongoose = require('mongoose');
const dns = require('dns');

try {
  dns.setServers(['8.8.8.8', '1.1.1.1', '8.8.4.4']);
  if (dns.setDefaultResultOrder) {
    dns.setDefaultResultOrder('ipv4first');
  }
} catch (e) {}

const User = require('../models/User');

async function updateAdminPass() {
  try {
    const uri = process.env.MONGO_URI || 'mongodb+srv://hilmiarizal36_db_user:bqdn5dbDRSias57Z@cluster0.dwunpou.mongodb.net/?appName=Cluster0';
    console.log('Connecting to Mongo URI...');
    await mongoose.connect(uri, {
      dbName: 'saren_one_db',
      serverSelectionTimeoutMS: 5000,
      tls: true,
      tlsAllowInvalidCertificates: true
    });

    console.log('Connected to MongoDB Atlas!');
    
    // Update admin user password to Admin@123 and ensure username admin exists
    const res = await User.updateMany(
      { username: 'admin' },
      { $set: { pass: 'Admin@123', status: 'VERIFIED', role: 'ADMIN' } }
    );
    console.log(`Updated ${res.modifiedCount} admin user documents in MongoDB Atlas!`);

    const users = await User.find({ username: 'admin' });
    console.log('Current Admin User in Mongo:', users);

    await mongoose.disconnect();
    console.log('Disconnected!');
  } catch (err) {
    console.error('Update Admin Pass error:', err.message);
  }
}

updateAdminPass();
