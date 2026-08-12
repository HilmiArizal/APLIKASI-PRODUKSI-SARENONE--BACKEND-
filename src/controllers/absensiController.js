const Absensi = require('../models/Absensi');
const { readCollection, writeCollection, addAuditLog } = require('../utils/dbHelper');

const getWIBDate = () => {
  const now = new Date();
  const wib = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  return wib.toISOString().substring(0, 10); // YYYY-MM-DD
};

// GET /api/absensi
exports.getAll = async (req, res) => {
  try {
    const mongoose = require('mongoose');
    const { tanggal, name, type } = req.query;

    if (mongoose.connection.readyState === 1) {
      const filter = {};
      if (tanggal) filter.tanggal = tanggal;
      if (name) filter.name = { $regex: name, $options: 'i' };
      if (type) filter.type = type;
      let data = await Absensi.find(filter).sort({ timestampRaw: -1 }).lean();

      // Auto-resolve lokasiNama for old existing records in DB
      data = await Promise.all(data.map(async (item) => {
        if (!item.lokasiNama && item.latitude && item.longitude) {
          const locName = await reverseGeocode(item.latitude, item.longitude);
          if (locName) {
            item.lokasiNama = locName;
            Absensi.updateOne({ _id: item._id }, { $set: { lokasiNama: locName } }).catch(() => {});
          }
        }
        return item;
      }));

      return res.json({ success: true, data });
    }
    let data = readCollection('absensi');
    if (tanggal) data = data.filter(d => d.tanggal === tanggal);
    if (name) data = data.filter(d => d.name?.toLowerCase().includes(name.toLowerCase()));
    if (type) data = data.filter(d => d.type === type);
    return res.json({ success: true, data });
  } catch (err) {
    const data = readCollection('absensi');
    return res.json({ success: true, data });
  }
};

const reverseGeocode = async (lat, lng) => {
  if (!lat || !lng) return '';
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=16`, {
      headers: { 'User-Agent': 'SarenOneApp/1.0' },
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (!res.ok) return '';
    const data = await res.json();
    if (data && data.address) {
      const a = data.address;
      const parts = [
        a.amenity || a.building || a.shop || a.road || a.pedestrian,
        a.suburb || a.village || a.quarter || a.neighbourhood || a.city_district,
        a.city || a.regency || a.town || a.county,
        a.state
      ].filter(Boolean);
      if (parts.length > 0) return parts.join(', ');
    }
    if (data && data.display_name) {
      return data.display_name.split(',').slice(0, 3).join(',').trim();
    }
  } catch (e) {
    // ignore timeout / network error
  }
  return '';
};

// POST /api/absensi  — dikirim dari app mobile
exports.create = async (req, res) => {
  try {
    const mongoose = require('mongoose');
    const { name, type, time, latitude, longitude } = req.body;

    if (!name || !type || !time) {
      return res.status(400).json({ success: false, message: 'Data nama, tipe (Check-In/Out), dan waktu wajib diisi.' });
    }

    let finalPhotoUrl = req.body.photoUrl || req.body.photo || '';
    if (req.file && req.file.buffer) {
      const mime = req.file.mimetype || 'image/jpeg';
      const base64 = req.file.buffer.toString('base64');
      finalPhotoUrl = `data:${mime};base64,${base64}`;
    }

    let lokasiNama = req.body.lokasiNama || req.body.locationName || req.body.namaLokasi || '';
    if (!lokasiNama && latitude && longitude) {
      lokasiNama = await reverseGeocode(latitude, longitude);
    }

    const tanggal = getWIBDate();
    const newId = 'ABS-' + Date.now();

    const newData = {
      id: newId,
      name: name.trim(),
      type,
      time,
      tanggal,
      latitude: latitude ? parseFloat(latitude) : null,
      longitude: longitude ? parseFloat(longitude) : null,
      lokasiNama: lokasiNama || (latitude && longitude ? `${parseFloat(latitude).toFixed(4)}, ${parseFloat(longitude).toFixed(4)}` : ''),
      photoUrl: finalPhotoUrl,
      keterangan: req.body.keterangan || req.body.catatan || req.body.notes || req.body.remark || '',
      timestampRaw: Date.now(),
      createdAt: new Date().toISOString()
    };

    if (mongoose.connection.readyState === 1) {
      await Absensi.create(newData);
    }

    const list = readCollection('absensi');
    list.unshift(newData);
    writeCollection('absensi', list);

    addAuditLog(name, 'TIM_MARKETING', `Absensi ${type}`, `${name} melakukan ${type} pada ${time} | Keterangan: ${newData.keterangan || '-'} | GPS: ${latitude || '-'}, ${longitude || '-'}`);

    return res.status(201).json({ success: true, message: `Absensi ${type} berhasil disimpan!`, data: newData });
  } catch (err) {
    console.error('Absensi create error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/absensi/rekap  — rekap per nama per tanggal
exports.getRekap = async (req, res) => {
  try {
    const mongoose = require('mongoose');
    const { tanggal } = req.query;

    let data = [];
    if (mongoose.connection.readyState === 1) {
      const filter = tanggal ? { tanggal } : {};
      data = await Absensi.find(filter).sort({ timestampRaw: 1 });
    } else {
      data = readCollection('absensi');
      if (tanggal) data = data.filter(d => d.tanggal === tanggal);
    }

    // Group by name
    const grouped = {};
    data.forEach(item => {
      if (!grouped[item.name]) grouped[item.name] = { name: item.name, checkIn: null, checkOut: null };
      if (item.type === 'Check-In' && !grouped[item.name].checkIn) grouped[item.name].checkIn = item;
      if (item.type === 'Check-Out') grouped[item.name].checkOut = item;
    });

    return res.json({ success: true, data: Object.values(grouped) });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// DELETE /api/absensi/all — hapus seluruh riwayat absensi
exports.clearAll = async (req, res) => {
  try {
    const mongoose = require('mongoose');
    if (mongoose.connection.readyState === 1) {
      await Absensi.deleteMany({});
    }
    writeCollection('absensi', []);
    return res.json({ success: true, message: 'Semua riwayat absensi berhasil dihapus.' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// DELETE /api/absensi/:id
exports.delete = async (req, res) => {
  try {
    const mongoose = require('mongoose');
    const { id } = req.params;

    if (mongoose.connection.readyState === 1) {
      await Absensi.deleteOne({ id });
    }
    let list = readCollection('absensi');
    list = list.filter(d => d.id !== id);
    writeCollection('absensi', list);

    return res.json({ success: true, message: 'Data absensi berhasil dihapus.' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
