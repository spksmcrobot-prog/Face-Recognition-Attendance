// ============================================================
// leave.js — Leave Request & Approval
// ============================================================

// ─── Submit Leave Request (student) ──────────────────────────
async function submitLeaveRequest(uid, userData, formData, evidenceFile) {
  let evidenceUrl = '';

  // Upload evidence to Drive if provided
  if (evidenceFile) {
    const tmpId = `${uid}_${Date.now()}`;
    const result = await uploadLeaveEvidence(evidenceFile, tmpId);
    evidenceUrl = result.url || '';
  }

  const ref = db.collection(COLLECTIONS.LEAVE).doc();
  const leaveData = {
    id:           ref.id,
    uid,
    studentId:    userData.studentId,
    studentName:  userData.name,
    studentEmail: (formData.studentEmail || userData.contactEmail || userData.email || '').trim(),
    studentPhone: (formData.studentPhone || userData.phone || userData.contactPhone || '').trim(),
    company:      userData.company || '',
    platoon:      userData.platoon || '',
    school:       userData.school || '',
    type:         formData.type,         // 'personal' | 'sick'
    startDate:    formData.startDate,
    endDate:      formData.endDate,
    days:         daysBetween(formData.startDate, formData.endDate),
    reason:       formData.reason,
    evidenceUrl,
    status:       LEAVE_STATUS.PENDING,
    createdAt:    firebase.firestore.FieldValue.serverTimestamp(),
    approvedBy:   null,
    approvedAt:   null,
    approverNote: '',
  };

  await ref.set(leaveData);

  // Notify instructors via GAS
  const instructors = await getInstructorEmails();
  await notifyLeaveRequest(leaveData, instructors);

  return leaveData;
}

// ─── Approve / Reject (instructor level 5+) ──────────────────
async function processLeaveRequest(leaveId, approved, approverUid, note = '') {
  const status = approved ? LEAVE_STATUS.APPROVED : LEAVE_STATUS.REJECTED;
  const leaveRef = db.collection(COLLECTIONS.LEAVE).doc(leaveId);
  const leaveSnap = await leaveRef.get();
  if (!leaveSnap.exists) throw new Error('ไม่พบคำขอลานี้');

  const leaveData = leaveSnap.data();
  await leaveRef.update({
    status,
    approvedBy:   approverUid,
    approvedAt:   firebase.firestore.FieldValue.serverTimestamp(),
    approverNote: note,
  });

  // If approved, mark leave status in attendance records
  if (approved) {
    await markLeaveInAttendance(leaveData);
  }

  // Notify student
  await notifyLeaveResult({ ...leaveData, id: leaveId }, approved, note);

  return status;
}

// ─── Mark Leave in Attendance ─────────────────────────────────
async function markLeaveInAttendance(leaveData) {
  const start  = strToDate(leaveData.startDate);
  const end    = strToDate(leaveData.endDate);
  const batch  = db.batch();

  for (let d = new Date(start); d <= end; d.setDate(d.getDate()+1)) {
    const dateStr = dateToStr(d);
    const ref = db.collection(COLLECTIONS.ATTENDANCE)
                  .doc(dateStr)
                  .collection('records')
                  .doc(leaveData.uid);
    batch.set(ref, {
      uid:       leaveData.uid,
      studentId: leaveData.studentId,
      name:      leaveData.studentName,
      company:   leaveData.company,
      platoon:   leaveData.platoon,
      status:    'leave',
      leaveId:   leaveData.id,
      leaveType: leaveData.type,
      date:      dateStr,
    }, { merge: true });
  }
  await batch.commit();
}

// ─── Get Leave Requests (various filters) ────────────────────
async function getLeaveRequests(filters = {}) {
  let query = db.collection(COLLECTIONS.LEAVE);
  if (filters.school)   query = query.where('school','==', filters.school);
  if (filters.platoon)  query = query.where('platoon','==', filters.platoon);
  if (filters.status)   query = query.where('status','==', filters.status);
  if (filters.uid)      query = query.where('uid','==', filters.uid);
  if (filters.company)  query = query.where('company','==', filters.company);

  const snap = await query.get();
  let leaves = [];
  snap.forEach(d => {
    leaves.push({ id: d.id, ...d.data() });
  });

  // Strict track/gender filtering for platoon & company leaders
  if (filters.track && filters.track !== 'all') {
    leaves = leaves.filter(l => {
      const isSpecialPlatoon = String(l.platoon || '').includes('พิเศษ');
      if (filters.track === 'special') return isSpecialPlatoon || l.track === 'special';
      if (filters.track === 'regular') return !isSpecialPlatoon && l.track !== 'special';
      return true;
    });
  }

  // Sort by createdAt descending in JS to avoid Firestore composite index requirements
  leaves.sort((a, b) => {
    const timeA = a.createdAt ? a.createdAt.toMillis() : 0;
    const timeB = b.createdAt ? b.createdAt.toMillis() : 0;
    return timeB - timeA;
  });

  return filters.limit ? leaves.slice(0, filters.limit) : leaves;
}

