// ============================================================
// attendance.js — Attendance Recording & History
// ============================================================

// ─── Fetch Attendance Rules ────────────────────────────────────
async function getAttendanceRules() {
  try {
    const snap = await db.collection(COLLECTIONS.SETTINGS).doc('attendance-rules').get();
    if (snap.exists) {
      const data = snap.data();
      return {
        systemEnabled: data.systemEnabled !== false,
        enforceTimeWindow: !!data.enforceTimeWindow,
        checkInStart: data.checkInStart || '06:00',
        checkInEnd: data.checkInEnd || '09:00',
        checkOutStart: data.checkOutStart || '14:00',
        checkOutEnd: data.checkOutEnd || '18:00',
        minSessions: parseInt(data.minSessions) || 10
      };
    }
  } catch (e) {
    console.warn('Failed to fetch attendance rules:', e);
  }
  return {
    systemEnabled: true,
    enforceTimeWindow: true,
    checkInStart: '06:00',
    checkInEnd: '09:00',
    checkOutStart: '14:00',
    checkOutEnd: '18:00',
    minSessions: 10
  };
}

// ─── Validate Attendance Time Window ───────────────────────────
function timeToMinutes(timeStr) {
  if (!timeStr || typeof timeStr !== 'string' || !timeStr.includes(':')) return 0;
  const parts = timeStr.split(':').map(Number);
  return (parts[0] || 0) * 60 + (parts[1] || 0);
}

function validateAttendanceTime(mode, rules) {
  if (!rules) {
    rules = { systemEnabled: true, enforceTimeWindow: true, checkInStart: '06:00', checkInEnd: '09:00', checkOutStart: '14:00', checkOutEnd: '18:00' };
  }

  // 1. Check systemEnabled
  if (rules.systemEnabled === false) {
    return {
      allowed: false,
      reason: 'disabled',
      msg: '⚠️ ระบบเช็คชื่อถูกปิดใช้งานชั่วคราวโดยผู้ดูแลระบบ'
    };
  }

  // 2. If enforceTimeWindow is false, check-in/out is allowed freely
  if (!rules.enforceTimeWindow) {
    return { allowed: true, status: 'present', msg: 'เปิดให้เช็คชื่อได้อย่างอิสระ' };
  }

  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  if (mode === 'checkin') {
    const startMins = timeToMinutes(rules.checkInStart);
    const endMins = timeToMinutes(rules.checkInEnd);

    if (currentMinutes < startMins) {
      return {
        allowed: false,
        reason: 'early',
        msg: `⏳ ยังไม่ถึงเวลาเช็คเข้า (เปิดเช็คเข้าเวลา ${rules.checkInStart} - ${rules.checkInEnd} น.)`
      };
    } else if (currentMinutes > endMins) {
      return {
        allowed: true,
        status: 'late',
        isLate: true,
        msg: `⚠️ เลยเวลาเช็คเข้าปกติ (${rules.checkInEnd} น.) ระบบจะบันทึกสถานะเป็น "สาย"`
      };
    } else {
      return {
        allowed: true,
        status: 'present',
        msg: `✅ อยู่ในช่วงเวลาเช็คเข้า (${rules.checkInStart} - ${rules.checkInEnd} น.)`
      };
    }
  } else if (mode === 'checkout') {
    const startMins = timeToMinutes(rules.checkOutStart);
    const endMins = timeToMinutes(rules.checkOutEnd);

    if (currentMinutes < startMins) {
      return {
        allowed: false,
        reason: 'early',
        msg: `⏳ ยังไม่ถึงเวลาเช็คออก (เปิดเช็คออกเวลา ${rules.checkOutStart} - ${rules.checkOutEnd} น.)`
      };
    } else if (currentMinutes > endMins) {
      return {
        allowed: false,
        reason: 'late',
        msg: `⚠️ เลยช่วงเวลาเช็คออกแล้ว (เปิดเช็คออกเวลา ${rules.checkOutStart} - ${rules.checkOutEnd} น.)`
      };
    } else {
      return {
        allowed: true,
        status: 'present',
        msg: `✅ อยู่ในช่วงเวลาเช็คออก (${rules.checkOutStart} - ${rules.checkOutEnd} น.)`
      };
    }
  }

  return { allowed: true, status: 'present' };
}

