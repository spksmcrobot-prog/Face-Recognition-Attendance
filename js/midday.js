// ============================================================
// midday.js — Mid-day Check Logic
// ============================================================

// ─── Get Active Rounds for Date ─────────────────────────────
async function getTodayRounds(dateStr = null) {
  const targetDate = dateStr || today();
  const snap = await db.collection(COLLECTIONS.MIDDAY)
                       .doc(targetDate)
                       .collection('rounds')
                       .get();
  const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  docs.sort((a, b) => {
    const at = a.createdAt ? (a.createdAt.seconds || 0) : 0;
    const bt = b.createdAt ? (b.createdAt.seconds || 0) : 0;
    return at - bt;
  });
  return docs;
}

// ─── Create New Round (commander) ────────────────────────────
async function createRound(createdBy, roundNumber, dateStr = null) {
  const targetDate = dateStr || today();
  const ref = db.collection(COLLECTIONS.MIDDAY)
                .doc(targetDate)
                .collection('rounds')
                .doc();
  const num = parseInt(roundNumber);
  await ref.set({
    roundNumber: num,
    createdBy,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    date: targetDate,
    open: true,
    stats: { total: 0, present: 0, mission: 0, absent: 0 }
  });

  // Create notification in notifications collection
  try {
    await db.collection(COLLECTIONS.NOTIFICATIONS).add({
      type: 'midday_round_open',
      title: '🔔 เปิดรอบเช็คยอดแล้ว',
      message: `ผู้ดูแลเปิดรอบเช็คยอดระหว่างวัน รอบที่ ${num} กรุณารายงานตัว`,
      roundId: ref.id,
      roundNumber: num,
      date: targetDate,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      createdBy: createdBy || ''
    });
  } catch (e) {
    console.warn('Failed to add notification:', e);
  }

  return ref.id;
}

// ─── Close Round ─────────────────────────────────────────────
async function closeRound(roundId, dateStr = null) {
  const targetDate = dateStr || today();
  await db.collection(COLLECTIONS.MIDDAY)
          .doc(targetDate)
          .collection('rounds')
          .doc(roundId)
          .update({ 
            open: false, 
            closedAt: firebase.firestore.FieldValue.serverTimestamp() 
          });
}

// ─── Submit Midday Check (student) ───────────────────────────
async function submitMiddayCheck(roundId, uid, studentData, status, reasonOrLocation = '', faceVerified = false, dateStr = null) {
  const targetDate = dateStr || today();
  const roundRef = db.collection(COLLECTIONS.MIDDAY)
                     .doc(targetDate)
                     .collection('rounds')
                     .doc(roundId);

  await roundRef.collection('records')
                .doc(uid)
                .set({
                  uid,
                  studentId:   studentData.studentId,
                  name:        studentData.name,
                  company:     studentData.company,
                  platoon:     studentData.platoon,
                  status,                              // present | mission | absent
                  detail:      reasonOrLocation,
                  faceVerified,
                  timestamp:   firebase.firestore.FieldValue.serverTimestamp(),
                }, { merge: true });

  // Update stats on parent round doc
  try {
    const snap = await roundRef.collection('records').get();
    const recs = snap.docs.map(d => d.data());
    const stats = {
      total: recs.length,
      present: recs.filter(r => r.status === 'present').length,
      mission: recs.filter(r => r.status === 'mission').length,
      absent: recs.filter(r => r.status === 'absent').length
    };
    await roundRef.update({ stats });
  } catch (e) {
    console.warn('Failed to update round stats:', e);
  }
}

// ─── Get Round Records (commander view) ──────────────────────
async function getRoundRecords(roundId, filters = {}, dateStr = null) {
  const targetDate = dateStr || today();
  let query = db.collection(COLLECTIONS.MIDDAY)
                .doc(targetDate)
                .collection('rounds')
                .doc(roundId)
                .collection('records');
  if (filters.platoon) query = query.where('platoon','==', filters.platoon);
  const snap = await query.get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ─── Get Student's Check for a Round ─────────────────────────
async function getMyMiddayCheck(roundId, uid, dateStr = null) {
  const targetDate = dateStr || today();
  const snap = await db.collection(COLLECTIONS.MIDDAY)
                       .doc(targetDate)
                       .collection('rounds')
                       .doc(roundId)
                       .collection('records')
                       .doc(uid)
                       .get();
  return snap.exists ? snap.data() : null;
}

// ─── Delete Round (admin/commander) ─────────────────────────
async function deleteRound(roundId, dateStr = null) {
  const targetDate = dateStr || today();
  const roundRef = db.collection(COLLECTIONS.MIDDAY)
                     .doc(targetDate)
                     .collection('rounds')
                     .doc(roundId);

  const recSnap = await roundRef.collection('records').get();
  const batch = db.batch();
  recSnap.docs.forEach(d => batch.delete(d.ref));
  batch.delete(roundRef);
  await batch.commit();
}

// ─── Delete Individual Record from Round ──────────────────────
async function deleteRoundRecord(roundId, uid, dateStr = null) {
  const targetDate = dateStr || today();
  const roundRef = db.collection(COLLECTIONS.MIDDAY)
                     .doc(targetDate)
                     .collection('rounds')
                     .doc(roundId);

  await roundRef.collection('records').doc(uid).delete();

  try {
    const snap = await roundRef.collection('records').get();
    const recs = snap.docs.map(d => d.data());
    const stats = {
      total: recs.length,
      present: recs.filter(r => r.status === 'present').length,
      mission: recs.filter(r => r.status === 'mission').length,
      absent: recs.filter(r => r.status === 'absent').length
    };
    await roundRef.update({ stats });
  } catch (e) {
    console.warn('Failed to update stats after record deletion:', e);
  }
}

// ─── Update Individual Record in Round ───────────────────────
async function updateRoundRecord(roundId, uid, recordData, dateStr = null) {
  const targetDate = dateStr || today();
  const roundRef = db.collection(COLLECTIONS.MIDDAY)
                     .doc(targetDate)
                     .collection('rounds')
                     .doc(roundId);

  await roundRef.collection('records').doc(uid).set({
    ...recordData,
    uid,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  }, { merge: true });

  try {
    const snap = await roundRef.collection('records').get();
    const recs = snap.docs.map(d => d.data());
    const stats = {
      total: recs.length,
      present: recs.filter(r => r.status === 'present').length,
      mission: recs.filter(r => r.status === 'mission').length,
      absent: recs.filter(r => r.status === 'absent').length
    };
    await roundRef.update({ stats });
  } catch (e) {
    console.warn('Failed to update stats after record update:', e);
  }
}

// ─── Get Latest Open Round ───────────────────────────────────
async function getLatestOpenRound(dateStr = null) {
  const targetDate = dateStr || today();
  const snap = await db.collection(COLLECTIONS.MIDDAY)
                       .doc(targetDate)
                       .collection('rounds')
                       .get();
  if (snap.empty) return null;
  const openRounds = snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(r => r.open === true)
    .sort((a, b) => {
      const at = a.createdAt ? (a.createdAt.seconds || 0) : 0;
      const bt = b.createdAt ? (b.createdAt.seconds || 0) : 0;
      return bt - at; // desc — รอบล่าสุดก่อน
    });
  return openRounds.length > 0 ? openRounds[0] : null;
}
