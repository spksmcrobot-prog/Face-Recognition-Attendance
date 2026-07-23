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
    studentEmail: userData.email || `${userData.studentId}@nstda.system`,
    company:      userData.company,
    platoon:      userData.platoon,
    school:       userData.school,
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

// ─── Get Instructor Emails ────────────────────────────────────
async function getInstructorEmails() {
  const snap = await db.collection(COLLECTIONS.USERS)
                       .where('role','==', ROLES.INSTRUCTOR)
                       .get();
  return snap.docs.map(d => d.data().email).filter(Boolean);
}

// ─── Cancel Leave (student) ───────────────────────────────────
async function cancelLeaveRequest(leaveId, uid) {
  const snap = await db.collection(COLLECTIONS.LEAVE).doc(leaveId).get();
  if (!snap.exists) throw new Error('ไม่พบคำขอลา');
  if (snap.data().uid !== uid) throw new Error('ไม่มีสิทธิ์ยกเลิก');
  if (snap.data().status !== LEAVE_STATUS.PENDING) throw new Error('ไม่สามารถยกเลิกหลังการอนุมัติแล้ว');
  await db.collection(COLLECTIONS.LEAVE).doc(leaveId).update({ status: 'cancelled' });
}
