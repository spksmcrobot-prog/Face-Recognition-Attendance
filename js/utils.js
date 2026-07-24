// ============================================================
// utils.js — Helper Functions
// ============================================================

// ─── Date / Time ────────────────────────────────────────────
var THAI_MONTHS = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน',
                     'กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
var THAI_MONTHS_SHORT = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.',
                            'ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];

// Collections and Roles fallback in case firebase-config.js is cached or skipped
if (typeof window.COLLECTIONS === 'undefined' || !window.COLLECTIONS.USERS) {
  window.COLLECTIONS = {
    USERS: 'users',
    ATTENDANCE: 'attendance',
    MIDDAY: 'middayChecks',
    LEAVE: 'leaveRequests',
    SETTINGS: 'settings',
    SCHOOLS: 'schools',
    NOTIFICATIONS: 'notifications',
    MIDDAY_ROUNDS: 'middayRounds',
    ROUNDS: 'rounds'
  };
}
if (typeof window.ROLES === 'undefined') {
  window.ROLES = {
    STUDENT: 1, PLATOON: 2, COMPANY: 3, BATTALION: 4, INSTRUCTOR: 5, ADMIN: 6
  };
}
if (typeof window.ROLE_NAMES === 'undefined') {
  window.ROLE_NAMES = {
    1: 'นักศึกษาวิชาทหาร', 2: 'หัวหน้าหมวด', 3: 'กองร้อย', 4: 'กองพัน / ครู', 5: 'หัวหน้าชุดครูฝึก (ผู้อนุมัติใบลา)', 6: 'แอดมินระบบ (System Admin)'
  };
}
function dateToStr(d = new Date()) {
  // Returns YYYY-MM-DD
  return d.toISOString().split('T')[0];
}

function strToDate(s) {
  const [y,m,d] = s.split('-').map(Number);
  return new Date(y, m-1, d);
}

function formatDateThai(dateStr) {
  const d = strToDate(dateStr);
  return `${d.getDate()} ${THAI_MONTHS[d.getMonth()]} ${d.getFullYear() + 543}`;
}

function formatDateShort(dateStr) {
  const d = strToDate(dateStr);
  return `${d.getDate()} ${THAI_MONTHS_SHORT[d.getMonth()]} ${(d.getFullYear()+543).toString().slice(-2)}`;
}

function formatTime(ts) {
  if (!ts) return '--:--';
  const d = ts?.toDate ? ts.toDate() : (ts instanceof Date ? ts : new Date(ts));
  if (isNaN(d.getTime())) return '--:--';
  return d.toLocaleTimeString('th-TH', {hour:'2-digit', minute:'2-digit'});
}

function formatTimeSec(ts) {
  if (!ts) return '--:--:--';
  const d = ts?.toDate ? ts.toDate() : (ts instanceof Date ? ts : new Date(ts));
  if (isNaN(d.getTime())) return '--:--:--';
  return d.toLocaleTimeString('th-TH', {hour:'2-digit', minute:'2-digit', second:'2-digit'});
}

function formatDateTime(ts) {
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleString('th-TH', {
    day:'2-digit',month:'short',year:'numeric',
    hour:'2-digit',minute:'2-digit'
  });
}

function today() { return dateToStr(new Date()); }

function daysBetween(a, b) {
  const ms = Math.abs(strToDate(b) - strToDate(a));
  return Math.floor(ms / 86400000) + 1;
}

function getThaiDayName(dateStr) {
  const days = ['อาทิตย์','จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์','เสาร์'];
  return days[strToDate(dateStr).getDay()];
}

function standardizeBirthdate(str) {
  if (!str) return '';
  str = str.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(str)) {
    const [d, m, y] = str.split('/');
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return str;
}

function formatBirthdateDisplay(str) {
  if (!str) return '';
  str = str.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const [y, m, d] = str.split('-');
    return `${d}/${m}/${y}`;
  }
  return str;
}

