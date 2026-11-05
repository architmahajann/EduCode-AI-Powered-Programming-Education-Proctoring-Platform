const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const Room = require('../Model/roomModel');
const User = require('../Model/userModel');

function cleanupSnapshots(baseDir, cutoffTs) {
  const stats = { filesDeleted: 0, dirsDeleted: 0 };
  try {
    if (!fs.existsSync(baseDir)) return stats;
    const students = fs.readdirSync(baseDir);
    for (const student of students) {
      const studentDir = path.join(baseDir, student);
      let removedAny = false;
      try {
        const st = fs.statSync(studentDir);
        if (!st.isDirectory()) continue;
      } catch(_) { continue; }

      const files = fs.readdirSync(studentDir).filter(f => /\.(png|jpg)$/i.test(f));
      for (const f of files) {
        const full = path.join(studentDir, f);
        let ts = Number((f.split('.')[0]) || 0);
        try {
          if (!Number.isFinite(ts) || ts <= 0) {
            // Fallback to file mtime when filename has no numeric timestamp
            const st = fs.statSync(full);
            ts = st.mtimeMs;
          }
        } catch(_) { /* ignore */ }
        if (ts < cutoffTs) {
          try { fs.unlinkSync(full); stats.filesDeleted++; removedAny = true; } catch(_) {}
        }
      }
      // If directory is empty after cleanup, remove it
      try {
        const remain = fs.readdirSync(studentDir).filter(name => !name.startsWith('.'));
        if (remain.length === 0) { fs.rmdirSync(studentDir); stats.dirsDeleted++; }
      } catch(_) { /* ignore */ }
    }
  } catch (e) {
    console.warn('[Retention] snapshot cleanup failed:', e.message);
  }
  return stats;
}

async function cleanupDatabase(cutoffDate) {
  const result = { roomsDeleted: 0, usersDeleted: 0 };
  if (mongoose.connection.readyState !== 1) {
    return { ...result, skipped: 'db-not-connected' };
  }
  try {
    // Find rooms older than cutoff
    const oldRooms = await Room.find({ createdAt: { $lt: cutoffDate } }, { _id: 1 }).lean();
    const ids = oldRooms.map(r => String(r._id));
    if (ids.length === 0) return result;

    // Delete users belonging to those rooms
    const userDel = await User.deleteMany({ roomId: { $in: ids } });
    result.usersDeleted = userDel?.deletedCount || 0;
    // Delete rooms themselves
    const roomDel = await Room.deleteMany({ _id: { $in: ids } });
    result.roomsDeleted = roomDel?.deletedCount || 0;
  } catch (e) {
    console.warn('[Retention] db cleanup failed:', e.message);
  }
  return result;
}

function start(options = {}) {
  const snapshotDir = options.snapshotDir || path.join(process.cwd(), 'public', 'snapshots');
  const retentionDays = Number(options.retentionDays || 2);
  const intervalMs = Number(options.intervalMs || 6 * 60 * 60 * 1000); // every 6h
  const firstDelayMs = Number(options.firstDelayMs || 30 * 1000); // start ~30s after boot

  async function runOnce() {
    const now = Date.now();
    const cutoffTs = now - retentionDays * 24 * 60 * 60 * 1000;
    const cutoffDate = new Date(cutoffTs);
    try {
      console.log(`[Retention] running (cutoff ${cutoffDate.toISOString()})`);
      const fsStats = cleanupSnapshots(snapshotDir, cutoffTs);
      const dbStats = await cleanupDatabase(cutoffDate);
      console.log('[Retention] done', { ...fsStats, ...dbStats });
    } catch (e) {
      console.warn('[Retention] run failed:', e.message);
    }
  }

  // schedule
  setTimeout(runOnce, firstDelayMs);
  setInterval(runOnce, intervalMs);
  console.log(`[Retention] scheduled: every ${Math.round(intervalMs/3600000)}h, keep ${retentionDays} day(s)`);
}

module.exports = { start };
