// =========================================================
// ตั้งค่าลิงก์ Google Apps Script Web App (/exec) ของคุณที่นี่
// =========================================================
const GAS_API_URL = "https://script.google.com/macros/s/AKfycbw6WlYkNJ_SKNpfJkjzEeL6swrY0E31PTfPu6yyzHAPg7xfkkV5__JKrJvC2qFiZ6T8/exec";
// =========================================================

const AppState = {
  token: localStorage.getItem('tadika_token') || '',
  user: null,
  settings: {},
  classes: [],
  studentsCache: [],
  reportRecords: [],
  parsedExcelStudents: []
};

let html5QrCode = null;
let isScanning = false;
let lastScannedToken = "";
let scanCooldown = false;

// =========================================================
// 1. Core API Client (เชื่อมต่อ Code.gs ผ่าน POST text/plain)
// =========================================================
async function callApi(action, data = {}) {
  if (!GAS_API_URL || GAS_API_URL.includes("วางลิงก์")) {
    Swal.fire('ยังไม่ได้ตั้งค่าลิงก์ API', 'กรุณาเปิดไฟล์ app.js แล้ววางลิงก์ /exec ที่บรรทัด GAS_API_URL', 'error');
    throw new Error('GAS_API_URL is not configured');
  }

  const response = await fetch(GAS_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: action, token: AppState.token, data: data })
  });

  const res = await response.json();

  if (res.unauthorized) {
    forceLogout('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่อีกครั้ง');
    throw new Error('Unauthorized');
  }
  return res;
}

function showToast(msg, icon = 'success') {
  Swal.mixin({
    toast: true, position: 'top-end', showConfirmButton: false, timer: 2500, timerProgressBar: true
  }).fire({ icon: icon, title: msg });
}

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[m]));
}

// =========================================================
// 2. Initialization & Authentication
// =========================================================
document.addEventListener('DOMContentLoaded', () => {
  // นาฬิกาเรียลไทม์บน Topbar
  setInterval(() => {
    const el = document.getElementById('live-clock');
    if (el) el.innerText = new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + ' น.';
  }, 1000);

  if (AppState.token) {
    bootstrapApp();
  } else {
    showLoginScreen();
  }
});

function showLoginScreen() {
  document.getElementById('app-screen').classList.add('hidden');
  document.getElementById('login-screen').classList.remove('hidden');
}

function forceLogout(message) {
  stopScanner();
  AppState.token = '';
  AppState.user = null;
  localStorage.removeItem('tadika_token');
  showLoginScreen();
  if (message) showToast(message, 'warning');
}