// ─── Birthdate → Password ────────────────────────────────────
function birthdateToPassword(birthdate) {
  // birthdate = "YYYY-MM-DD" → password = "DDMMYYYY"
  const standardized = standardizeBirthdate(birthdate);
  const [y,m,d] = standardized.split('-');
  return `${d}${m}${y}`;
}

function birthdateToEmail(studentId) {
  return `${studentId.toLowerCase()}@nstda.system`;
}

// ─── Geolocation ────────────────────────────────────────────
function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation ไม่รองรับ'));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true, timeout: 10000, maximumAge: 0
    });
  });
}

function getDistanceMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = (lat2-lat1) * Math.PI/180;
  const dLng = (lng2-lng1) * Math.PI/180;
  const a = Math.sin(dLat/2)**2 +
            Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

async function checkLocationInGeofence() {
  try {
    const settingsDoc = await db.collection(COLLECTIONS.SETTINGS).doc('geofence').get();
    if (!settingsDoc.exists) return { valid: true, msg: 'ไม่ได้กำหนดพิกัด' };
    const { center, radius } = settingsDoc.data();

    const pos = await getCurrentPosition();
    const dist = getDistanceMeters(
      pos.coords.latitude, pos.coords.longitude,
      center.lat, center.lng
    );
    return {
      valid: dist <= radius,
      dist: Math.round(dist),
      msg: dist <= radius ? `อยู่ในพื้นที่ (ห่าง ${Math.round(dist)} ม.)` : `นอกพื้นที่ (ห่าง ${Math.round(dist)} ม.)`
    };
  } catch(e) {
    return { valid: false, msg: 'ไม่สามารถระบุตำแหน่งได้' };
  }
}

// ─── Toast Notifications ─────────────────────────────────────
// Leave and Round Status are defined in firebase-config.js

function showToast(msg, type = 'success', duration = 3000) {
  // ── Smart Icon Detection ────────────────────────────────────
  if (!type || type === 'info') {
    if (/(สำเร็จ|เรียบร้อย|อนุมัติ|ดึงพิกัด|บันทึก|เพิ่ม|ลบ|เข้าสู่ระบบ|เช็คชื่อ|เช็คเข้า|เช็คออก|ส่ง)/.test(msg)
        && !/(ไม่|ผิดพ|ล้มเหลว)/.test(msg)) {
      type = 'success';
    } else if (/(ไม่|ผิดพ|ล้มเหลว|ข้อผิดพ)/.test(msg)) {
      type = 'error';
    } else if (/(เตือน|ระวัง|กรุณา)/.test(msg)) {
      type = 'warning';
    } else {
      type = 'success';
    }
  }

  if (typeof window.Swal !== 'undefined') {
    return Swal.fire({
      position: 'center',
      icon: type || 'success',
      title: msg,
      showConfirmButton: false,
      timer: duration || 2200,
      timerProgressBar: true,
      showCloseButton: true,
      allowOutsideClick: true,
      customClass: {
        popup: 'swal2-center-unified-popup'
      }
    });
  }

  // ── Fallback: plain DOM toast ──────────────────────────────
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:999999;pointer-events:none;display:flex;flex-direction:column;gap:10px;align-items:center;';
    document.body.appendChild(container);
  }
  const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
  const toast = document.createElement('div');
  toast.className = 'toast show';
  toast.style.cssText = 'pointer-events:auto;background:rgba(255,255,255,0.98);color:#0f172a;border:1.5px solid rgba(21,154,97,0.3);box-shadow:0 20px 50px -10px rgba(0,0,0,0.18),0 0 25px rgba(21,154,97,0.15);border-radius:1.25rem;padding:0.9rem 1.4rem;font-weight:700;display:flex;align-items:center;gap:0.75rem;font-family:\'Prompt\',\'Kanit\',sans-serif;font-size:0.92rem;min-width:260px;max-width:420px;cursor:pointer;transition:all 0.25s ease;';
  toast.innerHTML = `<span class="toast-icon">${icons[type] || icons.success}</span><span class="toast-msg">${msg}</span>`;
  toast.onclick = () => toast.remove();
  container.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; toast.style.transform = 'scale(0.9)'; setTimeout(() => toast.remove(), 250); }, duration);
}

