// ============================================================
// Firebase Configuration — ระบบเช็คชื่อ นศท.
// Project: face-recognition-attenda-cc9b2
// ============================================================

const firebaseConfig = {
  apiKey:            "AIzaSyBKiZsFm_GmTRGjEEn9JmXkaLWTnGIrGtk",
  authDomain:        "face-recognition-attenda-cc9b2.firebaseapp.com",
  projectId:         "face-recognition-attenda-cc9b2",
  storageBucket:     "face-recognition-attenda-cc9b2.firebasestorage.app",
  messagingSenderId: "148036711444",
  appId:             "1:148036711444:web:b9577a6443b2f36dca2301",
  measurementId:     "G-WWZCB5RMTM"
};

// Initialize
firebase.initializeApp(firebaseConfig);

const db   = firebase.firestore();
const auth = firebase.auth();
db.settings({ ignoreUndefinedProperties: true, merge: true });
// ============================================================
// Collection Names
// ============================================================
var COLLECTIONS = {
  USERS:         'users',
  ATTENDANCE:    'attendance',
  MIDDAY:        'middayChecks',
  LEAVE:         'leaveRequests',
  SETTINGS:      'settings',
  SCHOOLS:       'schools',
  NOTIFICATIONS: 'notifications',
  MIDDAY_ROUNDS: 'middayRounds',
};

// ============================================================
// Role Definitions
// ============================================================
var ROLES = {
  STUDENT:     1,  // นศท.
  PLATOON:     2,  // หัวหน้าหมวด
  COMPANY:     3,  // ชั้นปี
  BATTALION:   4,  // กองพัน / ครู
  INSTRUCTOR:  5,  // หัวหน้าชุดครูฝึก
  ADMIN:       6,  // แอดมินระบบ
};

var ROLE_NAMES = {
  1: 'นักศึกษาวิชาทหาร',
  2: 'หัวหน้าหมวด',
  3: 'กองร้อย',
  4: 'กองพัน / ครู',
  5: 'หัวหน้าชุดครูฝึก (ผู้อนุมัติใบลา)',
  6: 'แอดมินระบบ (System Admin)',
};

// ============================================================
// Attendance Status
// ============================================================
var ATTENDANCE_STATUS = {
  PRESENT: 'present',
  ABSENT:  'absent',
  LATE:    'late',
  LEAVE:   'leave',
};

// ============================================================
// Leave Types
// ============================================================
var LEAVE_TYPES = {
  PERSONAL: 'personal',  // ลากิจ
  SICK:     'sick',      // ลาป่วย
};

var LEAVE_STATUS = {
  PENDING:  'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
};
