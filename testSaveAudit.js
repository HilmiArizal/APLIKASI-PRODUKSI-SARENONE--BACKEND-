const connectDB = require('./src/config/db');
const AuditStokFisik = require('./src/models/AuditStokFisik');

async function testInsert() {
  await connectDB();
  console.log('Connected to MongoDB Atlas!');

  const testBatch = [
    {
      tanggal: '2026-08-01',
      bahanId: 'bb1',
      bahanNama: 'BLP',
      satuan: 'kg',
      stokSistem: 72.7,
      stokFisik: 63.935,
      selisihQty: -8.765,
      susutPct: 12.1,
      hargaSatuan: 46000,
      nilaiSusutRp: 403190,
      keterangan: 'Test Import Excel',
      auditor: 'Hilmi Arizal'
    }
  ];

  const inserted = await AuditStokFisik.insertMany(testBatch);
  console.log('Successfully inserted into MongoDB Atlas! Inserted count:', inserted.length);

  const countAfter = await AuditStokFisik.countDocuments();
  console.log('New AuditStokFisik record count in MongoDB Atlas:', countAfter);

  process.exit(0);
}

testInsert();