// ─── SweetAlert2 Helper Wrappers ─────────────────────────────
function showAlertPopup(title, text = '', icon = 'info') {
  if (typeof window.Swal !== 'undefined') {
    return Swal.fire({
      position: 'center',
      title: title,
      html: text,
      icon: icon,
      confirmButtonText: 'ตกลง',
      confirmButtonColor: '#10b981',
      showCloseButton: true,
      allowOutsideClick: true,
      allowEscapeKey: true,
      customClass: {
        popup: 'swal2-center-unified-popup'
      }
    });
  } else {
    alert(`${title}\n${text}`);
    return Promise.resolve();
  }
}

function showConfirmPopup(title, text = '', confirmText = 'ตกลง', cancelText = 'ยกเลิก', icon = 'question') {
  if (typeof window.Swal !== 'undefined') {
    return Swal.fire({
      position: 'center',
      title: title,
      html: text,
      icon: icon,
      showCancelButton: true,
      showCloseButton: true,
      confirmButtonText: confirmText,
      cancelButtonText: cancelText,
      confirmButtonColor: '#10b981',
      cancelButtonColor: '#64748b',
      reverseButtons: true,
      allowOutsideClick: true,
      allowEscapeKey: true,
      customClass: {
        popup: 'swal2-center-unified-popup'
      }
    }).then(result => result.isConfirmed);
  } else {
    return Promise.resolve(confirm(title + '\n' + text));
  }
}

// ─── Modal Helpers ───────────────────────────────────────────
function openModal(id) {
  const el = document.getElementById(id);
  if (el) {
    el.classList.remove('hidden');
    el.classList.add('open');
    if (!el.classList.contains('flex') && !el.classList.contains('grid') && !el.classList.contains('block')) {
      el.classList.add('flex');
    }
    el.classList.add('items-center', 'justify-center');
    document.body.style.overflow = 'hidden';
  }
}
function closeModal(id) {
  const el = document.getElementById(id);
  if (el) {
    el.classList.add('hidden');
    el.classList.remove('open', 'flex', 'grid');
    document.body.style.overflow = '';
  }
}

// Global click-outside listener to dismiss custom modals
document.addEventListener('click', function(e) {
  if (e.target && (e.target.classList.contains('modal-backdrop') || (e.target.classList.contains('modal') && e.target.classList.contains('open')))) {
    e.target.classList.remove('open');
    document.body.style.overflow = '';
  }
});

// ─── Loading ─────────────────────────────────────────────────
function showLoading(btnEl, text='กำลังโหลด...') {
  if (!btnEl) return;
  btnEl._origText = btnEl.innerHTML;
  btnEl.disabled = true;
  btnEl.innerHTML = `<span class="spinner spinner-sm"></span> ${text}`;
}
function hideLoading(btnEl) {
  if (!btnEl) return;
  btnEl.disabled = false;
  btnEl.innerHTML = btnEl._origText || btnEl.innerHTML;
}

// ─── Auth Guard ──────────────────────────────────────────────
function requireAuth(allowedRoles = []) {
  return new Promise((resolve, reject) => {
    auth.onAuthStateChanged(async user => {
      if (!user) {
        if (sessionStorage.getItem('is_switching_account') === 'true' || window._isSwitchingAccount) return;
        window.location.href='index.html';
        return;
      }
      const snap = await db.collection(COLLECTIONS.USERS).doc(user.uid).get();
      if (!snap.exists) {
        if (sessionStorage.getItem('is_switching_account') === 'true' || window._isSwitchingAccount) return;
        auth.signOut(); window.location.href='index.html'; return;
      }
      const data = snap.data();
      if (allowedRoles.length && !allowedRoles.includes(data.role)) {
        window.location.href='dashboard.html';
        return;
      }
      resolve({ uid: user.uid, ...data });
    });
  });
}

