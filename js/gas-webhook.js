// ============================================================
// gas-webhook.js — Google Apps Script Email Automation
// ============================================================

// ⚠️ GAS Web App URL สำหรับระบบแจ้งเตือนทางอีเมล
const GAS_URL = 'https://script.google.com/macros/s/AKfycbw4quSoeMEjWnwapSvhxZKnFR-G0Rr0KISa9HuMTZPVy2ClUjQiP0D7e0w7GwxKr7Qb8w/exec';

// ─── Send Leave Notification to Instructor ──────────────────
async function notifyLeaveRequest(leaveData, instructorEmails) {
  const payload = {
    action:       'LEAVE_REQUEST',
    studentName:  leaveData.studentName,
    studentId:    leaveData.studentId,
    studentEmail: leaveData.studentEmail || '',
    studentPhone: leaveData.studentPhone || '',
    company:      leaveData.company || '',
    platoon:      leaveData.platoon || '',
    school:       leaveData.school || '',
    leaveType:    leaveTypeName(leaveData.type),
    startDate:    formatDateThai(leaveData.startDate),
    endDate:      formatDateThai(leaveData.endDate),
    days:         daysBetween(leaveData.startDate, leaveData.endDate),
    reason:       leaveData.reason,
    evidenceUrl:  leaveData.evidenceUrl || '',
    leaveId:      leaveData.id,
    approvalUrl:  `${window.location.origin}/leave-approval.html?id=${leaveData.id}`,
    recipients:   instructorEmails,
  };
  return callGAS(payload);
}

// ─── Send Approval Result to Student ────────────────────────
async function notifyLeaveResult(leaveData, approved, note = '') {
  const payload = {
    action:       approved ? 'LEAVE_APPROVED' : 'LEAVE_REJECTED',
    studentName:  leaveData.studentName,
    studentId:    leaveData.studentId,
    studentEmail: leaveData.studentEmail || '',
    leaveType:    leaveTypeName(leaveData.type),
    startDate:    formatDateThai(leaveData.startDate),
    endDate:      formatDateThai(leaveData.endDate),
    note,
    recipients:   [leaveData.studentEmail].filter(Boolean),
  };
  return callGAS(payload);
}

// ─── Send Daily Summary to School ────────────────────────────
async function sendDailySummaryToSchool(schoolData, summaryData, dateStr) {
  const payload = {
    action:       'DAILY_SUMMARY',
    schoolName:   schoolData.name,
    teacherName:  schoolData.teacherName,
    teacherEmail: schoolData.teacherEmail,
    date:         formatDateThai(dateStr),
    students:     summaryData.students,
    stats:        summaryData.stats,
    recipients:   [schoolData.teacherEmail],
  };
  return callGAS(payload);
}

// ─── Generic GAS Call ────────────────────────────────────────
async function callGAS(payload) {
  let url = (typeof GAS_URL !== 'undefined') ? GAS_URL : '';
  try {
    const savedUrl = localStorage.getItem('gas_web_app_url');
    if (savedUrl && savedUrl.trim()) url = savedUrl.trim();
  } catch(e) {}

  if (!url || url === 'YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL') {
    console.warn('GAS URL not configured. Email payload:', payload);
    return { skipped: true };
  }

  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      mode: 'no-cors', // GAS requires no-cors
    });
    return { success: true };
  } catch(e) {
    console.error('GAS error:', e);
    return { error: e.message };
  }
}

