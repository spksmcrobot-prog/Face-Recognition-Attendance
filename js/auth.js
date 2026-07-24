// ============================================================
// auth.js — Authentication & Session Management
// ============================================================

// ─── Login ──────────────────────────────────────────────────
async function login(studentId, birthdate) {
  const password = birthdateToPassword(birthdate);
  const rawId = (studentId || '').trim();
  const candidates = [];

  if (rawId) candidates.push(rawId);

  try {
    const userSnap = await db.collection(COLLECTIONS.USERS)
      .where('studentId', '==', rawId)
      .limit(1)
      .get();

    if (!userSnap.empty) {
      const userData = userSnap.docs[0].data();
      if (userData.nationalId) candidates.push(userData.nationalId);
      if (userData.email) candidates.push(userData.email.replace(/@nstda\.system$/i, ''));
    }
  } catch (e) {
    // continue with the direct login attempt if lookup fails
  }

  const uniqueEmails = [...new Set(candidates.map(id => birthdateToEmail(id)))];
  let lastError = null;

  for (const email of uniqueEmails) {
    try {
      const cred = await auth.signInWithEmailAndPassword(email, password);
      if (cred && cred.user) {
        const uSnap = await db.collection(COLLECTIONS.USERS).doc(cred.user.uid).get();
        if (uSnap.exists) {
          const uData = uSnap.data();
          if (uData.disabled === true || uData.status === 'disabled' || uData.status === 'suspended') {
            await auth.signOut();
            throw new Error('บัญชีผู้ใช้งานนี้ถูกระงับการใช้งาน กรุณาติดต่อแอดมินระบบ');
          }
        }
      }
      return cred;
    } catch (err) {
      lastError = err;
      if (err.message && err.message.includes('ถูกระงับการใช้งาน')) throw err;
      if (err.code !== 'auth/user-not-found' && err.code !== 'auth/wrong-password' && err.code !== 'auth/invalid-login-credentials') {
        throw err;
      }
    }
  }

  throw lastError || new Error('ข้อมูลเข้าสู่ระบบไม่ถูกต้อง');
}

// ─── Logout ─────────────────────────────────────────────────
async function logout() {
  try {
    sessionStorage.clear();
    if (typeof auth !== 'undefined' && auth.signOut) {
      await auth.signOut().catch(() => {});
    }
  } catch (e) {}
  window.location.href = 'index.html';
}

// ─── Get Current User Data ──────────────────────────────────
async function getCurrentUser() {
  return new Promise(resolve => {
    auth.onAuthStateChanged(async user => {
      if (!user) {
        localStorage.removeItem('cached_user_profile');
        resolve(null);
        return;
      }
      const snap = await db.collection(COLLECTIONS.USERS).doc(user.uid).get();
      if (!snap.exists) {
        localStorage.removeItem('cached_user_profile');
        resolve(null);
        return;
      }
      const uData = snap.data();
      if (uData.disabled === true || uData.status === 'disabled' || uData.status === 'suspended') {
        await auth.signOut();
        localStorage.removeItem('cached_user_profile');
        resolve(null);
        return;
      }
      const fullUser = { uid: user.uid, ...uData };
      window.currentUser = fullUser;
      try {
        localStorage.setItem('cached_user_profile', JSON.stringify(fullUser));
      } catch (e) {}
      resolve(fullUser);
    });
  });
}

// ─── Auth Guard ──────────────────────────────────────────────
async function guardPage(allowedRoles = []) {
  const user = await getCurrentUser();
  if (!user) { window.location.href = 'index.html'; return null; }
  if (allowedRoles.length && !allowedRoles.includes(user.role)) {
    window.location.href = 'dashboard.html';
    return null;
  }
  return user;
}