async function handleLoginSubmit(e) {
  e.preventDefault();
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;
  const btn = document.getElementById('btn-login');

  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> กำลังตรวจสอบ...';

  try {
    const res = await callApi('login', { username, password });
    if (res.success) {
      AppState.token = res.token;
      AppState.user = res.user;
      localStorage.setItem('tadika_token', res.token);
      document.getElementById('login-password').value = '';
      await bootstrapApp();
    } else {
      Swal.fire('เข้าสู่ระบบไม่สำเร็จ', res.message || 'กรุณาตรวจสอบชื่อผู้ใช้และรหัสผ่าน', 'error');
    }
  } catch (err) {
    Swal.fire('เชื่อมต่อไม่ได้', 'กรุณาตรวจสอบลิงก์ /exec หรืออินเทอร์เน็ต', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-right-to-bracket text-islamicGold"></i> เข้าสู่ระบบ';
  }
}

async function handleLogout() {
  const confirm = await Swal.fire({
    title: 'ออกจากระบบ?', icon: 'question', showCancelButton: true,
    confirmButtonColor: '#064e3b', confirmButtonText: 'ออกจากระบบ', cancelButtonText: 'ยกเลิก'
  });
  if (!confirm.isConfirmed) return;
  try { await callApi('logout'); } catch (e) {}
  forceLogout('ออกจากระบบเรียบร้อยแล้ว');
}

async function bootstrapApp() {
  Swal.fire({ title: 'กำลังโหลดข้อมูลระบบ...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
  try {
    const res = await callApi('getInitialData');
    Swal.close();
    if (!res.success) {
      forceLogout(res.message);
      return;
    }

    AppState.settings = res.settings || {};
    AppState.classes = res.classes || [];
    AppState.user = res.user;

    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('app-screen').classList.remove('hidden');

    applyGlobalSettingsUI();
    applyRoleVisibility();

    // หากเป็น Attendance Staff ให้เข้าหน้าสแกนทันที นอกนั้นเข้า Dashboard
    if (AppState.user.role === 'Attendance Staff') {
      navigateTo('scanner');
    } else {
      navigateTo('dashboard');
    }
  } catch (err) {
    Swal.close();
    if (err.message !== 'Unauthorized') {
      Swal.fire('ผิดพลาด', 'ไม่สามารถโหลดข้อมูลเริ่มต้นได้', 'error');
      showLoginScreen();
    }
  }
}

function applyGlobalSettingsUI() {
  const centerName = AppState.settings['CENTER_NAME'] || 'ศูนย์การศึกษาอิสลามประจำมัสยิด (ตาดีกา)';
  document.getElementById('center-name-display').innerText = centerName;
  document.getElementById('dash-center-name').innerText = centerName;
  document.title = centerName + ' - Smart Attendance';

  if (AppState.user) {
    document.getElementById('user-display-name').innerText = AppState.user.displayName || AppState.user.email;
    document.getElementById('user-role-badge').innerText = 'สิทธิ์: ' + AppState.user.role;
  }

  const sessionName = AppState.settings['SESSION_NAME'] || 'ช่วงเช้า';
  const lateAfter = AppState.settings['LATE_AFTER'] || '08:30';
  document.getElementById('scan-session-info').innerText = `รอบ: ${sessionName} (สายหลัง ${lateAfter} น.)`;

  populateAllClassDropdowns();
}

function applyRoleVisibility() {
  const role = AppState.user ? AppState.user.role : 'Attendance Staff';
  document.querySelectorAll('.role-admin-only').forEach(el => {
    el.classList.toggle('hidden', role !== 'Admin');
  });
  document.querySelectorAll('.role-admin-teacher').forEach(el => {
    el.classList.toggle('hidden', role !== 'Admin' && role !== 'Teacher');
  });
}

function populateAllClassDropdowns() {
  document.querySelectorAll('.dynamic-class-select').forEach(sel => {
    const includeAll = sel.getAttribute('data-include-all') === 'true';
    const currentVal = sel.value;
    sel.innerHTML = '';
    if (includeAll) sel.insertAdjacentHTML('beforeend', '<option value="All">-- ทุกชั้นเรียน --</option>');
    AppState.classes.forEach(c => {
      sel.insertAdjacentHTML('beforeend', `<option value="${escapeHtml(c.className)}">${escapeHtml(c.className)}</option>`);
    });
    if (currentVal) sel.value = currentVal;
  });
}

// =========================================================
// 3. Navigation
// =========================================================
function navigateTo(pageId) {
  document.querySelectorAll('.page-section').forEach(p => p.classList.add('hidden'));
  const target = document.getElementById('page-' + pageId);
  if (target) target.classList.remove('hidden');

  document.querySelectorAll('.nav-item').forEach(item => {
    if (item.getAttribute('data-target') === pageId) {
      item.classList.add('bg-emerald-800', 'text-white', 'border-l-4', 'border-islamicGold', 'font-semibold');
      item.classList.remove('text-emerald-100');
      document.getElementById('topbar-title').innerText = item.innerText.trim();
    } else {
      item.classList.remove('bg-emerald-800', 'text-white', 'border-l-4', 'border-islamicGold', 'font-semibold');
      item.classList.add('text-emerald-100');
    }
  });

  if (window.innerWidth < 768) {
    document.getElementById('sidebar').classList.add('hidden');
    document.getElementById('sidebar-overlay').classList.add('hidden');
  }

  if (pageId !== 'scanner') stopScanner();

  if (pageId === 'dashboard') loadDashboardData();
  if (pageId === 'students') loadStudentsData();
  if (pageId === 'qrcode') loadStudentsForQR();
  if (pageId === 'reports') initReportsPage();
  if (pageId === 'settings') loadSettingsPage();
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('hidden');
  document.getElementById('sidebar-overlay').classList.toggle('hidden');
}

// =========================================================
// 4. Dashboard & Finalize Attendance
// =========================================================
async function loadDashboardData() {
  const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  document.getElementById('dash-date-display').innerText = new Date().toLocaleDateString('th-TH', options);
  document.getElementById('class-summary-body').innerHTML = '<tr><td colspan="5" class="px-4 py-8 text-center text-gray-400"><i class="fa-solid fa-spinner fa-spin mr-2"></i>กำลังโหลด...</td></tr>';
  document.getElementById('recent-logs-body').innerHTML = '<tr><td colspan="4" class="px-4 py-8 text-center text-gray-400"><i class="fa-solid fa-spinner fa-spin mr-2"></i>กำลังโหลด...</td></tr>';

  try {
    const data = await callApi('getDashboardData');
    if (!data.success) return;

    document.getElementById('stat-total').innerText = data.total;
    document.getElementById('stat-present').innerText = data.present;
    document.getElementById('stat-late').innerText = data.late;
    document.getElementById('stat-leave').innerText = data.leave;
    document.getElementById('stat-absent').innerText = data.absent;
    document.getElementById('stat-unchecked').innerText = data.unchecked;
    document.getElementById('stat-percent').innerText = data.percent || 0;

    // สรุปรายชั้น
    const clsBody = document.getElementById('class-summary-body');
    clsBody.innerHTML = '';
    if (!data.classSummary || data.classSummary.length === 0) {
      clsBody.innerHTML = '<tr><td colspan="5" class="px-4 py-8 text-center text-gray-400">ยังไม่มีข้อมูลนักเรียน</td></tr>';
    } else {
      data.classSummary.forEach(c => {
        clsBody.insertAdjacentHTML('beforeend', `
          <tr class="hover:bg-emerald-50/40">
            <td class="px-4 py-2.5 font-semibold text-gray-800">${escapeHtml(c.className)}</td>
            <td class="px-3 py-2.5 text-center">${c.total}</td>
            <td class="px-3 py-2.5 text-center font-bold text-emerald-600">${c.present}</td>
            <td class="px-3 py-2.5 text-center font-bold text-amber-600">${c.late}</td>
            <td class="px-3 py-2.5 text-center font-bold text-red-500">${c.absent + c.leave}</td>
          </tr>
        `);
      });
    }

    // รายการล่าสุด
    const tbody = document.getElementById('recent-logs-body');
    tbody.innerHTML = '';
    if (!data.recent || data.recent.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" class="px-4 py-8 text-center text-gray-400">ยังไม่มีรายการเช็กชื่อในวันนี้</td></tr>';
    } else {
      data.recent.forEach(log => {
        let badge = 'text-emerald-700 bg-emerald-100';
        if (log.status === 'มาสาย') badge = 'text-amber-700 bg-amber-100';
        else if (log.status === 'ขาดเรียน') badge = 'text-red-700 bg-red-100';
        else if (log.status === 'ลา') badge = 'text-sky-700 bg-sky-100';

        tbody.insertAdjacentHTML('beforeend', `
          <tr class="hover:bg-gray-50">
            <td class="px-4 py-2.5 text-gray-500 whitespace-nowrap">${escapeHtml(log.time)}</td>
            <td class="px-4 py-2.5 font-medium text-gray-800">${escapeHtml(log.name)}</td>
            <td class="px-3 py-2.5 text-gray-600">${escapeHtml(log.class)}</td>
            <td class="px-3 py-2.5 text-center"><span class="px-2.5 py-0.5 rounded-full text-xs font-bold ${badge}">${escapeHtml(log.status)}</span></td>
          </tr>
        `);
      });
    }

    // รายชื่อผู้ขาดเรียนวันนี้
    const absentBox = document.getElementById('dash-absent-box');
    const absentListEl = document.getElementById('dash-absent-list');
    if (data.absentList && data.absentList.length > 0) {
      absentBox.classList.remove('hidden');
      document.getElementById('dash-absent-count').innerText = data.absentList.length + ' คน';
      absentListEl.innerHTML = data.absentList.map(a =>
        `<span class="bg-red-50 border border-red-200 text-red-800 px-3 py-1 rounded-full font-medium">${escapeHtml(a.name)} (${escapeHtml(a.className)})</span>`
      ).join('');
    } else {
      absentBox.classList.add('hidden');
    }
  } catch (err) {
    if (err.message !== 'Unauthorized') showToast('โหลดข้อมูลแดชบอร์ดไม่สำเร็จ', 'error');
  }
}

async function confirmFinalizeAttendance() {
  const result = await Swal.fire({
    title: 'ยืนยันปิดรอบเช็กชื่อ?',
    text: "ระบบจะบันทึกนักเรียนที่ยังไม่เช็กชื่อทั้งหมดของวันนี้เป็น 'ขาดเรียน' และส่งอีเมลแจ้งเตือนผู้ดูแล (หากตั้งค่าไว้)",
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#064e3b',
    confirmButtonText: 'ยืนยันปิดรอบ',
    cancelButtonText: 'ยกเลิก'
  });
  if (!result.isConfirmed) return;

  Swal.fire({ title: 'กำลังปิดรอบเช็กชื่อ...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
  try {
    const today = new Date().toLocaleDateString('en-CA');
    const sessionName = AppState.settings['SESSION_NAME'] || 'ช่วงเช้า';
    const res = await callApi('finalizeAttendance', { dateKey: today, sessionName: sessionName });
    Swal.fire(res.success ? 'สำเร็จ' : 'แจ้งเตือน', res.message, res.success ? 'success' : 'warning');
    if (res.success) loadDashboardData();
  } catch (err) {
    Swal.fire('ผิดพลาด', err.toString(), 'error');
  }
}

// =========================================================
// 5. QR Scanner (กล้องสดบน Vercel 100%)
// =========================================================
async function startScanner() {
  if (isScanning) return;
  document.getElementById('scan-result').classList.add('hidden');
  document.getElementById('btn-start-scan').classList.add('hidden');
  document.getElementById('btn-stop-scan').classList.remove('hidden');
  document.getElementById('camera-placeholder').style.display = 'none';

  html5QrCode = new Html5Qrcode("reader");
  const config = { fps: 10, qrbox: { width: 230, height: 230 }, aspectRatio: 1.0 };

  try {
    await html5QrCode.start({ facingMode: "environment" }, config, onScanSuccess, () => {});
    isScanning = true;
  } catch (err) {
    Swal.fire('ไม่สามารถเปิดกล้องได้', String(err), 'error');
    resetScannerUI();
  }
}

function stopScanner() {
  if (html5QrCode && isScanning) {
    html5QrCode.stop().then(() => {
      isScanning = false;
      html5QrCode.clear();
      resetScannerUI();
    }).catch(() => {
      isScanning = false;
      resetScannerUI();
    });
  }
}

function resetScannerUI() {
  const startBtn = document.getElementById('btn-start-scan');
  const stopBtn = document.getElementById('btn-stop-scan');
  const ph = document.getElementById('camera-placeholder');
  if (startBtn) startBtn.classList.remove('hidden');
  if (stopBtn) stopBtn.classList.add('hidden');
  if (ph) ph.style.display = 'block';
}

function onScanSuccess(decodedText) {
  if (scanCooldown || decodedText === lastScannedToken) return;
  lastScannedToken = decodedText;
  scanCooldown = true;
  processCheckIn(decodedText, null);
  setTimeout(() => { scanCooldown = false; lastScannedToken = ""; }, 3000);
}

function manualCheckIn() {
  const id = document.getElementById('manual-student-id').value.trim().toUpperCase();
  if (!id) { showToast('กรุณากรอกรหัสนักเรียน', 'warning'); return; }
  processCheckIn(null, id);
  document.getElementById('manual-student-id').value = '';
}

async function processCheckIn(qrToken, manualStudentId) {
  const resultDiv = document.getElementById('scan-result');
  const card = document.getElementById('result-card');
  resultDiv.classList.remove('hidden');
  card.className = 'p-5 rounded-2xl text-center border-2 border-gray-300 bg-gray-50';
  document.getElementById('result-icon').innerHTML = '<i class="fa-solid fa-spinner fa-spin text-emeraldDark"></i>';
  document.getElementById('result-name').innerText = 'กำลังบันทึกข้อมูล...';
  document.getElementById('result-class').innerText = '';
  document.getElementById('result-status').innerText = 'รอสักครู่';
  document.getElementById('result-status').className = 'px-5 py-1.5 rounded-full text-sm font-bold text-white bg-gray-400 inline-block';

  try {
    const sessionName = AppState.settings['SESSION_NAME'] || 'ช่วงเช้า';
    const res = await callApi('saveAttendance', { qrToken, sessionName, manualStudentId });
    if (res.success) {
      playSound('success');
      showScanResultUI(res.data.name, 'ชั้นเรียน: ' + res.data.class, res.data.status, true);
    } else {
      playSound('error');
      showScanResultUI(res.message, 'กรุณาตรวจสอบอีกครั้ง', 'ไม่สำเร็จ', false);
    }
  } catch (err) {
    playSound('error');
    showScanResultUI('เชื่อมต่อฐานข้อมูลไม่ได้', 'กรุณาตรวจสอบอินเทอร์เน็ต', 'ERROR', false);
  }
}

function showScanResultUI(name, subtext, status, isSuccess) {
  const card = document.getElementById('result-card');
  document.getElementById('result-name').innerText = name;
  document.getElementById('result-class').innerText = subtext;
  document.getElementById('result-status').innerText = status;

  if (isSuccess && status === 'มาเรียน') {
    card.className = 'p-5 rounded-2xl text-center border-2 border-emerald-500 bg-emerald-50';
    document.getElementById('result-icon').innerHTML = '<i class="fa-solid fa-check-circle text-emerald-600"></i>';
    document.getElementById('result-status').className = 'px-5 py-1.5 rounded-full text-sm font-bold text-white bg-emerald-600 inline-block';
  } else if (isSuccess && status === 'มาสาย') {
    card.className = 'p-5 rounded-2xl text-center border-2 border-amber-500 bg-amber-50';
    document.getElementById('result-icon').innerHTML = '<i class="fa-solid fa-clock text-amber-500"></i>';
    document.getElementById('result-status').className = 'px-5 py-1.5 rounded-full text-sm font-bold text-white bg-amber-500 inline-block';
  } else {
    card.className = 'p-5 rounded-2xl text-center border-2 border-red-500 bg-red-50';
    document.getElementById('result-icon').innerHTML = '<i class="fa-solid fa-times-circle text-red-500"></i>';
    document.getElementById('result-status').className = 'px-5 py-1.5 rounded-full text-sm font-bold text-white bg-red-500 inline-block';
  }
}

function playSound(type) {
  const audio = document.getElementById(type === 'success' ? 'sound-success' : 'sound-error');
  if (audio) { audio.currentTime = 0; audio.play().catch(() => {}); }
}

// =========================================================
// 6. Students Management & Excel Import
// =========================================================
async function loadStudentsData() {
  populateAllClassDropdowns();
  document.getElementById('students-table-body').innerHTML = '<tr><td colspan="5" class="px-4 py-8 text-center text-gray-400"><i class="fa-solid fa-spinner fa-spin mr-2"></i>กำลังโหลด...</td></tr>';
  try {
    const res = await callApi('getStudentsData');
    AppState.studentsCache = res.students || [];
    document.getElementById('student-count-badge').innerText = AppState.studentsCache.length;
    filterStudentsTable();
  } catch (err) {
    showToast('โหลดรายชื่อนักเรียนไม่สำเร็จ', 'error');
  }
}

function filterStudentsTable() {
  const q = (document.getElementById('student-search-input').value || '').toLowerCase().trim();
  const cls = document.getElementById('student-class-filter').value;
  const filtered = AppState.studentsCache.filter(s => {
    const matchClass = (cls === 'All' || !cls || s.className === cls);
    const text = `${s.id} ${s.prefix}${s.fname} ${s.lname} ${s.parent} ${s.phone}`.toLowerCase();
    return matchClass && text.includes(q);
  });

  const tbody = document.getElementById('students-table-body');
  tbody.innerHTML = '';
  const isAdmin = AppState.user && AppState.user.role === 'Admin';

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="px-4 py-8 text-center text-gray-400">ไม่พบข้อมูลนักเรียน</td></tr>';
    return;
  }

  filtered.forEach(std => {
    const jsonSafe = encodeURIComponent(JSON.stringify(std));
    const actionCol = isAdmin ? `
      <td class="px-4 py-3 text-center whitespace-nowrap space-x-1">
        <button onclick="openEditStudent('${jsonSafe}')" class="text-amber-600 hover:bg-amber-50 p-1.5 rounded-lg" title="แก้ไข"><i class="fa-solid fa-pen-to-square"></i></button>
        <button onclick="confirmDeactivateStudent('${escapeHtml(std.id)}', '${escapeHtml(std.fname)}')" class="text-red-500 hover:bg-red-50 p-1.5 rounded-lg" title="ปิดสถานะ"><i class="fa-solid fa-user-slash"></i></button>
      </td>` : '';

    tbody.insertAdjacentHTML('beforeend', `
      <tr class="hover:bg-emerald-50/40">
        <td class="px-4 py-3 font-bold text-emeraldDark whitespace-nowrap">${escapeHtml(std.id)}</td>
        <td class="px-4 py-3 font-medium text-gray-800">${escapeHtml(std.prefix + std.fname + ' ' + std.lname)}</td>
        <td class="px-4 py-3"><span class="bg-emerald-100 text-emeraldDark px-2.5 py-0.5 rounded-full text-xs font-semibold">${escapeHtml(std.className)}</span></td>
        <td class="px-4 py-3 text-gray-600 text-xs">${escapeHtml(std.parent || '-')}<div class="text-gray-400">${escapeHtml(std.phone || '')}</div></td>
        ${actionCol}
      </tr>
    `);
  });
}

function openStudentModal() {
  populateAllClassDropdowns();
  document.getElementById('sf-id').value = '';
  document.getElementById('student-form').reset();
  document.getElementById('student-modal-title').innerText = 'เพิ่มนักเรียนใหม่';
  document.getElementById('student-modal').classList.remove('hidden');
}

function openEditStudent(encoded) {
  populateAllClassDropdowns();
  const std = JSON.parse(decodeURIComponent(encoded));
  document.getElementById('sf-id').value = std.id;
  document.getElementById('sf-prefix').value = std.prefix;
  document.getElementById('sf-fname').value = std.fname;
  document.getElementById('sf-lname').value = std.lname;
  document.getElementById('sf-class').value = std.className;
  document.getElementById('sf-parent').value = std.parent;
  document.getElementById('sf-phone').value = std.phone;
  document.getElementById('student-modal-title').innerText = `แก้ไขข้อมูล (${std.id})`;
  document.getElementById('student-modal').classList.remove('hidden');
}

function closeStudentModal() {
  document.getElementById('student-modal').classList.add('hidden');
}

async function submitStudentForm(e) {
  e.preventDefault();
  const id = document.getElementById('sf-id').value;
  const prefix = document.getElementById('sf-prefix').value;
  const payload = {
    id, prefix,
    fname: document.getElementById('sf-fname').value.trim(),
    lname: document.getElementById('sf-lname').value.trim(),
    className: document.getElementById('sf-class').value,
    parent: document.getElementById('sf-parent').value.trim(),
    phone: document.getElementById('sf-phone').value.trim(),
    gender: (prefix === 'ด.ช.' || prefix === 'นาย') ? 'ชาย' : 'หญิง'
  };

  Swal.fire({ title: 'กำลังบันทึก...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
  try {
    const res = await callApi(id ? 'updateStudentData' : 'saveNewStudent', payload);
    Swal.fire(res.success ? 'สำเร็จ' : 'ผิดพลาด', res.message, res.success ? 'success' : 'error');
    if (res.success) { closeStudentModal(); loadStudentsData(); }
  } catch (err) {
    Swal.fire('ผิดพลาด', err.toString(), 'error');
  }
}

async function confirmDeactivateStudent(studentId, fname) {
  const r = await Swal.fire({
    title: 'ปิดสถานะนักเรียน?', text: `ต้องการปิดสถานะของ ${fname} (${studentId}) ใช่หรือไม่?`,
    icon: 'warning', showCancelButton: true, confirmButtonColor: '#dc2626', confirmButtonText: 'ยืนยัน', cancelButtonText: 'ยกเลิก'
  });
  if (!r.isConfirmed) return;
  Swal.fire({ title: 'กำลังดำเนินการ...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
  const res = await callApi('deactivateStudent', { studentId });
  Swal.fire(res.success ? 'สำเร็จ' : 'ผิดพลาด', res.message, res.success ? 'success' : 'error');
  if (res.success) loadStudentsData();
}

function downloadExcelTemplate() {
  const rows = [
    { "คำนำหน้า": "ด.ช.", "ชื่อ": "อับดุลเลาะห์", "นามสกุล": "มานะดี", "ชั้นเรียน": "ชั้นปีที่ 1", "ชื่อผู้ปกครอง": "นายอิสมาแอล มานะดี", "เบอร์โทร": "081-2345678" },
    { "คำนำหน้า": "ด.ญ.", "ชื่อ": "ฟาฏิมะห์", "นามสกุล": "ใจงาม", "ชั้นเรียน": "ชั้นปีที่ 1", "ชื่อผู้ปกครอง": "นางอาอีฉะห์ ใจงาม", "เบอร์โทร": "089-8765432" }
  ];
  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [{ wch: 10 }, { wch: 18 }, { wch: 18 }, { wch: 14 }, { wch: 24 }, { wch: 15 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Template_Students");
  XLSX.writeFile(wb, "Template_Import_Students_Tadika.xlsx");
  showToast('ดาวน์โหลดเทมเพลตเรียบร้อย');
}

function openImportModal() {
  populateAllClassDropdowns();
  AppState.parsedExcelStudents = [];
  document.getElementById('excel-file-input').value = '';
  document.getElementById('import-preview-box').classList.add('hidden');
  document.getElementById('btn-confirm-import').disabled = true;
  document.getElementById('import-modal').classList.remove('hidden');
}

function closeImportModal() {
  document.getElementById('import-modal').classList.add('hidden');
}

function toggleImportClassSelect() {
  const mode = document.getElementById('import-mode').value;
  document.getElementById('import-target-class-wrap').classList.toggle('hidden', mode !== 'SINGLE_CLASS');
}

function previewExcelFile(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = evt => {
    try {
      const wb = XLSX.read(new Uint8Array(evt.target.result), { type: 'array' });
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" });
      AppState.parsedExcelStudents = rows.map(r => ({
        prefix: (r["คำนำหน้า"] || r["Prefix"] || "ด.ช.").toString().trim(),
        fname: (r["ชื่อ"] || r["ชื่อจริง"] || r["FirstName"] || "").toString().trim(),
        lname: (r["นามสกุล"] || r["LastName"] || "").toString().trim(),
        className: (r["ชั้นเรียน"] || r["ชั้น"] || r["Class"] || "ชั้นปีที่ 1").toString().trim(),
        parent: (r["ชื่อผู้ปกครอง"] || r["ผู้ปกครอง"] || r["ParentName"] || "").toString().trim(),
        phone: (r["เบอร์โทร"] || r["เบอร์โทรศัพท์"] || r["ParentPhone"] || "").toString().trim()
      })).filter(s => s.fname !== "");

      if (AppState.parsedExcelStudents.length === 0) {
        Swal.fire('ไม่พบข้อมูล', 'กรุณาตรวจสอบหัวคอลัมน์ในไฟล์ Excel ให้ตรงกับเทมเพลต', 'warning');
        return;
      }
      document.getElementById('import-preview-box').classList.remove('hidden');
      document.getElementById('import-preview-count').innerText = `พร้อมนำเข้า ${AppState.parsedExcelStudents.length} คน (ตัวอย่าง 5 คนแรก):`;
      document.getElementById('import-preview-list').innerHTML = AppState.parsedExcelStudents.slice(0, 5)
        .map((s, i) => `<li>${i + 1}. ${escapeHtml(s.prefix + s.fname + ' ' + s.lname)} (${escapeHtml(s.className)})</li>`).join('');
      document.getElementById('btn-confirm-import').disabled = false;
    } catch (err) {
      Swal.fire('อ่านไฟล์ไม่สำเร็จ', err.toString(), 'error');
    }
  };
  reader.readAsArrayBuffer(file);
}

async function executeExcelImport() {
  if (AppState.parsedExcelStudents.length === 0) return;
  const mode = document.getElementById('import-mode').value;
  const forcedClass = document.getElementById('import-target-class').value;
  const students = AppState.parsedExcelStudents.map(s => ({
    ...s, className: (mode === 'SINGLE_CLASS' && forcedClass) ? forcedClass : s.className
  }));

  Swal.fire({ title: `กำลังนำเข้า ${students.length} คน...`, allowOutsideClick: false, didOpen: () => Swal.showLoading() });
  try {
    const res = await callApi('importStudentsBatch', { students });
    if (res.success) {
      if (res.classes) { AppState.classes = res.classes; populateAllClassDropdowns(); }
      Swal.fire('นำเข้าสำเร็จ!', res.message, 'success');
      closeImportModal();
      loadStudentsData();
    } else {
      Swal.fire('ผิดพลาด', res.message, 'error');
    }
  } catch (err) {
    Swal.fire('ผิดพลาด', err.toString(), 'error');
  }
}

// =========================================================
// 7. QR Code Cards Generator
// =========================================================
async function loadStudentsForQR() {
  populateAllClassDropdowns();
  document.getElementById('qr-print-area').innerHTML = '<div class="col-span-full text-center text-gray-400 py-12"><i class="fa-solid fa-spinner fa-spin mr-2"></i>กำลังสร้างบัตร...</div>';
  try {
    const res = await callApi('getStudentsData');
    AppState.studentsCache = res.students || [];
    renderFilteredQRCards();
  } catch (err) {
    showToast('โหลดข้อมูลไม่สำเร็จ', 'error');
  }
}

function renderFilteredQRCards() {
  const container = document.getElementById('qr-print-area');
  container.innerHTML = '';
  const selectedClass = document.getElementById('qr-class-filter').value;
  const list = AppState.studentsCache.filter(s => selectedClass === 'All' || !selectedClass || s.className === selectedClass);

  if (list.length === 0) {
    container.innerHTML = '<div class="col-span-full text-center text-gray-400 py-12">ไม่พบรายชื่อนักเรียน</div>';
    return;
  }

  const centerName = AppState.settings['CENTER_NAME'] || 'ศูนย์การศึกษาอิสลามประจำมัสยิด (ตาดีกา)';
  list.forEach(std => {
    container.insertAdjacentHTML('beforeend', `
      <div class="bg-white border-2 border-emeraldDark rounded-2xl overflow-hidden flex flex-col justify-between text-center w-[235px] mx-auto shadow-md print:shadow-none break-inside-avoid relative" style="height: 340px;">
        <div class="islamic-pattern text-white px-3 py-3 border-b-2 border-islamicGold">
          <div class="flex items-center justify-center gap-1.5 text-islamicGold text-xs font-bold mb-1">
            <i class="fa-solid fa-mosque"></i> <span>บัตรประจำตัวนักเรียน</span>
          </div>
          <p class="text-[11px] font-semibold leading-snug line-clamp-2 text-emerald-50">${escapeHtml(centerName)}</p>
        </div>
        <div class="flex-1 flex flex-col items-center justify-center p-2 bg-white">
          <div id="qr-box-${std.id}" class="p-2 border-2 border-islamicGold/50 rounded-xl bg-white"></div>
          <p class="text-[10px] text-gray-400 mt-1 tracking-wider">${escapeHtml(std.id)}</p>
        </div>
        <div class="bg-emerald-50 px-3 py-2.5 border-t border-emerald-200">
          <h4 class="font-bold text-emeraldDark text-sm truncate">${escapeHtml(std.prefix + std.fname + ' ' + std.lname)}</h4>
          <p class="text-xs font-semibold text-emerald-700 mt-0.5">${escapeHtml(std.className)}</p>
        </div>
        <button onclick="confirmRegenQR('${escapeHtml(std.id)}', '${escapeHtml(std.fname)}')" class="no-print absolute top-2 right-2 w-7 h-7 rounded-full bg-white/20 hover:bg-islamicGold text-white hover:text-emeraldDark text-xs flex items-center justify-center" title="ออกรหัส QR ใหม่">
          <i class="fa-solid fa-arrows-rotate"></i>
        </button>
      </div>
    `);

    setTimeout(() => {
      const el = document.getElementById(`qr-box-${std.id}`);
      if (el) {
        new QRCode(el, {
          text: std.token, width: 120, height: 120,
          colorDark: "#064e3b", colorLight: "#ffffff", correctLevel: QRCode.CorrectLevel.H
        });
      }
    }, 30);
  });
}

async function confirmRegenQR(studentId, fname) {
  const r = await Swal.fire({
    title: 'ออกบัตร QR ใหม่?', text: `บัตรเดิมของ ${fname} (${studentId}) จะใช้สแกนไม่ได้อีก ยืนยันหรือไม่?`,
    icon: 'warning', showCancelButton: true, confirmButtonColor: '#064e3b', confirmButtonText: 'ยืนยัน', cancelButtonText: 'ยกเลิก'
  });
  if (!r.isConfirmed) return;
  Swal.fire({ title: 'กำลังออกรหัสใหม่...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
  const res = await callApi('regenerateToken', { studentId });
  Swal.fire(res.success ? 'สำเร็จ' : 'ผิดพลาด', res.message, res.success ? 'success' : 'error');
  if (res.success) loadStudentsForQR();
}

function printQRCards() {
  document.querySelectorAll('.print-section-active').forEach(el => el.classList.remove('print-section-active'));
  document.getElementById('qr-print-area').classList.add('print-section-active');
  window.print();
}

// =========================================================
// 8. Reports & Edit Attendance Status
// =========================================================
function initReportsPage() {
  populateAllClassDropdowns();
  const today = new Date().toLocaleDateString('en-CA');
  if (!document.getElementById('rep-start-date').value) document.getElementById('rep-start-date').value = today;
  if (!document.getElementById('rep-end-date').value) document.getElementById('rep-end-date').value = today;
  fetchReportData();
}

async function fetchReportData() {
  const startDate = document.getElementById('rep-start-date').value;
  const endDate = document.getElementById('rep-end-date').value;
  const filterClass = document.getElementById('rep-class').value;

  document.getElementById('report-table-body').innerHTML = '<tr><td colspan="9" class="border px-4 py-8 text-center text-gray-400"><i class="fa-solid fa-spinner fa-spin mr-2"></i>กำลังดึงข้อมูล...</td></tr>';

  try {
    const res = await callApi('getReportData', { startDate, endDate, filterClass });
    if (!res.success) return;

    AppState.reportRecords = res.records || [];
    document.getElementById('rep-doc-center').innerText = res.centerName;
    document.getElementById('rep-doc-meta').innerText = `ตั้งแต่วันที่ ${startDate} ถึง ${endDate} | ชั้นเรียน: ${filterClass === 'All' ? 'ทุกชั้นเรียน' : filterClass}`;
    document.getElementById('rep-sign-chairman').innerText = res.chairmanName;
    document.getElementById('rep-sign-teacher').innerText = res.teacherName;

    document.getElementById('rep-sum-present').innerText = res.summary.present;
    document.getElementById('rep-sum-late').innerText = res.summary.late;
    document.getElementById('rep-sum-leave').innerText = res.summary.leave;
    document.getElementById('rep-sum-absent').innerText = res.summary.absent;

    const tbody = document.getElementById('report-table-body');
    tbody.innerHTML = '';

    if (AppState.reportRecords.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" class="border px-4 py-8 text-center text-gray-400">ไม่พบข้อมูลในช่วงเวลาที่เลือก</td></tr>';
      return;
    }

    AppState.reportRecords.forEach((r, idx) => {
      let color = 'text-emerald-700 font-bold';
      if (r.status === 'มาสาย') color = 'text-amber-600 font-bold';
      else if (r.status === 'ขาดเรียน') color = 'text-red-600 font-bold';
      else if (r.status === 'ลา') color = 'text-sky-600 font-bold';

      tbody.insertAdjacentHTML('beforeend', `
        <tr>
          <td class="border border-gray-300 px-2 py-1.5 text-center">${idx + 1}</td>
          <td class="border border-gray-300 px-2 py-1.5 text-center whitespace-nowrap">${escapeHtml(r.date)}</td>
          <td class="border border-gray-300 px-2 py-1.5 text-center">${escapeHtml(r.studentId)}</td>
          <td class="border border-gray-300 px-3 py-1.5">${escapeHtml(r.name)}</td>
          <td class="border border-gray-300 px-2 py-1.5 text-center">${escapeHtml(r.class)}</td>
          <td class="border border-gray-300 px-2 py-1.5 text-center">${escapeHtml(r.time)}</td>
          <td class="border border-gray-300 px-2 py-1.5 text-center ${color}">${escapeHtml(r.status)}</td>
          <td class="border border-gray-300 px-2 py-1.5 text-gray-600 text-xs">${escapeHtml(r.note)}</td>
          <td class="border border-gray-300 px-2 py-1.5 text-center no-print">
            <button onclick="editAttendanceStatus('${escapeHtml(r.recordId)}', '${escapeHtml(r.status)}', '${escapeHtml(r.note)}', '${escapeHtml(r.name)}')" class="text-amber-600 hover:bg-amber-50 p-1 rounded" title="แก้ไขสถานะ">
              <i class="fa-solid fa-pen"></i>
            </button>
          </td>
        </tr>
      `);
    });
  } catch (err) {
    showToast('ดึงข้อมูลรายงานไม่สำเร็จ', 'error');
  }
}

async function editAttendanceStatus(recordId, currentStatus, currentNote, name) {
  const { value: formValues } = await Swal.fire({
    title: 'แก้ไขสถานะการมาเรียน',
    html: `
      <p class="text-sm font-bold text-emeraldDark mb-3">${name}</p>
      <select id="swal-status" class="swal2-input w-full text-sm">
        <option value="มาเรียน" ${currentStatus === 'มาเรียน' ? 'selected' : ''}>มาเรียน</option>
        <option value="มาสาย" ${currentStatus === 'มาสาย' ? 'selected' : ''}>มาสาย</option>
        <option value="ลา" ${currentStatus === 'ลา' ? 'selected' : ''}>ลา</option>
        <option value="ขาดเรียน" ${currentStatus === 'ขาดเรียน' ? 'selected' : ''}>ขาดเรียน</option>
      </select>
      <input id="swal-note" class="swal2-input w-full text-sm" placeholder="เหตุผล / หมายเหตุ (เช่น ลาป่วย)" value="${currentNote}">
    `,
    focusConfirm: false,
    showCancelButton: true,
    confirmButtonColor: '#064e3b',
    confirmButtonText: 'บันทึกการแก้ไข',
    cancelButtonText: 'ยกเลิก',
    preConfirm: () => ({
      status: document.getElementById('swal-status').value,
      note: document.getElementById('swal-note').value.trim()
    })
  });

  if (!formValues) return;
  Swal.fire({ title: 'กำลังอัปเดต...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
  const res = await callApi('updateAttendanceStatus', { recordId, status: formValues.status, note: formValues.note });
  Swal.fire(res.success ? 'สำเร็จ' : 'ผิดพลาด', res.message, res.success ? 'success' : 'error');
  if (res.success) fetchReportData();
}

function exportReportExcel() {
  if (AppState.reportRecords.length === 0) {
    Swal.fire('ไม่มีข้อมูล', 'ไม่พบข้อมูลสำหรับส่งออก Excel', 'warning');
    return;
  }
  const rows = AppState.reportRecords.map((r, i) => ({
    "ลำดับ": i + 1, "วันที่": r.date, "รหัสนักเรียน": r.studentId,
    "ชื่อ-นามสกุล": r.name, "ชั้นเรียน": r.class, "เวลาเช็กชื่อ": r.time,
    "สถานะ": r.status, "หมายเหตุ": r.note
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Attendance_Report");
  XLSX.writeFile(wb, `Tadika_Report_${document.getElementById('rep-start-date').value}.xlsx`);
  showToast('ส่งออกไฟล์ Excel เรียบร้อย');
}

function printReportPDF() {
  document.querySelectorAll('.print-section-active').forEach(el => el.classList.remove('print-section-active'));
  document.getElementById('report-print-area').classList.add('print-section-active');
  window.print();
}

// =========================================================
// 9. Settings, Classes & Users Management
// =========================================================
async function loadSettingsPage() {
  document.getElementById('set-center-name').value = AppState.settings['CENTER_NAME'] || '';
  document.getElementById('set-chairman-name').value = AppState.settings['CHAIRMAN_NAME'] || '';
  document.getElementById('set-start-time').value = AppState.settings['CHECKIN_START'] || '07:00';
  document.getElementById('set-late-after').value = AppState.settings['LATE_AFTER'] || '08:30';
  document.getElementById('set-close-time').value = AppState.settings['CHECKIN_CLOSE'] || '09:00';
  document.getElementById('set-admin-email').value = AppState.settings['ADMIN_EMAIL'] || '';
  renderSettingsClassesTable();

  try {
    const res = await callApi('getUsers');
    if (res.success) renderUsersTable(res.users || []);
  } catch (e) {}
}

function renderSettingsClassesTable() {
  const tbody = document.getElementById('settings-classes-body');
  tbody.innerHTML = '';
  if (!AppState.classes.length) {
    tbody.innerHTML = '<tr><td colspan="3" class="px-4 py-6 text-center text-gray-400">ยังไม่มีชั้นเรียน</td></tr>';
    return;
  }
  AppState.classes.forEach(c => {
    tbody.insertAdjacentHTML('beforeend', `
      <tr class="hover:bg-gray-50">
        <td class="px-4 py-2.5 font-semibold text-emeraldDark">${escapeHtml(c.className)}</td>
        <td class="px-4 py-2.5 text-gray-700">${escapeHtml(c.teacher || '-')}</td>
        <td class="px-3 py-2.5 text-center space-x-1">
          <button onclick="fillClassEdit('${escapeHtml(c.className)}', '${escapeHtml(c.teacher)}')" class="text-amber-600 p-1"><i class="fa-solid fa-pen"></i></button>
          <button onclick="confirmDeleteClass('${escapeHtml(c.className)}')" class="text-red-500 p-1"><i class="fa-solid fa-trash"></i></button>
        </td>
      </tr>
    `);
  });
}

function fillClassEdit(cls, teacher) {
  document.getElementById('cls-name-input').value = cls;
  document.getElementById('cls-teacher-input').value = teacher;
  document.getElementById('cls-teacher-input').focus();
}

async function submitSettingsForm(e) {
  e.preventDefault();
  const payload = {
    CENTER_NAME: document.getElementById('set-center-name').value.trim(),
    CHAIRMAN_NAME: document.getElementById('set-chairman-name').value.trim(),
    CHECKIN_START: document.getElementById('set-start-time').value,
    LATE_AFTER: document.getElementById('set-late-after').value,
    CHECKIN_CLOSE: document.getElementById('set-close-time').value,
    ADMIN_EMAIL: document.getElementById('set-admin-email').value.trim()
  };
  Swal.fire({ title: 'กำลังบันทึก...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
  const res = await callApi('saveSettingsData', payload);
  if (res.success) {
    AppState.settings = res.settings;
    applyGlobalSettingsUI();
    Swal.fire('สำเร็จ', res.message, 'success');
  } else {
    Swal.fire('ผิดพลาด', res.message, 'error');
  }
}

async function submitClassTeacherForm(e) {
  e.preventDefault();
  const className = document.getElementById('cls-name-input').value.trim();
  const teacherName = document.getElementById('cls-teacher-input').value.trim();
  Swal.fire({ title: 'กำลังบันทึก...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
  const res = await callApi('saveClassTeacher', { className, teacherName });
  if (res.success) {
    AppState.classes = res.classes;
    populateAllClassDropdowns();
    renderSettingsClassesTable();
    document.getElementById('cls-name-input').value = '';
    document.getElementById('cls-teacher-input').value = '';
    Swal.fire('สำเร็จ', res.message, 'success');
  } else {
    Swal.fire('ผิดพลาด', res.message, 'error');
  }
}

async function confirmDeleteClass(className) {
  const r = await Swal.fire({
    title: 'ลบชั้นเรียน?', text: `ต้องการปิดใช้งาน "${className}" ใช่หรือไม่?`,
    icon: 'warning', showCancelButton: true, confirmButtonColor: '#dc2626', confirmButtonText: 'ลบ', cancelButtonText: 'ยกเลิก'
  });
  if (!r.isConfirmed) return;
  const res = await callApi('deleteClassTeacher', { className });
  if (res.success) {
    AppState.classes = res.classes;
    populateAllClassDropdowns();
    renderSettingsClassesTable();
    showToast('ลบชั้นเรียนแล้ว');
  }
}

function renderUsersTable(users) {
  const tbody = document.getElementById('settings-users-body');
  tbody.innerHTML = '';
  users.forEach(u => {
    const badge = u.active ? '<span class="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full text-xs font-bold">ใช้งาน</span>'
                           : '<span class="bg-gray-200 text-gray-500 px-2 py-0.5 rounded-full text-xs font-bold">ระงับ</span>';
    tbody.insertAdjacentHTML('beforeend', `
      <tr class="hover:bg-gray-50">
        <td class="px-4 py-2.5 font-medium">${escapeHtml(u.email)}</td>
        <td class="px-4 py-2.5">${escapeHtml(u.displayName)}</td>
        <td class="px-4 py-2.5 text-xs font-semibold text-emeraldDark">${escapeHtml(u.role)}</td>
        <td class="px-4 py-2.5">${badge}</td>
        <td class="px-3 py-2.5 text-center space-x-1">
          <button onclick="fillUserEdit('${escapeHtml(u.email)}', '${escapeHtml(u.displayName)}', '${escapeHtml(u.role)}')" class="text-amber-600 p-1"><i class="fa-solid fa-pen"></i></button>
          <button onclick="confirmDeleteUser('${escapeHtml(u.email)}')" class="text-red-500 p-1"><i class="fa-solid fa-user-slash"></i></button>
        </td>
      </tr>
    `);
  });
}

function fillUserEdit(email, displayName, role) {
  document.getElementById('usr-email').value = email;
  document.getElementById('usr-name').value = displayName;
  document.getElementById('usr-role').value = role;
  document.getElementById('usr-password').value = '';
  document.getElementById('usr-password').focus();
}

async function submitUserForm(e) {
  e.preventDefault();
  const payload = {
    email: document.getElementById('usr-email').value.trim(),
    displayName: document.getElementById('usr-name').value.trim(),
    role: document.getElementById('usr-role').value,
    password: document.getElementById('usr-password').value,
    active: true
  };
  Swal.fire({ title: 'กำลังบันทึกผู้ใช้...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
  const res = await callApi('saveUser', payload);
  if (res.success) {
    renderUsersTable(res.users);
    document.getElementById('usr-email').value = '';
    document.getElementById('usr-name').value = '';
    document.getElementById('usr-password').value = '';
    Swal.fire('สำเร็จ', res.message, 'success');
  } else {
    Swal.fire('ผิดพลาด', res.message, 'error');
  }
}

async function confirmDeleteUser(email) {
  const r = await Swal.fire({
    title: 'ระงับสิทธิ์ผู้ใช้?', text: `ต้องการระงับบัญชี "${email}" ใช่หรือไม่?`,
    icon: 'warning', showCancelButton: true, confirmButtonColor: '#dc2626', confirmButtonText: 'ระงับสิทธิ์', cancelButtonText: 'ยกเลิก'
  });
  if (!r.isConfirmed) return;
  const res = await callApi('deleteUser', { email });
  if (res.success) {
    renderUsersTable(res.users);
    showToast('ระงับสิทธิ์เรียบร้อยแล้ว');
  } else {
    Swal.fire('แจ้งเตือน', res.message, 'warning');
  }
}