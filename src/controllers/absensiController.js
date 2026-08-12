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
      const data = await Absensi.find(filter).sort({ timestampRaw: -1 });
      return res.json({ success: true, data });
    }
    const data = readCollection('absensi');
    return res.json({ success: true, data });
  } catch (err) {
    const data = readCollection('absensi');
    return res.json({ success: true, data });
  }
};

// POST /api/absensi  — dikirim dari app mobile
exports.create = async (req, res) => {
  try {
    const mongoose = require('mongoose');
    const { name, type, time, latitude, longitude, photoUrl } = req.body;

    if (!name || !type || !time) {
      return res.status(400).json({ success: false, message: 'name, type, dan time wajib diisi.' });
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
      photoUrl: photoUrl || '',
      timestampRaw: Date.now(),
      createdAt: new Date().toISOString()
    };

    if (mongoose.connection.readyState === 1) {
      await Absensi.create(newData);
    }

    const list = readCollection('absensi');
    list.unshift(newData);
    writeCollection('absensi', list);

    addAuditLog(name, 'TIM_MARKETING', `Absensi ${type}`, `${name} melakukan ${type} pada ${time} | GPS: ${latitude || '-'}, ${longitude || '-'}`);

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
