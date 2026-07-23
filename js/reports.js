// ============================================================
// reports.js — Reporting & School Email
// ============================================================

// ─── Generate Summary for a Date Range ───────────────────────
async function generateSummary(startDate, endDate, filters = {}) {
  const results = [];
  const start = strToDate(startDate);
  const end   = strToDate(endDate);

  for (let d = new Date(start); d <= end; d.setDate(d.getDate()+1)) {
    const dateStr = dateToStr(d);
    let query = db.collection(COLLECTIONS.ATTENDANCE).doc(dateStr).collection('records');
    if (filters.company) query = query.where('company','==',filters.company);
    if (filters.platoon) query = query.where('platoon','==',filters.platoon);
    if (filters.school)  query = query.where('school','==',filters.school);
    const snap = await query.get();
    let records = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    // Enforce strict track/gender filtering for role 2 and role 3 commanders
    if (filters.track && filters.track !== 'all') {
      records = records.filter(r => {
        const isSpecialPlatoon = String(r.platoon || '').includes('พิเศษ');
        if (filters.track === 'special') return isSpecialPlatoon || r.track === 'special';
        if (filters.track === 'regular') return !isSpecialPlatoon && r.track !== 'special';
        return true;
      });
    }

    if (records.length) results.push({ date: dateStr, records, stats: computeStats(records) });
  }
  return results;
}

// ─── Get School List ──────────────────────────────────────────
async function getSchools() {
  const snap = await db.collection(COLLECTIONS.SCHOOLS).orderBy('name').get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ─── Save School ─────────────────────────────────────────────
async function saveSchool(schoolData) {
  const { id, ...data } = schoolData;
  if (id) {
    await db.collection(COLLECTIONS.SCHOOLS).doc(id).update({ ...data, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
  } else {
    await db.collection(COLLECTIONS.SCHOOLS).add({ ...data, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
  }
}

// ─── Delete School ────────────────────────────────────────────
async function deleteSchool(id) {
  await db.collection(COLLECTIONS.SCHOOLS).doc(id).delete();
}

// ─── Send Daily Report to Schools ────────────────────────────
async function sendReportToSchools(dateStr) {
  const schools = await getSchools();
  const results = [];
  for (const school of schools) {
    if (!school.teacherEmail) continue;
    const records = await getSchoolRecordsForDate(dateStr, school.name);
    if (!records.length) continue;
    const summaryData = {
      students: records.map(r => ({ studentId: r.studentId, name: r.name, status: statusTextTh(r.status) })),
      stats: computeStats(records),
    };
    const result = await sendDailySummaryToSchool(school, summaryData, dateStr);
    results.push({ school: school.name, ...result });
  }
  return results;
}

async function getSchoolRecordsForDate(dateStr, schoolName) {
  const snap = await db.collection(COLLECTIONS.ATTENDANCE)
                       .doc(dateStr).collection('records')
                       .where('school','==',schoolName)
                       .get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

function statusTextTh(status) {
  const map = { present:'มาเรียน', absent:'ขาดเรียน', late:'มาสาย', leave:'ลา' };
  return map[status] || status;
}

// ─── Export to CSV ────────────────────────────────────────────
function exportToCSV(data, filename = 'report.csv') {
  const headers = ['วันที่','รหัส นศท.','ชื่อ','หมวด','ชั้นปี','โรงเรียน','สถานะ','เวลาเข้า','เวลาออก'];
  const rows = [];
  data.forEach(day => {
    day.records.forEach(r => {
      rows.push([
        day.date,
        r.studentId || '',
        r.name || '',
        r.platoon || '',
        r.company || '',
        r.school || '',
        statusTextTh(r.status),
        r.checkInTime  ? formatTime(r.checkInTime)  : '',
        r.checkOutTime ? formatTime(r.checkOutTime) : '',
      ]);
    });
  });

  const csvContent = [headers, ...rows]
    .map(row => row.map(cell => `"${String(cell).replace(/"/g,'""')}"`).join(','))
    .join('\n');

  const bom   = '\uFEFF'; // UTF-8 BOM for Excel Thai support
  const blob  = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url   = URL.createObjectURL(blob);
  const link  = document.createElement('a');
  link.href = url; link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ─── Print Report ─────────────────────────────────────────────
function printReport() { window.print(); }