// ─── Create Account (Admin use) ──────────────────────────────
async function createStudentAccount(studentData) {
  const { studentId, birthdate, name, role, company, platoon,
          school, center, year, program, nationalId, contactEmail, phone } = studentData;

  const isStudent = !role || role === ROLES.STUDENT;
  const username  = isStudent ? (studentId || nationalId || '') : studentId;
  const email     = birthdateToEmail(username);
  const password = birthdateToPassword(birthdate);

  // Create Firebase Auth account
  const cred = await auth.createUserWithEmailAndPassword(email, password);
  const uid  = cred.user.uid;

  // Save profile to Firestore
  await db.collection(COLLECTIONS.USERS).doc(uid).set({
    studentId, name, role: role || ROLES.STUDENT,
    company: company || '', platoon: platoon || '',
    school: school || '', center: center || '',
    year: year || '', program: program || '',
    nationalId: nationalId || '', birthdate: birthdate || '',
    email: email,
    contactEmail: (contactEmail || studentData.email || '').trim(),
    phone: (phone || studentData.phone || '').trim(),
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });

  return uid;
}

// ─── Update Face Descriptor ──────────────────────────────────
async function saveFaceDescriptor(uid, descriptor) {
  await db.collection(COLLECTIONS.USERS).doc(uid).update({
    faceDescriptor: Array.from(descriptor),
    faceUpdatedAt: firebase.firestore.FieldValue.serverTimestamp(),
  });
}

// ─── Render User Info in Topbar ─────────────────────────────
function renderTopbarUser(user) {
  const el = document.getElementById('topbar-user');
  if (!el || !user) return;
  const name = user.name || user.studentId || 'ผู้ใช้งาน';
  const userRole = user.role || ROLES.STUDENT;
  const roleName = ROLE_NAMES[userRole] || 'นักศึกษาวิชาทหาร';

  el.innerHTML = `
    <div class="flex items-center gap-2 rounded-xl border border-emerald-950/5 bg-white py-1.5 pl-1.5 pr-2.5 cursor-pointer hover:bg-forest-50 transition" id="user-avatar" title="${escapeHtml(name)}">
      <div class="grid h-7 w-7 place-items-center rounded-lg bg-forest-100 text-[.62rem] font-black text-forest-700">
        ${initials(name)}
      </div>
      <span class="hidden text-xs font-bold text-forest-900 sm:block">${escapeHtml(name)}</span>
    </div>
    <div class="hidden shadow-2xl" id="user-menu" style="
      position:absolute;top:52px;right:0;min-width:210px;
      background:white;border:1px solid #e8f0eb;
      border-radius:1.15rem;padding:8px;z-index:999;box-shadow:0 12px 40px rgba(20,66,46,.12);color:#17382a;
    ">
      <div style="padding:12px 12px 10px;border-bottom:1px solid #e8f0eb;margin-bottom:6px;">
        <div class="font-bold text-sm text-forest-900">${escapeHtml(name)}</div>
        <div class="text-xs text-forest-600 font-semibold mt-0.5">${roleName}</div>
        <div class="text-[10px] text-slate-400 font-mono mt-0.5">${user.studentId || ''}</div>
      </div>
      <button onclick="document.getElementById('user-menu')?.classList.add('hidden'); openSwitchAccountModal();" class="flex items-center gap-2 px-3 py-2 text-xs font-bold text-slate-600 transition hover:bg-forest-50 hover:text-forest-700 rounded-xl w-full mb-1 text-left">
        <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 7a4 4 0 110-8 4 4 0 010 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" stroke-linecap="round" stroke-linejoin="round"/></svg>
        สลับบัญชี
      </button>
      <button onclick="logout()" class="flex items-center gap-2 px-3 py-2 text-xs font-bold text-rose-600 transition hover:bg-rose-50 rounded-xl w-full text-left border-t border-slate-100 pt-2 mt-1">
        <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M10 17l5-5-5-5M15 12H3M21 19V5a2 2 0 00-2-2h-6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        ออกจากระบบ
      </button>
    </div>
  `;
  document.getElementById('user-avatar')?.addEventListener('click', (e) => {
    e.stopPropagation();
    document.getElementById('user-menu')?.classList.toggle('hidden');
  });
  document.addEventListener('click', e => {
    if (el && !el.contains(e.target)) document.getElementById('user-menu')?.classList.add('hidden');
  });
}

