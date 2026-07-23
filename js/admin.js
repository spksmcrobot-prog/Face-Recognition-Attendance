// ============================================================
// admin.js — System Administration
// ============================================================

// ─── Get All Students ─────────────────────────────────────────
async function getAllStudents(filters = {}) {
  let query = db.collection(COLLECTIONS.USERS).where('role','==', ROLES.STUDENT);
  if (filters.company) query = query.where('company','==',filters.company);
  if (filters.platoon) query = query.where('platoon','==',filters.platoon);
  if (filters.school)  query = query.where('school','==',filters.school);
  const snap = await query.get();
  let students = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  
  // Sort by studentId in JS to avoid composite index requirements
  students.sort((a, b) => (a.studentId || '').localeCompare(b.studentId || ''));
  
  return students;
}

// ─── Get All Users (all roles) ────────────────────────────────
async function getAllUsers() {
  const snap = await db.collection(COLLECTIONS.USERS).orderBy('role').get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ─── Create User Account ──────────────────────────────────────
async function adminCreateUser(userData) {
  return createStudentAccount(userData);
}

// ─── Update User ─────────────────────────────────────────────
async function updateUser(uid, data) {
  const { birthdate, ...rest } = data;
  await db.collection(COLLECTIONS.USERS).doc(uid).update({
    ...rest,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
  });
}

// ─── Toggle User Active ───────────────────────────────────────
async function toggleUserActive(uid, active) {
  await db.collection(COLLECTIONS.USERS).doc(uid).update({ active });
}

// ─── Reset Face Descriptor ────────────────────────────────────
async function resetFaceDescriptor(uid) {
  await db.collection(COLLECTIONS.USERS).doc(uid).update({
    faceDescriptor: null,
    faceUpdatedAt:  firebase.firestore.FieldValue.serverTimestamp(),
  });
}

// ─── Get / Set Geofence ──────────────────────────────────────
async function getGeofence() {
  const snap = await db.collection(COLLECTIONS.SETTINGS).doc('geofence').get();
  return snap.exists ? snap.data() : { center: { lat:13.7563, lng:100.5018 }, radius:200 };
}

async function saveGeofence(lat, lng, radius) {
  await db.collection(COLLECTIONS.SETTINGS).doc('geofence').set({
    center: { lat: parseFloat(lat), lng: parseFloat(lng) },
    radius: parseInt(radius),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
  });
}

// ─── Get System Stats ─────────────────────────────────────────
async function getSystemStats() {
  const [students, staff, leaves, todayRec, schools] = await Promise.all([
    db.collection(COLLECTIONS.USERS).where('role','==',ROLES.STUDENT).get(),
    db.collection(COLLECTIONS.USERS).where('role','>',ROLES.STUDENT).get(),
    db.collection(COLLECTIONS.LEAVE).get(),
    db.collection(COLLECTIONS.ATTENDANCE).doc(today()).collection('records').get(),
    db.collection(COLLECTIONS.SCHOOLS).get(),
  ]);
  return {
    students:  students.size,
    staff:     staff.size,
    leaves:    leaves.size,
    todayAtt:  todayRec.size,
    schools:   schools.size,
  };
}

// ─── Batch Import Students (CSV) ─────────────────────────────
function parseStudentCSV(text) {
  const lines = text.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim().replace(/"/g,''));
  return lines.slice(1).map(line => {
    const values = line.split(',').map(v => v.trim().replace(/"/g,''));
    const obj = {};
    headers.forEach((h,i) => obj[h] = values[i] || '');
    return obj;
  });
}

async function batchImportStudents(students) {
  const results = { success: 0, errors: [] };
  for (const s of students) {
    try {
      await adminCreateUser({
        studentId:  s['studentId'] || s['รหัสนศท'],
        birthdate:  standardizeBirthdate(s['birthdate'] || s['วันเกิด']),
        name:       s['name'] || s['ชื่อ'],
        company:    s['year'] || s['ชั้นปี'] || s['company'] || s['กองร้อย'],
        platoon:    s['platoon'] || s['หมวด'],
        school:     s['school'] || s['โรงเรียน'],
        center:     s['center'] || s['ศูนย์'],
        year:       s['year'] || s['ชั้นปี'] || s['company'] || s['กองร้อย'],
        nationalId: s['nationalId'] || s['เลขบัตร'],
        role:       ROLES.STUDENT,
      });
      results.success++;
    } catch(e) {
      results.errors.push({ student: s['studentId'] || s['รหัสนศท'], error: e.message });
    }
  }
  return results;
}

// ─── Enroll Face for Student (admin) ─────────────────────────
async function adminEnrollFace(uid, videoEl) {
  return enrollFace(videoEl, uid);
}
