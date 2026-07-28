const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const connectDB = require('./src/config/db');
const seedMongoDB = require('./src/utils/seedMongo');

const authRoutes = require('./src/routes/authRoutes');
const bahanBakuRoutes = require('./src/routes/bahanBakuRoutes');
const produkRoutes = require('./src/routes/produkRoutes');
const resepRoutes = require('./src/routes/resepRoutes');
const produksiRoutes = require('./src/routes/produksiRoutes');
const auditLogRoutes = require('./src/routes/auditLogRoutes');
const kategoriProdukRoutes = require('./src/routes/kategoriProdukRoutes');
const kategoriBahanBakuRoutes = require('./src/routes/kategoriBahanBakuRoutes');

const app = express();
const PORT = process.env.PORT || 5000;

// Connect MongoDB & Seed Initial Database Tables
connectDB().then(async (isConnected) => {
  if (isConnected) {
    await seedMongoDB();
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Root Route
app.get('/', (req, res) => {
  res.json({
    status: 'ONLINE',
    app: 'SAREN ONE Stock & Production Backend REST API',
    database: process.env.MONGO_URI ? 'MongoDB Atlas (Active)' : 'JSON File Fallback',
    version: '1.0.0',
    endpoints: {
      auth: '/api/auth',
      bahanBaku: '/api/bahan-baku',
      produk: '/api/produk',
      resep: '/api/resep',
      produksi: '/api/produksi',
      auditLog: '/api/audit-log'
    }
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/bahan-baku', bahanBakuRoutes);
app.use('/api/produk', produkRoutes);
app.use('/api/resep', resepRoutes);
app.use('/api/produksi', produksiRoutes);
app.use('/api/audit-log', auditLogRoutes);
app.use('/api/kategori-produk', kategoriProdukRoutes);
app.use('/api/kategori-bahan-baku', kategoriBahanBakuRoutes);

// Start Server
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`=======================================================`);
    console.log(`🚀 SAREN ONE Backend REST API Server Is Running!`);
    console.log(`📡 URL: http://localhost:${PORT}`);
    console.log(`=======================================================`);
  });
}

module.exports = app;