// ─── Render Sidebar by Role ──────────────────────────────────
function renderSidebar(user) {
  const nav = document.getElementById('sidebar-nav');
  if (!nav || !user) return;
  const userRole = user.role || ROLES.STUDENT;

  const icons = {
    dashboard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="3" width="7" height="7" rx="1.5" stroke-width="2"/><rect x="14" y="3" width="7" height="7" rx="1.5" stroke-width="2"/><rect x="3" y="14" width="7" height="7" rx="1.5" stroke-width="2"/><rect x="14" y="14" width="7" height="7" rx="1.5" stroke-width="2"/></svg>',
    attendance:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    reports:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 20V10M12 20V4M6 20v-6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    leave:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    approval:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    team:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 7a4 4 0 110-8 4 4 0 010 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="3" stroke-width="2"/><path d="M19.4 15a1.7 1.7 0 00.34 1.88l.06.06-2.12 2.12-.06-.06a1.7 1.7 0 00-1.88-.34 1.7 1.7 0 00-1.04 1.56V20.3h-3v-.08A1.7 1.7 0 0010.66 18.66a1.7 1.7 0 00-1.88.34l-.06.06-2.12-2.12.06-.06A1.7 1.7 0 007 15a1.7 1.7 0 00-1.56-1.04H5.3v-3h.14A1.7 1.7 0 007 9.92a1.7 1.7 0 00-.34-1.88l-.06-.06 2.12-2.12.06.06a1.7 1.7 0 001.88.34A1.7 1.7 0 0011.7 4.7v-.08h3v.08a1.7 1.7 0 001.04 1.56 1.7 1.7 0 001.88-.34l.06-.06 2.12 2.12-.06.06a1.7 1.7 0 00-.34 1.88 1.7 1.7 0 001.56 1.04h.08v3h-.08A1.7 1.7 0 0019.4 15z" stroke-width="1.5" stroke-linejoin="round"/></svg>'
  };

  const allItems = [
    // นศท. (role=1) — หน้าหลักใหม่
    { roles:[1], href:'student.html',    icon: icons.dashboard, label:'หน้าหลัก' },
    { roles:[1], href:'leave-request.html',icon: icons.leave, label:'ขอลากิจ / ลาป่วย' },
    // Level 2+
    { roles:[2,3,4,5,6], href:'dashboard.html',      icon: icons.dashboard, label:'ศูนย์ควบคุม' },
    { roles:[2,3,4,5,6], href:'reports.html',        icon: icons.reports, label:'รายงานภาพรวม' },
    { roles:[5,6],       href:'leave-approval.html', icon: icons.approval, label:'อนุมัติใบลา', badge:'pending-count' },
    { roles:[2,3,4,5,6], href:'midday-check.html',   icon: icons.team, label:'ติดตามกำลังพล' },
    { roles:[3,4,5,6],   href:'admin.html',          icon: icons.settings, label:'จัดการข้อมูลระบบ' },
  ];

  nav.innerHTML = allItems
    .filter(item => item.roles.includes(userRole))
    .map(item => {
      const navId = 'nav-' + item.href.replace('.html','').replace('#','history');
      return `
        <a href="${item.href}" class="nav-item flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-500 transition hover:bg-forest-50 hover:text-forest-700" id="${navId}">
          <div class="h-5 w-5 opacity-70 [&>svg]:w-full [&>svg]:h-full">${item.icon}</div>
          <span>${item.label}</span>
          ${item.badge === 'pending-count' ? `<span class="ml-auto rounded-full bg-rose-500 px-2 py-0.5 text-[0.65rem] font-bold text-white hidden" id="pending-badge">0</span>` : ''}
        </a>
      `;
    }).join('');

  // Load pending leave count for level 5+
  if (userRole >= 5) {
    db.collection(COLLECTIONS.LEAVE)
      .where('status','==','pending')
      .get()
      .then(snap => {
        const badge = document.getElementById('pending-badge');
        if (badge && snap.size > 0) {
          badge.textContent = snap.size;
          badge.classList.remove('hidden');
        }
      });
  }

  setActiveNav();
}

