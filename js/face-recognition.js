// ============================================================
// face-recognition.js — face-api.js Integration (Optimized)
// ============================================================

var MODELS_PATH    = './models';
var faceApiLoaded  = false;

// ─── Pre-converted stored descriptor cache ───────────────────
var _cachedDescriptor = null;
var _cachedRaw        = null;

function getCachedDescriptor(storedDescriptor) {
  if (_cachedRaw !== storedDescriptor) {
    _cachedRaw        = storedDescriptor;
    _cachedDescriptor = storedDescriptor instanceof Float32Array
      ? storedDescriptor
      : new Float32Array(storedDescriptor);
  }
  return _cachedDescriptor;
}

// ─── TinyFaceDetector options (two tiers for speed) ──────────
var OPTS_FAST  = new faceapi.TinyFaceDetectorOptions({ inputSize: 128, scoreThreshold: 0.4 });
var OPTS_NORM  = new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.45 });

// ─── Load Models ─────────────────────────────────────────────
async function loadFaceModels(onProgress) {
  if (faceApiLoaded) return;
  onProgress?.('กำลังโหลด Face Detection Model...');
  await faceapi.nets.tinyFaceDetector.loadFromUri(MODELS_PATH);
  onProgress?.('กำลังโหลด Face Landmark Model...');
  await faceapi.nets.faceLandmark68Net.loadFromUri(MODELS_PATH);
  onProgress?.('กำลังโหลด Face Recognition Model...');
  await faceapi.nets.faceRecognitionNet.loadFromUri(MODELS_PATH);
  faceApiLoaded = true;
  onProgress?.('โหลด Model สำเร็จ ✓');
}

// ─── Start Camera ────────────────────────────────────────────
async function startCamera(videoEl) {
  var stream = await navigator.mediaDevices.getUserMedia({
    video: { width: 320, height: 240, facingMode: 'user' },
    audio: false,
  });
  videoEl.srcObject = stream;
  return new Promise(resolve => {
    videoEl.onloadedmetadata = () => { videoEl.play(); resolve(stream); };
  });
}

function stopCamera(videoEl) {
  var stream = videoEl?.srcObject;
  stream?.getTracks().forEach(t => t.stop());
  if (videoEl) videoEl.srcObject = null;
}

// ─── Detect Face & Get Descriptor (normal quality for verify) ─
async function detectFaceDescriptor(videoEl) {
  var result = await faceapi
    .detectSingleFace(videoEl, OPTS_NORM)
    .withFaceLandmarks()
    .withFaceDescriptor();
  return result || null;
}

// ─── Compare Descriptors ─────────────────────────────────────
function compareFaces(descriptor1, descriptor2, threshold = 0.5) {
  var d1 = descriptor1 instanceof Float32Array ? descriptor1 : new Float32Array(descriptor1);
  var d2 = getCachedDescriptor(descriptor2);
  var distance = faceapi.euclideanDistance(d1, d2);
  return { match: distance <= threshold, distance, confidence: Math.max(0, 1 - distance) };
}

// ─── Enroll Face (save descriptor to Firestore) ──────────────
async function enrollFace(videoEl, uid) {
  var result = await detectFaceDescriptor(videoEl);
  if (!result) throw new Error('ไม่พบใบหน้าในกล้อง กรุณาปรับตำแหน่งใบหน้า');
  var descriptor = Array.from(result.descriptor);
  await saveFaceDescriptor(uid, descriptor);
  return descriptor;
}

// ─── Verify Face (for check-in) ──────────────────────────────
async function verifyFace(videoEl, storedDescriptor) {
  if (!storedDescriptor) throw new Error('ยังไม่ได้ลงทะเบียนใบหน้า กรุณาติดต่อผู้ดูแลระบบ');

  var result = await detectFaceDescriptor(videoEl);
  if (!result) return { verified: false, confidence: 0, msg: 'ไม่พบใบหน้า กรุณาให้ใบหน้าอยู่ในกรอบ' };

  var { match, distance, confidence } = compareFaces(result.descriptor, storedDescriptor);
  return {
    verified:   match,
    confidence: Math.round(confidence * 100),
    distance:   distance.toFixed(3),
    msg: match
      ? `ยืนยันตัวตนสำเร็จ (${Math.round(confidence * 100)}%)`
      : `ยืนยันตัวตนไม่สำเร็จ (ความมั่นใจ ${Math.round(confidence * 100)}%)`,
  };
}

// ─── Draw Detection Box on Canvas (lightweight — no landmarks) ─
async function drawDetections(videoEl, canvasEl) {
  // ใช้ OPTS_FAST (inputSize=128) เพื่อ draw loop เร็ว
  var detections = await faceapi.detectAllFaces(videoEl, OPTS_FAST);
  var dims = faceapi.matchDimensions(canvasEl, videoEl, true);
  var resized = faceapi.resizeResults(detections, dims);

  var ctx = canvasEl.getContext('2d');
  ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);

  resized.forEach(d => {
    var { x, y, width, height } = d.box;
    ctx.strokeStyle = 'rgba(245,158,11,0.9)';
    ctx.lineWidth   = 2;
    ctx.strokeRect(x, y, width, height);
  });

  return detections.length;
}

// ─── Continuous Detection Loop ────────────────────────────────
var detectionLoop = null;
var _loopRunning  = false;

function startDetectionLoop(videoEl, canvasEl, onFaceCount) {
  stopDetectionLoop();
  _loopRunning = true;

  async function tick() {
    if (!_loopRunning) return;
    try {
      var count = await drawDetections(videoEl, canvasEl);
      onFaceCount?.(count);
    } catch (e) { /* ignore */ }
    if (_loopRunning) setTimeout(tick, 120); // ~8fps เร็วพอสำหรับ UI
  }

  tick();
}

function stopDetectionLoop() {
  _loopRunning = false;
  if (detectionLoop) { clearInterval(detectionLoop); detectionLoop = null; }
}