// ─── Get Single Leave Request ─────────────────────────────────
async function getLeaveRequest(leaveId) {
  const snap = await db.collection(COLLECTIONS.LEAVE).doc(leaveId).get();
  return snap.exists ? { id: snap.id, ...snap.data() } : null;
}

// ─── Get Instructor Emails (Role 5 & Role 6 or Approver Email in settings) ───
async function getInstructorEmails() {
  const emails = new Set();

  // 1. Check local & Firestore settings for specific approver email
  try {
    const localApprover = localStorage.getItem('gas_approver_email');
    if (localApprover && localApprover.includes('@')) {
      emails.add(localApprover.trim());
    }
  } catch(e) {}

  try {
    const sysSnap = await db.collection(COLLECTIONS.SETTINGS).doc('gas').get();
    if (sysSnap.exists) {
      const d = sysSnap.data();
      if (d.approverEmail && d.approverEmail.includes('@')) emails.add(d.approverEmail.trim());
      if (d.adminEmail && d.adminEmail.includes('@')) emails.add(d.adminEmail.trim());
    }
  } catch(e) {}

  // 2. Fetch all instructor/admin accounts (role >= 5) from Firestore
  try {
    const snap = await db.collection(COLLECTIONS.USERS).get();
    snap.docs.forEach(doc => {
      const u = doc.data();
      const roleNum = Number(u.role);
      if (roleNum >= ROLES.INSTRUCTOR) {
        const em = (u.contactEmail || u.email || '').trim();
        if (em && em.includes('@') && !em.endsWith('@nstda.system')) {
          emails.add(em);
        }
      }
    });
  } catch(e) {
    console.warn('Error fetching instructor emails:', e);
  }

  // 3. Fallback: search all staff (role >= 2) with valid contact email if no role 5+ email found
  if (emails.size === 0) {
    try {
      const snap = await db.collection(COLLECTIONS.USERS).get();
      snap.docs.forEach(doc => {
        const u = doc.data();
        const roleNum = Number(u.role);
        if (roleNum >= ROLES.PLATOON) {
          const em = (u.contactEmail || u.email || '').trim();
          if (em && em.includes('@') && !em.endsWith('@nstda.system')) {
            emails.add(em);
          }
        }
      });
    } catch(e) {}
  }

  return Array.from(emails);
}

// ─── Cancel Leave (student) ───────────────────────────────────
async function cancelLeaveRequest(leaveId, uid) {
  const snap = await db.collection(COLLECTIONS.LEAVE).doc(leaveId).get();
  if (!snap.exists) throw new Error('ไม่พบคำขอลา');
  if (snap.data().uid !== uid) throw new Error('ไม่มีสิทธิ์ยกเลิก');
  if (snap.data().status !== LEAVE_STATUS.PENDING) throw new Error('ไม่สามารถยกเลิกหลังการอนุมัติแล้ว');
  await db.collection(COLLECTIONS.LEAVE).doc(leaveId).update({ status: 'cancelled' });
}

// ─── Delete Leave Request (admin/commander/student) ───────────
async function deleteLeaveRequest(leaveId) {
  const snap = await db.collection(COLLECTIONS.LEAVE).doc(leaveId).get();
  if (!snap.exists) throw new Error('ไม่พบคำขอลา');
  const leaveData = snap.data();

  // Delete leave document
  await db.collection(COLLECTIONS.LEAVE).doc(leaveId).delete();

  // Clean up attendance records if leave was marked
  if (leaveData.uid && leaveData.startDate && leaveData.endDate) {
    try {
      const start = strToDate(leaveData.startDate);
      const end = strToDate(leaveData.endDate);
      const batch = db.batch();
      let count = 0;
      for (let d = new Date(start); d <= end; d.setDate(d.getDate()+1)) {
        const dateStr = dateToStr(d);
        const ref = db.collection(COLLECTIONS.ATTENDANCE)
                      .doc(dateStr)
                      .collection('records')
                      .doc(leaveData.uid);
        batch.delete(ref);
        count++;
      }
      if (count > 0) await batch.commit();
    } catch(e) {
      console.warn('Failed to cleanup attendance records for deleted leave:', e);
    }
  }
}