function setActiveNav() {
  var path = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-item').forEach(function(item) {
    var href = item.getAttribute('href');
    if (href && href !== '#' && href.split('?')[0] === path) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });
}

// Instant pre-render sidebar & topbar from cached profile on DOM load
document.addEventListener('DOMContentLoaded', function() {
  try {
    var raw = localStorage.getItem('cached_user_profile');
    if (raw) {
      var user = JSON.parse(raw);
      renderSidebar(user);
      renderTopbarUser(user);
      var card = document.getElementById('sidebar-user-card');
      if (card) {
        var nameEl = document.getElementById('sidebar-name');
        var roleEl = document.getElementById('sidebar-role');
        var avEl   = document.getElementById('sidebar-avatar');
        if (nameEl) nameEl.textContent = user.name || user.studentId || '--';
        if (roleEl && typeof ROLE_NAMES !== 'undefined') roleEl.textContent = ROLE_NAMES[user.role] || '';
        if (avEl && typeof initials === 'function') avEl.textContent = initials(user.name || user.studentId || '?');
        card.classList.remove('hidden');
      }
    }
  } catch (e) {}
});

// ─── SPA Seamless Navigation Router (Zero-Flicker Page Swapper) ───────────────────
async function navigateSPA(url, pushHistory = true) {
  try {
    const targetPage = url.split('/').pop().split('?')[0] || 'index.html';
    const currentPath = (window.location.pathname.split('/').pop() || 'index.html').split('?')[0];

    if (targetPage.toLowerCase() === currentPath.toLowerCase() && !url.includes('#')) {
      return;
    }

    const mainEl = document.querySelector('main');
    if (mainEl) {
      mainEl.style.transition = 'opacity 0.1s ease';
      mainEl.style.opacity = '0.3';
    }

    const response = await fetch(url);
    if (!response.ok) {
      window.location.href = url;
      return;
    }

    const htmlText = await response.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlText, 'text/html');

    const newMain = doc.querySelector('main');
    if (!newMain || !mainEl) {
      window.location.href = url;
      return;
    }

    if (doc.title) document.title = doc.title;

    mainEl.innerHTML = newMain.innerHTML;
    mainEl.className = newMain.className;

    if (pushHistory) {
      history.pushState({ url }, '', url);
    }

    const cachedUser = window.currentUser || (function() {
      try { return JSON.parse(localStorage.getItem('cached_user_profile')); } catch(e) { return null; }
    })();

    if (typeof renderSidebar === 'function' && cachedUser) {
      renderSidebar(cachedUser);
    } else if (typeof setActiveNav === 'function') {
      setActiveNav();
    }

    const scripts = doc.querySelectorAll('script');
    scripts.forEach(s => {
      if (s.textContent && (
        s.textContent.includes('loadCommanderView') || 
        s.textContent.includes('loadCommanderData') || 
        s.textContent.includes('loadLeaves') || 
        s.textContent.includes('generateReport') || 
        s.textContent.includes('loadStaffList')
      )) {
        try {
          const fn = new Function(s.textContent);
          fn();
        } catch (err) {
          console.warn('SPA script eval warning:', err);
        }
      }
    });

    triggerPageInit(targetPage, cachedUser);

    window.scrollTo({ top: 0, behavior: 'instant' });
    setTimeout(() => {
      if (mainEl) mainEl.style.opacity = '1';
    }, 50);

  } catch (e) {
    console.error('SPA Navigation Error:', e);
    window.location.href = url;
  }
}

