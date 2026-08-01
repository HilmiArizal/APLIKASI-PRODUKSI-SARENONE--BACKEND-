const Penjualan = require('../models/Penjualan');
const Pelanggan = require('../models/Pelanggan');
const ProdukSales = require('../models/ProdukSales');
const { readCollection, writeCollection, addAuditLog } = require('../utils/dbHelper');

const getWIBTimestamp = () => {
  const now = new Date();
  const wib = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  return `${wib.getFullYear()}-${String(wib.getMonth()+1).padStart(2,'0')}-${String(wib.getDate()).padStart(2,'0')} ${String(wib.getHours()).padStart(2,'0')}:${String(wib.getMinutes()).padStart(2,'0')}`;
};

// GET /api/penjualan
exports.getAll = async (req, res) => {
  try {
    const mongoose = require('mongoose');
    if (mongoose.connection.readyState === 1) {
      const data = await Penjualan.find().sort({ createdAt: -1 });
      return res.json({ success: true, data });
    }
    const data = readCollection('penjualan');
    return res.json({ success: true, data });
  } catch (err) {
    const data = readCollection('penjualan');
    return res.json({ success: true, data });
  }
};

// POST /api/penjualan
exports.create = async (req, res) => {
  try {
    const mongoose = require('mongoose');
    const { user, ...body } = req.body;
    const now = getWIBTimestamp();
    const newId = 'PJL-' + Date.now();
    const noFaktur = 'INV-' + now.replace(/[-: ]/g, '').substring(0, 12);

    const processedItems = (body.items || []).map(it => {
      const qty = Number(it.qty) || 1;
      const hJual = Number(it.hargaSatuan) || 0;
      const hModal = Number(it.hargaModal) || 0;
      const feeItem = Math.max(0, (hJual - hModal) * qty);
      return {
        ...it,
        qty,
        hargaSatuan: hJual,
        hargaModal: hModal,
        feeMarketingItem: feeItem,
        subtotal: qty * hJual
      };
    });

    const totalFeeMarketing = Number(body.totalFeeMarketing) || processedItems.reduce((sum, i) => sum + (i.feeMarketingItem || 0), 0);

    const newData = {
      id: newId,
      noFaktur: body.noFaktur || noFaktur,
      tanggal: body.tanggal || now,
      pelangganId: body.pelangganId || '',
      namaPelanggan: body.namaPelanggan,
      kategoriCustomer: body.kategoriCustomer || 'Umum',
      teleponPelanggan: body.teleponPelanggan || '',
      alamatPelanggan: body.alamatPelanggan || '',
      items: processedItems,
      totalHarga: body.totalHarga || 0,
      diskon: body.diskon || 0,
      totalBersih: body.totalBersih || 0,
      totalFeeMarketing: totalFeeMarketing,
      metodePembayaran: body.metodePembayaran || 'Tunai',
      statusPembayaran: body.statusPembayaran || 'Lunas',
      catatan: body.catatan || '',
      createdBy: user?.name || 'Tim Penjualan',
      createdAt: now
    };

    if (mongoose.connection.readyState === 1) {
      await Penjualan.create(newData);

      // Reduce stock for each product item sold
      for (const it of processedItems) {
        if (!it.produkId && !it.namaProduk) continue;
        const qty = Number(it.qty) || 1;

        // Try match by produkId first, fallback by namaProduk
        let produkQuery = null;
        if (it.produkId) {
          produkQuery = mongoose.Types.ObjectId.isValid(it.produkId)
            ? { $or: [{ _id: it.produkId }, { id: it.produkId }] }
            : { id: it.produkId };
        } else {
          produkQuery = { namaProduk: it.namaProduk };
        }

        await ProdukSales.findOneAndUpdate(
          produkQuery,
          { $inc: { stokReady: -qty } }
        );

        // Also reduce in local JSON fallback
        const prodList = readCollection('produkSales');
        const pIdx = prodList.findIndex(p =>
          (it.produkId && (p.id === it.produkId || p._id === it.produkId)) ||
          (it.namaProduk && p.namaProduk === it.namaProduk)
        );
        if (pIdx !== -1) {
          prodList[pIdx].stokReady = Math.max(0, (Number(prodList[pIdx].stokReady) || 0) - qty);
          writeCollection('produkSales', prodList);
        }
      }

      // If Tempo or credit sale, update Customer's active piutang in MongoDB
      if (body.pelangganId && (body.statusPembayaran === 'Tempo' || body.metodePembayaran === 'Tempo')) {
        const query = mongoose.Types.ObjectId.isValid(body.pelangganId) ? { $or: [{ _id: body.pelangganId }, { id: body.pelangganId }] } : { nama: body.namaPelanggan };
        await Pelanggan.findOneAndUpdate(query, { $inc: { totalPiutang: body.totalBersih || 0 } });
      }
    }
    const list = readCollection('penjualan');
    list.unshift(newData);
    writeCollection('penjualan', list);

    addAuditLog(user?.name || 'Tim Penjualan', user?.role || 'TIM_PENJUALAN', 'Catat Penjualan', `Penjualan ${newData.noFaktur} ke ${newData.namaPelanggan} (${newData.kategoriCustomer}), Total Rp ${newData.totalBersih.toLocaleString('id-ID')}, Fee Mkt Rp ${totalFeeMarketing.toLocaleString('id-ID')}`);

    return res.status(201).json({ success: true, message: 'Penjualan berhasil dicatat!', data: newData });
  } catch (err) {
    console.error('Create penjualan error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// PUT /api/penjualan/:id
exports.update = async (req, res) => {
  try {
    const mongoose = require('mongoose');
    const { id } = req.params;
    const { user, ...body } = req.body;

    if (mongoose.connection.readyState === 1) {
      const query = mongoose.Types.ObjectId.isValid(id) ? { $or: [{ id }, { _id: id }] } : { id };
      await Penjualan.findOneAndUpdate(query, body);
    }
    const list = readCollection('penjualan');
    const idx = list.findIndex(d => d.id === id);
    if (idx !== -1) { list[idx] = { ...list[idx], ...body }; writeCollection('penjualan', list); }

    return res.json({ success: true, message: 'Penjualan berhasil diperbarui!' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// DELETE /api/penjualan/:id
exports.delete = async (req, res) => {
  try {
    const mongoose = require('mongoose');
    const { id } = req.params;
    const { user } = req.body;

    // First, find the penjualan to restore stock
    let targetPenjualan = null;
    if (mongoose.connection.readyState === 1) {
      const query = mongoose.Types.ObjectId.isValid(id) ? { $or: [{ id }, { _id: id }] } : { id };
      targetPenjualan = await Penjualan.findOne(query);
      await Penjualan.deleteOne(query);

      // Restore stock for each product item
      if (targetPenjualan?.items?.length) {
        for (const it of targetPenjualan.items) {
          const qty = Number(it.qty) || 1;
          let produkQuery = null;
          if (it.produkId) {
            produkQuery = mongoose.Types.ObjectId.isValid(it.produkId)
              ? { $or: [{ _id: it.produkId }, { id: it.produkId }] }
              : { id: it.produkId };
          } else if (it.namaProduk) {
            produkQuery = { namaProduk: it.namaProduk };
          }
          if (produkQuery) {
            await ProdukSales.findOneAndUpdate(produkQuery, { $inc: { stokReady: qty } });
          }
        }
      }
    }

    let list = readCollection('penjualan');
    const target = list.find(d => d.id === id);
    list = list.filter(d => d.id !== id);
    writeCollection('penjualan', list);

    addAuditLog(user?.name || 'Admin', user?.role || 'TIM_PENJUALAN', 'Hapus Penjualan', `Hapus penjualan: ${target?.noFaktur || id}`);
    return res.json({ success: true, message: 'Penjualan berhasil dihapus!' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

    addAuditLog(user?.name || 'Admin', user?.role || 'TIM_PENJUALAN', 'Hapus Penjualan', `Hapus penjualan: ${target?.noFaktur || id}`);
    return res.json({ success: true, message: 'Penjualan berhasil dihapus!' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