// ─── Record Check-in ─────────────────────────────────────────
async function recordCheckIn(uid, studentData, location, faceVerified, customStatus = 'present') {
  const todayStr = today();
  const ref = db.collection(COLLECTIONS.ATTENDANCE)
                .doc(todayStr)
                .collection('records')
                .doc(uid);

  const existing = await ref.get();
  if (existing.exists && existing.data().checkInTime) {
    return { alreadyChecked: true, data: existing.data() };
  }

  const now = firebase.firestore.FieldValue.serverTimestamp();
  const record = {
    uid,
    studentId:   studentData.studentId,
    name:        studentData.name,
    company:     studentData.company,
    platoon:     studentData.platoon,
    school:      studentData.school,
    status:      customStatus || 'present',
    checkInTime: now,
    checkOutTime:null,
    location:    location || null,
    faceVerified,
    date:        todayStr,
  };
  await ref.set(record, { merge: true });
  return { success: true, data: record };
}

// ─── Record Check-out ────────────────────────────────────────
async function recordCheckOut(uid, location, faceVerified) {
  const todayStr = today();
  const ref = db.collection(COLLECTIONS.ATTENDANCE)
                .doc(todayStr)
                .collection('records')
                .doc(uid);
  const snap = await ref.get();
  if (!snap.exists) throw new Error('ไม่พบข้อมูลการเช็คชื่อวันนี้');
  if (snap.data().checkOutTime) return { alreadyOut: true };
  await ref.update({
    checkOutTime:          firebase.firestore.FieldValue.serverTimestamp(),
    checkOutFaceVerified:  faceVerified,
    checkOutLocation:      location || null,
  });
  return { success: true };
}


// ─── Get Today Status for Student ───────────────────────────
async function getTodayAttendance(uid) {
  const snap = await db.collection(COLLECTIONS.ATTENDANCE)
                       .doc(today())
                       .collection('records')
                       .doc(uid)
                       .get();
  return snap.exists ? snap.data() : null;
}

// ─── Get History for Student ─────────────────────────────────
async function getStudentHistory(uid, limitDays = 30) {
  const dates = [];
  const now = new Date();
  for (let i = 0; i < limitDays; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    dates.push(dateToStr(d));
  }
  const snaps = await Promise.all(
    dates.map(dateStr =>
      db.collection(COLLECTIONS.ATTENDANCE)
        .doc(dateStr)
        .collection('records')
        .doc(uid)
        .get()
        .then(snap => ({ date: dateStr, ...(snap.exists ? snap.data() : { status: 'absent' }) }))
    )
  );
  return snaps;
}

// ─── Get All Records for a Date (commander view) ─────────────
async function getDailyRecords(dateStr, filters = {}) {
  let query = db.collection(COLLECTIONS.ATTENDANCE)
                .doc(dateStr)
                .collection('records');
  if (filters.platoon)  query = query.where('platoon', '==', filters.platoon);
  if (filters.company)  query = query.where('company', '==', filters.company);
  const snap = await query.get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ─── Update Attendance Status (commander) ───────────────────
async function updateAttendanceStatus(dateStr, uid, status, note = '') {
  await db.collection(COLLECTIONS.ATTENDANCE)
          .doc(dateStr)
          .collection('records')
          .doc(uid)
          .set({ status, note, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
}

// ─── Compute Statistics ──────────────────────────────────────
function computeStats(records) {
  const stats = { present:0, absent:0, late:0, leave:0, total: records.length };
  records.forEach(r => {
    if (stats.hasOwnProperty(r.status)) stats[r.status]++;
    else stats.absent++;
  });
  stats.presentRate = stats.total ? Math.round((stats.present / stats.total) * 100) : 0;
  return stats;
}

// ─── Mark Absent for no-shows (batch) ───────────────────────
async function markAbsentForNoShows(dateStr, allStudentUids) {
  const batch = db.batch();
  const dayRef = db.collection(COLLECTIONS.ATTENDANCE).doc(dateStr).collection('records');
  for (const uid of allStudentUids) {
    const ref = dayRef.doc(uid);
    const snap = await ref.get();
    if (!snap.exists) {
      batch.set(ref, { uid, status: 'absent', date: dateStr, auto: true });
    }
  }
  await batch.commit();
}