function triggerPageInit(pageName, user) {
  pageName = (pageName || '').toLowerCase();
  if (pageName === 'midday-check.html') {
    if (typeof loadCommanderView === 'function') loadCommanderView();
  } else if (pageName === 'dashboard.html') {
    if (typeof loadCommanderData === 'function' && user) loadCommanderData(user);
  } else if (pageName === 'leave-approval.html') {
    if (typeof loadLeaves === 'function') loadLeaves();
  } else if (pageName === 'reports.html') {
    if (typeof generateReport === 'function') generateReport();
  } else if (pageName === 'admin.html') {
    if (typeof loadStaffList === 'function') loadStaffList();
  } else if (pageName === 'student.html') {
    if (typeof loadStudentData === 'function' && user) loadStudentData(user);
  }
}

document.addEventListener('click', function(e) {
  var item = e.target.closest('.nav-item');
  if (item && item.href && item.href.includes('.html') && !item.href.includes('index.html')) {
    e.preventDefault();
    navigateSPA(item.href, true);
  }
});

window.addEventListener('popstate', function(e) {
  if (location.pathname.includes('.html') && !location.pathname.includes('index.html')) {
    navigateSPA(location.href, false);
  }
});

// ─── Local Account Management Helpers ─────────────────────────
const SAVED_ACCOUNTS_KEY = 'rd_saved_accounts';

function getSavedAccounts() {
  try {
    return JSON.parse(localStorage.getItem(SAVED_ACCOUNTS_KEY)) || [];
  } catch (e) {
    return [];
  }
}

function saveAccount(studentId, birthdate, name, role, uid) {
  if (!studentId) return;
  const accounts = getSavedAccounts();
  const index = accounts.findIndex(a => a.studentId === studentId);
  const accountData = { studentId, birthdate, name, role, uid, lastLogin: Date.now() };
  if (index >= 0) {
    accounts[index] = accountData;
  } else {
    accounts.push(accountData);
  }
  localStorage.setItem(SAVED_ACCOUNTS_KEY, JSON.stringify(accounts));
}

function removeAccount(studentId) {
  let accounts = getSavedAccounts();
  accounts = accounts.filter(a => a.studentId !== studentId);
  localStorage.setItem(SAVED_ACCOUNTS_KEY, JSON.stringify(accounts));
}

