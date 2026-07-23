// ============================================================
// drive-upload.js — Google Drive File Upload via GAS Proxy
// ============================================================

// ⚠️ ใช้ GAS เป็น proxy สำหรับ upload รูปเข้า Drive
// (ไม่ต้องเปิดเผย Service Account key ใน frontend)

const DRIVE_GAS_URL = 'YOUR_DRIVE_UPLOAD_GAS_URL';

// ─── Upload File via GAS Proxy ───────────────────────────────
async function uploadToDrive(file, folder = 'evidence') {
  if (!DRIVE_GAS_URL || DRIVE_GAS_URL === 'YOUR_DRIVE_UPLOAD_GAS_URL') {
    console.warn('Drive GAS URL not configured.');
    return { url: null, skipped: true };
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const base64 = reader.result.split(',')[1];
        const res = await fetch(DRIVE_GAS_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action:   'UPLOAD',
            filename: `${folder}_${Date.now()}_${file.name}`,
            mimeType: file.type,
            data:     base64,
            folder,
          }),
          mode: 'no-cors',
        });
        // Since no-cors, we can't read response.
        // The GAS should return the Drive file URL via a redirect or stored in Firestore.
        resolve({ success: true });
      } catch(e) {
        reject(e);
      }
    };
    reader.readAsDataURL(file);
  });
}

// ─── Upload Profile Photo ────────────────────────────────────
async function uploadProfilePhoto(file, uid) {
  const result = await uploadToDrive(file, `profile_${uid}`);
  return result;
}

// ─── Compress & Convert File to Base64 ─────────────────────────
function fileToBase64Compressed(file, maxWidth = 1024, quality = 0.8) {
  return new Promise((resolve) => {
    if (!file) return resolve('');
    if (!file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = e => resolve(e.target.result || '');
      reader.onerror = () => resolve('');
      reader.readAsDataURL(file);
      return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
      const img = new Image();
      img.onload = function() {
        let width = img.width;
        let height = img.height;
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(dataUrl);
      };
      img.onerror = function() {
        resolve(e.target.result || '');
      };
      img.src = e.target.result;
    };
    reader.onerror = function() { resolve(''); };
    reader.readAsDataURL(file);
  });
}

// ─── Upload Evidence (leave) ─────────────────────────────────
async function uploadLeaveEvidence(file, leaveId) {
  try {
    const result = await uploadToDrive(file, `leave_${leaveId}`);
    if (result && result.url) {
      return result;
    }
  } catch(e) {
    console.warn('Drive upload error, using local compressed data URL:', e);
  }
  // Fallback: convert file to compressed base64 data URL
  const dataUrl = await fileToBase64Compressed(file);
  return { url: dataUrl };
}

// ─── Preview File ────────────────────────────────────────────
function previewFile(file, imgEl) {
  if (!file || !imgEl) return;
  const reader = new FileReader();
  reader.onload = e => { imgEl.src = e.target.result; };
  reader.readAsDataURL(file);
}

// ─── Validate File ────────────────────────────────────────────
function validateImageFile(file, maxMB = 5) {
  const allowed = ['image/jpeg','image/png','image/webp','image/gif'];
  if (!allowed.includes(file.type)) {
    return { valid: false, msg: 'รองรับเฉพาะ JPG, PNG, WEBP, GIF' };
  }
  if (file.size > maxMB * 1024 * 1024) {
    return { valid: false, msg: `ไฟล์ต้องมีขนาดไม่เกิน ${maxMB} MB` };
  }
  return { valid: true };
}

// ============================================================
// Google Apps Script — Drive Upload (paste in GAS project)
// ============================================================
/*
function doPost(e) {
  const data = JSON.parse(e.postData.contents);
  
  if (data.action === 'UPLOAD') {
    const folderId = 'YOUR_DRIVE_FOLDER_ID';
    const folder   = DriveApp.getFolderById(folderId);
    const blob     = Utilities.newBlob(
      Utilities.base64Decode(data.data), data.mimeType, data.filename
    );
    const file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    const url = `https://drive.google.com/uc?id=${file.getId()}`;
    
    return ContentService.createTextOutput(JSON.stringify({ url }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
*/