// ============================================================
// Google Apps Script Code (paste this in your GAS project)
// ============================================================
/*
function doPost(e) {
  const data = JSON.parse(e.postData.contents);
  
  if (data.action === 'LEAVE_REQUEST') {
    data.recipients.forEach(email => {
      if (!email) return;
      GmailApp.sendEmail(email,
        `[ใบลา] ${data.studentName} — ${data.leaveType}`,
        '',
        { htmlBody: buildLeaveRequestEmail(data) }
      );
    });
  }
  
  if (data.action === 'LEAVE_APPROVED' || data.action === 'LEAVE_REJECTED') {
    const status = data.action === 'LEAVE_APPROVED' ? 'อนุมัติ ✅' : 'ปฏิเสธ ❌';
    data.recipients.forEach(email => {
      if (!email) return;
      GmailApp.sendEmail(email,
        `[ผลใบลา] ${data.leaveType} — ${status}`,
        '',
        { htmlBody: buildLeaveResultEmail(data, status) }
      );
    });
  }
  
  if (data.action === 'DAILY_SUMMARY') {
    GmailApp.sendEmail(
      data.teacherEmail,
      `[รายงาน นศท.] ${data.schoolName} — ${data.date}`,
      '',
      { htmlBody: buildDailySummaryEmail(data) }
    );
  }
  
  return ContentService.createTextOutput(JSON.stringify({ok:true}))
    .setMimeType(ContentService.MimeType.JSON);
}

function buildLeaveRequestEmail(d) {
  return `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto">
      <div style="background:#f59e0b;color:#000;padding:24px;border-radius:8px 8px 0 0">
        <h2 style="margin:0">📋 ใบขอลา — ${d.leaveType}</h2>
      </div>
      <div style="background:#f8f8f8;padding:24px;border:1px solid #eee">
        <table style="width:100%;border-collapse:collapse">
          <tr><td style="padding:8px;color:#666">ชื่อ นศท.</td><td style="padding:8px;font-weight:bold">${d.studentName}</td></tr>
          <tr><td style="padding:8px;color:#666">รหัส</td><td style="padding:8px">${d.studentId}</td></tr>
          <tr><td style="padding:8px;color:#666">ประเภทลา</td><td style="padding:8px">${d.leaveType}</td></tr>
          <tr><td style="padding:8px;color:#666">ช่วงวันที่</td><td style="padding:8px">${d.startDate} – ${d.endDate} (${d.days} วัน)</td></tr>
          <tr><td style="padding:8px;color:#666">เหตุผล</td><td style="padding:8px">${d.reason}</td></tr>
        </table>
        ${d.evidenceUrl ? `<p><a href="${d.evidenceUrl}">📎 ดูหลักฐานแนบ</a></p>` : ''}
        <div style="margin-top:20px;text-align:center">
          <a href="${d.approvalUrl}" style="background:#10b981;color:#fff;padding:12px 32px;border-radius:6px;text-decoration:none;font-weight:bold">
            กดเพื่ออนุมัติ / ปฏิเสธ
          </a>
        </div>
      </div>
    </div>`;
}

function buildLeaveResultEmail(d, status) {
  return `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto">
      <div style="background:#0d1426;color:#f59e0b;padding:24px;border-radius:8px 8px 0 0">
        <h2 style="margin:0">ผลการพิจารณาใบลา — ${status}</h2>
      </div>
      <div style="padding:24px;background:#f8f8f8;border:1px solid #eee">
        <p>เรียน คุณ${d.studentName}</p>
        <p>ใบขอ${d.leaveType} ระหว่าง ${d.startDate} – ${d.endDate} ของคุณได้รับการพิจารณาแล้ว</p>
        <p><strong>ผล: ${status}</strong></p>
        ${d.note ? `<p>หมายเหตุ: ${d.note}</p>` : ''}
      </div>
    </div>`;
}

function buildDailySummaryEmail(d) {
  const rows = d.students.map(s =>
    `<tr><td>${s.studentId}</td><td>${s.name}</td><td>${s.status}</td></tr>`
  ).join('');
  return `
    <div style="font-family:sans-serif;max-width:700px;margin:0 auto">
      <div style="background:#f59e0b;color:#000;padding:20px;border-radius:8px 8px 0 0">
        <h2 style="margin:0">รายงานประจำวัน — ${d.schoolName}</h2>
        <p style="margin:4px 0 0">${d.date}</p>
      </div>
      <div style="padding:24px;background:#f8f8f8;border:1px solid #eee">
        <p>เรียน อาจารย์${d.teacherName}</p>
        <table style="width:100%;border-collapse:collapse;margin-top:16px">
          <thead><tr style="background:#e5e7eb">
            <th style="padding:10px;text-align:left">รหัส</th>
            <th style="padding:10px;text-align:left">ชื่อ</th>
            <th style="padding:10px;text-align:left">สถานะ</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <div style="margin-top:16px;padding:16px;background:#fff;border-radius:6px">
          <strong>สรุป:</strong>
          มา ${d.stats.present} | ขาด ${d.stats.absent} | สาย ${d.stats.late} | ลา ${d.stats.leave}
        </div>
      </div>
    </div>`;
}
*/