// ─── Account Switcher Modal & Handlers ─────────────────────────
function openSwitchAccountModal() {
  let modal = document.getElementById('switch-account-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'switch-account-modal';
    modal.className = 'modal-backdrop';
    modal.style.zIndex = '999999';
    
    modal.innerHTML = `
      <div class="modal-card !max-w-md flex flex-col p-0 overflow-hidden" style="max-width: 440px;">
        <!-- Header -->
        <div class="flex items-center justify-between border-b border-emerald-950/5 px-5 py-4 bg-slate-50 shrink-0">
          <div>
            <h3 class="font-extrabold text-forest-900 text-base">สลับบัญชีผู้ใช้</h3>
            <p class="text-xs text-slate-500 mt-0.5">เลือกบัญชี หรือเพิ่มบัญชีใหม่</p>
          </div>
          <button class="icon-btn !h-8 !w-8 bg-white shadow-sm border border-slate-200 flex items-center justify-center text-slate-500 hover:text-forest-900 font-bold" onclick="closeModal('switch-account-modal')">✕</button>
        </div>
        
        <!-- Saved Accounts List -->
        <div class="p-5 overflow-y-auto max-h-[40vh] space-y-3" id="switch-accounts-list">
          <!-- Dynamically populated -->
        </div>

        <!-- Divider / Add Account Button -->
        <div class="px-5 pb-4 shrink-0">
          <button onclick="toggleSwitchAddAccountForm()" class="w-full flex items-center justify-center gap-2 rounded-xl border border-emerald-100 bg-forest-50 py-2.5 text-xs font-extrabold text-forest-700 hover:bg-forest-100 transition">
            <span>+</span> เพิ่มบัญชีใหม่
          </button>
        </div>

        <!-- Add Account Inline Form -->
        <div class="px-5 pb-5 border-t border-slate-50 bg-slate-50/50 hidden" id="switch-add-account-form-wrapper">
          <form id="switch-add-account-form" onsubmit="handleSwitchAddAccountSubmit(event)" class="pt-4 space-y-3">
            <h4 class="text-xs font-bold text-forest-900">เพิ่มบัญชีผู้ใช้งาน</h4>
            <div>
              <label class="mb-1 block text-[10px] font-bold text-slate-500 uppercase">เลขประจำตัว นศท. / รหัสเจ้าหน้าที่</label>
              <input type="text" id="switch-student-id" placeholder="ระบุรหัสผู้ใช้งาน" required class="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-forest-900 outline-none focus:border-forest-600 transition">
            </div>
            <div>
              <label class="mb-1 block text-[10px] font-bold text-slate-500 uppercase">รหัสผ่าน (วันเกิด วว/ดด/ปปปป)</label>
              <input type="text" id="switch-birthdate" placeholder="เช่น 15/01/2005" required class="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-forest-900 outline-none focus:border-forest-600 transition">
            </div>
            <button type="submit" id="switch-login-btn" class="w-full rounded-xl bg-forest-600 py-2.5 text-xs font-bold text-white hover:bg-forest-700 transition">
              เข้าสู่ระบบและบันทึกบัญชี
            </button>
          </form>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  // Populate Accounts
  renderSavedAccountsList();
  
  // Hide Add Account Form by default
  document.getElementById('switch-add-account-form-wrapper').classList.add('hidden');
  
  openModal('switch-account-modal');
}

function renderSavedAccountsList() {
  const container = document.getElementById('switch-accounts-list');
  if (!container) return;
  
  const accounts = getSavedAccounts();
  const currentUid = auth.currentUser ? auth.currentUser.uid : null;
  
  if (accounts.length === 0) {
    container.innerHTML = `<div class="text-center py-6 text-slate-400 text-xs font-medium">ยังไม่มีบัญชีที่บันทึกไว้</div>`;
    return;
  }
  
  let html = '';
  accounts.forEach(a => {
    const isCurrent = a.uid === currentUid;
    const roleName = ROLE_NAMES[a.role] || 'ผู้ใช้งาน';
    const safeStudentId = escapeHtml(a.studentId || '');
    
    html += `
      <div class="flex items-center justify-between p-3 rounded-xl border ${isCurrent ? 'border-forest-600 bg-forest-50/30' : 'border-slate-100 bg-white hover:border-forest-100'} transition gap-2">
        <div class="flex items-center gap-3 cursor-pointer min-w-0 flex-1" ${isCurrent ? '' : `onclick="switchAccountByStudentId('${safeStudentId}')"`}>
          <div class="grid h-8 w-8 shrink-0 place-items-center rounded-lg ${isCurrent ? 'bg-forest-600 text-white' : 'bg-slate-50 text-forest-700'} text-[10px] font-bold">
            ${initials(a.name || 'น ศ')}
          </div>
          <div class="min-w-0">
            <div class="flex items-center gap-1.5">
              <span class="text-xs font-bold text-forest-900 truncate">${escapeHtml(a.name || '-')}</span>
              ${isCurrent ? '<span class="rounded bg-forest-100 px-1.5 py-0.5 text-[8px] font-extrabold text-forest-700">ปัจจุบัน</span>' : ''}
            </div>
            <span class="text-[10px] text-slate-400 font-mono">${roleName} · ${safeStudentId}</span>
          </div>
        </div>
        <button onclick="deleteSavedAccount('${safeStudentId}')" class="h-7 w-7 rounded-lg border border-slate-100 bg-white flex items-center justify-center text-slate-400 hover:text-red-500 hover:border-red-100 transition shrink-0" title="ลบบัญชี">
          <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
      </div>
    `;
  });
  
  container.innerHTML = html;
}

function toggleSwitchAddAccountForm() {
  const form = document.getElementById('switch-add-account-form-wrapper');
  if (form) {
    form.classList.toggle('hidden');
  }
}

async function handleSwitchAddAccountSubmit(event) {
  event.preventDefault();
  const studentId = document.getElementById('switch-student-id').value.trim();
  const birthdate = document.getElementById('switch-birthdate').value.trim();
  const btn = document.getElementById('switch-login-btn');
  
  if (!studentId || !birthdate) return;
  
  showLoading(btn, 'กำลังตรวจสอบ...');
  
  try {
    sessionStorage.setItem('is_switching_account', 'true');
    window._isSwitchingAccount = true;

    const cred = await login(studentId, birthdate);
    const userSnap = await db.collection(COLLECTIONS.USERS).doc(cred.user.uid).get();
    let name = 'ผู้ใช้งาน';
    let role = 1;
    if (userSnap.exists) {
      const data = userSnap.data();
      name = data.name || name;
      role = data.role || role;
    }
    
    saveAccount(studentId, birthdate, name, role, cred.user.uid);
    closeModal('switch-account-modal');
    
    sessionStorage.removeItem('is_switching_account');
    window._isSwitchingAccount = false;

    if (typeof Swal !== 'undefined') {
      await Swal.fire({
        icon: 'success',
        title: 'เพิ่มบัญชีและเข้าสู่ระบบสำเร็จ',
        timer: 1200,
        showConfirmButton: false
      });
    }
    
    window.location.href = role === 1 ? 'student.html' : 'dashboard.html';
  } catch (err) {
    sessionStorage.removeItem('is_switching_account');
    window._isSwitchingAccount = false;
    console.error(err);
    showAlertPopup('เข้าสู่ระบบไม่สำเร็จ', err.message || 'รหัสผ่านหรือบัญชีไม่ถูกต้อง', 'error');
    hideLoading(btn);
  }
}

async function switchAccountByStudentId(studentId) {
  if (!studentId) return;
  const saved = getSavedAccounts().find(a => a.studentId === studentId);
  const birthdate = saved ? saved.birthdate : '';
  await switchAccount(studentId, birthdate);
}

async function switchAccount(studentId, birthdate) {
  if (!studentId) return;

  sessionStorage.setItem('is_switching_account', 'true');
  window._isSwitchingAccount = true;

  if (typeof Swal !== 'undefined') {
    Swal.fire({
      title: 'กำลังสลับบัญชี...',
      text: 'กรุณารอสักครู่',
      allowOutsideClick: false,
      didOpen: () => { Swal.showLoading(); }
    });
  }
  
  try {
    let cleanBirthdate = birthdate || '';
    if (!cleanBirthdate || cleanBirthdate === 'undefined') {
      const saved = getSavedAccounts().find(a => a.studentId === studentId);
      if (saved && saved.birthdate) cleanBirthdate = saved.birthdate;
    }

    const stdBirthdate = (typeof standardizeBirthdate === 'function') ? standardizeBirthdate(cleanBirthdate) : cleanBirthdate;

    const cred = await login(studentId, stdBirthdate);
    const userSnap = await db.collection(COLLECTIONS.USERS).doc(cred.user.uid).get();
    let name = 'ผู้ใช้งาน';
    let role = 1;
    if (userSnap.exists) {
      const data = userSnap.data();
      name = data.name || name;
      role = data.role || role;
    }
    
    saveAccount(studentId, stdBirthdate, name, role, cred.user.uid);
    sessionStorage.removeItem('is_switching_account');
    window._isSwitchingAccount = false;
    
    window.location.href = role === 1 ? 'student.html' : 'dashboard.html';
  } catch (err) {
    sessionStorage.removeItem('is_switching_account');
    window._isSwitchingAccount = false;
    console.error('Account switch error:', err);
    showAlertPopup('สลับบัญชีไม่สำเร็จ', err.message || 'รหัสผ่านหรือข้อมูลบัญชีไม่ถูกต้อง', 'error');
  }
}

function deleteSavedAccount(studentId) {
  removeAccount(studentId);
  renderSavedAccountsList();
}