// ─── Role Redirect ───────────────────────────────────────────
function redirectByRole(role) {
  window.location.href = 'dashboard.html';
}

function toggleSidebar(forceOpen = null) {
  const sb = document.getElementById('sidebar');
  const ov = document.getElementById('sidebackdrop') || document.getElementById('sidebar-overlay');
  if (!sb || !ov) return;
  
  if (forceOpen === false) {
    sb.classList.remove('open');
    sb.classList.add('-translate-x-full');
    ov.classList.add('hidden');
  } else {
    const isOpen = sb.classList.contains('open') || !sb.classList.contains('-translate-x-full');
    if (isOpen) {
      sb.classList.remove('open');
      sb.classList.add('-translate-x-full');
      ov.classList.add('hidden');
    } else {
      sb.classList.add('open');
      sb.classList.remove('-translate-x-full');
      ov.classList.remove('hidden');
    }
  }
}

// ─── String / Misc ──────────────────────────────────────────
function initials(name) {
  return name?.split(' ').filter(Boolean).map(w=>w[0]).join('').slice(0,2).toUpperCase() || '??';
}

function statusBadge(status) {
  const map = {
    present:  ['badge-present','✓ มา'],
    absent:   ['badge-absent','✗ ขาด'],
    late:     ['badge-late','⏰ สาย'],
    leave:    ['badge-leave','📋 ลา'],
    pending:  ['badge-pending','⏳ รอ'],
    approved: ['badge-approved','✓ อนุมัติ'],
    rejected: ['badge-rejected','✗ ไม่อนุมัติ'],
    mission:  ['badge-mission','🎖 ภารกิจ'],
  };
  const [cls,label] = map[status] || ['badge-pending', status];
  return `<span class="badge ${cls}">${label}</span>`;
}

function leaveTypeName(t) {
  return t === 'sick' ? 'ลาป่วย' : 'ลากิจ';
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

// ─── Sidebar toggle (mobile) ─────────────────────────────────
function initSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebackdrop') || document.getElementById('sidebar-overlay');
  const menuBtn = document.getElementById('menu-btn');
  if (menuBtn) {
    menuBtn.addEventListener('click', () => toggleSidebar());
  }
  if (overlay) {
    overlay.addEventListener('click', () => toggleSidebar(false));
  }
}

// ─── Active nav highlight ────────────────────────────────────
function setActiveNav() {
  const page = window.location.pathname.split('/').pop() || 'dashboard.html';
  document.querySelectorAll('.nav-item').forEach(el => {
    const href = el.getAttribute('href') || '';
    if (href === page || (href !== '#' && page.includes(href))) {
      el.classList.add('bg-forest-50', 'text-forest-700', 'active');
    } else {
      el.classList.remove('bg-forest-50', 'text-forest-700', 'active');
    }
  });
}

// ─── File Validation ─────────────────────────────────────────
function validateImageFile(file, maxMB = 5) {
  if (!file) return { valid: false, msg: 'ไม่พบไฟล์' };
  const maxBytes = maxMB * 1024 * 1024;
  if (file.size > maxBytes) return { valid: false, msg: `ไฟล์ใหญ่เกิน ${maxMB}MB` };
  const allowed = ['image/jpeg','image/png','image/gif','image/webp'];
  if (!allowed.includes(file.type)) return { valid: false, msg: 'รองรับเฉพาะ JPG, PNG, GIF, WebP' };
  return { valid: true };
}

// ─── Image Preview ────────────────────────────────────────────
function previewFile(file, imgEl) {
  const reader = new FileReader();
  reader.onload = function(e) {
    imgEl.src = e.target.result;
    imgEl.style.display = '';
  };
  reader.readAsDataURL(file);
}
