// ============================================================
// Code.gs — Google Apps Script for Face Recognition Attendance System
// ระบบแจ้งเตือนทางอีเมลอัตโนมัติ (ใบลา & รายงานประจำวันประจำโรงเรียน)
// ============================================================
//
// 📌 คำแนะนำการติดตั้ง:
// 1. ไปที่ https://script.google.com
// 2. สร้างโครงการใหม่ (New Project) แล้ววางโค้ดทั้งหมดนี้ลงในไฟล์ Code.gs
// 3. กดเมนู "นำออกไปใช้งาน" (Deploy) -> "การทำให้ใช้งานได้อย่างตั้งต้นใหม่" (New deployment)
// 4. เลือกประเภท: Web App (เว็บแอป)
//    - Execute as: Me (บัญชีของคุณ)
//    - Who has access: Anyone (ทุกคน)
// 5. กด "Deploy" อนุญาตสิทธิ์ GmailApp แล้วคัดลอก Web App URL ไปวางในหน้า Admin (แท็บระบบ) ในระบบเช็คชื่อ
// ============================================================

function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({
    status: 'ok',
    message: 'ระบบส่งอีเมลแจ้งเตือน รด. Check พร้อมใช้งาน'
  })).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return ContentService.createTextOutput(JSON.stringify({ error: 'No payload received' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    const data = JSON.parse(e.postData.contents);
    const action = data.action;

    // 1. แจ้งเตือนเมื่อนักเรียนขอลา (ส่งถึงหัวหน้าชุดครูฝึก / ผู้อนุมัติ)
    if (action === 'LEAVE_REQUEST') {
      const recipients = data.recipients || [];
      const subject = `[ใบขอลา] ${data.studentName} — ${data.leaveType}`;
      const htmlBody = buildLeaveRequestEmail(data);

      recipients.forEach(function(email) {
        if (email && email.includes('@') && !email.endsWith('@nstda.system')) {
          try {
            GmailApp.sendEmail(email, subject, '', { htmlBody: htmlBody });
          } catch(err) {
            Logger.log('Error sending to ' + email + ': ' + err.toString());
          }
        }
      });
      return responseJSON({ success: true, message: 'ส่งแจ้งเตือนใบขอลาเรียบร้อย' });
    }

    // 2. แจ้งผลการอนุมัติ / ปฏิเสธใบลา (ส่งกลับหา นศท.)
    if (action === 'LEAVE_APPROVED' || action === 'LEAVE_REJECTED') {
      const isApproved = action === 'LEAVE_APPROVED';
      const statusText = isApproved ? 'อนุมัติแล้ว ✅' : 'ปฏิเสธ ❌';
      const recipients = data.recipients || [data.studentEmail];
      const subject = `[ผลการพิจารณาใบลา] ${data.leaveType} — ${statusText}`;
      const htmlBody = buildLeaveResultEmail(data, isApproved);

      recipients.forEach(function(email) {
        if (email && email.includes('@') && !email.endsWith('@nstda.system')) {
          try {
            GmailApp.sendEmail(email, subject, '', { htmlBody: htmlBody });
          } catch(err) {
            Logger.log('Error sending to student ' + email + ': ' + err.toString());
          }
        }
      });
      return responseJSON({ success: true, message: 'ส่งแจ้งผลใบลาถึงนักเรียนเรียบร้อย' });
    }

    // 3. ส่งรายงานสรุปประจำวันของโรงเรียน
    if (action === 'DAILY_SUMMARY') {
      const teacherEmail = data.teacherEmail || (data.recipients && data.recipients[0]);
      if (!teacherEmail || !teacherEmail.includes('@')) {
        return responseJSON({ error: 'ไม่พบอีเมลครูผู้ประสานงานโรงเรียน' });
      }

      const subject = `[รายงานการเข้าเรียน นศท.] ${data.schoolName} — ${data.date}`;
      const htmlBody = buildDailySummaryEmail(data);

      GmailApp.sendEmail(teacherEmail, subject, '', { htmlBody: htmlBody });
      return responseJSON({ success: true, message: 'ส่งรายงานสรุปเข้าอีเมลโรงเรียนเรียบร้อย' });
    }

    return responseJSON({ error: 'Unknown action: ' + action });

  } catch(err) {
    return responseJSON({ error: err.toString() });
  }
}

function responseJSON(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ─── 📧 HTML TEMPLATES ──────────────────────────────────────

// 1. เทมเพลตอีเมลแจ้งเตือนครูฝึก (ขอลา)
function buildLeaveRequestEmail(d) {
  const primaryColor = '#159a61';
  const bgColor = '#f6faf8';
  return `
    <div style="font-family: 'Sarabun', Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: ${bgColor}; padding: 20px; border-radius: 16px;">
      <div style="background: linear-gradient(135deg, #159a61, #0e7e4f); color: #ffffff; padding: 24px; border-radius: 12px 12px 0 0; text-align: center;">
        <h2 style="margin: 0; font-size: 22px; font-weight: 800;">📋 แจ้งเตือนใบขอลา — ${d.leaveType}</h2>
        <p style="margin: 6px 0 0; opacity: 0.9; font-size: 14px;">ระบบเช็คชื่อ นศท. ศูนย์ฝึกย่อยโรงเรียนสมเด็จพิทยาคม</p>
      </div>

      <div style="background-color: #ffffff; padding: 24px; border-radius: 0 0 12px 12px; border: 1px solid #e2e8f0; border-top: none;">
        <p style="font-size: 15px; color: #334155; margin-top: 0;">เรียน <strong>หัวหน้าชุดครูฝึก / ผู้อนุมัติใบลา</strong>,</p>
        <p style="font-size: 14px; color: #475569; margin-bottom: 20px;">มีนักศึกษาวิชาทหารส่งคำร้องขอลาใหม่ โดยมีรายละเอียดดังนี้:</p>

        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 14px;">
          <tr style="border-bottom: 1px solid #f1f5f9;">
            <td style="padding: 10px 0; color: #64748b; width: 35%;">ชื่อ–นามสกุล นศท.</td>
            <td style="padding: 10px 0; font-weight: bold; color: #0f172a;">${d.studentName}</td>
          </tr>
          <tr style="border-bottom: 1px solid #f1f5f9;">
            <td style="padding: 10px 0; color: #64748b;">รหัสนักศึกษา</td>
            <td style="padding: 10px 0; font-weight: bold; color: #0f172a;">${d.studentId}</td>
          </tr>
          <tr style="border-bottom: 1px solid #f1f5f9;">
            <td style="padding: 10px 0; color: #64748b;">ชั้นปี / หมวด</td>
            <td style="padding: 10px 0; color: #0f172a;">ปี ${d.company || '-'} / หมวด ${d.platoon || '-'}</td>
          </tr>
          <tr style="border-bottom: 1px solid #f1f5f9;">
            <td style="padding: 10px 0; color: #64748b;">สถานศึกษา</td>
            <td style="padding: 10px 0; color: #0f172a;">${d.school || '-'}</td>
          </tr>
          <tr style="border-bottom: 1px solid #f1f5f9;">
            <td style="padding: 10px 0; color: #64748b;">ประเภทการลา</td>
            <td style="padding: 10px 0; font-weight: bold; color: #d97706;">${d.leaveType}</td>
          </tr>
          <tr style="border-bottom: 1px solid #f1f5f9;">
            <td style="padding: 10px 0; color: #64748b;">ช่วงวันที่ลา</td>
            <td style="padding: 10px 0; font-weight: bold; color: #0f172a;">${d.startDate} ถึง ${d.endDate} (${d.days} วัน)</td>
          </tr>
          <tr style="border-bottom: 1px solid #f1f5f9;">
            <td style="padding: 10px 0; color: #64748b;">อีเมลติดต่อ นศท.</td>
            <td style="padding: 10px 0; color: #2563eb;">${d.studentEmail || '-'}</td>
          </tr>
          <tr style="border-bottom: 1px solid #f1f5f9;">
            <td style="padding: 10px 0; color: #64748b;">เบอร์โทรศัพท์</td>
            <td style="padding: 10px 0; color: #0f172a;">${d.studentPhone || '-'}</td>
          </tr>
          <tr>
            <td style="padding: 10px 0; color: #64748b; vertical-align: top;">เหตุผลการลา</td>
            <td style="padding: 10px 0; color: #334155; line-height: 1.5;">${d.reason}</td>
          </tr>
        </table>

        ${d.evidenceUrl ? `
          <div style="margin-bottom: 24px; padding: 12px; background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; text-align: center;">
            <a href="${d.evidenceUrl}" target="_blank" style="color: #166534; font-weight: bold; text-decoration: none; font-size: 14px;">📎 คลิกที่นี่เพื่อเปิดดูหลักฐานแนบ</a>
          </div>
        ` : ''}

        <div style="text-align: center; margin-top: 24px;">
          <a href="${d.approvalUrl}" style="background-color: ${primaryColor}; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 10px; font-weight: bold; font-size: 15px; display: inline-block; box-shadow: 0 4px 12px rgba(21,154,97,0.3);">
            เข้าสู่ระบบเพื่ออนุมัติ / ปฏิเสธใบลา
          </a>
        </div>
      </div>
      <p style="text-align: center; font-size: 12px; color: #94a3b8; margin-top: 16px;">อีเมลฉบับนี้ส่งโดยระบบเช็คชื่ออัตโนมัติ กรุณาอย่าตอบกลับอีเมลนี้</p>
    </div>
  `;
}

// 2. เทมเพลตอีเมลแจ้งผลการอนุมัติส่งให้นักเรียน
function buildLeaveResultEmail(d, isApproved) {
  const headerBg = isApproved ? 'linear-gradient(135deg, #10b981, #047857)' : 'linear-gradient(135deg, #ef4444, #b91c1c)';
  const statusBadge = isApproved 
    ? '<span style="background-color: #d1fae5; color: #065f46; padding: 6px 16px; border-radius: 20px; font-weight: bold; font-size: 14px;">✅ อนุมัติแล้ว</span>'
    : '<span style="background-color: #fee2e2; color: #991b1b; padding: 6px 16px; border-radius: 20px; font-weight: bold; font-size: 14px;">❌ ไม่ผ่านการอนุมัติ / ปฏิเสธ</span>';

  return `
    <div style="font-family: 'Sarabun', Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #f8fafc; padding: 20px; border-radius: 16px;">
      <div style="background: ${headerBg}; color: #ffffff; padding: 24px; border-radius: 12px 12px 0 0; text-align: center;">
        <h2 style="margin: 0; font-size: 20px; font-weight: 800;">ผลการพิจารณาใบขอลา</h2>
        <p style="margin: 4px 0 0; opacity: 0.9; font-size: 13px;">ระบบเช็คชื่อ นศท. ศูนย์ฝึกย่อยโรงเรียนสมเด็จพิทยาคม</p>
      </div>

      <div style="background-color: #ffffff; padding: 24px; border-radius: 0 0 12px 12px; border: 1px solid #e2e8f0; border-top: none;">
        <p style="font-size: 15px; color: #334155; margin-top: 0;">เรียน คุณ <strong>${d.studentName}</strong> (รหัส ${d.studentId}),</p>
        <p style="font-size: 14px; color: #475569;">คำร้องขอ ${d.leaveType} ของคุณได้รับการพิจารณาจากผู้บังคับบัญชาเรียบร้อยแล้ว โดยมีรายละเอียดดังนี้:</p>

        <div style="text-align: center; margin: 20px 0; padding: 16px; background-color: #f1f5f9; border-radius: 10px;">
          <div style="font-size: 13px; color: #64748b; margin-bottom: 8px;">สถานะการพิจารณา</div>
          ${statusBadge}
        </div>

        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 14px;">
          <tr style="border-bottom: 1px solid #f1f5f9;">
            <td style="padding: 10px 0; color: #64748b; width: 35%;">ประเภทการลา</td>
            <td style="padding: 10px 0; font-weight: bold; color: #0f172a;">${d.leaveType}</td>
          </tr>
          <tr style="border-bottom: 1px solid #f1f5f9;">
            <td style="padding: 10px 0; color: #64748b;">ช่วงวันที่ขอลา</td>
            <td style="padding: 10px 0; color: #0f172a;">${d.startDate} ถึง ${d.endDate}</td>
          </tr>
          ${d.note ? `
          <tr>
            <td style="padding: 10px 0; color: #64748b; vertical-align: top;">หมายเหตุจากผู้อนุมัติ</td>
            <td style="padding: 10px 0; color: #dc2626; font-weight: bold;">${d.note}</td>
          </tr>` : ''}
        </table>

        <div style="background-color: #f0f9ff; border: 1px solid #bae6fd; padding: 12px; border-radius: 8px; font-size: 13px; color: #0369a1; text-align: center;">
          หากมีข้อสงสัยเพิ่มเติม สามารถติดต่อสอบถามครูฝึกหรือหัวหน้าชุดครูฝึกได้โดยตรง
        </div>
      </div>
      <p style="text-align: center; font-size: 12px; color: #94a3b8; margin-top: 16px;">ระบบเช็คชื่อ นศท. ศูนย์ฝึกย่อยโรงเรียนสมเด็จพิทยาคม</p>
    </div>
  `;
}

// 3. เทมเพลตอีเมลรายงานสรุปการเข้าเรียนประจำวันประจำโรงเรียน
function buildDailySummaryEmail(d) {
  const stats = d.stats || { present: 0, absent: 0, late: 0, leave: 0 };
  const students = d.students || [];

  const rowsHtml = students.map(function(s) {
    let badgeStyle = 'background-color: #f1f5f9; color: #475569;';
    if (s.status === 'มาเรียน' || s.status === 'present') badgeStyle = 'background-color: #d1fae5; color: #065f46;';
    else if (s.status === 'ขาดเรียน' || s.status === 'absent') badgeStyle = 'background-color: #fee2e2; color: #991b1b;';
    else if (s.status === 'มาสาย' || s.status === 'late') badgeStyle = 'background-color: #fef3c7; color: #92400e;';
    else if (s.status === 'ลา' || s.status === 'leave') badgeStyle = 'background-color: #e0f2fe; color: #075985;';

    return `
      <tr style="border-bottom: 1px solid #f1f5f9;">
        <td style="padding: 10px 12px; font-family: monospace; font-weight: bold; color: #1e293b;">${s.studentId}</td>
        <td style="padding: 10px 12px; font-weight: 500; color: #0f172a;">${s.name}</td>
        <td style="padding: 10px 12px; color: #475569; text-align: center;">ปี ${s.company || '-'} / หมวด ${s.platoon || '-'}</td>
        <td style="padding: 10px 12px; text-align: center;">
          <span style="padding: 4px 10px; border-radius: 12px; font-size: 12px; font-weight: bold; ${badgeStyle}">${s.status}</span>
        </td>
      </tr>
    `;
  }).join('');

  return `
    <div style="font-family: 'Sarabun', Arial, sans-serif; max-width: 680px; margin: 0 auto; background-color: #f8fafc; padding: 20px; border-radius: 16px;">
      <div style="background: linear-gradient(135deg, #159a61, #0f766e); color: #ffffff; padding: 24px; border-radius: 12px 12px 0 0;">
        <h2 style="margin: 0; font-size: 20px; font-weight: 800;">📊 รายงานการเช็คชื่อ นศท. ประจำวัน</h2>
        <p style="margin: 4px 0 0; opacity: 0.9; font-size: 14px;">โรงเรียน: <strong>${d.schoolName}</strong> | วันที่: ${d.date}</p>
      </div>

      <div style="background-color: #ffffff; padding: 24px; border-radius: 0 0 12px 12px; border: 1px solid #e2e8f0; border-top: none;">
        <p style="font-size: 14px; color: #334155; margin-top: 0;">เรียน <strong>อาจารย์ผู้รับผิดชอบ นศท. (${d.schoolName})</strong>,</p>
        <p style="font-size: 14px; color: #475569;">ศูนย์ฝึกย่อยโรงเรียนสมเด็จพิทยาคม ขอส่งสรุปยอดการเช็คชื่อเข้าร่วมการฝึกของนักศึกษาวิชาทหารในสังกัดของท่าน ประจำวันที่ ${d.date} ดังนี้:</p>

        <!-- Dynamic Summary Cards -->
        <div style="display: table; width: 100%; table-layout: fixed; margin: 20px 0; text-align: center;">
          <div style="display: table-cell; padding: 8px;">
            <div style="background-color: #ecfdf5; border: 1px solid #a7f3d0; padding: 12px; border-radius: 10px;">
              <div style="font-size: 20px; font-weight: bold; color: #047857;">${stats.present || 0}</div>
              <div style="font-size: 12px; color: #065f46; font-weight: bold;">มาเรียน</div>
            </div>
          </div>
          <div style="display: table-cell; padding: 8px;">
            <div style="background-color: #fef2f2; border: 1px solid #fecaca; padding: 12px; border-radius: 10px;">
              <div style="font-size: 20px; font-weight: bold; color: #b91c1c;">${stats.absent || 0}</div>
              <div style="font-size: 12px; color: #991b1b; font-weight: bold;">ขาดเรียน</div>
            </div>
          </div>
          <div style="display: table-cell; padding: 8px;">
            <div style="background-color: #fffbeb; border: 1px solid #fde68a; padding: 12px; border-radius: 10px;">
              <div style="font-size: 20px; font-weight: bold; color: #b45309;">${stats.late || 0}</div>
              <div style="font-size: 12px; color: #92400e; font-weight: bold;">มาสาย</div>
            </div>
          </div>
          <div style="display: table-cell; padding: 8px;">
            <div style="background-color: #f0f9ff; border: 1px solid #bae6fd; padding: 12px; border-radius: 10px;">
              <div style="font-size: 20px; font-weight: bold; color: #0369a1;">${stats.leave || 0}</div>
              <div style="font-size: 12px; color: #075985; font-weight: bold;">ลากิจ/ลาป่วย</div>
            </div>
          </div>
        </div>

        <h3 style="font-size: 15px; color: #1e293b; margin-top: 24px; margin-bottom: 12px;">รายชื่อและสถานะ นศท. ทุกราย:</h3>
        <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
          <thead>
            <tr style="background-color: #f8fafc; border-bottom: 2px solid #e2e8f0;">
              <th style="padding: 10px 12px; text-align: left; color: #475569;">รหัส นศท.</th>
              <th style="padding: 10px 12px; text-align: left; color: #475569;">ชื่อ–นามสกุล</th>
              <th style="padding: 10px 12px; text-align: center; color: #475569;">ปี / หมวด</th>
              <th style="padding: 10px 12px; text-align: center; color: #475569;">สถานะ</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      </div>

      <p style="text-align: center; font-size: 12px; color: #94a3b8; margin-top: 16px;">
        ระบบเช็คชื่ออัตโนมัติ ศูนย์ฝึกย่อยโรงเรียนสมเด็จพิทยาคม
      </p>
    </div>
  `;
}

// ─── ⏱️ (ไม่บังคับ) ฟังก์ชันตั้งเวลาส่งอัตโนมัติใน GAS ─────────────────────────────
// สามารถกดสร้าง Time-driven Trigger ให้รันฟังก์ชันนี้อัตโนมัติทุกวันเวลา 17:00 น. ได้
function autoSendDailySchoolReports() {
  Logger.log('Auto daily report trigger started');
  // ฟังก์ชันนี้พร้อมสำหรับต่อยอดขยายความสามารถผ่าน GAS Trigger
}
