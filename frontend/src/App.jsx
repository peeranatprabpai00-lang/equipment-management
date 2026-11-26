import { useState, useEffect, useRef } from 'react';

import { BrowserRouter as Router, Routes, Route, Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { QRCodeCanvas } from 'qrcode.react';
import JsBarcode from 'jsbarcode';
import axios from 'axios';
import * as XLSX from 'xlsx';

// =========================================================================
// PSU BRAND THEME CONSTANTS (มหาวิทยาลัยสงขลานครินทร์)
// Deep Royal Navy: #071d36 / #002D62 | PSU Blue: #005691 / #0066B2
// Accent Sky: #0284C7 / #38BDF8 | Gold Accent: #D4AF37 / #EAB308
// =========================================================================

export const ROLE_DEFINITIONS = {
  admin: {
    key: 'admin',
    label: 'ผู้ดูแลระบบ (Administrator)',
    shortLabel: 'ผู้ดูแลระบบ',
    badgeColor: 'bg-blue-100 text-blue-900 border-blue-300',
    icon: '🛡️',
    description: 'สิทธิ์สูงสุด เข้าถึงได้ทุกเมนู จัดการครุภัณฑ์ ยืม-คืน ซ่อม และจัดการผู้ใช้/กำหนดสิทธิ์',
    permissions: ['จัดการครุภัณฑ์', 'ยืม-คืน', 'แจ้งซ่อม', 'พิมพ์ป้ายบาร์โค้ด', 'จัดการผู้ใช้และสิทธิ์']
  },
  staff: {
    key: 'staff',
    label: 'เจ้าหน้าที่พัสดุ (Staff)',
    shortLabel: 'เจ้าหน้าที่พัสดุ',
    badgeColor: 'bg-sky-100 text-sky-800 border-sky-300',
    icon: '📋',
    description: 'จัดการข้อมูลครุภัณฑ์, ทำรายการยืม-คืน, แจ้งซ่อม และพิมพ์ป้ายบาร์โค้ด',
    permissions: ['จัดการครุภัณฑ์', 'ยืม-คืน', 'แจ้งซ่อม', 'พิมพ์ป้ายบาร์โค้ด']
  },
  technician: {
    key: 'technician',
    label: 'ช่างซ่อมบำรุง (Technician)',
    shortLabel: 'ช่างซ่อมบำรุง',
    badgeColor: 'bg-amber-100 text-amber-800 border-amber-300',
    icon: '🔧',
    description: 'ดูรายการครุภัณฑ์, บันทึกการแจ้งซ่อม และปิดงานซ่อมพร้อมลงค่าใช้จ่าย',
    permissions: ['ดูครุภัณฑ์', 'แจ้งซ่อมและปิดงานซ่อม']
  },
  viewer: {
    key: 'viewer',
    label: 'ผู้ใช้งานทั่วไป (Viewer)',
    shortLabel: 'ผู้ใช้งานทั่วไป',
    badgeColor: 'bg-slate-100 text-slate-700 border-slate-300',
    icon: '👁️',
    description: 'ดูข้อมูลครุภัณฑ์, ส่งแจ้งซ่อมครุภัณฑ์ และติดตามสถานะการซ่อมบำรุง',
    permissions: ['ดูข้อมูลครุภัณฑ์', 'ส่งแจ้งซ่อมครุภัณฑ์']
  }
};

// Helper: สร้างรหัสครุภัณฑ์ (เริ่มต้นด้วยหมวดหมู่ + รหัสครุภัณฑ์ เช่น ITs001)
export function getAssetCode(eq) {
  if (!eq) return 'ITs000';
  if (eq.code) return String(eq.code);
  let prefix = 'IT';
  if (eq.category) {
    if (eq.category.toLowerCase().includes('แอร์') || eq.category.toLowerCase().includes('ปรับอากาศ')) prefix = 'AIR';
    else if (eq.category.toLowerCase().includes('อิเล็ก') || eq.category.toLowerCase().includes('electronics')) prefix = 'EL';
    else if (eq.category.toLowerCase().includes('สำนักงาน') || eq.category.toLowerCase().includes('office')) prefix = 'OFF';
    else if (eq.category.toLowerCase().includes('โสต') || eq.category.toLowerCase().includes('audio')) prefix = 'AV';
    else if (eq.category.toLowerCase().includes('เฟอร์นิเจอร์') || eq.category.toLowerCase().includes('furniture')) prefix = 'FUR';
  }
  return `${prefix}s${String(eq.id || 0).padStart(3, '0')}`;
}

// Helper: สร้างข้อความใน QR Code สำหรับตรวจสอบข้อมูล
export function getAssetQRValue(eq) {
  if (!eq) return '';
  // QR Code now contains only the asset code (เช่น ITs001) for easy scanning
  const code = getAssetCode(eq);
  return code;
}

// Helper: คำนวณราคาหรือมูลค่า
export function getAssetPrice(eq) {
  if (eq.price !== undefined && eq.price !== null && !isNaN(Number(eq.price)) && Number(eq.price) > 0) {
    return Number(eq.price);
  }
  const basePrices = { 'IT': 32500, 'คอมพิวเตอร์และอุปกรณ์': 32500, 'Electronics': 18900, 'เครื่องใช้สำนักงาน': 12900, 'เครื่องปรับอากาศ': 38500 };
  return basePrices[eq.category] || (eq.id ? eq.id * 5200 + 8500 : 15000);
}

// Helper: กำหนดหน่วยงานเริ่มต้น
export function getAssetDepartment(eq) {
  if (eq.department) return eq.department;
  return 'สำนักทรัพยากรการเรียนรู้คุณหญิงหลง อรรถกระวีสุนทร';
}

// --- Component แสดง Barcode (Code 128) ---
export function Barcode({ 
  value, 
  width = 1.35, 
  height = 42, 
  fontSize = 11, 
  displayValue = true,
  className = "" 
}) {
  const barcodeRef = useRef(null);

  useEffect(() => {
    if (barcodeRef.current && value) {
      try {
        JsBarcode(barcodeRef.current, String(value), {
          format: "CODE128",
          width,
          height,
          displayValue,
          font: "monospace",
          fontSize,
          textMargin: 3,
          margin: 4,
          background: "#ffffff",
          lineColor: "#071d36",
        });
      } catch (err) {
        console.error("Barcode rendering error:", err);
      }
    }
  }, [value, width, height, fontSize, displayValue]);

  return <svg ref={barcodeRef} className={`mx-auto max-w-full ${className}`} />;
}

// --- Component ป้ายทะเบียนครุภัณฑ์ ม.อ. (PSU Asset Tag) ---
export function AssetTag({ 
  equipment, 
  orgName = "มหาวิทยาลัยสงขลานครินทร์ (PSU)", 
  size = "standard", 
  showQr = true, 
  showBarcode = true,
  id = ""
}) {
  if (!equipment) return null;
  const assetCode = getAssetCode(equipment);
  const isCompact = size === "compact";

  return (
    <div 
      id={id}
      className={`asset-tag-card bg-white text-gray-900 border-2 border-[#002D62] rounded-lg text-center shadow-sm relative mx-auto select-none w-full ${
        isCompact 
          ? 'max-w-[88mm] p-2 text-xs' 
          : 'max-w-[96mm] p-2.5 text-sm'
      }`}
      style={{
        boxSizing: 'border-box',
        pageBreakInside: 'avoid',
        breakInside: 'avoid',
        breakInsidePage: 'avoid',
        WebkitColumnBreakInside: 'avoid'
      }}
    >
      {/* Header ป้ายครุภัณฑ์ */}
      <div className={`border-b-2 border-[#002D62] ${isCompact ? 'pb-1 mb-1' : 'pb-1.5 mb-1.5'}`}>
        <div className="flex items-center justify-between text-[10px] font-bold tracking-wider text-slate-800">
          <span className="flex items-center gap-1 overflow-hidden">
            <img src="/psu-logo.png" alt="PSU" className={`${isCompact ? 'h-4' : 'h-4.5'} w-auto object-contain inline shrink-0`} />
            <span className="truncate max-w-[150px]">{orgName}</span>
          </span>
          <span className="font-mono text-[#002D62] font-extrabold shrink-0 ml-1">{assetCode}</span>
        </div>
        <h4 className={`font-extrabold text-[#002D62] leading-tight truncate mt-0.5 ${isCompact ? 'text-xs' : 'text-sm'}`} title={equipment.name}>
          {equipment.name}
        </h4>
        <div className="flex justify-between items-center text-[10px] text-gray-600 mt-0.5">
          <span>หมวด: <strong className="text-gray-900">{equipment.category || '-'}</strong></span>
          <span className="text-[9px] text-slate-500 font-mono">#{equipment.id}</span>
        </div>
      </div>

      {/* Body: QR Code & Barcode */}
      <div className={`grid ${showQr && showBarcode ? 'grid-cols-2' : 'grid-cols-1'} gap-1.5 items-center my-1 p-1 bg-slate-50 rounded border border-gray-200`}>
        {showQr && (
          <div className="flex flex-col items-center justify-center p-0.5 bg-white rounded border border-gray-200">
            <QRCodeCanvas 
              id={`qr-canvas-${equipment.id}`}
              value={getAssetQRValue(equipment)} 
              size={isCompact ? 68 : 82} 
              level="H"
              marginSize={1}
            />
            <span className="text-[8px] text-slate-600 mt-0.5 font-semibold">สแกนตรวจสอบ</span>
          </div>
        )}

        {showBarcode && (
          <div className="flex flex-col items-center justify-center p-0.5 bg-white rounded border border-gray-200 overflow-hidden">
            <Barcode 
              value={assetCode} 
              width={isCompact ? 1.0 : 1.15} 
              height={isCompact ? 26 : 34} 
              fontSize={isCompact ? 8.5 : 9.5} 
            />
            <span className="text-[8px] text-slate-600 mt-0.5 font-semibold">บาร์โค้ดครุภัณฑ์</span>
          </div>
        )}
      </div>

      {/* Footer ป้ายครุภัณฑ์ */}
      <div className={`text-[8.5px] text-gray-600 ${isCompact ? 'pt-0.5' : 'pt-1'} border-t border-dashed border-gray-300 flex justify-between items-center`}>
        <span className="truncate max-w-[90px]">ม.อ. ป้ายครุภัณฑ์</span>
        <span className="text-[7.5px] font-bold text-red-700 tracking-tighter">ห้ามแกะหรือทำลายป้าย</span>
        <span>พิมพ์: {new Date().toLocaleDateString('th-TH')}</span>
      </div>
    </div>
  );
}

// =========================================================================
// 1. หน้าเข้าสู่ระบบ (LOGIN PAGE) - โทนสถาบัน ม.อ. ตามภาพ Image 2
// =========================================================================
function LoginPage({ onLoginSuccess, equipmentsCount = 1248 }) {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('123456');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await axios.post('http://localhost:5000/api/login', { username, password });
      const userObj = res.data.user || {
        username: res.data.username || username,
        role: res.data.role || 'admin',
        department: res.data.department || 'สำนักงานอธิการบดี ม.อ.',
        full_name: res.data.full_name || 'เจ้าหน้าที่พัสดุ ม.อ.'
      };
      const token = res.data.token || 'demo-token';
      localStorage.setItem('token', token);
      localStorage.setItem('username', userObj.username);
      localStorage.setItem('role', userObj.role || 'admin');
      localStorage.setItem('user_profile', JSON.stringify(userObj));
      onLoginSuccess(userObj);
    } catch (err) {
      setError(err.response?.data?.error || 'เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-slate-100 via-slate-50 to-blue-50/40 flex flex-col justify-center items-center p-4 sm:p-6">
      {/* Center Form Card */}
      <div className="w-full max-w-md bg-white rounded-3xl shadow-xl border border-slate-200/80 p-8 sm:p-10 relative overflow-hidden">
        {/* Decorative Top Accent Bar in PSU Navy */}
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-[#071d36] via-[#005691] to-[#002D62]"></div>

        {/* Brand Logo & Title */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <img src="/psu-logo.png" alt="PSU Logo" className="h-14 w-auto object-contain drop-shadow-xs" />
          </div>
          <h2 className="text-2xl font-extrabold text-[#002D62] font-heading">
            เข้าสู่ระบบ
          </h2>
          <p className="text-slate-500 text-xs sm:text-sm mt-1">
            ระบบบริหารจัดการครุภัณฑ์ มหาวิทยาลัยสงขลานครินทร์
          </p>
        </div>

        {error && (
          <div className="mb-5 bg-red-50 text-red-600 text-xs p-3.5 rounded-xl border border-red-200 flex items-center gap-2">
            <span>⚠️</span> {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              อีเมลหรือชื่อผู้ใช้งาน
            </label>
            <input 
              type="text" 
              required 
              value={username} 
              onChange={e => setUsername(e.target.value)}
              placeholder="name@psu.ac.th หรือ admin"
              className="w-full px-4 py-3 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-[#005691] focus:border-[#005691] outline-none transition"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              รหัสผ่าน
            </label>
            <div className="relative">
              <input 
                type={showPassword ? "text" : "password"} 
                required 
                value={password} 
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full px-4 py-3 rounded-xl border border-slate-300 text-sm pr-12 focus:ring-2 focus:ring-[#005691] focus:border-[#005691] outline-none transition"
              />
              <button 
                type="button" 
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-3.5 text-xs text-slate-400 hover:text-slate-700 font-medium cursor-pointer"
              >
                {showPassword ? "ซ่อน" : "แสดง"}
              </button>
            </div>
          </div>

          <div className="flex items-center text-xs text-slate-600 pt-1">
            <label className="flex items-center gap-2 cursor-pointer">
              <input 
                type="checkbox" 
                checked={rememberMe} 
                onChange={e => setRememberMe(e.target.checked)}
                className="rounded text-[#005691] focus:ring-[#005691] cursor-pointer" 
              />
              <span>จดจำการเข้าสู่ระบบ</span>
            </label>
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className="w-full bg-[#005691] hover:bg-[#003B71] text-white font-bold py-3.5 px-4 rounded-xl shadow-md hover:shadow-lg transition duration-150 flex items-center justify-center gap-2 text-sm cursor-pointer disabled:opacity-60 mt-2"
          >
            <span>{loading ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}</span>
            <span>→</span>
          </button>
        </form>
      </div>
    </div>
  );
}

// =========================================================================
// 2. SIDEBAR NAVIGATION (PSU Dark Navy Theme ตามภาพ Image 1)
// =========================================================================
function Sidebar({ currentUser, onLogout, isOpen, onClose }) {
  const location = useLocation();
  const role = currentUser?.role || 'viewer';
  const isAdmin = role === 'admin';
  const isStaff = role === 'staff';
  const isTechnician = role === 'technician';
  const canManage = isAdmin || isStaff;
  const canRepair = true; // ทุกสิทธิ์รวมถึงผู้ใช้งานทั่วไป (Viewer) สามารถเข้าดูและส่งแจ้งซ่อมได้

  const menuWorkspace = [
    { to: '/', label: 'ภาพรวมระบบ', icon: '🔲' },
    { to: '/manage', label: 'ทะเบียนครุภัณฑ์', icon: '🗂️' },
    ...(canManage ? [{ to: '/purchase', label: 'รายละเอียดการซื้อ', icon: '📑' }] : []),
    ...(role !== 'viewer' ? [{ to: '/tags', label: 'ป้ายรหัส & บาร์โค้ด', icon: '🏷️' }] : []),
    ...(canManage ? [
      { to: '/categories', label: 'หมวดหมู่ครุภัณฑ์', icon: '🗃️' },
      { to: '/departments', label: 'หน่วยงานและสถานที่', icon: '🏢' },
    ] : []),
  ];

  const menuOperations = [
    ...(canManage ? [
      { to: '/receive', label: 'รับเข้าครุภัณฑ์', icon: '📥' },
      { to: '/transfer', label: 'โอนย้ายครุภัณฑ์ / คืน', icon: '🔄' },
    ] : []),
    { to: '/repairs', label: 'แจ้งซ่อม / ซ่อมบำรุง', icon: '🔧' },
    ...(canManage ? [
      { to: '/audit', label: 'ตรวจนับครุภัณฑ์', icon: '📋' },
      { to: '/disposal', label: 'จำหน่ายครุภัณฑ์', icon: '🗑️' },
    ] : []),
    ...(isAdmin ? [{ to: '/users', label: 'รายงานและผู้ใช้งาน', icon: '👥', highlight: true }] : [])
  ];

  return (
    <>
      {/* Overlay backdrop สำหรับมือถือ */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={onClose}
        />
      )}
      <aside className={`
        fixed lg:static inset-y-0 left-0 z-50
        w-64 bg-[#071d36] text-slate-300 flex flex-col justify-between h-screen
        shrink-0 border-r border-[#002D62] no-print
        transform transition-transform duration-300 ease-in-out
        ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
      <div className="flex flex-col h-full overflow-hidden">
        {/* App Logo & Header */}
        <div className="p-5 border-b border-[#002D62] flex items-center justify-center">
          <img src="/psu-logo.png" alt="PSU" className="h-10 w-auto object-contain brightness-0 invert drop-shadow" />
        </div>

        {/* Nav Links Scrollable Area */}
        <div className="flex-1 overflow-y-auto p-3 space-y-4 text-xs custom-sidebar-scroll">
          {/* WORKSPACE SECTION */}
          <div>
            <div className="px-3 mb-2 text-[10px] font-bold text-slate-400 tracking-wider uppercase">
              WORKSPACE
            </div>
            <nav className="space-y-1">
              {menuWorkspace.map(item => {
                const isActive = location.pathname === item.to;
                return (
                  <Link
                    key={item.label}
                    to={item.to}
                    onClick={() => onClose && onClose()}
                    className={`flex items-center gap-3 px-3 py-2 rounded-xl font-medium transition ${
                      isActive 
                        ? 'bg-[#003B71] text-white shadow-sm font-semibold border-l-4 border-sky-400' 
                        : 'text-slate-300 hover:bg-[#002D62]/60 hover:text-white'
                    }`}
                  >
                    <span className="text-sm">{item.icon}</span>
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* OPERATIONS SECTION */}
          {menuOperations.length > 0 && (
            <div>
              <div className="px-3 mb-2 text-[10px] font-bold text-slate-400 tracking-wider uppercase">
                การดำเนินงาน
              </div>
              <nav className="space-y-1">
                {menuOperations.map(item => {
                  const isActive = location.pathname === item.to;
                  return (
                    <Link
                      key={item.label}
                      to={item.to}
                      onClick={() => onClose && onClose()}
                      className={`flex items-center gap-3 px-3 py-2 rounded-xl font-medium transition ${
                        isActive 
                          ? 'bg-[#003B71] text-white shadow-sm font-semibold border-l-4 border-sky-400' 
                          : 'text-slate-300 hover:bg-[#002D62]/60 hover:text-white'
                      }`}
                    >
                      <span className="text-sm">{item.icon}</span>
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </nav>
            </div>
          )}
        </div>

        {/* Sidebar Footer */}
        <div className="p-4 border-t border-[#002D62] bg-[#05162a] text-xs">
          <div className="flex justify-between items-center text-[11px]">
            <div>
              <div className="font-bold text-slate-200">มหาวิทยาลัยสงขลานครินทร์</div>
              <div className="text-slate-400 text-[10px]">ระบบบริหารจัดการครุภัณฑ์</div>
            </div>
            <button 
              onClick={onLogout}
              className="text-red-400 hover:text-red-300 text-xs px-2 py-1 rounded hover:bg-red-950/40 transition cursor-pointer"
              title="ออกจากระบบ"
            >
              ออก
            </button>
          </div>
        </div>
      </div>
    </aside>
    </>
  );
}

// =========================================================================
// 3. TOPBAR HEADER (Breadcrumbs, Search, Profile)
// =========================================================================
function Topbar({ currentUser, onLogout, onMenuToggle, equipments = [], repairs = [] }) {
  const currentRoleInfo = ROLE_DEFINITIONS[currentUser?.role] || ROLE_DEFINITIONS.staff;
  const location = useLocation();
  const navigate = useNavigate();
  const [notifOpen, setNotifOpen] = useState(false);

  const pendingRepairs = repairs.filter(r => (r.repair_status || r.status) !== 'ซ่อมเสร็จแล้ว');
  const missingEquipments = equipments.filter(e => e.status === 'สูญหาย');
  const repairEquipments = equipments.filter(e => e.status === 'ส่งซ่อม');
  const disposalEquipments = equipments.filter(e => e.status === 'รอจำหน่าย');

  const notifications = [
    ...missingEquipments.map(eq => ({
      id: `missing-${eq.id}`,
      type: 'danger',
      title: `ครุภัณฑ์สูญหาย: ${eq.name}`,
      subtitle: `รหัส ${getAssetCode(eq)} • ${eq.location || '-'}`,
      to: '/manage'
    })),
    ...pendingRepairs.map(r => ({
      id: `repair-${r.id}`,
      type: 'warning',
      title: `แจ้งซ่อมค้าง: ${r.equipment_name || `รหัส #${r.equipment_id}`}`,
      subtitle: `${r.issue || 'รอตรวจสอบ'} (${r.repair_status || 'รอดำเนินการ'})`,
      to: '/repairs'
    })),
    ...disposalEquipments.map(eq => ({
      id: `disposal-${eq.id}`,
      type: 'info',
      title: `รอจำหน่าย: ${eq.name}`,
      subtitle: `รหัส ${getAssetCode(eq)}`,
      to: currentUser?.role === 'admin' || currentUser?.role === 'staff' ? '/disposal' : '/manage'
    }))
  ];
  const totalAlerts = notifications.length;

  const BREADCRUMB_MAP = {
    '/': { group: 'พื้นที่ทำงาน', label: 'ภาพรวมระบบ' },
    '/manage': { group: 'พื้นที่ทำงาน', label: 'ทะเบียนครุภัณฑ์' },
    '/purchase': { group: 'พื้นที่ทำงาน', label: 'รายละเอียดการซื้อ' },
    '/tags': { group: 'พื้นที่ทำงาน', label: 'ป้ายรหัส & บาร์โค้ด' },
    '/categories': { group: 'พื้นที่ทำงาน', label: 'หมวดหมู่ครุภัณฑ์' },
    '/departments': { group: 'พื้นที่ทำงาน', label: 'หน่วยงานและสถานที่' },
    '/receive': { group: 'การดำเนินงาน', label: 'รับเข้าครุภัณฑ์' },
    '/transfer': { group: 'การดำเนินงาน', label: 'โอนย้ายครุภัณฑ์ / คืน' },
    '/repairs': { group: 'การดำเนินงาน', label: 'ซ่อมบำรุง' },
    '/audit': { group: 'การดำเนินงาน', label: 'ตรวจนับครุภัณฑ์' },
    '/disposal': { group: 'การดำเนินงาน', label: 'จำหน่ายครุภัณฑ์' },
    '/users': { group: 'การดำเนินงาน', label: 'รายงานและผู้ใช้งาน' }
  };

  const currentCrumb = BREADCRUMB_MAP[location.pathname] || { group: 'พื้นที่ทำงาน', label: 'ทะเบียนครุภัณฑ์' };

  return (
    <header className="h-16 shrink-0 bg-white border-b border-slate-200 px-4 md:px-6 flex items-center justify-between sticky top-0 z-30 no-print shadow-2xs">
      {/* Left: Hamburger (mobile) + Breadcrumb */}
      <div className="flex items-center gap-3 text-xs text-slate-500">
        {/* Hamburger button — แสดงเฉพาะมือถือ/แท็บเล็ต */}
        <button
          onClick={onMenuToggle}
          className="lg:hidden p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition cursor-pointer"
          title="เมนู"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <div className="flex items-center gap-2">
          <span className="hidden sm:inline hover:text-slate-800">{currentCrumb.group}</span>
          <span className="hidden sm:inline">/</span>
          <span className="font-semibold text-slate-800">{currentCrumb.label}</span>
        </div>
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-4">
        {/* Notification Bell (ใช้งานได้จริง) */}
        <div className="relative">
          <button 
            onClick={() => setNotifOpen(o => !o)}
            className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition cursor-pointer relative"
            title="การแจ้งเตือน"
          >
            <span>🔔</span>
            {totalAlerts > 0 ? (
              <span className="min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[10px] font-bold rounded-full absolute -top-0.5 -right-0.5 flex items-center justify-center shadow-xs">
                {totalAlerts > 99 ? '99+' : totalAlerts}
              </span>
            ) : (
              <span className="w-2 h-2 bg-emerald-500 rounded-full absolute top-1.5 right-1.5"></span>
            )}
          </button>

          {notifOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setNotifOpen(false)}></div>
              <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-2xl shadow-2xl border border-slate-200 z-50 overflow-hidden">
                <div className="bg-[#071d36] text-white px-4 py-3 flex items-center justify-between">
                  <span className="font-bold text-xs flex items-center gap-1.5">
                    <span>🔔</span> การแจ้งเตือนระบบ ({totalAlerts})
                  </span>
                  <span className="text-[10px] text-sky-300">
                    ซ่อม {repairEquipments.length} • สูญหาย {missingEquipments.length}
                  </span>
                </div>
                <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
                  {notifications.length === 0 ? (
                    <div className="p-6 text-center text-xs text-slate-400">
                      ✅ ไม่มีรายการแจ้งเตือนค้างในระบบ
                    </div>
                  ) : (
                    notifications.slice(0, 15).map(n => (
                      <button
                        key={n.id}
                        onClick={() => { setNotifOpen(false); navigate(n.to); }}
                        className="w-full text-left px-4 py-3 hover:bg-slate-50 transition flex items-start gap-2.5 cursor-pointer"
                      >
                        <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${
                          n.type === 'danger' ? 'bg-red-500' : n.type === 'warning' ? 'bg-amber-500' : 'bg-sky-500'
                        }`}></span>
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-bold text-slate-800 truncate">{n.title}</div>
                          <div className="text-[11px] text-slate-500 truncate mt-0.5">{n.subtitle}</div>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* User Profile Pill */}
        <div className="flex items-center gap-2 md:gap-3 pl-2 border-l border-slate-200">
          <div className="w-8 h-8 rounded-full bg-emerald-50 border border-emerald-300 text-emerald-700 flex items-center justify-center text-xs font-bold shadow-2xs">
            ✓
          </div>
          <div className="text-right hidden sm:block">
            <div className="text-xs font-bold text-slate-800 leading-tight">
              {currentUser?.full_name || currentUser?.username}
            </div>
            <div className="text-[10px] text-slate-500">
              {currentRoleInfo.shortLabel} ม.อ.
            </div>
          </div>
          <button 
            onClick={onLogout}
            className="text-slate-400 hover:text-red-600 text-xs cursor-pointer ml-1"
            title="ออกจากระบบ"
          >
            ▾
          </button>
        </div>
      </div>
    </header>
  );
}

// =========================================================================
// Helper: เลือกทะเบียนรถจัดส่งแยกตามปีงบประมาณ (+ เพิ่มรถใหม่ในปีงบนี้ได้ทันที)
// =========================================================================
function DeliveryTruckSelect({ fiscalYear, value, onChange, deliveryTrucks = [], onTruckAdded, disabled = false }) {
  const [addingNew, setAddingNew] = useState(false);
  const [newPlate, setNewPlate] = useState('');
  const [saving, setSaving] = useState(false);

  const yearStr = String(fiscalYear || '2570');
  const yearTrucks = deliveryTrucks.filter(t => String(t.fiscal_year) === yearStr);
  const plateOptions = Array.from(new Set([
    ...yearTrucks.map(t => t.license_plate),
    ...(value && value !== '-' ? [value] : [])
  ])).filter(Boolean);

  const handleAddTruck = async () => {
    const clean = newPlate.trim();
    if (!clean) return;
    setSaving(true);
    try {
      await axios.post('http://localhost:5000/api/delivery-trucks', {
        fiscal_year: yearStr,
        license_plate: clean
      });
      onChange(clean);
      setNewPlate('');
      setAddingNew(false);
      if (onTruckAdded) await onTruckAdded();
    } catch (err) {
      alert('ไม่สามารถเพิ่มทะเบียนรถได้');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-1.5">
      <div className="flex gap-1.5">
        <select
          disabled={disabled}
          value={value || ''}
          onChange={e => onChange(e.target.value)}
          className="flex-1 border border-slate-300 rounded-xl p-2 text-xs bg-white outline-none focus:ring-2 focus:ring-[#005691] disabled:bg-slate-50"
        >
          <option value="">-- ไม่ระบุ / เลือกรถปีงบ {yearStr} --</option>
          {plateOptions.map(p => (
            <option key={p} value={p}>🚚 {p} (ปีงบ {yearStr})</option>
          ))}
        </select>
        {!disabled && (
          <button
            type="button"
            onClick={() => setAddingNew(v => !v)}
            className="px-2.5 py-1.5 bg-sky-50 hover:bg-sky-100 text-[#005691] border border-sky-200 rounded-xl text-[11px] font-bold whitespace-nowrap cursor-pointer"
            title={`เพิ่มรถส่งของใหม่สำหรับปีงบประมาณ ${yearStr}`}
          >
            {addingNew ? 'ยกเลิก' : '+ เพิ่มรถ'}
          </button>
        )}
      </div>
      {!disabled && addingNew && (
        <div className="flex gap-1.5 items-center bg-slate-50 p-2 rounded-xl border border-slate-200">
          <input
            type="text"
            value={newPlate}
            onChange={e => setNewPlate(e.target.value)}
            placeholder={`ทะเบียนรถใหม่ (ปีงบ ${yearStr}) เช่น กข 1234`}
            className="flex-1 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs bg-white outline-none focus:ring-1 focus:ring-[#005691]"
          />
          <button
            type="button"
            disabled={saving || !newPlate.trim()}
            onClick={handleAddTruck}
            className="px-3 py-1.5 bg-[#005691] hover:bg-[#003B71] text-white rounded-lg text-[11px] font-bold cursor-pointer disabled:opacity-50"
          >
            {saving ? '...' : 'บันทึก'}
          </button>
        </div>
      )}
    </div>
  );
}

// =========================================================================
// 4. หน้าจัดการทะเบียนครุภัณฑ์ (ASSET REGISTRY) - ตรงตามภาพ Image 1
// =========================================================================
function Management({ equipments, categoriesData = [], departmentsData = [], deliveryTrucks = [], fetchAllData, onOpenSingleTag, onOpenBatchPrint, onOpenImport, currentUser, allowAdd = false }) {
  const location = useLocation();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ทั้งหมด');
  const [categoryFilter, setCategoryFilter] = useState('ทั้งหมด');
  const [departmentFilter, setDepartmentFilter] = useState('ทั้งหมด');
  const [selectedIds, setSelectedIds] = useState([]);
  const [activeTab, setActiveTab] = useState('all'); // 'all', 'available', 'repair', 'disposal'
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Sync searchTerm with URL query param ?search=
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const q = params.get('search');
    if (q !== null) {
      setSearchTerm(q);
      setCurrentPage(1);
    }
  }, [location.search]);

  // Reset to page 1 whenever any filter or search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, categoryFilter, departmentFilter, activeTab, pageSize]);
  // Categories & Departments อิงจากข้อมูลในฐานข้อมูลเป็นหลัก
  const CATEGORY_LIST = categoriesData.length > 0 ? categoriesData : [
    { code: 'IT', name: 'คอมพิวเตอร์และอุปกรณ์' },
    { code: 'OFF', name: 'เครื่องใช้สำนักงาน' },
    { code: 'AIR', name: 'เครื่องปรับอากาศ' },
    { code: 'AV', name: 'โสตทัศนูปกรณ์' },
    { code: 'FUR', name: 'เฟอร์นิเจอร์สำนักงาน' },
    { code: 'EL', name: 'อิเล็กทรอนิกส์' },
    { code: 'GEN', name: 'อื่นๆ' },
  ];

  const categories = Array.from(new Set([
    ...categoriesData.map(c => c.name),
    ...equipments.map(e => e.category)
  ].filter(Boolean)));

  const departments = departmentsData.length > 0
    ? departmentsData.map(d => d.name)
    : ['สำนักทรัพยากรการเรียนรู้คุณหญิงหลง อรรถกระวีสุนทร'];
  const [newDeptName, setNewDeptName] = useState('');
  const [showDeptManager, setShowDeptManager] = useState(false);

  const [addForm, setAddForm] = useState({ 
    categoryCode: 'IT',
    category: 'คอมพิวเตอร์และอุปกรณ์', 
    name: '', 
    brand: '', 
    department: 'สำนักทรัพยากรการเรียนรู้คุณหญิงหลง อรรถกระวีสุนทร', 
    price: '',
    customCode: ''
  });
  const [actionMenuId, setActionMenuId] = useState(null);
  const [detailEq, setDetailEq] = useState(null);
  const [isEditingDetail, setIsEditingDetail] = useState(false);
  const [detailForm, setDetailForm] = useState({});
  const [auditHistory, setAuditHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const openAssetDetailModal = async (eq, edit = false) => {
    setDetailEq(eq);
    setIsEditingDetail(edit);
    setAuditHistory([]);
    setLoadingHistory(true);

    try {
      const res = await axios.get(`http://localhost:5000/api/equipments/${eq.id}/history`);
      setAuditHistory(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error('Fetch history error:', err);
    } finally {
      setLoadingHistory(false);
    }

    setDetailForm({
      code: getAssetCode(eq),
      name: eq.name || '',
      category: eq.category || '',
      details: eq.details || '',
      brand: eq.brand || '',
      serial_no: eq.serial_no || '',
      license_plate: eq.license_plate || '-',
      price: getAssetPrice(eq),
      shipping_cost: parseFloat(eq.shipping_cost) || 0,
      installation_cost: parseFloat(eq.installation_cost) || 0,
      other_cost: parseFloat(eq.other_cost) || 0,
      location: eq.location || '',
      dept_code: eq.dept_code || 'LRC-01',
      department: getAssetDepartment(eq),
      fiscal_year: eq.fiscal_year || '2570',
      fund_code: eq.fund_code || 'BG-70',
      fund_source: eq.fund_source || 'เงินงบประมาณแผ่นดิน',
      requisition_no: eq.requisition_no || '',
      requisition_date: eq.requisition_date || '',
      purchase_approval_no: eq.purchase_approval_no || '',
      purchase_approval_date: eq.purchase_approval_date || '',
      purchase_method: eq.purchase_method || 'เฉพาะเจาะจง',
      vendor: eq.vendor || '',
      payment_doc_no: eq.payment_doc_no || '',
      contract_no: eq.contract_no || '',
      contract_start_date: eq.contract_start_date || '',
      contract_end_date: eq.contract_end_date || '',
      received_date: eq.received_date || (eq.created_at ? new Date(eq.created_at).toISOString().slice(0, 10) : ''),
      useful_life: eq.useful_life || '5 ปี',
      salvage_value: eq.salvage_value !== undefined && eq.salvage_value !== null ? eq.salvage_value : 1,
      warranty_period: eq.warranty_period || '1 ปี',
      warranty_end_date: eq.warranty_end_date || '',
      status: eq.status || 'พร้อมใช้งาน',
      disposal_date: eq.disposal_date || '',
      disposal_doc_no: eq.disposal_doc_no || '',
      disposal_note: eq.disposal_note || '',
      remark: eq.remark || ''
    });
  };

  const handleSaveAssetDetail = async (e) => {
    e.preventDefault();
    if (!canManage) {
      alert('คุณไม่มีสิทธิ์แก้ไขข้อมูลครุภัณฑ์ (เฉพาะ Admin และ Staff)');
      return;
    }
    if (!detailEq) return;
    try {
      const payload = {
        ...detailForm,
        modified_by: currentUser?.full_name || currentUser?.username || 'ผู้ดูแลระบบ'
      };
      await axios.put(`http://localhost:5000/api/equipments/${detailEq.id}`, payload);
      setDetailEq(null);
      fetchAllData();
    } catch (err) {
      alert('เกิดข้อผิดพลาดในการบันทึกข้อมูลครุภัณฑ์');
    }
  };

  const isAdmin = currentUser?.role === 'admin';
  const canManage = currentUser?.role === 'admin' || currentUser?.role === 'staff';
  const canPrintTags = currentUser?.role !== 'viewer';

  // Tab counts
  const totalCount = equipments.length;
  const availableCount = equipments.filter(eq => eq.status === 'พร้อมใช้งาน').length;
  const repairCount = equipments.filter(eq => eq.status === 'ส่งซ่อม').length;
  const disposalCount = equipments.filter(eq => eq.status === 'กำลังถูกยืม' || eq.status === 'รอจำหน่าย').length;
  const missingCount = equipments.filter(eq => eq.status === 'สูญหาย').length;

  const handleCreateAsset = async (e) => {
    e.preventDefault();
    try {
      const nextSeq = String(equipments.length + 1).padStart(3, '0');
      const finalCode = (addForm.customCode || '').trim() || `${addForm.categoryCode}s${nextSeq}`;

      await axios.post('http://localhost:5000/api/equipments', {
        code: finalCode,
        name: addForm.name,
        category: addForm.category,
        brand: addForm.brand,
        department: addForm.department,
        price: parseFloat(addForm.price) || 0,
        status: 'พร้อมใช้งาน'
      });
      setIsAddModalOpen(false);
      setAddForm({ 
        categoryCode: 'IT',
        category: 'คอมพิวเตอร์และอุปกรณ์', 
        name: '', 
        brand: '', 
        department: departments[0] || 'สำนักทรัพยากรการเรียนรู้คุณหญิงหลง อรรถกระวีสุนทร', 
        price: '',
        customCode: ''
      });
      fetchAllData();
    } catch (err) {
      alert('เกิดข้อผิดพลาดในการเพิ่มครุภัณฑ์');
    }
  };

  const handleDelete = async (id) => {
    if (!isAdmin) {
      alert('คุณไม่มีสิทธิ์ในการลบครุภัณฑ์ (สงวนสิทธิ์เฉพาะผู้ดูแลระบบ Admin เท่านั้น)');
      return;
    }
    if (window.confirm('ยืนยันการลบครุภัณฑ์ชิ้นนี้ออกจากระบบ ม.อ.?')) {
      try {
        await axios.delete(`http://localhost:5000/api/equipments/${id}`, {
          headers: { 'x-user-role': currentUser?.role || '' }
        });
        fetchAllData();
      } catch (err) {
        alert(err.response?.data?.error || 'เกิดข้อผิดพลาดในการลบข้อมูล');
      }
    }
  };

  const handleExportCSV = () => {
    const headers = ['รหัสครุภัณฑ์,ชื่อครุภัณฑ์,หมวดหมู่,ยี่ห้อ,หน่วยงาน,มูลค่า (บาท),สถานะปัจจุบัน,วันที่บันทึก'];
    const rows = equipments.map(eq => `${getAssetCode(eq)},"${eq.name}","${eq.category}","${eq.brand || '-'}","${getAssetDepartment(eq)}",${getAssetPrice(eq)},"${eq.status}","${new Date(eq.created_at).toLocaleDateString('th-TH')}"`);
    const csvContent = '\uFEFF' + [headers, ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `ทะเบียนครุภัณฑ์_คุณหญิงหลง_${new Date().toLocaleDateString('th-TH')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Filter list
  const filteredEquipments = equipments.filter(eq => {
    const assetCode = getAssetCode(eq).toLowerCase();
    const matchesSearch = eq.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          (eq.category || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                          assetCode.includes(searchTerm.toLowerCase());
    
    // Status Tab Filter
    let matchesTab = true;
    if (activeTab === 'available') matchesTab = eq.status === 'พร้อมใช้งาน';
    else if (activeTab === 'repair') matchesTab = eq.status === 'ส่งซ่อม';
    else if (activeTab === 'disposal') matchesTab = eq.status === 'กำลังถูกยืม' || eq.status === 'รอจำหน่าย';
    else if (activeTab === 'missing') matchesTab = eq.status === 'สูญหาย';

    // Dropdown Filters
    const matchesStatus = statusFilter === 'ทั้งหมด' || eq.status === statusFilter;
    const matchesCategory = categoryFilter === 'ทั้งหมด' || eq.category === categoryFilter;
    const matchesDept = departmentFilter === 'ทั้งหมด' || getAssetDepartment(eq) === departmentFilter;

    return matchesSearch && matchesTab && matchesStatus && matchesCategory && matchesDept;
  });

  // Pagination calculations
  const totalPages = Math.max(1, Math.ceil(filteredEquipments.length / pageSize));
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, filteredEquipments.length);
  const paginatedEquipments = filteredEquipments.slice(startIndex, endIndex);

  const isAllPageSelected = paginatedEquipments.length > 0 && paginatedEquipments.every(e => selectedIds.includes(e.id));
  const handleSelectAll = (e) => {
    if (e.target.checked) {
      const pageIds = paginatedEquipments.map(e => e.id);
      setSelectedIds(prev => Array.from(new Set([...prev, ...pageIds])));
    } else {
      const pageIds = new Set(paginatedEquipments.map(e => e.id));
      setSelectedIds(prev => prev.filter(id => !pageIds.has(id)));
    }
  };

  const getPageNumbers = () => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    if (currentPage <= 4) {
      return [1, 2, 3, 4, 5, '...', totalPages];
    }
    if (currentPage >= totalPages - 3) {
      return [1, '...', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
    }
    return [1, '...', currentPage - 1, currentPage, currentPage + 1, '...', totalPages];
  };

  const handleToggleSelect = (id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const selectedEquipments = equipments.filter(e => selectedIds.includes(e.id));

  return (
    <div className="p-6 space-y-6">
      {/* Title & Top Action Buttons (ตามแบบ Image 1) */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-[#002D62] font-heading">ทะเบียนครุภัณฑ์</h1>
          <p className="text-xs text-slate-500 mt-1">จัดการข้อมูลครุภัณฑ์ทั้งหมดขององค์กรอย่างเป็นระบบ</p>
        </div>

        <div className="flex items-center gap-2.5">
          {/* ปุ่ม นำเข้า / ส่งออก */}
          <div className="relative group">
            <button 
              className="bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold py-2.5 px-4 rounded-xl border border-slate-300 shadow-2xs transition flex items-center gap-2 cursor-pointer"
            >
              <span>↓ นำเข้า / ส่งออก</span>
              <span className="text-[10px]">▾</span>
            </button>
            <div className="absolute right-0 mt-1 w-52 bg-white border border-slate-200 rounded-xl shadow-xl py-1 text-xs hidden group-hover:block z-20">
              {canManage && onOpenImport && (
                <button onClick={onOpenImport} className="w-full text-left px-4 py-2 hover:bg-emerald-50 text-emerald-700 font-semibold flex items-center gap-2 cursor-pointer border-b border-slate-100">
                  <span>📤</span> นำเข้าไฟล์ Excel / CSV
                </button>
              )}
              <button onClick={handleExportCSV} className="w-full text-left px-4 py-2 hover:bg-slate-50 text-slate-700 flex items-center gap-2 cursor-pointer">
                <span>📥</span> ส่งออกข้อมูล CSV
              </button>
              {canPrintTags && (
                <>
                  <button onClick={() => onOpenBatchPrint(filteredEquipments)} className="w-full text-left px-4 py-2 hover:bg-slate-50 text-slate-700 flex items-center gap-2">
                    <span>🖨️</span> พิมพ์ป้ายทั้งหมด ({filteredEquipments.length})
                  </button>
                  {selectedIds.length > 0 && (
                    <button onClick={() => onOpenBatchPrint(selectedEquipments)} className="w-full text-left px-4 py-2 hover:bg-blue-50 text-[#005691] font-semibold flex items-center gap-2">
                      <span>🏷️</span> พิมพ์ป้ายที่เลือก ({selectedIds.length})
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

          {/* ปุ่ม เพิ่มครุภัณฑ์ (PSU Blue Accent) — แสดงเฉพาะหน้า รับเข้าครุภัณฑ์ */}
          {canManage && allowAdd && (
            <button 
              onClick={() => setIsAddModalOpen(true)}
              className="bg-[#005691] hover:bg-[#003B71] text-white text-xs font-bold py-2.5 px-4 rounded-xl shadow-sm transition flex items-center gap-2 cursor-pointer"
            >
              <span>+ เพิ่มครุภัณฑ์</span>
            </button>
          )}
        </div>
      </div>

      {/* Tabs ตัวกรองสถานะหลัก (ตามแบบ Image 1) */}
      <div className="border-b border-slate-200 flex gap-8 text-xs font-semibold">
        <button 
          onClick={() => setActiveTab('all')}
          className={`pb-3 transition flex items-center gap-1.5 cursor-pointer ${
            activeTab === 'all' 
              ? 'text-[#005691] border-b-2 border-[#005691] font-bold' 
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <span>ทั้งหมด</span>
          <span className="text-slate-400 font-normal">({totalCount})</span>
        </button>

        <button 
          onClick={() => setActiveTab('available')}
          className={`pb-3 transition flex items-center gap-1.5 cursor-pointer ${
            activeTab === 'available' 
              ? 'text-[#005691] border-b-2 border-[#005691] font-bold' 
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <span>พร้อมใช้งาน</span>
          <span className="text-slate-400 font-normal">({availableCount})</span>
        </button>

        <button 
          onClick={() => setActiveTab('repair')}
          className={`pb-3 transition flex items-center gap-1.5 cursor-pointer ${
            activeTab === 'repair' 
              ? 'text-[#005691] border-b-2 border-[#005691] font-bold' 
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <span>ซ่อมบำรุง</span>
          <span className="text-slate-400 font-normal">({repairCount})</span>
        </button>

        <button 
          onClick={() => setActiveTab('disposal')}
          className={`pb-3 transition flex items-center gap-1.5 cursor-pointer ${
            activeTab === 'disposal' 
              ? 'text-[#005691] border-b-2 border-[#005691] font-bold' 
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <span>รอจำหน่าย / ยืม</span>
          <span className="text-slate-400 font-normal">({disposalCount})</span>
        </button>

        <button 
          onClick={() => setActiveTab('missing')}
          className={`pb-3 transition flex items-center gap-1.5 cursor-pointer ${
            activeTab === 'missing' 
              ? 'text-red-600 border-b-2 border-red-600 font-bold' 
              : 'text-slate-500 hover:text-red-600'
          }`}
        >
          <span>สูญหาย</span>
          <span className={`font-normal ${missingCount > 0 ? 'text-red-500 font-bold' : 'text-slate-400'}`}>({missingCount})</span>
        </button>
      </div>

      {/* Filter Bar กล่องขาวกลม (ตามแบบ Image 1) */}
      <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-2.5 flex-1">
          {/* ช่องค้นหา */}
          <div className="relative min-w-[240px] flex-1 sm:flex-initial">
            <input 
              type="text" 
              placeholder="ค้นหาชื่อหรือรหัสครุภัณฑ์..." 
              value={searchTerm} 
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 pl-8 text-xs outline-none focus:ring-2 focus:ring-[#005691]"
            />
            <span className="absolute left-2.5 top-2 text-slate-400 text-xs">🔍</span>
          </div>

          {/* หมวดหมู่ทั้งหมด */}
          <select 
            value={categoryFilter} 
            onChange={e => setCategoryFilter(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-700 outline-none cursor-pointer"
          >
            <option value="ทั้งหมด">หมวดหมู่ทั้งหมด ▾</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>

          {/* หน่วยงานทั้งหมด */}
          <select 
            value={departmentFilter} 
            onChange={e => setDepartmentFilter(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-700 outline-none cursor-pointer"
          >
            <option value="ทั้งหมด">หน่วยงานทั้งหมด ▾</option>
            {departments.map(d => <option key={d} value={d}>{d}</option>)}
          </select>

          {/* สถานะทั้งหมด */}
          <select 
            value={statusFilter} 
            onChange={e => setStatusFilter(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-700 outline-none cursor-pointer"
          >
            <option value="ทั้งหมด">สถานะทั้งหมด</option>
            <option value="พร้อมใช้งาน">พร้อมใช้งาน</option>
            <option value="กำลังถูกยืม">กำลังถูกยืม</option>
            <option value="ส่งซ่อม">ส่งซ่อม</option>
            <option value="รอจำหน่าย">รอจำหน่าย</option>
            <option value="สูญหาย">สูญหาย</option>
          </select>
        </div>

        {/* จำนวนรายการ */}
        <div className="text-slate-400 text-xs font-medium">
          {filteredEquipments.length} รายการ
        </div>
      </div>

      {/* Data Table ตามแบบ Image 1 */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100 text-xs">
            <thead className="bg-slate-50 text-slate-400 uppercase font-semibold">
              <tr>
                <th className="px-4 py-3.5 text-center w-10">
                  <input 
                    type="checkbox" 
                    onChange={handleSelectAll}
                    checked={filteredEquipments.length > 0 && isAllPageSelected}
                    className="rounded text-[#005691] focus:ring-[#005691] cursor-pointer" 
                  />
                </th>
                <th className="px-3 py-3.5 text-center font-semibold w-10">ลำดับ</th>
                <th className="px-4 py-3.5 text-left font-semibold">รหัสครุภัณฑ์</th>
                <th className="px-4 py-3.5 text-left font-semibold">ชื่อครุภัณฑ์ / หมวดหมู่</th>
                <th className="px-4 py-3.5 text-left font-semibold">ยี่ห้อ</th>
                <th className="px-4 py-3.5 text-left font-semibold">หน่วยงาน</th>
                <th className="px-4 py-3.5 text-left font-semibold">สถานที่</th>
                <th className="px-4 py-3.5 text-left font-semibold">Serial No.</th>
                <th className="px-4 py-3.5 text-center font-semibold">ปีงบประมาณ</th>
                <th className="px-4 py-3.5 text-left font-semibold">มูลค่า (บาท)</th>
                <th className="px-4 py-3.5 text-left font-semibold">สถานะ</th>
                <th className="px-4 py-3.5 text-center font-semibold">ซ่อม</th>
                {canPrintTags && <th className="px-4 py-3.5 text-center font-semibold">ป้ายรหัส & พิมพ์</th>}
                <th className="px-4 py-3.5 text-center font-semibold">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {paginatedEquipments.map((eq, idx) => {
                const assetCode = getAssetCode(eq);
                const isSelected = selectedIds.includes(eq.id);
                const price = getAssetPrice(eq);
                const dept = getAssetDepartment(eq);

                return (
                  <tr key={eq.id} className={`hover:bg-slate-50/80 transition ${isSelected ? 'bg-sky-50/60' : ''}`}>
                    <td className="px-4 py-3.5 text-center">
                      <input 
                        type="checkbox" 
                        checked={isSelected}
                        onChange={() => handleToggleSelect(eq.id)}
                        className="rounded text-[#005691] focus:ring-[#005691] cursor-pointer" 
                      />
                    </td>

                    {/* ลำดับที่ */}
                    <td className="px-3 py-3.5 text-center text-slate-500 font-mono text-[11px]">
                      {startIndex + idx + 1}
                    </td>

                    {/* รหัสครุภัณฑ์ (PSU Blue Highlight) */}
                    <td className="px-4 py-3.5 whitespace-nowrap font-mono font-bold text-[#005691]">
                      {assetCode}
                    </td>

                    {/* ชื่อครุภัณฑ์ / หมวดหมู่ */}
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <div className="font-bold text-slate-800 text-sm">{eq.name}</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        {eq.category}
                      </div>
                    </td>

                    {/* ยี่ห้อ */}
                    <td className="px-4 py-3.5 whitespace-nowrap font-medium text-slate-700">
                      {eq.brand || '-'}
                    </td>

                    {/* หน่วยงาน */}
                    <td className="px-4 py-3.5 whitespace-nowrap text-slate-600 font-medium">
                      {dept}
                    </td>

                    {/* สถานที่ */}
                    <td className="px-4 py-3.5 whitespace-nowrap text-slate-600 text-[11px]">
                      {eq.location || '-'}
                    </td>

                    {/* Serial No. */}
                    <td className="px-4 py-3.5 whitespace-nowrap font-mono text-slate-700 text-[11px]">
                      {eq.serial_no || '-'}
                    </td>

                    {/* ปีงบประมาณ */}
                    <td className="px-4 py-3.5 whitespace-nowrap text-center font-bold text-[#005691] text-xs">
                      {eq.fiscal_year || '2570'}
                    </td>

                    {/* มูลค่า (บาท) */}
                    <td className="px-4 py-3.5 whitespace-nowrap font-semibold text-slate-700">
                      {price.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                    </td>

                    {/* สถานะ */}
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold inline-flex items-center gap-1 ${
                        eq.status === 'พร้อมใช้งาน' 
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                        eq.status === 'ส่งซ่อม' 
                          ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                        eq.status === 'สูญหาย'
                          ? 'bg-red-50 text-red-700 border border-red-200 font-bold' :
                        eq.status === 'กำลังถูกยืม'
                          ? 'bg-sky-50 text-sky-700 border border-sky-200' :
                        'bg-slate-100 text-slate-600 border border-slate-200'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${
                          eq.status === 'พร้อมใช้งาน' ? 'bg-emerald-500' : eq.status === 'ส่งซ่อม' ? 'bg-amber-500' : eq.status === 'สูญหาย' ? 'bg-red-500' : eq.status === 'กำลังถูกยืม' ? 'bg-sky-500' : 'bg-slate-400'
                        }`}></span>
                        <span>{eq.status}</span>
                      </span>
                    </td>

                    {/* จำนวนการซ่อม */}
                    <td className="px-4 py-3.5 text-center whitespace-nowrap">
                      <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                        (eq.repair_count || 0) > 0 
                          ? 'bg-amber-50 text-amber-700 border border-amber-200' 
                          : 'bg-slate-50 text-slate-400 border border-slate-200'
                      }`}>
                        {eq.repair_count || 0} ครั้ง
                      </span>
                    </td>

                    {/* ป้ายรหัส QR & Barcode (ซ่อนสำหรับผู้ใช้งานทั่วไป Viewer) */}
                    {canPrintTags && (
                      <td className="px-4 py-3.5 text-center whitespace-nowrap">
                        <button 
                          onClick={() => onOpenSingleTag(eq)} 
                          className="bg-sky-50 hover:bg-sky-100 text-[#005691] font-semibold px-2.5 py-1.5 rounded-lg border border-sky-200 transition text-[11px] flex items-center gap-1 mx-auto cursor-pointer"
                          title="ดูป้ายทะเบียนครุภัณฑ์พร้อม QR Code และ Barcode"
                        >
                          <span>🏷️</span>
                          <span>ป้ายรหัส & พิมพ์</span>
                        </button>
                      </td>
                    )}

                    {/* จัดการ */}
                    <td className="px-4 py-3.5 text-center whitespace-nowrap text-slate-400 relative">
                      <div className="inline-flex items-center gap-1">
                        <button
                          onClick={() => openAssetDetailModal(eq, false)}
                          className="bg-sky-50 hover:bg-sky-100 text-[#005691] border border-sky-200 font-semibold px-2.5 py-1.5 rounded-lg text-[11px] cursor-pointer"
                        >
                          👁️ ดูรายละเอียด
                        </button>
                        <button 
                          onClick={() => setActionMenuId(actionMenuId === eq.id ? null : eq.id)}
                          className="p-1 hover:text-slate-700 rounded transition cursor-pointer text-sm font-bold"
                          title="ตัวเลือกเพิ่มเติม"
                        >
                          •••
                        </button>
                      </div>

                      {actionMenuId === eq.id && (
                        <div className="absolute right-4 mt-1 w-36 bg-white border border-slate-200 rounded-xl shadow-xl py-1 text-xs text-left z-20">
                          {canManage && (
                            <button 
                              onClick={() => { openAssetDetailModal(eq, true); setActionMenuId(null); }}
                              className="w-full px-3 py-1.5 hover:bg-slate-50 text-slate-700 flex items-center gap-1.5 cursor-pointer"
                            >
                              <span>✏️</span> แก้ไขรายละเอียด
                            </button>
                          )}
                          <Link 
                            to="/repairs"
                            onClick={() => setActionMenuId(null)}
                            className="w-full px-3 py-1.5 hover:bg-slate-50 text-slate-700 flex items-center gap-1.5 cursor-pointer"
                          >
                            <span>🔧</span> ส่งแจ้งซ่อม
                          </Link>
                          {canPrintTags && (
                            <button 
                              onClick={() => { onOpenSingleTag(eq); setActionMenuId(null); }}
                              className="w-full px-3 py-1.5 hover:bg-slate-50 text-slate-700 flex items-center gap-1.5 cursor-pointer"
                            >
                              <span>🖨️</span> พิมพ์ป้าย
                            </button>
                          )}
                          {isAdmin && (
                            <button 
                              onClick={() => { handleDelete(eq.id); setActionMenuId(null); }}
                              className="w-full px-3 py-1.5 hover:bg-red-50 text-red-600 flex items-center gap-1.5 cursor-pointer"
                            >
                              <span>🗑️</span> ลบรายการ
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filteredEquipments.length === 0 && (
                <tr>
                  <td colSpan="14" className="px-6 py-12 text-center text-slate-400 text-xs">
                    🔍 ไม่พบครุภัณฑ์ที่ตรงกับเงื่อนไขการค้นหา
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="px-6 py-4 border-t border-slate-100 flex flex-col sm:flex-row justify-between items-center text-xs text-slate-500 gap-3">
          <div className="flex items-center gap-3">
            <div>
              แสดง <span className="font-bold text-slate-700">{filteredEquipments.length === 0 ? 0 : startIndex + 1}-{endIndex}</span> จาก <span className="font-bold text-slate-700">{filteredEquipments.length}</span> รายการ
              {filteredEquipments.length !== equipments.length && (
                <span className="text-slate-400 ml-1">(กรองจากทั้งหมด {equipments.length} รายการ)</span>
              )}
            </div>
            <div className="flex items-center gap-1.5 pl-3 border-l border-slate-200">
              <span className="text-slate-400 text-[11px]">หน้าละ:</span>
              <select
                value={pageSize}
                onChange={e => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-700 outline-none cursor-pointer"
              >
                <option value={10}>10 รายการ</option>
                <option value={25}>25 รายการ</option>
                <option value={50}>50 รายการ</option>
                <option value={100}>100 รายการ</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="px-2.5 py-1 border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition"
              title="หน้าก่อนหน้า"
            >
              ‹
            </button>

            {getPageNumbers().map((p, idx) => (
              p === '...' ? (
                <span key={`ellipsis-${idx}`} className="px-2 py-1 text-slate-400">...</span>
              ) : (
                <button
                  key={p}
                  type="button"
                  onClick={() => setCurrentPage(p)}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                    currentPage === p
                      ? 'bg-[#005691] text-white shadow-xs'
                      : 'border border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {p}
                </button>
              )
            ))}

            <button
              type="button"
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              className="px-2.5 py-1 border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition"
              title="หน้าถัดไป"
            >
              ›
            </button>
          </div>
        </div>
      </div>

      {/* Modal เพิ่มครุภัณฑ์ใหม่ตาม 5 ขั้นตอน */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="bg-[#071d36] text-white p-4 px-6 flex justify-between items-center">
              <div>
                <h3 className="font-extrabold text-base flex items-center gap-2">
                  <span>📦</span> ขั้นตอนการเพิ่มครุภัณฑ์
                </h3>
                <p className="text-[11px] text-sky-300 mt-0.5">กรอกข้อมูล 5 ขั้นตอนเพื่อบันทึกและสร้างรหัสครุภัณฑ์</p>
              </div>
              <button 
                onClick={() => setIsAddModalOpen(false)} 
                className="text-slate-400 hover:text-white font-bold p-1 rounded-lg text-lg transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateAsset} className="p-6 space-y-4 text-xs max-h-[80vh] overflow-y-auto">
              
              {/* 1. เลือกหมวดหมู่ */}
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-2">
                <label className="block font-bold text-slate-800 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-full bg-[#005691] text-white flex items-center justify-center text-[10px] font-bold">1</span>
                    <span>เลือกหมวดหมู่</span>
                  </span>
                  <span className="text-[10px] text-slate-400 font-normal">กำหนดรหัสหมวดหมู่เริ่มต้น</span>
                </label>
                <select 
                  value={addForm.category} 
                  onChange={e => {
                    const selName = e.target.value;
                    const found = CATEGORY_LIST.find(c => c.name === selName);
                    setAddForm({
                      ...addForm, 
                      category: selName,
                      categoryCode: found ? found.code : 'IT'
                    });
                  }}
                  className="w-full border border-slate-300 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-[#005691] bg-white font-semibold text-slate-800"
                >
                  {CATEGORY_LIST.map(cat => (
                    <option key={cat.code} value={cat.name}>
                      [{cat.code}] {cat.name}
                    </option>
                  ))}
                </select>

                {/* รหัสครุภัณฑ์ Preview */}
                <div className="flex items-center justify-between pt-1 text-[11px] bg-white p-2 rounded-lg border border-slate-200">
                  <span className="text-slate-600">รหัสครุภัณฑ์ที่จะได้รับ:</span>
                  <span className="font-mono font-extrabold text-sm text-[#005691] px-2 py-0.5 rounded bg-sky-50 border border-sky-200">
                    {(addForm.customCode || '').trim() || `${addForm.categoryCode}s${String(equipments.length + 1).padStart(3, '0')}`}
                  </span>
                </div>
              </div>

              {/* 2. ใส่ชื่อ */}
              <div>
                <label className="block font-bold text-slate-800 mb-1 flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-[#005691] text-white flex items-center justify-center text-[10px] font-bold">2</span>
                  <span>ใส่ชื่อครุภัณฑ์</span>
                  <span className="text-red-500">*</span>
                </label>
                <input 
                  type="text" required placeholder="เช่น Dell OptiPlex 7020, โน้ตบุ๊ก ThinkPad, จอภาพ LED 27 นิ้ว..."
                  value={addForm.name} onChange={e => setAddForm({...addForm, name: e.target.value})}
                  className="w-full border border-slate-300 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-[#005691] text-xs"
                />
              </div>

              {/* 3. ใส่ยี่ห้อ */}
              <div>
                <label className="block font-bold text-slate-800 mb-1 flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-[#005691] text-white flex items-center justify-center text-[10px] font-bold">3</span>
                  <span>ใส่ยี่ห้อ</span>
                  <span className="text-red-500">*</span>
                </label>
                <input 
                  type="text" required placeholder="เช่น Dell, HP, Apple, Canon, Epson, Daikin, Modernform..."
                  value={addForm.brand} onChange={e => setAddForm({...addForm, brand: e.target.value})}
                  className="w-full border border-slate-300 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-[#005691] text-xs"
                />
              </div>

              {/* 4. เลือกหน่วยงานรับผิดชอบ */}
              <div>
                <label className="block font-bold text-slate-800 mb-1 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-full bg-[#005691] text-white flex items-center justify-center text-[10px] font-bold">4</span>
                    <span>เลือกหน่วยงานรับผิดชอบ</span>
                    <span className="text-red-500">*</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowDeptManager(!showDeptManager)}
                    className="text-[11px] text-[#005691] hover:underline font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    ⚙️ จัดการหน่วยงานเอง
                  </button>
                </label>

                {/* Department Manager Panel */}
                {showDeptManager && (
                  <div className="mb-2 border border-slate-200 rounded-xl p-3 bg-slate-50 space-y-2">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">จัดการรายการหน่วยงาน/แผนก</p>
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {departments.map((d, i) => (
                        <div key={i} className="flex items-center justify-between gap-2 text-xs bg-white px-2 py-1 rounded border border-slate-100">
                          <span className="flex-1 truncate">{d}</span>
                          <button
                            type="button"
                            onClick={() => {
                              const updated = departments.filter((_, idx) => idx !== i);
                              setDepartments(updated);
                              if (addForm.department === d) setAddForm({ ...addForm, department: updated[0] || '' });
                            }}
                            className="text-red-500 hover:text-red-700 text-[11px] shrink-0 font-bold cursor-pointer"
                          >
                            ✕ ลบ
                          </button>
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-2 pt-1">
                      <input
                        type="text"
                        placeholder="พิมพ์ชื่อหน่วยงานใหม่..."
                        value={newDeptName}
                        onChange={e => setNewDeptName(e.target.value)}
                        className="flex-1 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:ring-1 focus:ring-[#005691]"
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            const trimmed = newDeptName.trim();
                            if (trimmed && !departments.includes(trimmed)) {
                              setDepartments([...departments, trimmed]);
                              setAddForm({ ...addForm, department: trimmed });
                              setNewDeptName('');
                            }
                          }
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const trimmed = newDeptName.trim();
                          if (trimmed && !departments.includes(trimmed)) {
                            setDepartments([...departments, trimmed]);
                            setAddForm({ ...addForm, department: trimmed });
                            setNewDeptName('');
                          }
                        }}
                        className="px-3 py-1.5 bg-[#005691] hover:bg-[#003B71] text-white rounded-lg text-xs font-bold cursor-pointer"
                      >
                        + เพิ่ม
                      </button>
                    </div>
                  </div>
                )}

                <select
                  value={addForm.department} onChange={e => setAddForm({...addForm, department: e.target.value})}
                  className="w-full border border-slate-300 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-[#005691] bg-white font-medium text-slate-800"
                >
                  {departments.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>

              {/* 5. ใส่ราคา */}
              <div>
                <label className="block font-bold text-slate-800 mb-1 flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-[#005691] text-white flex items-center justify-center text-[10px] font-bold">5</span>
                  <span>ใส่ราคา (บาท)</span>
                  <span className="text-red-500">*</span>
                </label>
                <input 
                  type="number" required placeholder="เช่น 32500" min="0" step="any"
                  value={addForm.price} onChange={e => setAddForm({...addForm, price: e.target.value})}
                  className="w-full border border-slate-300 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-[#005691] text-xs font-semibold"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button 
                  type="button" 
                  onClick={() => setIsAddModalOpen(false)} 
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-medium transition cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button 
                  type="submit" 
                  className="px-5 py-2.5 bg-[#005691] hover:bg-[#003B71] text-white rounded-xl font-bold shadow-md hover:shadow-lg transition cursor-pointer flex items-center gap-1.5"
                >
                  <span>✓</span>
                  <span>บันทึกรับเข้าครุภัณฑ์</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal รายละเอียดการจัดซื้อและทะเบียนคุมครุภัณฑ์ (แสดงในหน้าทะเบียนครุภัณฑ์) */}
      {detailEq && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-4xl w-full shadow-2xl overflow-hidden border border-slate-200">
            <div className="bg-[#071d36] text-white p-4 px-6 flex justify-between items-center">
              <div>
                <h3 className="font-extrabold text-base flex items-center gap-2">
                  <span>📑</span>
                  <span>{isEditingDetail ? 'แก้ไขรายละเอียดการจัดซื้อและทะเบียนคุมครุภัณฑ์' : 'รายละเอียดการจัดซื้อและทะเบียนคุมครุภัณฑ์'}</span>
                </h3>
                <p className="text-[11px] text-sky-300 mt-0.5">
                  [{getAssetCode(detailEq)}] {detailEq.name} — สำนักทรัพยากรการเรียนรู้คุณหญิงหลง อรรถกระวีสุนทร
                </p>
              </div>
              <div className="flex items-center gap-2">
                {!isEditingDetail && (
                  <Link
                    to="/repairs"
                    onClick={() => setDetailEq(null)}
                    className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg cursor-pointer flex items-center gap-1"
                  >
                    <span>🔧</span> ส่งแจ้งซ่อม
                  </Link>
                )}
                {!isEditingDetail && canManage && (
                  <button
                    type="button"
                    onClick={() => setIsEditingDetail(true)}
                    className="bg-sky-500 hover:bg-sky-600 text-white text-xs font-bold px-3 py-1.5 rounded-lg cursor-pointer"
                  >
                    ✏️ แก้ไขข้อมูล
                  </button>
                )}
                <button onClick={() => setDetailEq(null)} className="text-slate-400 hover:text-white font-bold p-1 text-lg cursor-pointer">✕</button>
              </div>
            </div>

            <form onSubmit={handleSaveAssetDetail} className="p-6 space-y-6 text-xs max-h-[80vh] overflow-y-auto">
              <div className="space-y-3">
                <h4 className="font-extrabold text-[#002D62] border-b border-slate-200 pb-1.5">
                  1. ข้อมูลครุภัณฑ์และหน่วยงานผู้ใช้
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">รหัสครุภัณฑ์</label>
                    <input type="text" disabled={!isEditingDetail} value={detailForm.code} onChange={e => setDetailForm({ ...detailForm, code: e.target.value })}
                      className="w-full border border-slate-300 rounded-xl p-2 font-mono font-bold bg-slate-50" />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">ชื่อครุภัณฑ์</label>
                    <input type="text" disabled={!isEditingDetail} value={detailForm.name} onChange={e => setDetailForm({ ...detailForm, name: e.target.value })}
                      className="w-full border border-slate-300 rounded-xl p-2" />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">ประเภทครุภัณฑ์</label>
                    <input type="text" disabled={!isEditingDetail} value={detailForm.category} onChange={e => setDetailForm({ ...detailForm, category: e.target.value })}
                      className="w-full border border-slate-300 rounded-xl p-2" />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">ยี่ห้อ</label>
                    <input type="text" disabled={!isEditingDetail} value={detailForm.brand} onChange={e => setDetailForm({ ...detailForm, brand: e.target.value })}
                      className="w-full border border-slate-300 rounded-xl p-2" />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">SERIAL_NO</label>
                    <input type="text" disabled={!isEditingDetail} value={detailForm.serial_no} onChange={e => setDetailForm({ ...detailForm, serial_no: e.target.value })}
                      className="w-full border border-slate-300 rounded-xl p-2 font-mono" />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">ทะเบียนรถจัดส่ง (แยกตามปีงบประมาณ)</label>
                    <DeliveryTruckSelect
                      fiscalYear={detailForm.fiscal_year || '2570'}
                      value={detailForm.license_plate}
                      onChange={val => setDetailForm({ ...detailForm, license_plate: val })}
                      deliveryTrucks={deliveryTrucks}
                      onTruckAdded={fetchAllData}
                      disabled={!isEditingDetail}
                    />
                  </div>
                  <div className="sm:col-span-3">
                    <label className="block font-bold text-slate-700 mb-1">รายละเอียดครุภัณฑ์ (คุณลักษณะเฉพาะ)</label>
                    <input type="text" disabled={!isEditingDetail} value={detailForm.details} onChange={e => setDetailForm({ ...detailForm, details: e.target.value })}
                      placeholder="ระบุรุ่น สเปก หรือรายละเอียดเพิ่มเติม..." className="w-full border border-slate-300 rounded-xl p-2" />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">รหัสส่วนงาน</label>
                    <input type="text" disabled={!isEditingDetail} value={detailForm.dept_code} onChange={e => setDetailForm({ ...detailForm, dept_code: e.target.value })}
                      className="w-full border border-slate-300 rounded-xl p-2 font-mono" />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">ชื่อส่วนงาน</label>
                    <input type="text" disabled={!isEditingDetail} value={detailForm.department} onChange={e => setDetailForm({ ...detailForm, department: e.target.value })}
                      className="w-full border border-slate-300 rounded-xl p-2" />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">สถานที่ใช้งาน</label>
                    <input type="text" disabled={!isEditingDetail} value={detailForm.location} onChange={e => setDetailForm({ ...detailForm, location: e.target.value })}
                      className="w-full border border-slate-300 rounded-xl p-2" />
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="font-extrabold text-[#002D62] border-b border-slate-200 pb-1.5">
                  2. ราคาและค่าใช้จ่ายในการจัดซื้อ
                </h4>
                <div className="bg-sky-50 border border-sky-200 rounded-xl px-3.5 py-2.5 text-[11px] text-sky-800">
                  <span className="font-bold">หมายเหตุ:</span> ค่าขนส่ง / ค่าติดตั้ง / ค่าใช้จ่ายอื่น คือ <span className="font-semibold">ต้นทุนเริ่มแรกต่อหน่วย</span> เพื่อนำมารวมเป็นราคาทุนสินทรัพย์สำหรับคำนวณค่าเสื่อมราคา — หากรวมอยู่ในราคาต่อหน่วยแล้ว ให้ใส่ <span className="font-mono font-bold">0</span> ตามปกติ
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">ราคาต่อหน่วย (บาท)</label>
                    <input type="number" step="any" disabled={!isEditingDetail} value={detailForm.price} onChange={e => setDetailForm({ ...detailForm, price: e.target.value })}
                      className="w-full border border-slate-300 rounded-xl p-2 font-bold text-[#005691]" />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">ค่าขนส่ง (บาท)</label>
                    <input type="number" step="any" disabled={!isEditingDetail} value={detailForm.shipping_cost} onChange={e => setDetailForm({ ...detailForm, shipping_cost: e.target.value })}
                      className="w-full border border-slate-300 rounded-xl p-2" />
                    <p className="text-[10px] text-slate-400 mt-1">ต้นทุนเริ่มแรก / ถ้ารวมแล้วใส่ 0</p>
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">ค่าติดตั้ง (บาท)</label>
                    <input type="number" step="any" disabled={!isEditingDetail} value={detailForm.installation_cost} onChange={e => setDetailForm({ ...detailForm, installation_cost: e.target.value })}
                      className="w-full border border-slate-300 rounded-xl p-2" />
                    <p className="text-[10px] text-slate-400 mt-1">ต้นทุนเริ่มแรก / ถ้ารวมแล้วใส่ 0</p>
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">ค่าใช้จ่ายอื่น (บาท)</label>
                    <input type="number" step="any" disabled={!isEditingDetail} value={detailForm.other_cost} onChange={e => setDetailForm({ ...detailForm, other_cost: e.target.value })}
                      className="w-full border border-slate-300 rounded-xl p-2" />
                    <p className="text-[10px] text-slate-400 mt-1">ต้นทุนเริ่มแรก / ถ้ารวมแล้วใส่ 0</p>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="font-extrabold text-[#002D62] border-b border-slate-200 pb-1.5">
                  3. รายละเอียดการจัดซื้อ แหล่งเงิน และสัญญา
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">ปีงบประมาณ</label>
                    <input type="text" disabled={!isEditingDetail} value={detailForm.fiscal_year} onChange={e => setDetailForm({ ...detailForm, fiscal_year: e.target.value })}
                      className="w-full border border-slate-300 rounded-xl p-2" />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">รหัสแหล่งเงิน</label>
                    <input type="text" disabled={!isEditingDetail} value={detailForm.fund_code} onChange={e => setDetailForm({ ...detailForm, fund_code: e.target.value })}
                      className="w-full border border-slate-300 rounded-xl p-2 font-mono" />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">แหล่งเงิน</label>
                    <input type="text" disabled={!isEditingDetail} value={detailForm.fund_source} onChange={e => setDetailForm({ ...detailForm, fund_source: e.target.value })}
                      className="w-full border border-slate-300 rounded-xl p-2" />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">เลขที่ใบเบิก</label>
                    <input type="text" disabled={!isEditingDetail} value={detailForm.requisition_no} onChange={e => setDetailForm({ ...detailForm, requisition_no: e.target.value })}
                      className="w-full border border-slate-300 rounded-xl p-2" />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">วันที่ใบเบิกครุภัณฑ์</label>
                    <input type="date" disabled={!isEditingDetail} value={detailForm.requisition_date} onChange={e => setDetailForm({ ...detailForm, requisition_date: e.target.value })}
                      className="w-full border border-slate-300 rounded-xl p-2" />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">วิธีการจัดซื้อ</label>
                    <select disabled={!isEditingDetail} value={detailForm.purchase_method} onChange={e => setDetailForm({ ...detailForm, purchase_method: e.target.value })}
                      className="w-full border border-slate-300 rounded-xl p-2 bg-white">
                      <option value="เฉพาะเจาะจง">เฉพาะเจาะจง</option>
                      <option value="ประกวดราคาอิเล็กทรอนิกส์ (e-bidding)">ประกวดราคาอิเล็กทรอนิกส์ (e-bidding)</option>
                      <option value="ตลาดอิเล็กทรอนิกส์ (e-market)">ตลาดอิเล็กทรอนิกส์ (e-market)</option>
                      <option value="คัดเลือก">คัดเลือก</option>
                      <option value="รับบริจาค/โอน">รับบริจาค/โอน</option>
                    </select>
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">เลขที่เอกสารขออนุมัติซื้อ</label>
                    <input type="text" disabled={!isEditingDetail} value={detailForm.purchase_approval_no} onChange={e => setDetailForm({ ...detailForm, purchase_approval_no: e.target.value })}
                      className="w-full border border-slate-300 rounded-xl p-2" />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">วันที่เอกสารขออนุมัติซื้อ</label>
                    <input type="date" disabled={!isEditingDetail} value={detailForm.purchase_approval_date} onChange={e => setDetailForm({ ...detailForm, purchase_approval_date: e.target.value })}
                      className="w-full border border-slate-300 rounded-xl p-2" />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">ซื้อจาก (บริษัท / ห้างหุ้นส่วน / ร้านค้า)</label>
                    <input type="text" disabled={!isEditingDetail} value={detailForm.vendor} onChange={e => setDetailForm({ ...detailForm, vendor: e.target.value })}
                      className="w-full border border-slate-300 rounded-xl p-2" />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">เลขที่เอกสารเบิกจ่าย</label>
                    <input type="text" disabled={!isEditingDetail} value={detailForm.payment_doc_no} onChange={e => setDetailForm({ ...detailForm, payment_doc_no: e.target.value })}
                      className="w-full border border-slate-300 rounded-xl p-2" />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">เลขที่สัญญา / ใบสั่งซื้อ</label>
                    <input type="text" disabled={!isEditingDetail} value={detailForm.contract_no} onChange={e => setDetailForm({ ...detailForm, contract_no: e.target.value })}
                      className="w-full border border-slate-300 rounded-xl p-2 font-mono" />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">วันที่ตรวจรับ</label>
                    <input type="date" disabled={!isEditingDetail} value={detailForm.received_date} onChange={e => setDetailForm({ ...detailForm, received_date: e.target.value })}
                      className="w-full border border-slate-300 rounded-xl p-2" />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">วันเริ่มสัญญา</label>
                    <input type="date" disabled={!isEditingDetail} value={detailForm.contract_start_date} onChange={e => setDetailForm({ ...detailForm, contract_start_date: e.target.value })}
                      className="w-full border border-slate-300 rounded-xl p-2" />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">วันสิ้นสุดสัญญา</label>
                    <input type="date" disabled={!isEditingDetail} value={detailForm.contract_end_date} onChange={e => setDetailForm({ ...detailForm, contract_end_date: e.target.value })}
                      className="w-full border border-slate-300 rounded-xl p-2" />
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="font-extrabold text-[#002D62] border-b border-slate-200 pb-1.5">
                  4. อายุการใช้งาน การรับประกัน และการตัดจำหน่าย
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">อายุการใช้งาน</label>
                    <input type="text" disabled={!isEditingDetail} value={detailForm.useful_life} onChange={e => setDetailForm({ ...detailForm, useful_life: e.target.value })}
                      className="w-full border border-slate-300 rounded-xl p-2" />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">มูลค่าคงเหลือ (บาท)</label>
                    <input type="number" step="any" disabled={!isEditingDetail} value={detailForm.salvage_value} onChange={e => setDetailForm({ ...detailForm, salvage_value: e.target.value })}
                      className="w-full border border-slate-300 rounded-xl p-2" />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">ระยะเวลาประกัน</label>
                    <input type="text" disabled={!isEditingDetail} value={detailForm.warranty_period} onChange={e => setDetailForm({ ...detailForm, warranty_period: e.target.value })}
                      className="w-full border border-slate-300 rounded-xl p-2" />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">วันสิ้นสุดประกัน</label>
                    <input type="date" disabled={!isEditingDetail} value={detailForm.warranty_end_date} onChange={e => setDetailForm({ ...detailForm, warranty_end_date: e.target.value })}
                      className="w-full border border-slate-300 rounded-xl p-2" />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">สถานะ</label>
                    <input type="text" disabled={!isEditingDetail} value={detailForm.status} onChange={e => setDetailForm({ ...detailForm, status: e.target.value })}
                      className="w-full border border-slate-300 rounded-xl p-2" />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">วันที่ตัดจำหน่าย</label>
                    <input type="date" disabled={!isEditingDetail} value={detailForm.disposal_date} onChange={e => setDetailForm({ ...detailForm, disposal_date: e.target.value })}
                      className="w-full border border-slate-300 rounded-xl p-2" />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">เลขที่เอกสารตัดจำหน่าย</label>
                    <input type="text" disabled={!isEditingDetail} value={detailForm.disposal_doc_no} onChange={e => setDetailForm({ ...detailForm, disposal_doc_no: e.target.value })}
                      className="w-full border border-slate-300 rounded-xl p-2" />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">ประวัติการซ่อมแซม</label>
                    <input type="text" disabled value={`${detailEq.repair_count || 0} ครั้ง`}
                      className="w-full border border-slate-200 bg-slate-50 rounded-xl p-2 text-slate-500" />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block font-bold text-slate-700 mb-1">หมายเหตุการตัดจำหน่าย</label>
                    <input type="text" disabled={!isEditingDetail} value={detailForm.disposal_note} onChange={e => setDetailForm({ ...detailForm, disposal_note: e.target.value })}
                      className="w-full border border-slate-300 rounded-xl p-2" />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block font-bold text-slate-700 mb-1">หมายเหตุทั่วไป</label>
                    <input type="text" disabled={!isEditingDetail} value={detailForm.remark} onChange={e => setDetailForm({ ...detailForm, remark: e.target.value })}
                      className="w-full border border-slate-300 rounded-xl p-2" />
                  </div>
                </div>
              </div>

              {/* 5. ประวัติการแก้ไขข้อมูล (Audit Trail) */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between border-b border-slate-200 pb-1.5">
                  <h4 className="font-extrabold text-[#002D62] flex items-center gap-2 text-xs">
                    <span>📝</span>
                    <span>5. ประวัติการแก้ไขข้อมูล (Audit Trail)</span>
                  </h4>
                  <span className="text-[10px] text-slate-400">
                    {auditHistory.length > 0 ? `พบ ${auditHistory.length} รายการ` : 'ยังไม่มีบันทึกประวัติ'}
                  </span>
                </div>

                {loadingHistory ? (
                  <div className="py-4 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
                    <span className="inline-block animate-spin">⏳</span> กำลังโหลดประวัติการแก้ไข...
                  </div>
                ) : auditHistory.length === 0 ? (
                  <div className="bg-slate-50 border border-dashed border-slate-200 rounded-xl p-4 text-center text-slate-400 text-xs">
                    ยังไม่มีประวัติการแก้ไขข้อมูลสำหรับครุภัณฑ์ชิ้นนี้ (ระบบจะบันทึกอัตโนมัติเมื่อมีการแก้ไข)
                  </div>
                ) : (
                  <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                    {auditHistory.map((log) => {
                      const logDate = log.modified_at ? new Date(log.modified_at) : null;
                      const dateStr = logDate 
                        ? logDate.toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' }) + ' ' + 
                          logDate.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + ' น.'
                        : '-';
                      return (
                        <div key={log.id} className="bg-slate-50 hover:bg-slate-100/80 border border-slate-200 rounded-xl p-3 transition text-xs">
                          <div className="flex flex-wrap items-center justify-between gap-1 text-[11px] mb-1">
                            <div className="flex items-center gap-1.5 font-bold text-slate-800">
                              <span className="px-2 py-0.5 rounded-md bg-blue-100 text-blue-800 font-semibold text-[10px]">
                                {log.action || 'แก้ไขข้อมูล'}
                              </span>
                              <span>โดย: <span className="text-[#005691] font-bold">{log.modified_by || 'ผู้ดูแลระบบ'}</span></span>
                            </div>
                            <span className="text-slate-400 font-mono text-[10px]">
                              🕒 {dateStr}
                            </span>
                          </div>
                          <div className="text-slate-600 bg-white p-2 rounded-lg border border-slate-200/80 text-[11px] font-mono leading-relaxed break-words">
                            {log.changes || 'แก้ไขรายละเอียดข้อมูลทั่วไป'}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button type="button" onClick={() => setDetailEq(null)} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-medium cursor-pointer">
                  ปิดหน้าต่าง
                </button>
                {isEditingDetail && (
                  <button type="submit" className="px-5 py-2 bg-[#005691] hover:bg-[#003B71] text-white rounded-xl font-bold shadow-md cursor-pointer">
                    ✓ บันทึกข้อมูล
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// =========================================================================
// 5. หน้ารับเข้าครุภัณฑ์ (RECEIVE PAGE)
// =========================================================================
function ReceivePage({ equipments, categories = [], departmentsData = [], locationsData = [], fiscalYearsData = [], deliveryTrucks = [], fetchAllData, currentUser, onOpenSingleTag, onOpenBatchPrint, onOpenImport }) {
  const isAdmin = currentUser?.role === 'admin';
  const canManage = currentUser?.role === 'admin' || currentUser?.role === 'staff';
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showDeptManager, setShowDeptManager] = useState(false);
  const [newDeptName, setNewDeptName] = useState('');
  const [showLocManager, setShowLocManager] = useState(false);
  const [newLocName, setNewLocName] = useState('');
  const [showFyManager, setShowFyManager] = useState(false);
  const [newFyName, setNewFyName] = useState('');
  const locationOptions = locationsData.length > 0
    ? locationsData.map(l => l.name)
    : ['ห้องเซิร์ฟเวอร์ ชั้น 2'];
  const fiscalYearOptions = Array.from(
    new Set([
      ...fiscalYearsData.map(f => String(f.year)),
      ...equipments.map(e => String(e.fiscal_year || '2570')),
      '2571', '2570', '2569', '2568'
    ].filter(Boolean))
  ).sort().reverse();
  const departments = departmentsData.length > 0
    ? departmentsData.map(d => d.name)
    : ['สำนักทรัพยากรการเรียนรู้คุณหญิงหลง อรรถกระวีสุนทร'];
  const CATEGORY_LIST = categories.length > 0 ? categories : [
    { code: 'IT',  name: 'คอมพิวเตอร์และอุปกรณ์' },
    { code: 'OFF', name: 'เครื่องใช้สำนักงาน' },
    { code: 'AIR', name: 'เครื่องปรับอากาศ' },
    { code: 'AV',  name: 'โสตทัศนูปกรณ์' },
    { code: 'FUR', name: 'เฟอร์นิเจอร์สำนักงาน' },
    { code: 'EL',  name: 'อิเล็กทรอนิกส์' },
    { code: 'GEN', name: 'อื่นๆ' },
  ];
  const [addForm, setAddForm] = useState({
    categoryCode: 'IT', category: 'คอมพิวเตอร์และอุปกรณ์',
    name: '', brand: '', department: 'สำนักทรัพยากรการเรียนรู้คุณหญิงหลง อรรถกระวีสุนทร',
    price: '', serial_no: '', location: 'ห้องเซิร์ฟเวอร์ ชั้น 2', fiscal_year: '2570', license_plate: '', customCode: ''
  });

  const handleAddDeptToApi = async (name) => {
    const t = String(name || '').trim();
    if (!t) return;
    try {
      await axios.post('http://localhost:5000/api/departments', { name: t, building: 'อาคารคุณหญิงหลงฯ' });
      setAddForm(prev => ({ ...prev, department: t }));
      setNewDeptName('');
      await fetchAllData();
    } catch (e) {
      alert('ไม่สามารถเพิ่มหน่วยงานได้');
    }
  };

  const handleDeleteDeptFromApi = async (deptName) => {
    const eqCount = equipments.filter(e => getAssetDepartment(e) === deptName).length;
    if (eqCount > 0) {
      alert(`ไม่สามารถลบหน่วยงาน "${deptName}" ได้ เนื่องจากยังมีครุภัณฑ์สังกัดอยู่ ${eqCount} รายการ กรุณาโอนย้ายครุภัณฑ์ไปยังหน่วยงานอื่นก่อน`);
      return;
    }
    const found = departmentsData.find(d => d.name === deptName);
    if (!found) return;
    if (!window.confirm(`ยืนยันการลบหน่วยงาน "${deptName}" ?`)) return;
    try {
      await axios.delete(`http://localhost:5000/api/departments/${found.id}`);
      await fetchAllData();
    } catch (e) {
      alert(e.response?.data?.error || 'ไม่สามารถลบหน่วยงานได้');
    }
  };

  const handleCreateAsset = async (e) => {
    e.preventDefault();
    try {
      const nextSeq = String(equipments.length + 1).padStart(3, '0');
      const finalCode = (addForm.customCode || '').trim() || `${addForm.categoryCode}s${nextSeq}`;
      await axios.post('http://localhost:5000/api/equipments', {
        code: finalCode, name: addForm.name, category: addForm.category,
        brand: addForm.brand, department: addForm.department,
        price: parseFloat(addForm.price) || 0,
        serial_no: addForm.serial_no, location: addForm.location,
        fiscal_year: addForm.fiscal_year || '2570',
        license_plate: addForm.license_plate || '',
        status: 'พร้อมใช้งาน',
        modified_by: currentUser?.full_name || currentUser?.username || 'ผู้ดูแลระบบ'
      });
      setIsAddModalOpen(false);
      setAddForm({ categoryCode: 'IT', category: 'คอมพิวเตอร์และอุปกรณ์', name: '', brand: '',
        department: departments[0] || '', price: '', serial_no: '', location: 'ห้องเซิร์ฟเวอร์ ชั้น 2', fiscal_year: addForm.fiscal_year || '2570', license_plate: '', customCode: '' });
      fetchAllData();
    } catch (err) { alert('เกิดข้อผิดพลาดในการเพิ่มครุภัณฑ์'); }
  };

  const recentEquipments = [...equipments]
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .filter(eq => !searchTerm ||
      eq.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      getAssetCode(eq).toLowerCase().includes(searchTerm.toLowerCase()) ||
      (eq.serial_no || '').toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-[#002D62]">📥 รับเข้าครุภัณฑ์</h1>
          <p className="text-xs text-slate-500 mt-1">บันทึกการรับครุภัณฑ์ใหม่เข้าสู่ระบบ ม.อ. — สร้างรหัสและป้ายอัตโนมัติ</p>
        </div>
        {canManage && (
          <div className="flex items-center gap-2.5 flex-wrap">
            {onOpenImport && (
              <button onClick={onOpenImport}
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold py-3 px-5 rounded-xl shadow-md transition flex items-center gap-2 cursor-pointer">
                <span>📤</span><span>นำเข้า Excel / CSV</span>
              </button>
            )}
            <button onClick={() => setIsAddModalOpen(true)}
              className="bg-[#005691] hover:bg-[#003B71] text-white text-sm font-bold py-3 px-6 rounded-xl shadow-md transition flex items-center gap-2 cursor-pointer">
              <span className="text-lg">+</span><span>เพิ่มครุภัณฑ์ใหม่</span>
            </button>
          </div>
        )}
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs border-l-4 border-l-[#005691]">
          <div className="text-xs text-slate-500 font-semibold">รับเข้าทั้งหมด</div>
          <div className="text-2xl font-extrabold text-[#002D62] mt-1">{equipments.length} <span className="text-xs font-normal text-slate-400">รายการ</span></div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs border-l-4 border-l-emerald-500">
          <div className="text-xs text-emerald-700 font-semibold">พร้อมใช้งาน</div>
          <div className="text-2xl font-extrabold text-slate-800 mt-1">{equipments.filter(e => e.status === 'พร้อมใช้งาน').length} <span className="text-xs font-normal text-slate-400">รายการ</span></div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs border-l-4 border-l-amber-500">
          <div className="text-xs text-amber-700 font-semibold">รับเข้าเดือนนี้</div>
          <div className="text-2xl font-extrabold text-slate-800 mt-1">
            {equipments.filter(e => { const d = new Date(e.created_at); const n = new Date(); return d.getMonth()===n.getMonth()&&d.getFullYear()===n.getFullYear(); }).length}
            <span className="text-xs font-normal text-slate-400"> รายการ</span>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs border-l-4 border-l-sky-500">
          <div className="text-xs text-sky-700 font-semibold">รับเข้าล่าสุด</div>
          <div className="text-sm font-bold text-slate-700 mt-1 truncate">{recentEquipments[0]?.name || '-'}</div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between gap-3">
          <div className="relative flex-1 max-w-sm">
            <input type="text" placeholder="ค้นหาชื่อ, รหัส, Serial No..."
              value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 pl-9 text-xs outline-none focus:ring-2 focus:ring-[#005691] transition" />
            <span className="absolute left-3 top-2.5 text-slate-400 text-xs">🔍</span>
          </div>
          <span className="text-xs text-slate-400">{recentEquipments.length} รายการ</span>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100 text-xs">
            <thead className="bg-slate-50 text-slate-400 uppercase font-semibold">
              <tr>
                <th className="px-4 py-3 text-center w-10">ลำดับ</th>
                <th className="px-4 py-3 text-left">รหัสครุภัณฑ์</th>
                <th className="px-4 py-3 text-left">ชื่อครุภัณฑ์</th>
                <th className="px-4 py-3 text-left">หมวดหมู่</th>
                <th className="px-4 py-3 text-left">ยี่ห้อ</th>
                <th className="px-4 py-3 text-left">หน่วยงาน</th>
                <th className="px-4 py-3 text-left">สถานที่</th>
                <th className="px-4 py-3 text-left">Serial No.</th>
                <th className="px-4 py-3 text-right">มูลค่า (บาท)</th>
                <th className="px-4 py-3 text-left">สถานะ</th>
                <th className="px-4 py-3 text-left">วันที่รับเข้า</th>
                <th className="px-4 py-3 text-center">ป้ายรหัส</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {recentEquipments.map((eq, idx) => (
                <tr key={eq.id} className="hover:bg-slate-50/80 transition">
                  <td className="px-4 py-3 text-center text-slate-400 font-mono">{idx + 1}</td>
                  <td className="px-4 py-3 font-mono font-bold text-[#005691] whitespace-nowrap">{getAssetCode(eq)}</td>
                  <td className="px-4 py-3 font-semibold text-slate-800 whitespace-nowrap">{eq.name}</td>
                  <td className="px-4 py-3 text-slate-500">{eq.category}</td>
                  <td className="px-4 py-3 text-slate-600">{eq.brand || '-'}</td>
                  <td className="px-4 py-3 text-slate-600 max-w-[160px] truncate">{getAssetDepartment(eq)}</td>
                  <td className="px-4 py-3 text-slate-500">{eq.location || '-'}</td>
                  <td className="px-4 py-3 font-mono text-slate-600">{eq.serial_no || '-'}</td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-700">{getAssetPrice(eq).toLocaleString('th-TH', { minimumFractionDigits: 2 })}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold inline-flex items-center gap-1 ${
                      eq.status === 'พร้อมใช้งาน' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                      eq.status === 'ส่งซ่อม' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                      'bg-slate-100 text-slate-600 border border-slate-200'}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${eq.status==='พร้อมใช้งาน'?'bg-emerald-500':eq.status==='ส่งซ่อม'?'bg-amber-500':'bg-slate-400'}`}></span>
                      {eq.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                    {eq.created_at ? new Date(eq.created_at).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' }) : '-'}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button onClick={() => onOpenSingleTag(eq)}
                      className="bg-sky-50 hover:bg-sky-100 text-[#005691] font-semibold px-2 py-1 rounded-lg border border-sky-200 transition text-[11px] flex items-center gap-1 mx-auto cursor-pointer">
                      🏷️ ป้าย
                    </button>
                  </td>
                </tr>
              ))}
              {recentEquipments.length === 0 && (
                <tr><td colSpan="12" className="px-6 py-16 text-center text-slate-400 text-xs">
                  <div className="text-4xl mb-3">📦</div>
                  <div className="font-semibold text-slate-500">ยังไม่มีครุภัณฑ์ในระบบ</div>
                  <div className="mt-1">กดปุ่ม "เพิ่มครุภัณฑ์ใหม่" เพื่อบันทึกการรับเข้า</div>
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal เพิ่มครุภัณฑ์ */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden border border-slate-200">
            <div className="bg-[#071d36] text-white p-4 px-6 flex justify-between items-center">
              <div>
                <h3 className="font-extrabold text-base flex items-center gap-2"><span>📦</span> รับเข้าครุภัณฑ์ใหม่</h3>
                <p className="text-[11px] text-sky-300 mt-0.5">กรอกข้อมูลครุภัณฑ์เพื่อบันทึกเข้าระบบ ม.อ.</p>
              </div>
              <button onClick={() => setIsAddModalOpen(false)} className="text-slate-400 hover:text-white font-bold p-1 rounded-lg text-lg transition cursor-pointer">✕</button>
            </div>
            <form onSubmit={handleCreateAsset} className="p-6 space-y-4 text-xs max-h-[75vh] overflow-y-auto">
              {/* 1. หมวดหมู่ */}
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-2">
                <label className="block font-bold text-slate-800 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-full bg-[#005691] text-white flex items-center justify-center text-[10px] font-bold">1</span>
                    <span>เลือกหมวดหมู่</span>
                  </span>
                </label>
                <select value={addForm.category} onChange={e => {
                  const selName = e.target.value;
                  const found = CATEGORY_LIST.find(c => c.name === selName);
                  setAddForm({ ...addForm, category: selName, categoryCode: found ? found.code : 'IT' });
                }} className="w-full border border-slate-300 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-[#005691] bg-white font-semibold text-slate-800">
                  {CATEGORY_LIST.map(cat => <option key={cat.code} value={cat.name}>[{cat.code}] {cat.name}</option>)}
                </select>
                <div className="flex items-center justify-between pt-1 text-[11px] bg-white p-2 rounded-lg border border-slate-200">
                  <span className="text-slate-600">รหัสที่จะได้รับ:</span>
                  <span className="font-mono font-extrabold text-sm text-[#005691] px-2 py-0.5 rounded bg-sky-50 border border-sky-200">
                    {(addForm.customCode || '').trim() || `${addForm.categoryCode}s${String(equipments.length + 1).padStart(3, '0')}`}
                  </span>
                </div>
              </div>
              {/* 2. ชื่อ */}
              <div>
                <label className="block font-bold text-slate-800 mb-1 flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-[#005691] text-white flex items-center justify-center text-[10px] font-bold">2</span>
                  <span>ใส่ชื่อครุภัณฑ์</span><span className="text-red-500">*</span>
                </label>
                <input type="text" required placeholder="เช่น Dell OptiPlex 7020..."
                  value={addForm.name} onChange={e => setAddForm({ ...addForm, name: e.target.value })}
                  className="w-full border border-slate-300 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-[#005691] text-xs" />
              </div>
              {/* 3. ยี่ห้อ */}
              <div>
                <label className="block font-bold text-slate-800 mb-1 flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-[#005691] text-white flex items-center justify-center text-[10px] font-bold">3</span>
                  <span>ใส่ยี่ห้อ</span><span className="text-red-500">*</span>
                </label>
                <input type="text" required placeholder="เช่น Dell, HP, Apple, Canon..."
                  value={addForm.brand} onChange={e => setAddForm({ ...addForm, brand: e.target.value })}
                  className="w-full border border-slate-300 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-[#005691] text-xs" />
              </div>
              {/* 4. หน่วยงาน */}
              <div>
                <label className="block font-bold text-slate-800 mb-1 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-full bg-[#005691] text-white flex items-center justify-center text-[10px] font-bold">4</span>
                    <span>หน่วยงานรับผิดชอบ</span><span className="text-red-500">*</span>
                  </span>
                  <button type="button" onClick={() => setShowDeptManager(!showDeptManager)}
                    className="text-[11px] text-[#005691] hover:underline font-semibold cursor-pointer">⚙️ จัดการหน่วยงาน</button>
                </label>
                {showDeptManager && (
                  <div className="mb-2 border border-slate-200 rounded-xl p-3 bg-slate-50 space-y-2">
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {departments.map((d, i) => (
                        <div key={i} className="flex items-center justify-between gap-2 text-xs bg-white px-2 py-1 rounded border border-slate-100">
                          <span className="flex-1 truncate">{d}</span>
                          <button type="button" onClick={() => handleDeleteDeptFromApi(d)} className="text-red-500 text-[11px] font-bold cursor-pointer">✕ ลบ</button>
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-2 pt-1">
                      <input type="text" placeholder="ชื่อหน่วยงานใหม่..." value={newDeptName}
                        onChange={e => setNewDeptName(e.target.value)}
                        className="flex-1 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:ring-1 focus:ring-[#005691]"
                        onKeyDown={e => { if (e.key==='Enter') { e.preventDefault(); handleAddDeptToApi(newDeptName); }}} />
                      <button type="button" onClick={() => handleAddDeptToApi(newDeptName)}
                        className="px-3 py-1.5 bg-[#005691] text-white rounded-lg text-xs font-bold cursor-pointer">+ เพิ่ม</button>
                    </div>
                  </div>
                )}
                <select value={addForm.department} onChange={e => setAddForm({ ...addForm, department: e.target.value })}
                  className="w-full border border-slate-300 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-[#005691] bg-white font-medium text-slate-800">
                  {departments.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              {/* 5. ราคา และ 6. ปีงบประมาณ */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-800 mb-1 flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-full bg-[#005691] text-white flex items-center justify-center text-[10px] font-bold">5</span>
                    <span>ราคา (บาท)</span><span className="text-red-500">*</span>
                  </label>
                  <input type="number" required placeholder="เช่น 32500" min="0" step="any"
                    value={addForm.price} onChange={e => setAddForm({ ...addForm, price: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-[#005691] text-xs font-semibold" />
                </div>

                <div>
                  <label className="block font-bold text-slate-800 mb-1 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <span className="w-5 h-5 rounded-full bg-[#005691] text-white flex items-center justify-center text-[10px] font-bold">6</span>
                      <span>ปีงบประมาณ</span><span className="text-red-500">*</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowFyManager(!showFyManager)}
                      className="text-[10px] text-[#005691] hover:underline font-semibold cursor-pointer"
                    >
                      + เพิ่มปีงบประมาณ
                    </button>
                  </label>
                  <select
                    value={addForm.fiscal_year || '2570'}
                    onChange={e => setAddForm({ ...addForm, fiscal_year: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-[#005691] bg-white text-xs font-bold text-[#002D62]"
                  >
                    {fiscalYearOptions.map(fy => (
                      <option key={fy} value={fy}>ปีงบประมาณ {fy}</option>
                    ))}
                  </select>
                </div>
              </div>

              {showFyManager && (
                <div className="border border-slate-200 rounded-xl p-3 bg-slate-50 space-y-2">
                  <div className="text-[11px] font-bold text-slate-700">📅 เพิ่มปีงบประมาณใหม่</div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="ระบุปี พ.ศ. เช่น 2572..."
                      value={newFyName}
                      onChange={e => setNewFyName(e.target.value)}
                      className="flex-1 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs bg-white outline-none focus:ring-1 focus:ring-[#005691]"
                    />
                    <button
                      type="button"
                      onClick={async () => {
                        const y = newFyName.trim();
                        if (!y) return;
                        try {
                          await axios.post('http://localhost:5000/api/fiscal-years', { year: y });
                          setAddForm({ ...addForm, fiscal_year: y });
                          setNewFyName('');
                          setShowFyManager(false);
                          await fetchAllData();
                        } catch (e) {
                          alert('เกิดข้อผิดพลาดในการเพิ่มปีงบประมาณ');
                        }
                      }}
                      className="px-3 py-1.5 bg-[#005691] text-white rounded-lg text-xs font-bold cursor-pointer"
                    >
                      + บันทึกปีงบ
                    </button>
                  </div>
                </div>
              )}
              {/* Serial No. + สถานที่ */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-800 mb-1 text-[11px]">🔢 Serial No.</label>
                  <input type="text" placeholder="เช่น SN-20240001"
                    value={addForm.serial_no} onChange={e => setAddForm({ ...addForm, serial_no: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-[#005691] text-xs font-mono" />
                </div>
                <div>
                  <label className="block font-bold text-slate-800 mb-1 text-[11px] flex items-center justify-between">
                    <span>📍 สถานที่ติดตั้ง</span>
                    <button
                      type="button"
                      onClick={() => setShowLocManager(!showLocManager)}
                      className="text-[10px] text-[#005691] hover:underline font-semibold cursor-pointer"
                    >
                      + เพิ่มสถานที่
                    </button>
                  </label>
                  <select
                    value={addForm.location || locationOptions[0] || ''}
                    onChange={e => setAddForm({ ...addForm, location: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-[#005691] bg-white text-xs font-medium text-slate-800"
                  >
                    {locationOptions.map(loc => (
                      <option key={loc} value={loc}>{loc}</option>
                    ))}
                  </select>
                </div>
              </div>
              {/* ทะเบียนรถจัดส่ง (แยกตามปีงบประมาณ) */}
              <div>
                <label className="block font-bold text-slate-800 mb-1 text-[11px]">🚚 ทะเบียนรถจัดส่ง (ปีงบประมาณ {addForm.fiscal_year || '2570'})</label>
                <DeliveryTruckSelect
                  fiscalYear={addForm.fiscal_year || '2570'}
                  value={addForm.license_plate}
                  onChange={val => setAddForm({ ...addForm, license_plate: val })}
                  deliveryTrucks={deliveryTrucks}
                  onTruckAdded={fetchAllData}
                />
              </div>
              {showLocManager && (
                <div className="border border-slate-200 rounded-xl p-3 bg-slate-50 space-y-2">
                  <div className="text-[11px] font-bold text-slate-700">📍 เพิ่มสถานที่ติดตั้งใหม่</div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="พิมพ์ชื่อห้อง / สถานที่ใหม่ เช่น ห้องเซิร์ฟเวอร์ ชั้น 2..."
                      value={newLocName}
                      onChange={e => setNewLocName(e.target.value)}
                      className="flex-1 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs bg-white outline-none focus:ring-1 focus:ring-[#005691]"
                    />
                    <button
                      type="button"
                      onClick={async () => {
                        const t = newLocName.trim();
                        if (!t) return;
                        if (!customLocations.includes(t)) setCustomLocations([...customLocations, t]);
                        setAddForm({ ...addForm, location: t });
                        setNewLocName('');
                        setShowLocManager(false);
                        try {
                          await axios.post('http://localhost:5000/api/locations', {
                            name: t,
                            building: 'อาคารคุณหญิงหลงฯ',
                            department: addForm.department
                          });
                          fetchAllData();
                        } catch (e) {}
                      }}
                      className="px-3 py-1.5 bg-[#005691] text-white rounded-lg text-xs font-bold cursor-pointer"
                    >
                      + บันทึก
                    </button>
                  </div>
                </div>
              )}
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button type="button" onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-medium transition cursor-pointer">ยกเลิก</button>
                <button type="submit"
                  className="px-5 py-2.5 bg-[#005691] hover:bg-[#003B71] text-white rounded-xl font-bold shadow-md transition cursor-pointer flex items-center gap-1.5">
                  <span>✓</span><span>บันทึกรับเข้าครุภัณฑ์</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// =========================================================================
// 5b. หน้าโอนย้ายครุภัณฑ์ / ยืม-คืน (TRANSFER & BORROW/RETURN PAGE)
// =========================================================================
function TransferPage({ equipments, logs = [], departmentsData = [], locationsData = [], fetchAllData, currentUser }) {
  const isAdmin = currentUser?.role === 'admin';
  const canManage = currentUser?.role === 'admin' || currentUser?.role === 'staff';
  const [activeTab, setActiveTab] = useState('transfer'); // 'transfer' | 'borrow' | 'history'
  const [searchTerm, setSearchTerm] = useState('');
  const [deptFilter, setDeptFilter] = useState('ทั้งหมด');
  const [transfers, setTransfers] = useState([]);

  const locationOptions = locationsData.length > 0
    ? locationsData.map(l => l.name)
    : ['ห้องเซิร์ฟเวอร์ ชั้น 2'];

  // Modal โอนย้าย
  const [transferModalEq, setTransferModalEq] = useState(null);
  const [showDeptManager, setShowDeptManager] = useState(false);
  const [newDeptName, setNewDeptName] = useState('');
  const departments = departmentsData.length > 0
    ? departmentsData.map(d => d.name)
    : ['สำนักทรัพยากรการเรียนรู้คุณหญิงหลง อรรถกระวีสุนทร'];
  const [transferForm, setTransferForm] = useState({
    to_department: '',
    to_location: '',
    transferred_by: currentUser?.full_name || currentUser?.username || 'ผู้ดูแลระบบ',
    note: ''
  });

  // Modal ยืมครุภัณฑ์ (เลือกชื่อผู้ยืม และหน่วยงานแยกกัน)
  const [borrowModalEq, setBorrowModalEq] = useState(null);
  const [borrowerPerson, setBorrowerPerson] = useState('');
  const [borrowerDept, setBorrowerDept] = useState(departments[0] || '');

  const fetchTransfers = async () => {
    try {
      const res = await axios.get('http://localhost:5000/api/transfers');
      setTransfers(Array.isArray(res.data) ? res.data : []);
    } catch (e) {
      setTransfers([]);
    }
  };

  useEffect(() => {
    fetchTransfers();
  }, [equipments]);

  const openTransferModal = (eq) => {
    const currentDept = getAssetDepartment(eq);
    setTransferModalEq(eq);
    setTransferForm({
      to_department: currentDept || departments[0],
      to_location: eq.location || '',
      transferred_by: currentUser?.full_name || currentUser?.username || 'ผู้ดูแลระบบ',
      note: ''
    });
  };

  const handleSubmitTransfer = async (e) => {
    e.preventDefault();
    if (!transferModalEq) return;
    try {
      await axios.post('http://localhost:5000/api/transfers', {
        equipment_id: transferModalEq.id,
        to_department: transferForm.to_department,
        to_location: transferForm.to_location,
        transferred_by: transferForm.transferred_by,
        note: transferForm.note
      });
      setTransferModalEq(null);
      await fetchAllData();
      await fetchTransfers();
    } catch (err) {
      alert('เกิดข้อผิดพลาดในการโอนย้ายครุภัณฑ์');
    }
  };

  const handleSubmitBorrow = async (e) => {
    e.preventDefault();
    if (!borrowModalEq || !borrowerPerson.trim() || !borrowerDept.trim()) return;
    try {
      await axios.post('http://localhost:5000/api/borrow', {
        equipment_id: borrowModalEq.id,
        borrower_name: `${borrowerPerson.trim()} (${borrowerDept.trim()})`,
        modified_by: currentUser?.full_name || currentUser?.username || 'ผู้ดูแลระบบ'
      });
      setBorrowModalEq(null);
      setBorrowerPerson('');
      setBorrowerDept(departments[0] || '');
      await fetchAllData();
    } catch (err) {
      alert('เกิดข้อผิดพลาดในการบันทึกการยืม');
    }
  };

  const handleReturnEquipment = async (log) => {
    if (!window.confirm(`ยืนยันการรับคืน "${log.equipment_name}" จาก ${log.borrower_name}?`)) return;
    try {
      await axios.put(`http://localhost:5000/api/return/${log.id}`, {
        equipment_id: log.equipment_id,
        modified_by: currentUser?.full_name || currentUser?.username || 'ผู้ดูแลระบบ'
      });
      await fetchAllData();
    } catch (err) {
      alert('เกิดข้อผิดพลาดในการรับคืนครุภัณฑ์');
    }
  };

  const handleReturnByEquipment = async (eq) => {
    const activeLog = logs.find(l => l.equipment_id == eq.id && l.status === 'กำลังยืม');
    if (activeLog) {
      await handleReturnEquipment(activeLog);
    } else {
      if (!window.confirm(`ยืนยันการเปลี่ยนสถานะ "${eq.name}" เป็นพร้อมใช้งาน?`)) return;
      try {
        await axios.put(`http://localhost:5000/api/equipments/${eq.id}`, { status: 'พร้อมใช้งาน' });
        await fetchAllData();
      } catch (err) {
        alert('เกิดข้อผิดพลาดในการคืนสถานะ');
      }
    }
  };

  const allDepts = departments;

  const filtered = equipments.filter(eq => {
    const matchSearch =
      !searchTerm ||
      eq.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      getAssetCode(eq).toLowerCase().includes(searchTerm.toLowerCase()) ||
      (eq.serial_no || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (eq.location || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchDept = deptFilter === 'ทั้งหมด' || getAssetDepartment(eq) === deptFilter;
    return matchSearch && matchDept;
  });

  const activeBorrows = logs.filter(l => l.status === 'กำลังยืม');
  const borrowedCount = equipments.filter(e => e.status === 'กำลังถูกยืม').length;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-[#002D62]">🔄 โอนย้ายครุภัณฑ์ / ยืม-คืน</h1>
          <p className="text-xs text-slate-500 mt-1">จัดการโอนย้ายหน่วยงาน/สถานที่ติดตั้ง และบันทึกการยืม-คืนครุภัณฑ์</p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs border-l-4 border-l-[#005691]">
          <div className="text-xs text-slate-500 font-semibold">ครุภัณฑ์ทั้งหมด</div>
          <div className="text-2xl font-extrabold text-[#002D62] mt-1">{equipments.length} <span className="text-xs font-normal text-slate-400">รายการ</span></div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs border-l-4 border-l-sky-500">
          <div className="text-xs text-sky-700 font-semibold">ประวัติการโอนย้าย</div>
          <div className="text-2xl font-extrabold text-slate-800 mt-1">{transfers.length} <span className="text-xs font-normal text-slate-400">ครั้ง</span></div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs border-l-4 border-l-amber-500">
          <div className="text-xs text-amber-700 font-semibold">กำลังถูกยืม</div>
          <div className="text-2xl font-extrabold text-slate-800 mt-1">{borrowedCount} <span className="text-xs font-normal text-slate-400">รายการ</span></div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs border-l-4 border-l-emerald-500">
          <div className="text-xs text-emerald-700 font-semibold">คืนแล้วทั้งหมด</div>
          <div className="text-2xl font-extrabold text-slate-800 mt-1">{logs.filter(l => l.status === 'คืนแล้ว').length} <span className="text-xs font-normal text-slate-400">ครั้ง</span></div>
        </div>
      </div>

      {/* Sub-navigation Tabs */}
      <div className="border-b border-slate-200 flex gap-8 text-xs font-semibold">
        <button
          onClick={() => setActiveTab('transfer')}
          className={`pb-3 transition flex items-center gap-1.5 cursor-pointer ${
            activeTab === 'transfer' ? 'text-[#005691] border-b-2 border-[#005691] font-bold' : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <span>🏢 โอนย้ายหน่วยงาน / สถานที่</span>
          <span className="text-slate-400 font-normal">({equipments.length})</span>
        </button>
        <button
          onClick={() => setActiveTab('borrow')}
          className={`pb-3 transition flex items-center gap-1.5 cursor-pointer ${
            activeTab === 'borrow' ? 'text-[#005691] border-b-2 border-[#005691] font-bold' : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <span>📋 รายการยืม / คืนครุภัณฑ์</span>
          <span className="text-slate-400 font-normal">({activeBorrows.length} กำลังยืม)</span>
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`pb-3 transition flex items-center gap-1.5 cursor-pointer ${
            activeTab === 'history' ? 'text-[#005691] border-b-2 border-[#005691] font-bold' : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <span>🕒 ประวัติการโอนย้าย</span>
          <span className="text-slate-400 font-normal">({transfers.length})</span>
        </button>
      </div>

      {/* TAB 1: โอนย้ายหน่วยงาน / สถานที่ + ยืม/คืนด่วน */}
      {activeTab === 'transfer' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-sm">
              <input
                type="text"
                placeholder="ค้นหาชื่อ, รหัส, สถานที่, Serial No..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 pl-9 text-xs outline-none focus:ring-2 focus:ring-[#005691]"
              />
              <span className="absolute left-3 top-2.5 text-slate-400 text-xs">🔍</span>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={deptFilter}
                onChange={e => setDeptFilter(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-700 outline-none focus:ring-2 focus:ring-[#005691]"
              >
                <option value="ทั้งหมด">ทุกหน่วยงาน ▾</option>
                {allDepts.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
              <span className="text-xs text-slate-400">{filtered.length} รายการ</span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100 text-xs">
              <thead className="bg-slate-50 text-slate-400 uppercase font-semibold">
                <tr>
                  <th className="px-4 py-3 text-center w-10">ลำดับ</th>
                  <th className="px-4 py-3 text-left">รหัสครุภัณฑ์</th>
                  <th className="px-4 py-3 text-left">ชื่อครุภัณฑ์</th>
                  <th className="px-4 py-3 text-left">ยี่ห้อ</th>
                  <th className="px-4 py-3 text-left">หน่วยงานปัจจุบัน</th>
                  <th className="px-4 py-3 text-left">สถานที่ปัจจุบัน</th>
                  <th className="px-4 py-3 text-left">สถานะ</th>
                  <th className="px-4 py-3 text-center">การดำเนินการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {filtered.map((eq, idx) => {
                  const activeBorrow = logs.find(l => l.equipment_id == eq.id && l.status === 'กำลังยืม');
                  return (
                    <tr key={eq.id} className="hover:bg-slate-50/80 transition">
                      <td className="px-4 py-3 text-center text-slate-400 font-mono">{idx + 1}</td>
                      <td className="px-4 py-3 font-mono font-bold text-[#005691] whitespace-nowrap">{getAssetCode(eq)}</td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-800">{eq.name}</div>
                        <div className="text-[11px] text-slate-400">{eq.category}</div>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{eq.brand || '-'}</td>
                      <td className="px-4 py-3 font-medium text-slate-700">{getAssetDepartment(eq)}</td>
                      <td className="px-4 py-3 text-slate-600">{eq.location || '-'}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold inline-flex items-center gap-1 ${
                          eq.status === 'พร้อมใช้งาน' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                          eq.status === 'กำลังถูกยืม' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                          'bg-slate-100 text-slate-600 border border-slate-200'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${
                            eq.status === 'พร้อมใช้งาน' ? 'bg-emerald-500' : eq.status === 'กำลังถูกยืม' ? 'bg-amber-500' : 'bg-slate-400'
                          }`}></span>
                          <span>{eq.status}</span>
                        </span>
                        {activeBorrow && (
                          <div className="text-[10px] text-amber-700 mt-0.5">ผู้ยืม: {activeBorrow.borrower_name}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center whitespace-nowrap">
                        {canManage ? (
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              onClick={() => openTransferModal(eq)}
                              className="bg-[#005691] hover:bg-[#003B71] text-white font-semibold px-3 py-1.5 rounded-lg transition text-[11px] cursor-pointer"
                            >
                              🔄 โอนย้าย
                            </button>
                            {eq.status === 'พร้อมใช้งาน' && (
                              <button
                                onClick={() => { setBorrowModalEq(eq); setBorrowerName(''); }}
                                className="bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 font-semibold px-2.5 py-1.5 rounded-lg transition text-[11px] cursor-pointer"
                              >
                                📤 ยืม
                              </button>
                            )}
                            {eq.status === 'กำลังถูกยืม' && (
                              <button
                                onClick={() => handleReturnByEquipment(eq)}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-2.5 py-1.5 rounded-lg transition text-[11px] cursor-pointer"
                              >
                                📥 รับคืน
                              </button>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan="8" className="px-6 py-12 text-center text-slate-400">ไม่พบครุภัณฑ์ที่ค้นหา</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: รายการยืม-คืนครุภัณฑ์ */}
      {activeTab === 'borrow' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <div className="font-bold text-slate-800 text-sm">📋 ประวัติและรายการยืม-คืนครุภัณฑ์ทั้งหมด</div>
            <span className="text-xs text-slate-400">{logs.length} รายการ</span>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100 text-xs">
              <thead className="bg-slate-50 text-slate-400 uppercase font-semibold">
                <tr>
                  <th className="px-4 py-3 text-center w-12">ลำดับ</th>
                  <th className="px-4 py-3 text-left">ครุภัณฑ์</th>
                  <th className="px-4 py-3 text-left">ผู้ยืม / หน่วยงานผู้ยืม</th>
                  <th className="px-4 py-3 text-left">วันที่ยืม</th>
                  <th className="px-4 py-3 text-left">วันที่คืน</th>
                  <th className="px-4 py-3 text-left">สถานะ</th>
                  <th className="px-4 py-3 text-center">จัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {logs.map((log, idx) => (
                  <tr key={log.id} className="hover:bg-slate-50/80 transition">
                    <td className="px-4 py-3 text-center text-slate-400 font-mono">{idx + 1}</td>
                    <td className="px-4 py-3 font-semibold text-slate-800">{log.equipment_name}</td>
                    <td className="px-4 py-3 text-slate-700 font-medium">{log.borrower_name}</td>
                    <td className="px-4 py-3 text-slate-500">
                      {log.borrow_date ? new Date(log.borrow_date).toLocaleString('th-TH') : '-'}
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {log.return_date ? new Date(log.return_date).toLocaleString('th-TH') : '-'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold ${
                        log.status === 'คืนแล้ว'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-amber-50 text-amber-700 border border-amber-200'
                      }`}>
                        {log.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {log.status === 'กำลังยืม' && canManage ? (
                        <button
                          onClick={() => handleReturnEquipment(log)}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-3 py-1.5 rounded-lg text-[11px] transition cursor-pointer"
                        >
                          📥 รับคืนครุภัณฑ์
                        </button>
                      ) : (
                        <span className="text-slate-400 text-[11px]">เรียบร้อย</span>
                      )}
                    </td>
                  </tr>
                ))}
                {logs.length === 0 && (
                  <tr>
                    <td colSpan="7" className="px-6 py-12 text-center text-slate-400">ยังไม่มีประวัติการยืม-คืน</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: ประวัติการโอนย้าย */}
      {activeTab === 'history' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <div className="font-bold text-slate-800 text-sm">🕒 ประวัติการโอนย้ายครุภัณฑ์</div>
            <span className="text-xs text-slate-400">{transfers.length} รายการ</span>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100 text-xs">
              <thead className="bg-slate-50 text-slate-400 uppercase font-semibold">
                <tr>
                  <th className="px-4 py-3 text-center w-12">ลำดับ</th>
                  <th className="px-4 py-3 text-left">รหัส</th>
                  <th className="px-4 py-3 text-left">ชื่อครุภัณฑ์</th>
                  <th className="px-4 py-3 text-left">จากหน่วยงาน / สถานที่</th>
                  <th className="px-4 py-3 text-left">ไปยังหน่วยงาน / สถานที่</th>
                  <th className="px-4 py-3 text-left">ผู้ทำรายการ</th>
                  <th className="px-4 py-3 text-left">หมายเหตุ</th>
                  <th className="px-4 py-3 text-left">วัน-เวลาที่โอนย้าย</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {transfers.map((tr, idx) => (
                  <tr key={tr.id} className="hover:bg-slate-50/80 transition">
                    <td className="px-4 py-3 text-center text-slate-400 font-mono">{idx + 1}</td>
                    <td className="px-4 py-3 font-mono font-bold text-[#005691]">{tr.equipment_code || '-'}</td>
                    <td className="px-4 py-3 font-semibold text-slate-800">{tr.equipment_name}</td>
                    <td className="px-4 py-3 text-slate-600">
                      <div className="font-medium">{tr.from_department || '-'}</div>
                      <div className="text-[11px] text-slate-400">📍 {tr.from_location || '-'}</div>
                    </td>
                    <td className="px-4 py-3 text-emerald-700">
                      <div className="font-bold">➜ {tr.to_department || '-'}</div>
                      <div className="text-[11px] text-emerald-600">📍 {tr.to_location || '-'}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{tr.transferred_by || '-'}</td>
                    <td className="px-4 py-3 text-slate-500">{tr.note || '-'}</td>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                      {tr.transfer_date ? new Date(tr.transfer_date).toLocaleString('th-TH') : '-'}
                    </td>
                  </tr>
                ))}
                {transfers.length === 0 && (
                  <tr>
                    <td colSpan="8" className="px-6 py-12 text-center text-slate-400">ยังไม่มีประวัติการโอนย้ายครุภัณฑ์</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal โอนย้ายครุภัณฑ์ */}
      {transferModalEq && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden border border-slate-200">
            <div className="bg-[#071d36] text-white p-4 px-6 flex justify-between items-center">
              <div>
                <h3 className="font-extrabold text-base flex items-center gap-2">
                  <span>🔄</span> โอนย้ายครุภัณฑ์
                </h3>
                <p className="text-[11px] text-sky-300 mt-0.5">
                  [{getAssetCode(transferModalEq)}] {transferModalEq.name}
                </p>
              </div>
              <button onClick={() => setTransferModalEq(null)} className="text-slate-400 hover:text-white font-bold p-1 rounded-lg text-lg cursor-pointer">✕</button>
            </div>

            <form onSubmit={handleSubmitTransfer} className="p-6 space-y-4 text-xs max-h-[75vh] overflow-y-auto">
              {/* ข้อมูลต้นทาง */}
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-1">
                <div className="text-[11px] font-bold text-slate-400 uppercase">ข้อมูลปัจจุบัน (ต้นทาง)</div>
                <div className="flex justify-between text-slate-700 pt-1">
                  <span className="text-slate-500">หน่วยงานเดิม:</span>
                  <span className="font-bold">{getAssetDepartment(transferModalEq)}</span>
                </div>
                <div className="flex justify-between text-slate-700">
                  <span className="text-slate-500">สถานที่เดิม:</span>
                  <span className="font-semibold">{transferModalEq.location || '-'}</span>
                </div>
              </div>

              {/* เลือกหน่วยงานปลายทาง */}
              <div>
                <label className="block font-bold text-slate-800 mb-1 flex items-center justify-between">
                  <span>🏢 โอนย้ายไปยังหน่วยงานรับผิดชอบใหม่ <span className="text-red-500">*</span></span>
                  <button
                    type="button"
                    onClick={() => setShowDeptManager(!showDeptManager)}
                    className="text-[11px] text-[#005691] hover:underline font-semibold cursor-pointer"
                  >
                    ⚙️ จัดการหน่วยงาน
                  </button>
                </label>
                {showDeptManager && (
                  <div className="mb-2 border border-slate-200 rounded-xl p-3 bg-slate-50 space-y-2">
                    <div className="space-y-1 max-h-28 overflow-y-auto">
                      {departments.map((d, i) => (
                        <div key={i} className="flex items-center justify-between gap-2 text-xs bg-white px-2 py-1 rounded border border-slate-100">
                          <span className="flex-1 truncate">{d}</span>
                          <button type="button" onClick={async () => {
                            const eqCount = equipments.filter(e => getAssetDepartment(e) === d).length;
                            if (eqCount > 0) {
                              alert(`ไม่สามารถลบหน่วยงาน "${d}" ได้ เนื่องจากยังมีครุภัณฑ์สังกัดอยู่ ${eqCount} รายการ กรุณาโอนย้ายครุภัณฑ์ไปยังหน่วยงานอื่นก่อน`);
                              return;
                            }
                            const found = departmentsData.find(x => x.name === d);
                            if (found) {
                              if (!window.confirm(`ยืนยันการลบหน่วยงาน "${d}" ?`)) return;
                              try {
                                await axios.delete(`http://localhost:5000/api/departments/${found.id}`);
                                await fetchAllData();
                              } catch (err) {
                                alert(err.response?.data?.error || 'ไม่สามารถลบหน่วยงานได้');
                              }
                            }
                          }} className="text-red-500 text-[11px] font-bold cursor-pointer">✕ ลบ</button>
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="เพิ่มชื่อหน่วยงานใหม่..."
                        value={newDeptName}
                        onChange={e => setNewDeptName(e.target.value)}
                        className="flex-1 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs outline-none"
                      />
                      <button
                        type="button"
                        onClick={async () => {
                          const t = newDeptName.trim();
                          if (t) {
                            await axios.post('http://localhost:5000/api/departments', { name: t, building: 'อาคารคุณหญิงหลงฯ' });
                            setTransferForm({ ...transferForm, to_department: t });
                            setNewDeptName('');
                            await fetchAllData();
                          }
                        }}
                        className="px-3 py-1.5 bg-[#005691] text-white rounded-lg text-xs font-bold cursor-pointer"
                      >
                        + เพิ่ม
                      </button>
                    </div>
                  </div>
                )}
                <select
                  value={transferForm.to_department}
                  onChange={e => setTransferForm({ ...transferForm, to_department: e.target.value })}
                  className="w-full border border-slate-300 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-[#005691] bg-white font-semibold text-slate-800"
                >
                  {allDepts.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>

              {/* สถานที่ติดตั้งใหม่ */}
              <div>
                <label className="block font-bold text-slate-800 mb-1">📍 สถานที่ติดตั้ง / ห้องใหม่ <span className="text-red-500">*</span></label>
                <select
                  value={transferForm.to_location || locationOptions[0] || ''}
                  onChange={e => setTransferForm({ ...transferForm, to_location: e.target.value })}
                  className="w-full border border-slate-300 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-[#005691] bg-white font-semibold text-slate-800"
                >
                  {locationOptions.map(loc => (
                    <option key={loc} value={loc}>{loc}</option>
                  ))}
                </select>
              </div>

              {/* ผู้โอนย้าย & หมายเหตุ */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-800 mb-1">👤 ผู้ทำรายการโอนย้าย</label>
                  <input
                    type="text"
                    value={transferForm.transferred_by}
                    onChange={e => setTransferForm({ ...transferForm, transferred_by: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-[#005691]"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-800 mb-1">📝 หมายเหตุ / เหตุผลการโอนย้าย</label>
                  <input
                    type="text"
                    placeholder="เช่น ปรับปรุงโครงสร้าง, ย้ายห้องทำงาน..."
                    value={transferForm.note}
                    onChange={e => setTransferForm({ ...transferForm, note: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-[#005691]"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setTransferModalEq(null)}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-medium cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-[#005691] hover:bg-[#003B71] text-white rounded-xl font-bold shadow-md cursor-pointer"
                >
                  ✓ ยืนยันการโอนย้าย
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal ยืมครุภัณฑ์ */}
      {borrowModalEq && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl overflow-hidden border border-slate-200">
            <div className="bg-[#071d36] text-white p-4 px-6 flex justify-between items-center">
              <div>
                <h3 className="font-extrabold text-base">📤 บันทึกการยืมครุภัณฑ์</h3>
                <p className="text-[11px] text-sky-300 mt-0.5">[{getAssetCode(borrowModalEq)}] {borrowModalEq.name}</p>
              </div>
              <button onClick={() => setBorrowModalEq(null)} className="text-slate-400 hover:text-white font-bold p-1 text-lg cursor-pointer">✕</button>
            </div>
            <form onSubmit={handleSubmitBorrow} className="p-6 space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-800 mb-1">ชื่อผู้ยืม <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  required
                  placeholder="เช่น นายสมชาย ใจดี"
                  value={borrowerPerson}
                  onChange={e => setBorrowerPerson(e.target.value)}
                  className="w-full border border-slate-300 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-[#005691]"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-800 mb-1">หน่วยงานผู้ยืม <span className="text-red-500">*</span></label>
                <select
                  required
                  value={borrowerDept || departments[0] || ''}
                  onChange={e => setBorrowerDept(e.target.value)}
                  className="w-full border border-slate-300 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-[#005691] bg-white"
                >
                  {departments.map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button type="button" onClick={() => setBorrowModalEq(null)} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-medium cursor-pointer">ยกเลิก</button>
                <button type="submit" className="px-5 py-2 bg-[#005691] hover:bg-[#003B71] text-white rounded-xl font-bold cursor-pointer">✓ ยืนยันการยืม</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// =========================================================================
// 5c. หน้าจัดการหมวดหมู่ครุภัณฑ์ (CATEGORIES PAGE)
// =========================================================================
function CategoriesPage({ equipments = [], categories = [], fetchAllData, currentUser, onOpenSingleTag }) {
  const isAdmin = currentUser?.role === 'admin';
  const canManage = currentUser?.role === 'admin' || currentUser?.role === 'staff';
  const [selectedCatName, setSelectedCatName] = useState('ทั้งหมด');
  const [searchTerm, setSearchTerm] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCat, setEditingCat] = useState(null);
  const [form, setForm] = useState({ code: '', name: '', description: '', icon: '💻' });

  const ICON_OPTIONS = ['💻', '🖨️', '❄️', '📽️', '🪑', '⚡', '📦', '📷', '🔬', '🛠️', '📡', '🚗'];

  const defaultCategories = [
    { id: 1, code: 'IT',  name: 'คอมพิวเตอร์และอุปกรณ์', description: 'เครื่องคอมพิวเตอร์ โน้ตบุ๊ก เซิร์ฟเวอร์ จอภาพ และอุปกรณ์ต่อพ่วง IT', icon: '💻' },
    { id: 2, code: 'OFF', name: 'เครื่องใช้สำนักงาน', description: 'เครื่องถ่ายเอกสาร เครื่องพิมพ์ เครื่องสแกน และอุปกรณ์สำนักงาน', icon: '🖨️' },
    { id: 3, code: 'AIR', name: 'เครื่องปรับอากาศ', description: 'แอร์ เครื่องฟอกอากาศ และระบบระบายอากาศ', icon: '❄️' },
    { id: 4, code: 'AV',  name: 'โสตทัศนูปกรณ์', description: 'โปรเจคเตอร์ กล้อง เครื่องเสียง ไมโครโฟน และจอแสดงผลห้องประชุม', icon: '📽️' },
    { id: 5, code: 'FUR', name: 'เฟอร์นิเจอร์สำนักงาน', description: 'โต๊ะ เก้าอี้ ตู้เก็บเอกสาร ชั้นวางหนังสือ', icon: '🪑' },
    { id: 6, code: 'EL',  name: 'อิเล็กทรอนิกส์', description: 'เครื่องใช้ไฟฟ้าและอุปกรณ์อิเล็กทรอนิกส์ทั่วไป', icon: '⚡' },
    { id: 7, code: 'GEN', name: 'อื่นๆ', description: 'ครุภัณฑ์ทั่วไปอื่นๆ ที่ไม่อยู่ในหมวดหมู่หลัก', icon: '📦' },
  ];

  const catList = categories.length > 0 ? categories : defaultCategories;

  const openCreateModal = () => {
    setEditingCat(null);
    setForm({ code: '', name: '', description: '', icon: '📦' });
    setModalOpen(true);
  };

  const openEditModal = (cat) => {
    setEditingCat(cat);
    setForm({
      code: cat.code || '',
      name: cat.name || '',
      description: cat.description || '',
      icon: cat.icon || '📦'
    });
    setModalOpen(true);
  };

  const handleSaveCategory = async (e) => {
    e.preventDefault();
    try {
      if (editingCat) {
        await axios.put(`http://localhost:5000/api/categories/${editingCat.id}`, {
          ...form,
          oldName: editingCat.name
        });
        if (selectedCatName === editingCat.name) setSelectedCatName(form.name);
      } else {
        await axios.post('http://localhost:5000/api/categories', form);
      }
      setModalOpen(false);
      await fetchAllData();
    } catch (err) {
      alert(err.response?.data?.error || 'เกิดข้อผิดพลาดในการบันทึกหมวดหมู่');
    }
  };

  const handleDeleteCategory = async (cat) => {
    const count = equipments.filter(eq => eq.category === cat.name).length;
    if (count > 0) {
      if (!window.confirm(`หมวดหมู่ "${cat.name}" มีครุภัณฑ์อยู่ ${count} รายการ ยืนยันที่จะลบหมวดหมู่นี้หรือไม่?`)) return;
    } else {
      if (!window.confirm(`ยืนยันการลบหมวดหมู่ "[${cat.code}] ${cat.name}" ?`)) return;
    }
    try {
      await axios.delete(`http://localhost:5000/api/categories/${cat.id}`);
      if (selectedCatName === cat.name) setSelectedCatName('ทั้งหมด');
      await fetchAllData();
    } catch (err) {
      alert('เกิดข้อผิดพลาดในการลบหมวดหมู่');
    }
  };

  // สรุปสถิติรายหมวดหมู่
  const catStats = catList.map(cat => {
    const items = equipments.filter(eq =>
      eq.category === cat.name ||
      (cat.code === 'IT' && eq.category === 'IT') ||
      (cat.code === 'EL' && eq.category === 'Electronics')
    );
    const totalValue = items.reduce((sum, eq) => sum + getAssetPrice(eq), 0);
    const available = items.filter(eq => eq.status === 'พร้อมใช้งาน').length;
    const repairing = items.filter(eq => eq.status === 'ส่งซ่อม').length;
    const borrowed = items.filter(eq => eq.status === 'กำลังถูกยืม').length;
    return { ...cat, count: items.length, totalValue, available, repairing, borrowed, items };
  });

  const totalValueAll = equipments.reduce((sum, eq) => sum + getAssetPrice(eq), 0);

  const displayedEquipments = equipments.filter(eq => {
    const matchCat =
      selectedCatName === 'ทั้งหมด' ||
      eq.category === selectedCatName ||
      (selectedCatName === 'คอมพิวเตอร์และอุปกรณ์' && eq.category === 'IT') ||
      (selectedCatName === 'อิเล็กทรอนิกส์' && eq.category === 'Electronics');
    const matchSearch =
      !searchTerm ||
      eq.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      getAssetCode(eq).toLowerCase().includes(searchTerm.toLowerCase()) ||
      (eq.brand || '').toLowerCase().includes(searchTerm.toLowerCase());
    return matchCat && matchSearch;
  });

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-[#002D62]">🗃️ หมวดหมู่ครุภัณฑ์</h1>
          <p className="text-xs text-slate-500 mt-1">จัดการรหัสหมวดหมู่ (Prefix) ตรวจสอบจำนวนและมูลค่าครุภัณฑ์แยกตามประเภท</p>
        </div>
        {canManage && (
          <button
            onClick={openCreateModal}
            className="bg-[#005691] hover:bg-[#003B71] text-white text-xs font-bold py-2.5 px-4 rounded-xl shadow-sm transition flex items-center gap-2 cursor-pointer"
          >
            <span>+ เพิ่มหมวดหมู่ใหม่</span>
          </button>
        )}
      </div>

      {/* Summary Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs border-l-4 border-l-[#005691]">
          <div className="text-xs text-slate-500 font-semibold">จำนวนหมวดหมู่ทั้งหมด</div>
          <div className="text-2xl font-extrabold text-[#002D62] mt-1">{catList.length} <span className="text-xs font-normal text-slate-400">หมวดหมู่</span></div>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs border-l-4 border-l-emerald-500">
          <div className="text-xs text-emerald-700 font-semibold">ครุภัณฑ์ในระบบรวม</div>
          <div className="text-2xl font-extrabold text-slate-800 mt-1">{equipments.length} <span className="text-xs font-normal text-slate-400">รายการ</span></div>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs border-l-4 border-l-sky-500">
          <div className="text-xs text-sky-700 font-semibold">มูลค่าครุภัณฑ์รวมทั้งหมด</div>
          <div className="text-2xl font-extrabold text-slate-800 mt-1">
            {totalValueAll.toLocaleString('th-TH', { minimumFractionDigits: 2 })} <span className="text-xs font-normal text-slate-400">บาท</span>
          </div>
        </div>
      </div>

      {/* Category Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {catStats.map(cat => {
          const isSelected = selectedCatName === cat.name;
          return (
            <div
              key={cat.id || cat.code}
              onClick={() => setSelectedCatName(isSelected ? 'ทั้งหมด' : cat.name)}
              className={`bg-white rounded-2xl border p-5 shadow-2xs transition cursor-pointer flex flex-col justify-between ${
                isSelected
                  ? 'border-[#005691] ring-2 ring-[#005691]/20 bg-sky-50/30'
                  : 'border-slate-200 hover:border-sky-300 hover:shadow-md'
              }`}
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="inline-block font-mono font-extrabold text-[11px] px-2 py-0.5 rounded bg-[#002D62] text-white">
                      {cat.code}
                    </span>
                    <h3 className="font-bold text-slate-800 text-sm mt-1.5">{cat.name}</h3>
                  </div>
                  {canManage && (
                    <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => openEditModal(cat)}
                        className="p-1.5 text-slate-400 hover:text-[#005691] hover:bg-slate-100 rounded-lg transition text-xs cursor-pointer"
                        title="แก้ไขหมวดหมู่"
                      >
                        ✏️
                      </button>
                      <button
                        onClick={() => handleDeleteCategory(cat)}
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition text-xs cursor-pointer"
                        title="ลบหมวดหมู่"
                      >
                        🗑️
                      </button>
                    </div>
                  )}
                </div>
                <p className="text-[11px] text-slate-500 mt-2.5 line-clamp-2 min-h-[32px]">
                  {cat.description || 'ไม่มีคำอธิบายเพิ่มเติม'}
                </p>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 space-y-2 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">จำนวนครุภัณฑ์</span>
                  <span className="font-extrabold text-[#005691] text-sm">{cat.count} รายการ</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">มูลค่ารวม</span>
                  <span className="font-bold text-slate-700">{cat.totalValue.toLocaleString('th-TH')} ฿</span>
                </div>
                <div className="flex items-center gap-2 pt-1 text-[10px]">
                  <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">พร้อมใช้ {cat.available}</span>
                  <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">ยืม {cat.borrowed}</span>
                  <span className="px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200">ซ่อม {cat.repairing}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Equipment List Filtered by Category — แสดงเฉพาะเมื่อคลิกเลือกหมวดหมู่ */}
      {selectedCatName !== 'ทั้งหมด' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-slate-800 text-sm">
                รายการครุภัณฑ์ในหมวดหมู่: <span className="text-[#005691]">{selectedCatName}</span>
              </span>
              <button
                onClick={() => setSelectedCatName('ทั้งหมด')}
                className="text-[11px] px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 cursor-pointer"
              >
                ✕ ปิดตาราง
              </button>
            </div>
            <div className="relative w-full sm:w-64">
              <input
                type="text"
                placeholder="ค้นหาชื่อ, รหัส, ยี่ห้อ..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 pl-9 text-xs outline-none focus:ring-2 focus:ring-[#005691]"
              />
              <span className="absolute left-3 top-2.5 text-slate-400 text-xs">🔍</span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100 text-xs">
              <thead className="bg-slate-50 text-slate-400 uppercase font-semibold">
                <tr>
                  <th className="px-4 py-3 text-center w-10">ลำดับ</th>
                  <th className="px-4 py-3 text-left">รหัสครุภัณฑ์</th>
                  <th className="px-4 py-3 text-left">ชื่อครุภัณฑ์</th>
                  <th className="px-4 py-3 text-left">หมวดหมู่</th>
                  <th className="px-4 py-3 text-left">ยี่ห้อ</th>
                  <th className="px-4 py-3 text-left">หน่วยงาน</th>
                  <th className="px-4 py-3 text-left">สถานที่</th>
                  <th className="px-4 py-3 text-right">มูลค่า (บาท)</th>
                  <th className="px-4 py-3 text-left">สถานะ</th>
                  <th className="px-4 py-3 text-center">ป้ายรหัส</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {displayedEquipments.map((eq, idx) => (
                  <tr key={eq.id} className="hover:bg-slate-50/80 transition">
                    <td className="px-4 py-3 text-center text-slate-400 font-mono">{idx + 1}</td>
                    <td className="px-4 py-3 font-mono font-bold text-[#005691]">{getAssetCode(eq)}</td>
                    <td className="px-4 py-3 font-semibold text-slate-800">{eq.name}</td>
                    <td className="px-4 py-3 text-slate-600">{eq.category}</td>
                    <td className="px-4 py-3 text-slate-600">{eq.brand || '-'}</td>
                    <td className="px-4 py-3 text-slate-600">{getAssetDepartment(eq)}</td>
                    <td className="px-4 py-3 text-slate-500">{eq.location || '-'}</td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-700">
                      {getAssetPrice(eq).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold ${
                        eq.status === 'พร้อมใช้งาน' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                        eq.status === 'ส่งซ่อม' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                        'bg-slate-100 text-slate-600 border border-slate-200'
                      }`}>
                        {eq.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => onOpenSingleTag && onOpenSingleTag(eq)}
                        className="bg-sky-50 hover:bg-sky-100 text-[#005691] font-semibold px-2.5 py-1 rounded-lg border border-sky-200 text-[11px] cursor-pointer"
                      >
                        ป้าย
                      </button>
                    </td>
                  </tr>
                ))}
                {displayedEquipments.length === 0 && (
                  <tr>
                    <td colSpan="10" className="px-6 py-12 text-center text-slate-400">ไม่มีรายการครุภัณฑ์ในหมวดหมู่นี้</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal เพิ่ม / แก้ไขหมวดหมู่ */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl overflow-hidden border border-slate-200">
            <div className="bg-[#071d36] text-white p-4 px-6 flex justify-between items-center">
              <div>
                <h3 className="font-extrabold text-base">
                  {editingCat ? '✏️ แก้ไขหมวดหมู่ครุภัณฑ์' : '➕ เพิ่มหมวดหมู่ครุภัณฑ์ใหม่'}
                </h3>
                <p className="text-[11px] text-sky-300 mt-0.5">กำหนดรหัสย่อสำหรับสร้างเลขครุภัณฑ์อัตโนมัติ</p>
              </div>
              <button onClick={() => setModalOpen(false)} className="text-slate-400 hover:text-white font-bold p-1 text-lg cursor-pointer">✕</button>
            </div>

            <form onSubmit={handleSaveCategory} className="p-6 space-y-4 text-xs">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-slate-800 mb-1">รหัสย่อ (Prefix) <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    required
                    maxLength={8}
                    placeholder="เช่น MED"
                    value={form.code}
                    onChange={e => setForm({ ...form, code: e.target.value.toUpperCase() })}
                    className="w-full border border-slate-300 rounded-xl p-2.5 font-mono font-bold uppercase outline-none focus:ring-2 focus:ring-[#005691]"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block font-bold text-slate-800 mb-1">ชื่อหมวดหมู่ <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    required
                    placeholder="เช่น ครุภัณฑ์วิทยาศาสตร์และการแพทย์"
                    value={form.name}
                    onChange={e => setForm({ ...form, name: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-[#005691]"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-800 mb-1">คำอธิบายรายละเอียด</label>
                <textarea
                  rows={2}
                  placeholder="ระบุประเภทอุปกรณ์ที่จัดอยู่ในหมวดหมู่นี้..."
                  value={form.description}
                  onChange={e => setForm({ ...form, description: e.target.value })}
                  className="w-full border border-slate-300 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-[#005691]"
                />
              </div>

              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex items-center justify-between">
                <span className="text-slate-500">ตัวอย่างรหัสครุภัณฑ์ที่จะได้:</span>
                <span className="font-mono font-extrabold text-sm text-[#005691]">
                  {(form.code || 'CAT').toUpperCase()}s001
                </span>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-medium cursor-pointer">
                  ยกเลิก
                </button>
                <button type="submit" className="px-5 py-2 bg-[#005691] hover:bg-[#003B71] text-white rounded-xl font-bold shadow-md cursor-pointer">
                  ✓ บันทึกหมวดหมู่
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// =========================================================================
// 5d. หน้าหน่วยงานและสถานที่ (DEPARTMENTS & LOCATIONS PAGE)
// =========================================================================
function DepartmentsPage({ equipments = [], departmentsData = [], locationsData = [], fetchAllData, currentUser, onOpenSingleTag }) {
  const isAdmin = currentUser?.role === 'admin';
  const canManage = currentUser?.role === 'admin' || currentUser?.role === 'staff';
  const [activeTab, setActiveTab] = useState('departments'); // 'departments' | 'locations'
  const [selectedDept, setSelectedDept] = useState('ทั้งหมด');
  const [selectedLoc, setSelectedLoc] = useState('ทั้งหมด');
  const [searchTerm, setSearchTerm] = useState('');

  // Modal หน่วยงาน
  const [deptModalOpen, setDeptModalOpen] = useState(false);
  const [editingDept, setEditingDept] = useState(null);
  const [deptForm, setDeptForm] = useState({ name: '', building: '', floor: '', description: '' });

  // Modal สถานที่
  const [locModalOpen, setLocModalOpen] = useState(false);
  const [editingLoc, setEditingLoc] = useState(null);
  const [locForm, setLocForm] = useState({ name: '', building: '', floor: '', department: '', note: '' });

  const defaultDepts = [
    { id: 1, name: 'สำนักทรัพยากรการเรียนรู้คุณหญิงหลง อรรถกระวีสุนทร', building: 'อาคารคุณหญิงหลงฯ', floor: 'ชั้น 1-7', description: 'หน่วยงานหลักและส่วนกลางของสำนักทรัพยากรการเรียนรู้ฯ' },
    { id: 2, name: 'ฝ่ายเทคโนโลยีสารสนเทศ', building: 'อาคารคุณหญิงหลงฯ', floor: 'ชั้น 2', description: 'ดูแลระบบเครือข่าย เซิร์ฟเวอร์ คอมพิวเตอร์ และระบบสารสนเทศ' },
    { id: 3, name: 'ฝ่ายบริหารทั่วไป', building: 'อาคารคุณหญิงหลงฯ', floor: 'ชั้น 2', description: 'งานธุรการ งานพัสดุ การเงิน และบุคลากร' },
    { id: 4, name: 'ฝ่ายบริการสารสนเทศ', building: 'อาคารคุณหญิงหลงฯ', floor: 'ชั้น 3-4', description: 'บริการยืม-คืน สืบค้น และพื้นที่การเรียนรู้' },
    { id: 5, name: 'ฝ่ายจัดการทรัพยากรสารสนเทศ', building: 'อาคารคุณหญิงหลงฯ', floor: 'ชั้น 5', description: 'จัดหา วิเคราะห์หมวดหมู่ และเตรียมทรัพยากรสารสนเทศ' },
    { id: 6, name: 'สำนักงานอธิการบดี', building: 'อาคารสำนักงานอธิการบดี', floor: 'ชั้น 1-4', description: 'หน่วยงานบริหารส่วนกลาง มหาวิทยาลัยสงขลานครินทร์' }
  ];

  const defaultLocs = [
    { id: 1, name: 'ห้องเซิร์ฟเวอร์ ชั้น 2', building: 'อาคารคุณหญิงหลงฯ', floor: 'ชั้น 2', department: 'ฝ่ายเทคโนโลยีสารสนเทศ', note: 'ห้องควบคุมระบบเครือข่ายและแม่ข่ายหลัก' },
    { id: 2, name: 'ห้องสำนักงานบริหาร ชั้น 2', building: 'อาคารคุณหญิงหลงฯ', floor: 'ชั้น 2', department: 'ฝ่ายบริหารทั่วไป', note: 'พื้นที่ปฏิบัติงานเจ้าหน้าที่ธุรการและพัสดุ' },
    { id: 3, name: 'เคาน์เตอร์บริการยืม-คืน ชั้น 3', building: 'อาคารคุณหญิงหลงฯ', floor: 'ชั้น 3', department: 'ฝ่ายบริการสารสนเทศ', note: 'จุดบริการนักศึกษาและบุคลากร' },
    { id: 4, name: 'ห้องประชุมใหญ่ ชั้น 4', building: 'อาคารคุณหญิงหลงฯ', floor: 'ชั้น 4', department: 'สำนักทรัพยากรการเรียนรู้คุณหญิงหลง อรรถกระวีสุนทร', note: 'ห้องประชุมและอบรมสัมมนา' },
    { id: 5, name: 'ห้องปฏิบัติการคอมพิวเตอร์ ชั้น 5', building: 'อาคารคุณหญิงหลงฯ', floor: 'ชั้น 5', department: 'ฝ่ายจัดการทรัพยากรสารสนเทศ', note: 'ห้องปฏิบัติการและจัดเตรียมข้อมูล' }
  ];

  const deptList = departmentsData.length > 0 ? departmentsData : defaultDepts;
  const locList = locationsData.length > 0 ? locationsData : defaultLocs;

  // รวมสถานที่จากตัวครุภัณฑ์ที่อาจยังไม่ได้บันทึกในตาราง locations
  const extraLocNames = Array.from(new Set(equipments.map(e => e.location).filter(Boolean)))
    .filter(name => !locList.some(l => l.name === name));
  const mergedLocations = [
    ...locList,
    ...extraLocNames.map((name, idx) => ({
      id: `auto-${idx}`,
      name,
      building: 'อาคารคุณหญิงหลงฯ',
      floor: '-',
      department: equipments.find(e => e.location === name)?.department || '-',
      note: 'ดึงข้อมูลจากทะเบียนครุภัณฑ์อัตโนมัติ',
      isAuto: true
    }))
  ];

  // สรุปข้อมูลรายหน่วยงาน
  const deptStats = deptList.map(dept => {
    const items = equipments.filter(eq => getAssetDepartment(eq) === dept.name);
    const totalValue = items.reduce((sum, eq) => sum + getAssetPrice(eq), 0);
    const available = items.filter(eq => eq.status === 'พร้อมใช้งาน').length;
    const repairing = items.filter(eq => eq.status === 'ส่งซ่อม').length;
    const borrowed = items.filter(eq => eq.status === 'กำลังถูกยืม').length;
    const roomCount = mergedLocations.filter(l => l.department === dept.name).length;
    return { ...dept, count: items.length, totalValue, available, repairing, borrowed, roomCount };
  });

  // สรุปข้อมูลรายสถานที่
  const locStats = mergedLocations.map(loc => {
    const items = equipments.filter(eq => (eq.location || '') === loc.name);
    const totalValue = items.reduce((sum, eq) => sum + getAssetPrice(eq), 0);
    return { ...loc, count: items.length, totalValue };
  });

  const openAddDept = () => {
    setEditingDept(null);
    setDeptForm({ name: '', building: 'อาคารคุณหญิงหลงฯ', floor: '', description: '' });
    setDeptModalOpen(true);
  };

  const openEditDept = (dept) => {
    setEditingDept(dept);
    setDeptForm({
      name: dept.name || '',
      building: dept.building || '',
      floor: dept.floor || '',
      description: dept.description || ''
    });
    setDeptModalOpen(true);
  };

  const handleSaveDept = async (e) => {
    e.preventDefault();
    try {
      if (editingDept) {
        await axios.put(`http://localhost:5000/api/departments/${editingDept.id}`, {
          ...deptForm,
          oldName: editingDept.name
        });
        if (selectedDept === editingDept.name) setSelectedDept(deptForm.name);
      } else {
        await axios.post('http://localhost:5000/api/departments', deptForm);
      }
      setDeptModalOpen(false);
      await fetchAllData();
    } catch (err) {
      alert(err.response?.data?.error || 'เกิดข้อผิดพลาดในการบันทึกหน่วยงาน');
    }
  };

  const handleDeleteDept = async (dept) => {
    const eqCount = equipments.filter(eq => getAssetDepartment(eq) === dept.name).length;
    if (eqCount > 0) {
      alert(`ไม่สามารถลบหน่วยงาน "${dept.name}" ได้ เนื่องจากยังมีครุภัณฑ์สังกัดอยู่ ${eqCount} รายการ กรุณาโอนย้ายครุภัณฑ์ไปยังหน่วยงานอื่นก่อน`);
      return;
    }
    if (!window.confirm(`ยืนยันการลบหน่วยงาน "${dept.name}" ?`)) return;
    try {
      await axios.delete(`http://localhost:5000/api/departments/${dept.id}`);
      if (selectedDept === dept.name) setSelectedDept('ทั้งหมด');
      await fetchAllData();
    } catch (err) {
      alert(err.response?.data?.error || 'เกิดข้อผิดพลาดในการลบหน่วยงาน');
    }
  };

  const openAddLoc = () => {
    setEditingLoc(null);
    setLocForm({
      name: '',
      building: 'อาคารคุณหญิงหลงฯ',
      floor: '',
      department: deptList[0]?.name || '',
      note: ''
    });
    setLocModalOpen(true);
  };

  const openEditLoc = (loc) => {
    if (loc.isAuto) {
      setEditingLoc(null);
      setLocForm({
        name: loc.name,
        building: loc.building || 'อาคารคุณหญิงหลงฯ',
        floor: loc.floor || '',
        department: loc.department || deptList[0]?.name || '',
        note: ''
      });
    } else {
      setEditingLoc(loc);
      setLocForm({
        name: loc.name || '',
        building: loc.building || '',
        floor: loc.floor || '',
        department: loc.department || '',
        note: loc.note || ''
      });
    }
    setLocModalOpen(true);
  };

  const handleSaveLoc = async (e) => {
    e.preventDefault();
    try {
      if (editingLoc && !editingLoc.isAuto) {
        await axios.put(`http://localhost:5000/api/locations/${editingLoc.id}`, {
          ...locForm,
          oldName: editingLoc.name
        });
        if (selectedLoc === editingLoc.name) setSelectedLoc(locForm.name);
      } else {
        await axios.post('http://localhost:5000/api/locations', locForm);
      }
      setLocModalOpen(false);
      await fetchAllData();
    } catch (err) {
      alert(err.response?.data?.error || 'เกิดข้อผิดพลาดในการบันทึกสถานที่');
    }
  };

  const handleDeleteLoc = async (loc) => {
    const eqCount = equipments.filter(eq => (eq.location || '') === loc.name).length;
    if (loc.isAuto || eqCount > 0) {
      alert(`ไม่สามารถลบสถานที่ "${loc.name}" ได้ เนื่องจากยังมีครุภัณฑ์ติดตั้งอยู่ ${eqCount} รายการ กรุณาโอนย้ายครุภัณฑ์ออกก่อน`);
      return;
    }
    if (!window.confirm(`ยืนยันการลบสถานที่ "${loc.name}" ?`)) return;
    try {
      await axios.delete(`http://localhost:5000/api/locations/${loc.id}`);
      if (selectedLoc === loc.name) setSelectedLoc('ทั้งหมด');
      await fetchAllData();
    } catch (err) {
      alert(err.response?.data?.error || 'เกิดข้อผิดพลาดในการลบสถานที่');
    }
  };

  const displayedEquipments = equipments.filter(eq => {
    const matchDept = selectedDept === 'ทั้งหมด' || getAssetDepartment(eq) === selectedDept;
    const matchLoc = selectedLoc === 'ทั้งหมด' || (eq.location || '') === selectedLoc;
    const matchSearch =
      !searchTerm ||
      eq.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      getAssetCode(eq).toLowerCase().includes(searchTerm.toLowerCase()) ||
      (eq.location || '').toLowerCase().includes(searchTerm.toLowerCase());
    return matchDept && matchLoc && matchSearch;
  });

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-[#002D62]">หน่วยงานและสถานที่</h1>
          <p className="text-xs text-slate-500 mt-1">บริหารจัดการโครงสร้างหน่วยงาน/แผนก และสถานที่ติดตั้งครุภัณฑ์ภายในองค์กร</p>
        </div>
        {canManage && (
          <div className="flex items-center gap-2">
            <button
              onClick={openAddDept}
              className="bg-[#005691] hover:bg-[#003B71] text-white text-xs font-bold py-2.5 px-4 rounded-xl shadow-sm transition flex items-center gap-1.5 cursor-pointer"
            >
              <span>+ เพิ่มหน่วยงาน</span>
            </button>
            <button
              onClick={openAddLoc}
              className="bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold py-2.5 px-4 rounded-xl shadow-sm transition flex items-center gap-1.5 cursor-pointer"
            >
              <span>+ เพิ่มสถานที่/ห้อง</span>
            </button>
          </div>
        )}
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs border-l-4 border-l-[#005691]">
          <div className="text-xs text-slate-500 font-semibold">หน่วยงานทั้งหมด</div>
          <div className="text-2xl font-extrabold text-[#002D62] mt-1">{deptList.length} <span className="text-xs font-normal text-slate-400">หน่วยงาน</span></div>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs border-l-4 border-l-sky-500">
          <div className="text-xs text-sky-700 font-semibold">สถานที่ / ห้องติดตั้ง</div>
          <div className="text-2xl font-extrabold text-slate-800 mt-1">{mergedLocations.length} <span className="text-xs font-normal text-slate-400">แห่ง</span></div>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs border-l-4 border-l-emerald-500">
          <div className="text-xs text-emerald-700 font-semibold">ครุภัณฑ์ที่ระบุสถานที่แล้ว</div>
          <div className="text-2xl font-extrabold text-slate-800 mt-1">
            {equipments.filter(e => e.location && e.location !== '-').length} <span className="text-xs font-normal text-slate-400">รายการ</span>
          </div>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs border-l-4 border-l-amber-500">
          <div className="text-xs text-amber-700 font-semibold">ครุภัณฑ์ทั้งหมด</div>
          <div className="text-2xl font-extrabold text-slate-800 mt-1">{equipments.length} <span className="text-xs font-normal text-slate-400">รายการ</span></div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200 flex gap-8 text-xs font-semibold">
        <button
          onClick={() => setActiveTab('departments')}
          className={`pb-3 transition flex items-center gap-1.5 cursor-pointer ${
            activeTab === 'departments' ? 'text-[#005691] border-b-2 border-[#005691] font-bold' : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <span>หน่วยงาน / แผนก ({deptList.length})</span>
        </button>
        <button
          onClick={() => setActiveTab('locations')}
          className={`pb-3 transition flex items-center gap-1.5 cursor-pointer ${
            activeTab === 'locations' ? 'text-[#005691] border-b-2 border-[#005691] font-bold' : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <span>สถานที่ติดตั้ง / ห้อง ({mergedLocations.length})</span>
        </button>
      </div>

      {/* TAB 1: การ์ดหน่วยงาน */}
      {activeTab === 'departments' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {deptStats.map(dept => {
            const isSelected = selectedDept === dept.name;
            return (
              <div
                key={dept.id || dept.name}
                onClick={() => {
                  setSelectedDept(isSelected ? 'ทั้งหมด' : dept.name);
                  setSelectedLoc('ทั้งหมด');
                }}
                className={`bg-white rounded-2xl border p-5 shadow-2xs transition cursor-pointer flex flex-col justify-between ${
                  isSelected
                    ? 'border-[#005691] ring-2 ring-[#005691]/20 bg-sky-50/30'
                    : 'border-slate-200 hover:border-sky-300 hover:shadow-md'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-bold text-slate-800 text-sm leading-snug">{dept.name}</h3>
                      <div className="text-[11px] text-sky-700 font-medium mt-0.5">
                        {[dept.building, dept.floor].filter(Boolean).join(' • ') || 'ไม่ระบุอาคาร/ชั้น'}
                      </div>
                    </div>
                    {canManage && (
                      <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => openEditDept(dept)}
                          className="p-1.5 text-slate-400 hover:text-[#005691] hover:bg-slate-100 rounded-lg text-xs cursor-pointer"
                          title="แก้ไขหน่วยงาน"
                        >
                          ✏️
                        </button>
                        <button
                          onClick={() => handleDeleteDept(dept)}
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg text-xs cursor-pointer"
                          title="ลบหน่วยงาน"
                        >
                          🗑️
                        </button>
                      </div>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-2.5 line-clamp-2">
                    {dept.description || 'หน่วยงานในสังกัดมหาวิทยาลัยสงขลานครินทร์'}
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 space-y-2 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">ครุภัณฑ์ในความดูแล</span>
                    <span className="font-extrabold text-[#005691] text-sm">{dept.count} รายการ</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">มูลค่ารวม</span>
                    <span className="font-bold text-slate-700">{dept.totalValue.toLocaleString('th-TH')} ฿</span>
                  </div>
                  <div className="flex items-center justify-between pt-1 text-[10px]">
                    <div className="flex gap-1.5">
                      <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">พร้อมใช้ {dept.available}</span>
                      <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">ยืม {dept.borrowed}</span>
                      <span className="px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200">ซ่อม {dept.repairing}</span>
                    </div>
                    <span className="text-slate-400">{dept.roomCount} ห้อง</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* TAB 2: ตารางและการ์ดสถานที่ติดตั้ง */}
      {activeTab === 'locations' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {locStats.map(loc => {
            const isSelected = selectedLoc === loc.name;
            return (
              <div
                key={loc.id || loc.name}
                onClick={() => {
                  setSelectedLoc(isSelected ? 'ทั้งหมด' : loc.name);
                  setSelectedDept('ทั้งหมด');
                }}
                className={`bg-white rounded-2xl border p-5 shadow-2xs transition cursor-pointer flex flex-col justify-between ${
                  isSelected
                    ? 'border-sky-600 ring-2 ring-sky-500/20 bg-sky-50/30'
                    : 'border-slate-200 hover:border-sky-300 hover:shadow-md'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-bold text-slate-800 text-sm">{loc.name}</h3>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        {[loc.building, loc.floor].filter(Boolean).join(' • ') || 'ไม่ระบุอาคาร/ชั้น'}
                      </div>
                    </div>
                    {canManage && (
                      <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => openEditLoc(loc)}
                          className="p-1.5 text-slate-400 hover:text-[#005691] hover:bg-slate-100 rounded-lg text-xs cursor-pointer"
                          title="แก้ไขสถานที่"
                        >
                          ✏️
                        </button>
                        {!loc.isAuto && (
                          <button
                            onClick={() => handleDeleteLoc(loc)}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg text-xs cursor-pointer"
                            title="ลบสถานที่"
                          >
                            🗑️
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="mt-2.5 text-[11px] text-slate-600 bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-100 truncate">
                    สังกัด: <span className="font-semibold">{loc.department || '-'}</span>
                  </div>
                  {loc.note && (
                    <p className="text-[11px] text-slate-400 mt-2 line-clamp-1">{loc.note}</p>
                  )}
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 flex justify-between items-center text-xs">
                  <div>
                    <span className="text-slate-500">ครุภัณฑ์ที่ติดตั้ง: </span>
                    <span className="font-extrabold text-[#005691]">{loc.count} รายการ</span>
                  </div>
                  <span className="font-bold text-slate-700">{loc.totalValue.toLocaleString('th-TH')} ฿</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ตารางแสดงครุภัณฑ์ตามหน่วยงาน/สถานที่ที่คลิกเลือกเท่านั้น */}
      {(selectedDept !== 'ทั้งหมด' || selectedLoc !== 'ทั้งหมด') && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-wrap text-xs">
              {selectedDept !== 'ทั้งหมด' && (
                <span className="px-2.5 py-1 rounded-lg bg-sky-50 text-[#005691] font-bold border border-sky-200">
                  หน่วยงาน: {selectedDept}
                </span>
              )}
              {selectedLoc !== 'ทั้งหมด' && (
                <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 font-bold">
                  สถานที่: {selectedLoc}
                </span>
              )}
              <button
                onClick={() => { setSelectedDept('ทั้งหมด'); setSelectedLoc('ทั้งหมด'); }}
                className="text-[11px] px-2.5 py-1 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 font-semibold cursor-pointer"
              >
                ✕ ปิดตาราง
              </button>
            </div>
            <div className="relative w-full sm:w-64">
              <input
                type="text"
                placeholder="ค้นหาชื่อ, รหัส, สถานที่..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 pl-9 text-xs outline-none focus:ring-2 focus:ring-[#005691]"
              />
              <span className="absolute left-3 top-2.5 text-slate-400 text-xs">🔍</span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100 text-xs">
              <thead className="bg-slate-50 text-slate-400 uppercase font-semibold">
                <tr>
                  <th className="px-4 py-3 text-center w-10">ลำดับ</th>
                  <th className="px-4 py-3 text-left">รหัสครุภัณฑ์</th>
                  <th className="px-4 py-3 text-left">ชื่อครุภัณฑ์</th>
                  <th className="px-4 py-3 text-left">หมวดหมู่</th>
                  <th className="px-4 py-3 text-left">หน่วยงานรับผิดชอบ</th>
                  <th className="px-4 py-3 text-left">สถานที่ติดตั้ง</th>
                  <th className="px-4 py-3 text-right">มูลค่า (บาท)</th>
                  <th className="px-4 py-3 text-left">สถานะ</th>
                  <th className="px-4 py-3 text-center">ป้ายรหัส</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {displayedEquipments.map((eq, idx) => (
                  <tr key={eq.id} className="hover:bg-slate-50/80 transition">
                    <td className="px-4 py-3 text-center text-slate-400 font-mono">{idx + 1}</td>
                    <td className="px-4 py-3 font-mono font-bold text-[#005691]">{getAssetCode(eq)}</td>
                    <td className="px-4 py-3 font-semibold text-slate-800">{eq.name}</td>
                    <td className="px-4 py-3 text-slate-500">{eq.category}</td>
                    <td className="px-4 py-3 text-slate-700 font-medium">{getAssetDepartment(eq)}</td>
                    <td className="px-4 py-3 text-sky-700 font-medium">{eq.location || '-'}</td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-700">
                      {getAssetPrice(eq).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold ${
                        eq.status === 'พร้อมใช้งาน' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                        eq.status === 'ส่งซ่อม' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                        'bg-slate-100 text-slate-600 border border-slate-200'
                      }`}>
                        {eq.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => onOpenSingleTag && onOpenSingleTag(eq)}
                        className="bg-sky-50 hover:bg-sky-100 text-[#005691] font-semibold px-2.5 py-1 rounded-lg border border-sky-200 text-[11px] cursor-pointer"
                      >
                        ป้าย
                      </button>
                    </td>
                  </tr>
                ))}
                {displayedEquipments.length === 0 && (
                  <tr>
                    <td colSpan="9" className="px-6 py-12 text-center text-slate-400">ไม่พบรายการครุภัณฑ์ตามเงื่อนไขที่เลือก</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal เพิ่ม / แก้ไขหน่วยงาน */}
      {deptModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl overflow-hidden border border-slate-200">
            <div className="bg-[#071d36] text-white p-4 px-6 flex justify-between items-center">
              <div>
                <h3 className="font-extrabold text-base">
                  {editingDept ? '✏️ แก้ไขข้อมูลหน่วยงาน' : '🏢 เพิ่มหน่วยงานใหม่'}
                </h3>
                <p className="text-[11px] text-sky-300 mt-0.5">ระบุชื่อหน่วยงาน อาคาร และรายละเอียด</p>
              </div>
              <button onClick={() => setDeptModalOpen(false)} className="text-slate-400 hover:text-white font-bold p-1 text-lg cursor-pointer">✕</button>
            </div>

            <form onSubmit={handleSaveDept} className="p-6 space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-800 mb-1">ชื่อหน่วยงาน / แผนก <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  required
                  placeholder="เช่น ฝ่ายส่งเสริมการเรียนรู้"
                  value={deptForm.name}
                  onChange={e => setDeptForm({ ...deptForm, name: e.target.value })}
                  className="w-full border border-slate-300 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-[#005691]"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-800 mb-1">อาคาร</label>
                  <input
                    type="text"
                    placeholder="เช่น อาคารคุณหญิงหลงฯ"
                    value={deptForm.building}
                    onChange={e => setDeptForm({ ...deptForm, building: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-[#005691]"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-800 mb-1">ชั้น</label>
                  <input
                    type="text"
                    placeholder="เช่น ชั้น 3"
                    value={deptForm.floor}
                    onChange={e => setDeptForm({ ...deptForm, floor: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-[#005691]"
                  />
                </div>
              </div>
              <div>
                <label className="block font-bold text-slate-800 mb-1">รายละเอียดหน้าที่รับผิดชอบ</label>
                <textarea
                  rows={2}
                  placeholder="ระบุภารกิจหรือขอบเขตงานของหน่วยงาน..."
                  value={deptForm.description}
                  onChange={e => setDeptForm({ ...deptForm, description: e.target.value })}
                  className="w-full border border-slate-300 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-[#005691]"
                />
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button type="button" onClick={() => setDeptModalOpen(false)} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-medium cursor-pointer">
                  ยกเลิก
                </button>
                <button type="submit" className="px-5 py-2 bg-[#005691] hover:bg-[#003B71] text-white rounded-xl font-bold shadow-md cursor-pointer">
                  ✓ บันทึกหน่วยงาน
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal เพิ่ม / แก้ไขสถานที่ติดตั้ง */}
      {locModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl overflow-hidden border border-slate-200">
            <div className="bg-[#071d36] text-white p-4 px-6 flex justify-between items-center">
              <div>
                <h3 className="font-extrabold text-base">
                  {editingLoc ? '✏️ แก้ไขสถานที่ติดตั้ง' : '📍 เพิ่มสถานที่ติดตั้ง / ห้องใหม่'}
                </h3>
                <p className="text-[11px] text-sky-300 mt-0.5">ระบุชื่อห้อง อาคาร ชั้น และหน่วยงานที่ดูแล</p>
              </div>
              <button onClick={() => setLocModalOpen(false)} className="text-slate-400 hover:text-white font-bold p-1 text-lg cursor-pointer">✕</button>
            </div>

            <form onSubmit={handleSaveLoc} className="p-6 space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-800 mb-1">ชื่อสถานที่ / ห้อง <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  required
                  placeholder="เช่น ห้องเซิร์ฟเวอร์ ชั้น 2, ห้องประชุม 401..."
                  value={locForm.name}
                  onChange={e => setLocForm({ ...locForm, name: e.target.value })}
                  className="w-full border border-slate-300 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-[#005691]"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-800 mb-1">อาคาร</label>
                  <input
                    type="text"
                    placeholder="เช่น อาคารคุณหญิงหลงฯ"
                    value={locForm.building}
                    onChange={e => setLocForm({ ...locForm, building: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-[#005691]"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-800 mb-1">ชั้น</label>
                  <input
                    type="text"
                    placeholder="เช่น ชั้น 2"
                    value={locForm.floor}
                    onChange={e => setLocForm({ ...locForm, floor: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-[#005691]"
                  />
                </div>
              </div>
              <div>
                <label className="block font-bold text-slate-800 mb-1">หน่วยงานที่รับผิดชอบพื้นที่</label>
                <select
                  value={locForm.department}
                  onChange={e => setLocForm({ ...locForm, department: e.target.value })}
                  className="w-full border border-slate-300 rounded-xl p-2.5 bg-white outline-none focus:ring-2 focus:ring-[#005691]"
                >
                  {deptList.map(d => <option key={d.name} value={d.name}>{d.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block font-bold text-slate-800 mb-1">หมายเหตุเพิ่มเติม</label>
                <input
                  type="text"
                  placeholder="เช่น ห้องควบคุมอุณหภูมิ, ต้องใช้คีย์การ์ด..."
                  value={locForm.note}
                  onChange={e => setLocForm({ ...locForm, note: e.target.value })}
                  className="w-full border border-slate-300 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-[#005691]"
                />
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button type="button" onClick={() => setLocModalOpen(false)} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-medium cursor-pointer">
                  ยกเลิก
                </button>
                <button type="submit" className="px-5 py-2 bg-[#005691] hover:bg-[#003B71] text-white rounded-xl font-bold shadow-md cursor-pointer">
                  ✓ บันทึกสถานที่
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// =========================================================================
// 5e. หน้าตรวจนับครุภัณฑ์ (AUDIT PAGE)
// =========================================================================
function AuditPage({ equipments = [], audits = [], fetchAllData, currentUser }) {
  const isAdmin = currentUser?.role === 'admin';
  const canManage = currentUser?.role === 'admin' || currentUser?.role === 'staff';
  const [fiscalYear, setFiscalYear] = useState('2569');
  const [activeTab, setActiveTab] = useState('checklist'); // 'checklist' | 'history'
  const [searchTerm, setSearchTerm] = useState('');
  const [deptFilter, setDeptFilter] = useState('ทั้งหมด');
  const [auditFilter, setAuditFilter] = useState('ทั้งหมด'); // 'ทั้งหมด' | 'ตรวจแล้ว' | 'ยังไม่ตรวจ'

  // Modal บันทึกผลตรวจนับละเอียด
  const [modalEq, setModalEq] = useState(null);
  const [form, setForm] = useState({
    audit_status: 'พบปกติ',
    found_location: '',
    auditor: currentUser?.full_name || currentUser?.username || 'ผู้ดูแลระบบ',
    note: ''
  });

  // หาผลตรวจนับล่าสุดของครุภัณฑ์แต่ละชิ้นในปีงบที่เลือก
  const latestAuditByEqId = {};
  audits
    .filter(a => String(a.fiscal_year || '2569') === String(fiscalYear))
    .forEach(a => {
      if (!latestAuditByEqId[a.equipment_id]) {
        latestAuditByEqId[a.equipment_id] = a;
      }
    });

  const activeEquipments = equipments.filter(e => e.status !== 'จำหน่ายแล้ว');
  const auditedCount = activeEquipments.filter(e => !!latestAuditByEqId[e.id]).length;
  const pendingCount = activeEquipments.length - auditedCount;
  const foundNormalCount = Object.values(latestAuditByEqId).filter(a => a.audit_status === 'พบปกติ').length;
  const issueCount = Object.values(latestAuditByEqId).filter(a => a.audit_status !== 'พบปกติ').length;
  const progressPercent = activeEquipments.length > 0 ? Math.round((auditedCount / activeEquipments.length) * 100) : 0;

  const allDepts = Array.from(new Set(activeEquipments.map(e => getAssetDepartment(e)).filter(Boolean)));

  const filteredEquipments = activeEquipments.filter(eq => {
    const hasAudit = !!latestAuditByEqId[eq.id];
    const matchAudit =
      auditFilter === 'ทั้งหมด' ||
      (auditFilter === 'ตรวจแล้ว' && hasAudit) ||
      (auditFilter === 'ยังไม่ตรวจ' && !hasAudit);
    const matchDept = deptFilter === 'ทั้งหมด' || getAssetDepartment(eq) === deptFilter;
    const matchSearch =
      !searchTerm ||
      eq.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      getAssetCode(eq).toLowerCase().includes(searchTerm.toLowerCase()) ||
      (eq.location || '').toLowerCase().includes(searchTerm.toLowerCase());
    return matchAudit && matchDept && matchSearch;
  });

  const handleQuickAudit = async (eq, status) => {
    try {
      await axios.post('http://localhost:5000/api/audits', {
        equipment_id: eq.id,
        fiscal_year: fiscalYear,
        audit_status: status,
        found_location: eq.location || '-',
        auditor: currentUser?.full_name || currentUser?.username || 'ผู้ดูแลระบบ',
        note: 'ตรวจนับด่วนประจำปี'
      });
      await fetchAllData();
    } catch (err) {
      alert('เกิดข้อผิดพลาดในการบันทึกผลตรวจนับ');
    }
  };

  const openAuditModal = (eq) => {
    const prev = latestAuditByEqId[eq.id];
    setModalEq(eq);
    setForm({
      audit_status: prev?.audit_status || 'พบปกติ',
      found_location: prev?.found_location || eq.location || '',
      auditor: currentUser?.full_name || currentUser?.username || 'ผู้ดูแลระบบ',
      note: prev?.note || ''
    });
  };

  const handleSubmitAudit = async (e) => {
    e.preventDefault();
    if (!modalEq) return;
    try {
      await axios.post('http://localhost:5000/api/audits', {
        equipment_id: modalEq.id,
        fiscal_year: fiscalYear,
        ...form
      });
      setModalEq(null);
      await fetchAllData();
    } catch (err) {
      alert('เกิดข้อผิดพลาดในการบันทึกผลตรวจนับ');
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-[#002D62]">📋 ตรวจนับครุภัณฑ์ประจำปี</h1>
          <p className="text-xs text-slate-500 mt-1">ตรวจสอบสภาพและสถานะการคงอยู่ของครุภัณฑ์ตามรอบปีงบประมาณ ม.อ.</p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="font-bold text-slate-600">ปีงบประมาณ:</span>
          <select
            value={fiscalYear}
            onChange={e => setFiscalYear(e.target.value)}
            className="bg-white border border-slate-300 rounded-xl px-3.5 py-2 font-bold text-[#002D62] outline-none focus:ring-2 focus:ring-[#005691]"
          >
            <option value="2569">พ.ศ. 2569</option>
            <option value="2570">พ.ศ. 2570</option>
            <option value="2568">พ.ศ. 2568</option>
          </select>
        </div>
      </div>

      {/* Progress Banner & Stats */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs space-y-3">
        <div className="flex justify-between items-center text-xs">
          <span className="font-bold text-slate-700">ความคืบหน้าการตรวจนับครุภัณฑ์ ปีงบประมาณ {fiscalYear}</span>
          <span className="font-extrabold text-[#005691] text-sm">{auditedCount} / {activeEquipments.length} รายการ ({progressPercent}%)</span>
        </div>
        <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-[#005691] to-emerald-500 transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs border-l-4 border-l-[#005691]">
          <div className="text-xs text-slate-500 font-semibold">ตรวจนับแล้ว</div>
          <div className="text-2xl font-extrabold text-[#002D62] mt-1">{auditedCount} <span className="text-xs font-normal text-slate-400">รายการ</span></div>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs border-l-4 border-l-slate-400">
          <div className="text-xs text-slate-500 font-semibold">รอตรวจนับ</div>
          <div className="text-2xl font-extrabold text-slate-800 mt-1">{pendingCount} <span className="text-xs font-normal text-slate-400">รายการ</span></div>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs border-l-4 border-l-emerald-500">
          <div className="text-xs text-emerald-700 font-semibold">พบปกติ</div>
          <div className="text-2xl font-extrabold text-slate-800 mt-1">{foundNormalCount} <span className="text-xs font-normal text-slate-400">รายการ</span></div>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs border-l-4 border-l-rose-500">
          <div className="text-xs text-rose-700 font-semibold">ชำรุด / สูญหาย / รอจำหน่าย</div>
          <div className="text-2xl font-extrabold text-slate-800 mt-1">{issueCount} <span className="text-xs font-normal text-slate-400">รายการ</span></div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200 flex gap-8 text-xs font-semibold">
        <button
          onClick={() => setActiveTab('checklist')}
          className={`pb-3 transition cursor-pointer ${
            activeTab === 'checklist' ? 'text-[#005691] border-b-2 border-[#005691] font-bold' : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          📋 รายการตรวจนับครุภัณฑ์ ({activeEquipments.length})
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`pb-3 transition cursor-pointer ${
            activeTab === 'history' ? 'text-[#005691] border-b-2 border-[#005691] font-bold' : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          🕒 ประวัติบันทึกการตรวจนับทั้งหมด ({audits.length})
        </button>
      </div>

      {activeTab === 'checklist' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-sm">
              <input
                type="text"
                placeholder="ค้นหาชื่อ, รหัสครุภัณฑ์, สถานที่..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 pl-9 text-xs outline-none focus:ring-2 focus:ring-[#005691]"
              />
              <span className="absolute left-3 top-2.5 text-slate-400 text-xs">🔍</span>
            </div>
            <div className="flex items-center gap-2 flex-wrap text-xs">
              <select
                value={auditFilter}
                onChange={e => setAuditFilter(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 outline-none"
              >
                <option value="ทั้งหมด">สถานะตรวจนับทั้งหมด ▾</option>
                <option value="ยังไม่ตรวจ">⏳ ยังไม่ตรวจนับ</option>
                <option value="ตรวจแล้ว">✅ ตรวจนับแล้ว</option>
              </select>
              <select
                value={deptFilter}
                onChange={e => setDeptFilter(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 outline-none"
              >
                <option value="ทั้งหมด">ทุกหน่วยงาน ▾</option>
                {allDepts.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100 text-xs">
              <thead className="bg-slate-50 text-slate-400 uppercase font-semibold">
                <tr>
                  <th className="px-4 py-3 text-center w-10">ลำดับ</th>
                  <th className="px-4 py-3 text-left">รหัสครุภัณฑ์</th>
                  <th className="px-4 py-3 text-left">ชื่อครุภัณฑ์</th>
                  <th className="px-4 py-3 text-left">หน่วยงาน / สถานที่</th>
                  <th className="px-4 py-3 text-left">ผลการตรวจนับ (ปี {fiscalYear})</th>
                  <th className="px-4 py-3 text-left">ผู้ตรวจ / วันเวลา</th>
                  <th className="px-4 py-3 text-center">บันทึกผลตรวจนับ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {filteredEquipments.map((eq, idx) => {
                  const audit = latestAuditByEqId[eq.id];
                  return (
                    <tr key={eq.id} className="hover:bg-slate-50/80 transition">
                      <td className="px-4 py-3 text-center text-slate-400 font-mono">{idx + 1}</td>
                      <td className="px-4 py-3 font-mono font-bold text-[#005691]">{getAssetCode(eq)}</td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-800">{eq.name}</div>
                        <div className="text-[11px] text-slate-400">{eq.category}</div>
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        <div className="font-medium">{getAssetDepartment(eq)}</div>
                        <div className="text-[11px] text-slate-400">📍 {eq.location || '-'}</div>
                      </td>
                      <td className="px-4 py-3">
                        {audit ? (
                          <div>
                            <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold inline-flex items-center gap-1 ${
                              audit.audit_status === 'พบปกติ'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : audit.audit_status === 'ชำรุด'
                                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                : 'bg-rose-50 text-rose-700 border border-rose-200'
                            }`}>
                              {audit.audit_status === 'พบปกติ' ? '✅' : '⚠️'} {audit.audit_status}
                            </span>
                            {audit.note && <div className="text-[11px] text-slate-400 mt-1">{audit.note}</div>}
                          </div>
                        ) : (
                          <span className="px-2.5 py-1 rounded-full text-[11px] bg-slate-100 text-slate-500 border border-slate-200">
                            ⏳ รอตรวจนับ
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-500">
                        {audit ? (
                          <div>
                            <div className="font-medium text-slate-700">{audit.auditor}</div>
                            <div className="text-[10px] text-slate-400">
                              {new Date(audit.audited_at).toLocaleString('th-TH')}
                            </div>
                          </div>
                        ) : '-'}
                      </td>
                      <td className="px-4 py-3 text-center whitespace-nowrap">
                        {canManage ? (
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              onClick={() => handleQuickAudit(eq, 'พบปกติ')}
                              className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-2.5 py-1.5 rounded-lg text-[11px] transition cursor-pointer"
                              title="กดยืนยันพบครุภัณฑ์ปกติ"
                            >
                              ✓ พบปกติ
                            </button>
                            <button
                              onClick={() => openAuditModal(eq)}
                              className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold px-2.5 py-1.5 rounded-lg text-[11px] transition cursor-pointer"
                            >
                              📝 ระบุผลละเอียด
                            </button>
                          </div>
                        ) : '-'}
                      </td>
                    </tr>
                  );
                })}
                {filteredEquipments.length === 0 && (
                  <tr>
                    <td colSpan="7" className="px-6 py-12 text-center text-slate-400">ไม่พบรายการครุภัณฑ์ตามเงื่อนไข</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'history' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100 text-xs">
              <thead className="bg-slate-50 text-slate-400 uppercase font-semibold">
                <tr>
                  <th className="px-4 py-3 text-center w-10">ลำดับ</th>
                  <th className="px-4 py-3 text-left">ปีงบ</th>
                  <th className="px-4 py-3 text-left">รหัส</th>
                  <th className="px-4 py-3 text-left">ชื่อครุภัณฑ์</th>
                  <th className="px-4 py-3 text-left">ผลการตรวจ</th>
                  <th className="px-4 py-3 text-left">สถานที่พบจริง</th>
                  <th className="px-4 py-3 text-left">ผู้ตรวจนับ</th>
                  <th className="px-4 py-3 text-left">หมายเหตุ</th>
                  <th className="px-4 py-3 text-left">วัน-เวลา</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {audits.map((a, idx) => (
                  <tr key={a.id} className="hover:bg-slate-50/80">
                    <td className="px-4 py-3 text-center text-slate-400 font-mono">{idx + 1}</td>
                    <td className="px-4 py-3 font-semibold text-slate-700">{a.fiscal_year}</td>
                    <td className="px-4 py-3 font-mono font-bold text-[#005691]">{a.equipment_code}</td>
                    <td className="px-4 py-3 font-semibold text-slate-800">{a.equipment_name}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                        a.audit_status === 'พบปกติ'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-amber-50 text-amber-700 border border-amber-200'
                      }`}>
                        {a.audit_status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{a.found_location || '-'}</td>
                    <td className="px-4 py-3 text-slate-600">{a.auditor || '-'}</td>
                    <td className="px-4 py-3 text-slate-500">{a.note || '-'}</td>
                    <td className="px-4 py-3 text-slate-500">
                      {a.audited_at ? new Date(a.audited_at).toLocaleString('th-TH') : '-'}
                    </td>
                  </tr>
                ))}
                {audits.length === 0 && (
                  <tr>
                    <td colSpan="9" className="px-6 py-12 text-center text-slate-400">ยังไม่มีประวัติการตรวจนับครุภัณฑ์</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal บันทึกผลตรวจนับละเอียด */}
      {modalEq && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl overflow-hidden border border-slate-200">
            <div className="bg-[#071d36] text-white p-4 px-6 flex justify-between items-center">
              <div>
                <h3 className="font-extrabold text-base">📋 บันทึกผลตรวจนับครุภัณฑ์</h3>
                <p className="text-[11px] text-sky-300 mt-0.5">[{getAssetCode(modalEq)}] {modalEq.name}</p>
              </div>
              <button onClick={() => setModalEq(null)} className="text-slate-400 hover:text-white font-bold p-1 text-lg cursor-pointer">✕</button>
            </div>

            <form onSubmit={handleSubmitAudit} className="p-6 space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-800 mb-1">สภาพ / ผลการตรวจนับ <span className="text-red-500">*</span></label>
                <select
                  value={form.audit_status}
                  onChange={e => setForm({ ...form, audit_status: e.target.value })}
                  className="w-full border border-slate-300 rounded-xl p-2.5 bg-white font-semibold outline-none focus:ring-2 focus:ring-[#005691]"
                >
                  <option value="พบปกติ">✅ พบปกติ (พร้อมใช้งาน)</option>
                  <option value="ชำรุด">⚠️ ชำรุด (เปลี่ยนสถานะเป็นส่งซ่อม)</option>
                  <option value="เสื่อมสภาพ/รอจำหน่าย">🗑️ เสื่อมสภาพ (เสนอจำหน่าย)</option>
                  <option value="สูญหาย/ไม่พบ">❌ สูญหาย / ไม่พบในพื้นที่</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-800 mb-1">📍 สถานที่พบจริง</label>
                <input
                  type="text"
                  value={form.found_location}
                  onChange={e => setForm({ ...form, found_location: e.target.value })}
                  placeholder="ระบุห้องหรือจุดที่พบครุภัณฑ์..."
                  className="w-full border border-slate-300 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-[#005691]"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-800 mb-1">👤 ผู้ตรวจนับ</label>
                <input
                  type="text"
                  value={form.auditor}
                  onChange={e => setForm({ ...form, auditor: e.target.value })}
                  className="w-full border border-slate-300 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-[#005691]"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-800 mb-1">📝 หมายเหตุ</label>
                <textarea
                  rows={2}
                  value={form.note}
                  onChange={e => setForm({ ...form, note: e.target.value })}
                  placeholder="บันทึกรายละเอียดสภาพหรือข้อสังเกต..."
                  className="w-full border border-slate-300 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-[#005691]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button type="button" onClick={() => setModalEq(null)} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-medium cursor-pointer">
                  ยกเลิก
                </button>
                <button type="submit" className="px-5 py-2 bg-[#005691] hover:bg-[#003B71] text-white rounded-xl font-bold shadow-md cursor-pointer">
                  ✓ บันทึกผลตรวจนับ
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// =========================================================================
// 5f. หน้าจำหน่ายครุภัณฑ์ (DISPOSAL PAGE)
// =========================================================================
function DisposalPage({ equipments = [], disposals = [], fetchAllData, currentUser }) {
  const isAdmin = currentUser?.role === 'admin';
  const canManage = currentUser?.role === 'admin' || currentUser?.role === 'staff';
  const [activeTab, setActiveTab] = useState('records'); // 'records' | 'select'
  const [searchTerm, setSearchTerm] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedEq, setSelectedEq] = useState(null);
  const [modalEqSearch, setModalEqSearch] = useState('');
  const [showEqDropdown, setShowEqDropdown] = useState(false);
  const [form, setForm] = useState({
    equipment_id: '',
    disposal_method: 'ขายทอดตลาด',
    reason: 'เสื่อมสภาพจากการใช้งานตามอายุ ไม่คุ้มค่าในการซ่อมบำรุง',
    committee: currentUser?.full_name || currentUser?.username || 'ผู้ดูแลระบบ',
    sale_price: '0',
    doc_no: '',
    disposal_status: 'รอจำหน่าย'
  });

  const pendingDisposals = disposals.filter(d => d.disposal_status === 'รอจำหน่าย');
  const completedDisposals = disposals.filter(d => d.disposal_status === 'จำหน่ายแล้ว');
  const totalSaleRevenue = completedDisposals.reduce((sum, d) => sum + (parseFloat(d.sale_price) || 0), 0);

  const availableForDisposal = equipments.filter(e => e.status !== 'จำหน่ายแล้ว');

  const openDisposalModal = (eq = null) => {
    const target = eq || availableForDisposal[0] || null;
    setSelectedEq(target);
    setModalEqSearch(target ? `[${getAssetCode(target)}] ${target.name} (${getAssetDepartment(target)})` : '');
    setShowEqDropdown(false);
    setForm({
      equipment_id: target ? target.id : '',
      disposal_method: 'ขายทอดตลาด',
      reason: 'เสื่อมสภาพจากการใช้งานตามอายุ ไม่คุ้มค่าในการซ่อมบำรุง',
      committee: currentUser?.full_name || currentUser?.username || 'ผู้ดูแลระบบ',
      sale_price: '0',
      doc_no: `มอ.301/${new Date().getFullYear() + 543}`,
      disposal_status: 'รอจำหน่าย'
    });
    setModalOpen(true);
  };

  const handleSubmitDisposal = async (e) => {
    e.preventDefault();
    if (!form.equipment_id) return;
    try {
      await axios.post('http://localhost:5000/api/disposals', form);
      setModalOpen(false);
      await fetchAllData();
    } catch (err) {
      alert('เกิดข้อผิดพลาดในการบันทึกจำหน่ายครุภัณฑ์');
    }
  };

  const handleApproveDisposal = async (disp) => {
    if (!window.confirm(`ยืนยันอนุมัติการจำหน่ายครุภัณฑ์ "${disp.equipment_name}" ออกจากระบบบัญชี?`)) return;
    try {
      await axios.put(`http://localhost:5000/api/disposals/${disp.id}/approve`);
      await fetchAllData();
    } catch (err) {
      alert('เกิดข้อผิดพลาดในการอนุมัติจำหน่าย');
    }
  };

  const filteredCandidates = availableForDisposal.filter(eq =>
    !searchTerm ||
    eq.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    getAssetCode(eq).toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-[#002D62]">🗑️ จำหน่ายครุภัณฑ์</h1>
          <p className="text-xs text-slate-500 mt-1">บริหารจัดการรายการครุภัณฑ์ชำรุด เสื่อมสภาพ หรือหมดความจำเป็นในการใช้งาน</p>
        </div>
        {canManage && (
          <button
            onClick={() => openDisposalModal(null)}
            className="bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold py-2.5 px-4 rounded-xl shadow-sm transition flex items-center gap-2 cursor-pointer"
          >
            <span>+ เสนอจำหน่ายครุภัณฑ์</span>
          </button>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs border-l-4 border-l-[#005691]">
          <div className="text-xs text-slate-500 font-semibold">รายการเสนอจำหน่ายทั้งหมด</div>
          <div className="text-2xl font-extrabold text-[#002D62] mt-1">{disposals.length} <span className="text-xs font-normal text-slate-400">รายการ</span></div>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs border-l-4 border-l-amber-500">
          <div className="text-xs text-amber-700 font-semibold">รออนุมัติจำหน่าย</div>
          <div className="text-2xl font-extrabold text-slate-800 mt-1">{pendingDisposals.length} <span className="text-xs font-normal text-slate-400">รายการ</span></div>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs border-l-4 border-l-rose-500">
          <div className="text-xs text-rose-700 font-semibold">จำหน่ายออกจากระบบแล้ว</div>
          <div className="text-2xl font-extrabold text-slate-800 mt-1">{completedDisposals.length} <span className="text-xs font-normal text-slate-400">รายการ</span></div>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs border-l-4 border-l-emerald-500">
          <div className="text-xs text-emerald-700 font-semibold">รายได้จากการขายทอดตลาด</div>
          <div className="text-2xl font-extrabold text-slate-800 mt-1">
            {totalSaleRevenue.toLocaleString('th-TH')} <span className="text-xs font-normal text-slate-400">บาท</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200 flex gap-8 text-xs font-semibold">
        <button
          onClick={() => setActiveTab('records')}
          className={`pb-3 transition cursor-pointer ${
            activeTab === 'records' ? 'text-[#005691] border-b-2 border-[#005691] font-bold' : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          📄 รายการเสนอจำหน่าย & ประวัติ ({disposals.length})
        </button>
        <button
          onClick={() => setActiveTab('select')}
          className={`pb-3 transition cursor-pointer ${
            activeTab === 'select' ? 'text-[#005691] border-b-2 border-[#005691] font-bold' : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          🗂️ เลือกครุภัณฑ์เพื่อเสนอจำหน่าย ({availableForDisposal.length})
        </button>
      </div>

      {/* TAB 1: รายการเสนอจำหน่าย */}
      {activeTab === 'records' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100 text-xs">
              <thead className="bg-slate-50 text-slate-400 uppercase font-semibold">
                <tr>
                  <th className="px-4 py-3 text-center w-10">ลำดับ</th>
                  <th className="px-4 py-3 text-left">รหัสครุภัณฑ์</th>
                  <th className="px-4 py-3 text-left">ชื่อครุภัณฑ์</th>
                  <th className="px-4 py-3 text-left">วิธีจำหน่าย</th>
                  <th className="px-4 py-3 text-left">สาเหตุ / เลขที่เอกสาร</th>
                  <th className="px-4 py-3 text-right">ราคาจำหน่าย (บาท)</th>
                  <th className="px-4 py-3 text-left">สถานะ</th>
                  <th className="px-4 py-3 text-left">วันที่ทำรายการ</th>
                  <th className="px-4 py-3 text-center">การดำเนินการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {disposals.map((d, idx) => (
                  <tr key={d.id} className="hover:bg-slate-50/80 transition">
                    <td className="px-4 py-3 text-center text-slate-400 font-mono">{idx + 1}</td>
                    <td className="px-4 py-3 font-mono font-bold text-[#005691]">{d.equipment_code}</td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-800">{d.equipment_name}</div>
                      <div className="text-[11px] text-slate-400">{d.equipment_department || '-'}</div>
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-700">{d.disposal_method}</td>
                    <td className="px-4 py-3 text-slate-600">
                      <div>{d.reason || '-'}</div>
                      {d.doc_no && <div className="text-[11px] text-sky-700 font-mono">เอกสาร: {d.doc_no}</div>}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-700">
                      {(parseFloat(d.sale_price) || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${
                        d.disposal_status === 'จำหน่ายแล้ว'
                          ? 'bg-rose-50 text-rose-700 border border-rose-200'
                          : 'bg-amber-50 text-amber-700 border border-amber-200'
                      }`}>
                        {d.disposal_status === 'จำหน่ายแล้ว' ? 'จำหน่าย' : d.disposal_status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {d.requested_at ? new Date(d.requested_at).toLocaleDateString('th-TH') : '-'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {d.disposal_status === 'รอจำหน่าย' && canManage ? (
                        <button
                          onClick={() => handleApproveDisposal(d)}
                          className="bg-rose-600 hover:bg-rose-700 text-white font-semibold px-3 py-1.5 rounded-lg text-[11px] transition cursor-pointer"
                        >
                          ✓ อนุมัติจำหน่าย
                        </button>
                      ) : (
                        <span className="text-slate-400 text-[11px]">เสร็จสมบูรณ์</span>
                      )}
                    </td>
                  </tr>
                ))}
                {disposals.length === 0 && (
                  <tr>
                    <td colSpan="9" className="px-6 py-12 text-center text-slate-400">
                      ยังไม่มีรายการเสนอจำหน่ายครุภัณฑ์ — กดปุ่ม "+ เสนอจำหน่ายครุภัณฑ์" ด้านบนเพื่อเริ่มต้น
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: เลือกครุภัณฑ์จากทะเบียนเพื่อเสนอจำหน่าย */}
      {activeTab === 'select' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between gap-3">
            <div className="relative flex-1 max-w-sm">
              <input
                type="text"
                placeholder="ค้นหาครุภัณฑ์ที่ต้องการเสนอจำหน่าย..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 pl-9 text-xs outline-none focus:ring-2 focus:ring-[#005691]"
              />
              <span className="absolute left-3 top-2.5 text-slate-400 text-xs">🔍</span>
            </div>
            <span className="text-xs text-slate-400">{filteredCandidates.length} รายการ</span>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100 text-xs">
              <thead className="bg-slate-50 text-slate-400 uppercase font-semibold">
                <tr>
                  <th className="px-4 py-3 text-center w-10">ลำดับ</th>
                  <th className="px-4 py-3 text-left">รหัส</th>
                  <th className="px-4 py-3 text-left">ชื่อครุภัณฑ์</th>
                  <th className="px-4 py-3 text-left">หน่วยงาน</th>
                  <th className="px-4 py-3 text-right">ราคาทุนเดิม</th>
                  <th className="px-4 py-3 text-center">ประวัติซ่อม</th>
                  <th className="px-4 py-3 text-left">สถานะปัจจุบัน</th>
                  <th className="px-4 py-3 text-center">จัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {filteredCandidates.map((eq, idx) => (
                  <tr key={eq.id} className="hover:bg-slate-50/80">
                    <td className="px-4 py-3 text-center text-slate-400 font-mono">{idx + 1}</td>
                    <td className="px-4 py-3 font-mono font-bold text-[#005691]">{getAssetCode(eq)}</td>
                    <td className="px-4 py-3 font-semibold text-slate-800">{eq.name}</td>
                    <td className="px-4 py-3 text-slate-600">{getAssetDepartment(eq)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-700">
                      {getAssetPrice(eq).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[11px]">
                        {eq.repair_count || 0} ครั้ง
                      </span>
                    </td>
                    <td className="px-4 py-3">{eq.status}</td>
                    <td className="px-4 py-3 text-center">
                      {canManage && (
                        <button
                          onClick={() => openDisposalModal(eq)}
                          className="bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-semibold px-3 py-1.5 rounded-lg text-[11px] transition cursor-pointer"
                        >
                          🗑️ เสนอจำหน่าย
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal เสนอจำหน่ายครุภัณฑ์ */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden border border-slate-200">
            <div className="bg-[#071d36] text-white p-4 px-6 flex justify-between items-center">
              <div>
                <h3 className="font-extrabold text-base">🗑️ บันทึกการจำหน่ายครุภัณฑ์</h3>
                <p className="text-[11px] text-sky-300 mt-0.5">กรอกรายละเอียดตามระเบียบพัสดุ ม.อ.</p>
              </div>
              <button onClick={() => setModalOpen(false)} className="text-slate-400 hover:text-white font-bold p-1 text-lg cursor-pointer">✕</button>
            </div>

            <form onSubmit={handleSubmitDisposal} className="p-6 space-y-4 text-xs">
              <div className="relative">
                <label className="block font-bold text-slate-800 mb-1">
                  เลือกครุภัณฑ์ที่ต้องการจำหน่าย (พิมพ์ค้นหารหัส / ชื่อ / หน่วยงาน) <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={modalEqSearch}
                    onFocus={() => setShowEqDropdown(true)}
                    onChange={e => {
                      setModalEqSearch(e.target.value);
                      setShowEqDropdown(true);
                    }}
                    placeholder="พิมพ์รหัสครุภัณฑ์ ชื่อครุภัณฑ์ หรือหน่วยงานเพื่อค้นหา..."
                    className="w-full border border-slate-300 rounded-xl p-2.5 pr-16 bg-white font-semibold outline-none focus:ring-2 focus:ring-[#005691]"
                  />
                  <div className="absolute right-2.5 top-2 flex items-center gap-1">
                    {modalEqSearch && (
                      <button
                        type="button"
                        onClick={() => {
                          setModalEqSearch('');
                          setForm({ ...form, equipment_id: '' });
                          setShowEqDropdown(true);
                        }}
                        className="text-slate-400 hover:text-slate-600 px-1.5 py-0.5 rounded text-xs cursor-pointer"
                        title="ล้างข้อความค้นหา"
                      >
                        ✕
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setShowEqDropdown(!showEqDropdown)}
                      className="text-slate-500 hover:text-slate-800 px-1 py-0.5 text-xs cursor-pointer"
                    >
                      ▾
                    </button>
                  </div>
                </div>

                {showEqDropdown && (
                  <div className="absolute z-30 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-xl max-h-48 overflow-y-auto divide-y divide-slate-100">
                    {availableForDisposal
                      .filter(eq => {
                        const q = modalEqSearch.trim().toLowerCase();
                        if (!q) return true;
                        const label = `[${getAssetCode(eq)}] ${eq.name} (${getAssetDepartment(eq)})`.toLowerCase();
                        if (label === q) return true;
                        return (
                          getAssetCode(eq).toLowerCase().includes(q) ||
                          (eq.name || '').toLowerCase().includes(q) ||
                          getAssetDepartment(eq).toLowerCase().includes(q) ||
                          (eq.serial_no || '').toLowerCase().includes(q)
                        );
                      })
                      .map(eq => {
                        const isSelected = String(form.equipment_id) === String(eq.id);
                        return (
                          <div
                            key={eq.id}
                            onClick={() => {
                              setSelectedEq(eq);
                              setForm({ ...form, equipment_id: eq.id });
                              setModalEqSearch(`[${getAssetCode(eq)}] ${eq.name} (${getAssetDepartment(eq)})`);
                              setShowEqDropdown(false);
                            }}
                            className={`px-3.5 py-2.5 cursor-pointer transition flex items-center justify-between gap-2 ${
                              isSelected ? 'bg-sky-50 text-[#005691] font-bold' : 'hover:bg-slate-50 text-slate-700'
                            }`}
                          >
                            <div className="truncate">
                              <span className="font-mono font-bold text-[#005691] mr-2">[{getAssetCode(eq)}]</span>
                              <span className="font-semibold">{eq.name}</span>
                              <span className="text-slate-400 text-[11px] ml-1.5">({getAssetDepartment(eq)})</span>
                            </div>
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 shrink-0">
                              {eq.status}
                            </span>
                          </div>
                        );
                      })}
                    {availableForDisposal.filter(eq => {
                      const q = modalEqSearch.trim().toLowerCase();
                      if (!q) return true;
                      const label = `[${getAssetCode(eq)}] ${eq.name} (${getAssetDepartment(eq)})`.toLowerCase();
                      if (label === q) return true;
                      return (
                        getAssetCode(eq).toLowerCase().includes(q) ||
                        (eq.name || '').toLowerCase().includes(q) ||
                        getAssetDepartment(eq).toLowerCase().includes(q) ||
                        (eq.serial_no || '').toLowerCase().includes(q)
                      );
                    }).length === 0 && (
                      <div className="px-4 py-3 text-center text-slate-400">
                        ไม่พบครุภัณฑ์ที่ตรงกับคำค้นหา
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-800 mb-1">วิธีการจำหน่าย <span className="text-red-500">*</span></label>
                  <select
                    value={form.disposal_method}
                    onChange={e => setForm({ ...form, disposal_method: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl p-2.5 bg-white outline-none focus:ring-2 focus:ring-[#005691]"
                  >
                    <option value="ขายทอดตลาด">💰 ขายทอดตลาด</option>
                    <option value="โอนให้หน่วยงานอื่น">🏢 โอนให้หน่วยงานภายนอก</option>
                    <option value="บริจาค">🎁 บริจาคเพื่อสาธารณประโยชน์</option>
                    <option value="ทำลาย/แปรสภาพ">🔨 ทำลายตามระเบียบพัสดุ</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-800 mb-1">สถานะการดำเนินการ</label>
                  <select
                    value={form.disposal_status}
                    onChange={e => setForm({ ...form, disposal_status: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl p-2.5 bg-white outline-none focus:ring-2 focus:ring-[#005691]"
                  >
                    <option value="รอจำหน่าย">⏳ รออนุมัติจำหน่าย</option>
                    <option value="จำหน่ายแล้ว">✅ อนุมัติจำหน่ายทันที</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-800 mb-1">สาเหตุการเสนอจำหน่าย <span className="text-red-500">*</span></label>
                <textarea
                  rows={2}
                  required
                  value={form.reason}
                  onChange={e => setForm({ ...form, reason: e.target.value })}
                  className="w-full border border-slate-300 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-[#005691]"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-slate-800 mb-1">ราคาขายทอดตลาด (บาท)</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={form.sale_price}
                    onChange={e => setForm({ ...form, sale_price: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-[#005691]"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-800 mb-1">เลขที่เอกสารอ้างอิง</label>
                  <input
                    type="text"
                    value={form.doc_no}
                    onChange={e => setForm({ ...form, doc_no: e.target.value })}
                    placeholder="เช่น มอ.301/2569"
                    className="w-full border border-slate-300 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-[#005691]"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-800 mb-1">ผู้เสนอ / ประธานกรรมการ</label>
                  <input
                    type="text"
                    value={form.committee}
                    onChange={e => setForm({ ...form, committee: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-[#005691]"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-medium cursor-pointer">
                  ยกเลิก
                </button>
                <button type="submit" className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold shadow-md cursor-pointer">
                  ✓ บันทึกรายการจำหน่าย
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// =========================================================================
// 5g. หน้ารายละเอียดการซื้อ (PURCHASE DETAILS PAGE - อ้างอิงทะเบียนคุมครุภัณฑ์ ปีงบ 70)
// =========================================================================
function PurchaseDetailsPage({ equipments = [], fiscalYearsData = [], deliveryTrucks = [], fetchAllData, currentUser }) {
  const isAdmin = currentUser?.role === 'admin';
  const canManage = currentUser?.role === 'admin' || currentUser?.role === 'staff';
  const [searchTerm, setSearchTerm] = useState('');
  const [fiscalFilter, setFiscalFilter] = useState('ทั้งหมด');
  const [methodFilter, setMethodFilter] = useState('ทั้งหมด');
  const [viewMode, setViewMode] = useState('summary'); // 'summary' | 'full39'
  const [selectedEq, setSelectedEq] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [fyModalOpen, setFyModalOpen] = useState(false);
  const [newFyInput, setNewFyInput] = useState('');
  const [newFyNote, setNewFyNote] = useState('');

  const handleAddFiscalYear = async (e) => {
    e.preventDefault();
    const y = newFyInput.trim();
    if (!y) return;
    try {
      await axios.post('http://localhost:5000/api/fiscal-years', { year: y, note: newFyNote });
      setNewFyInput('');
      setNewFyNote('');
      setFyModalOpen(false);
      await fetchAllData();
    } catch (err) {
      alert('เกิดข้อผิดพลาดในการเพิ่มปีงบประมาณ');
    }
  };

  const emptyForm = {
    code: '', name: '', category: '', details: '', brand: '', serial_no: '', license_plate: '',
    price: 0, shipping_cost: 0, installation_cost: 0, other_cost: 0,
    location: '', dept_code: 'LRC-01', department: 'สำนักทรัพยากรการเรียนรู้คุณหญิงหลง อรรถกระวีสุนทร',
    fiscal_year: '2570', fund_code: 'F-2570', fund_source: 'เงินงบประมาณแผ่นดิน',
    requisition_no: '', requisition_date: '', purchase_approval_no: '', purchase_approval_date: '',
    purchase_method: 'เฉพาะเจาะจง', vendor: '', payment_doc_no: '', contract_no: '',
    contract_start_date: '', contract_end_date: '', received_date: '',
    useful_life: '5 ปี', salvage_value: 1, warranty_period: '1 ปี', warranty_end_date: '',
    status: 'พร้อมใช้งาน', disposal_date: '', disposal_doc_no: '', disposal_note: '', remark: ''
  };

  const [form, setForm] = useState(emptyForm);

  const openDetailModal = (eq, edit = false) => {
    setSelectedEq(eq);
    setIsEditing(edit);
    setForm({
      code: getAssetCode(eq),
      name: eq.name || '',
      category: eq.category || '',
      details: eq.details || '',
      brand: eq.brand || '',
      serial_no: eq.serial_no || '',
      license_plate: eq.license_plate || '-',
      price: getAssetPrice(eq),
      shipping_cost: parseFloat(eq.shipping_cost) || 0,
      installation_cost: parseFloat(eq.installation_cost) || 0,
      other_cost: parseFloat(eq.other_cost) || 0,
      location: eq.location || '',
      dept_code: eq.dept_code || 'LRC-01',
      department: getAssetDepartment(eq),
      fiscal_year: eq.fiscal_year || '2570',
      fund_code: eq.fund_code || 'BG-70',
      fund_source: eq.fund_source || 'เงินงบประมาณแผ่นดิน',
      requisition_no: eq.requisition_no || '',
      requisition_date: eq.requisition_date || '',
      purchase_approval_no: eq.purchase_approval_no || '',
      purchase_approval_date: eq.purchase_approval_date || '',
      purchase_method: eq.purchase_method || 'เฉพาะเจาะจง',
      vendor: eq.vendor || '',
      payment_doc_no: eq.payment_doc_no || '',
      contract_no: eq.contract_no || '',
      contract_start_date: eq.contract_start_date || '',
      contract_end_date: eq.contract_end_date || '',
      received_date: eq.received_date || (eq.created_at ? new Date(eq.created_at).toISOString().slice(0, 10) : ''),
      useful_life: eq.useful_life || '5 ปี',
      salvage_value: eq.salvage_value !== undefined && eq.salvage_value !== null ? eq.salvage_value : 1,
      warranty_period: eq.warranty_period || '1 ปี',
      warranty_end_date: eq.warranty_end_date || '',
      status: eq.status || 'พร้อมใช้งาน',
      disposal_date: eq.disposal_date || '',
      disposal_doc_no: eq.disposal_doc_no || '',
      disposal_note: eq.disposal_note || '',
      remark: eq.remark || ''
    });
  };

  const handleSavePurchaseDetails = async (e) => {
    e.preventDefault();
    if (!selectedEq) return;
    try {
      const payload = {
        ...form,
        modified_by: currentUser?.full_name || currentUser?.username || 'ผู้ดูแลระบบ'
      };
      await axios.put(`http://localhost:5000/api/equipments/${selectedEq.id}`, payload);
      setSelectedEq(null);
      await fetchAllData();
    } catch (err) {
      alert('เกิดข้อผิดพลาดในการบันทึกรายละเอียดการซื้อ');
    }
  };

  const handleExportFull39CSV = () => {
    const titleRow = ',ทะเบียนครุภัณฑ์สำนักทรัพยากรการเรียนรู้คุณหญิงหลง อรรถกระวีสุนทร ปีงบประมาณ 2570,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,';
    const headers = [
      'ลำดับ', 'รหัสครุภัณฑ์', 'ชื่อครุภัณฑ์', 'ประเภทครุภัณฑ์', 'รายละเอียดครุภัณฑ์', 'ยี่ห้อ', 'SERIAL_NO', 'หมายเลขป้ายทะเบียนรถ',
      'ราคาต่อหน่วย', 'ค่าขนส่ง', 'ค่าติดตั้ง', 'ค่าใช้จ่ายอื่น', 'สถานที่ใช้งาน', 'รหัสส่วนงาน', 'ชื่อส่วนงาน', 'ปีงบประมาณ',
      'รหัสแหล่งเงิน', 'แหล่งเงิน', 'เลขที่ใบเบิก', 'วันที่ใบเบิกครุภัณฑ์', 'เลขที่เอกสารขออนุมัติซื้อ', 'วันที่เอกสารขออนุมัติซื้อ',
      'วิธีการจัดซื้อ', 'ซื้อจาก', 'เลขที่เอกสารเบิกจ่าย', 'เลขที่สัญญา', 'วันเริ่มสัญญา', 'วันสิ้นสุดสัญญา', 'วันที่ตรวจรับ',
      'อายุการใช้งาน', 'มูลค่าคงเหลือ', 'ระยะเวลาประกัน', 'วันสิ้นสุดประกัน', 'สถานะ', 'วันที่ตัดจำหน่าย', 'เลขที่เอกสารตัดจำหน่าย',
      'หมายเหตุการตัดจำหน่าย', 'ประวัติการซ่อมแซม', 'หมายเหตุ'
    ].join(',');

    const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

    const rows = filtered.map((eq, idx) => [
      idx + 1,
      q(getAssetCode(eq)),
      q(eq.name || ''),
      q(eq.category || ''),
      q(eq.details || ''),
      q(eq.brand || ''),
      q(eq.serial_no || ''),
      q(eq.license_plate || '-'),
      getAssetPrice(eq),
      parseFloat(eq.shipping_cost) || 0,
      parseFloat(eq.installation_cost) || 0,
      parseFloat(eq.other_cost) || 0,
      q(eq.location || ''),
      q(eq.dept_code || 'LRC-01'),
      q(getAssetDepartment(eq)),
      q(eq.fiscal_year || '2570'),
      q(eq.fund_code || 'BG-70'),
      q(eq.fund_source || 'เงินงบประมาณแผ่นดิน'),
      q(eq.requisition_no || ''),
      q(eq.requisition_date || ''),
      q(eq.purchase_approval_no || ''),
      q(eq.purchase_approval_date || ''),
      q(eq.purchase_method || 'เฉพาะเจาะจง'),
      q(eq.vendor || ''),
      q(eq.payment_doc_no || ''),
      q(eq.contract_no || ''),
      q(eq.contract_start_date || ''),
      q(eq.contract_end_date || ''),
      q(eq.received_date || ''),
      q(eq.useful_life || '5 ปี'),
      parseFloat(eq.salvage_value ?? 1),
      q(eq.warranty_period || '1 ปี'),
      q(eq.warranty_end_date || ''),
      q(eq.status || 'พร้อมใช้งาน'),
      q(eq.disposal_date || ''),
      q(eq.disposal_doc_no || ''),
      q(eq.disposal_note || ''),
      q(`${eq.repair_count || 0} ครั้ง`),
      q(eq.remark || '')
    ].join(','));

    const csvContent = '\uFEFF' + [titleRow, headers, ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `ทะเบียนคุมครุภัณฑ์_ปีงบ_70_${new Date().toLocaleDateString('th-TH')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filtered = equipments.filter(eq => {
    const q = searchTerm.trim().toLowerCase();
    const matchSearch =
      !q ||
      getAssetCode(eq).toLowerCase().includes(q) ||
      (eq.name || '').toLowerCase().includes(q) ||
      (eq.vendor || '').toLowerCase().includes(q) ||
      (eq.contract_no || '').toLowerCase().includes(q) ||
      (eq.purchase_approval_no || '').toLowerCase().includes(q) ||
      (eq.serial_no || '').toLowerCase().includes(q);
    const matchFiscal = fiscalFilter === 'ทั้งหมด' || String(eq.fiscal_year || '2570') === fiscalFilter;
    const matchMethod = methodFilter === 'ทั้งหมด' || (eq.purchase_method || 'เฉพาะเจาะจง') === methodFilter;
    return matchSearch && matchFiscal && matchMethod;
  });

  const totalUnitPrice = filtered.reduce((s, eq) => s + getAssetPrice(eq), 0);
  const totalExtraCost = filtered.reduce(
    (s, eq) => s + (parseFloat(eq.shipping_cost) || 0) + (parseFloat(eq.installation_cost) || 0) + (parseFloat(eq.other_cost) || 0),
    0
  );
  const withContractCount = filtered.filter(eq => eq.contract_no && eq.contract_no.trim() !== '').length;

  // จัดกลุ่มตามปีงบประมาณเป็นหลัก (รวมปีงบที่เพิ่งสร้างใหม่ในระบบด้วย)
  const allAvailableFiscalYears = Array.from(
    new Set([
      ...fiscalYearsData.map(f => String(f.year)),
      ...equipments.map(eq => String(eq.fiscal_year || '2570')),
      '2570'
    ].filter(Boolean))
  ).sort();

  const fiscalYearsList = allAvailableFiscalYears.filter(fy =>
    fiscalFilter === 'ทั้งหมด' ? true : fy === fiscalFilter
  );

  const fiscalGroups = fiscalYearsList.map((fy, gIdx) => {
    const items = filtered.filter(eq => String(eq.fiscal_year || '2570') === fy);
    const sumPrice = items.reduce((s, eq) => s + getAssetPrice(eq), 0);
    return {
      orderNo: gIdx + 1,
      fiscalYear: fy,
      items,
      sumPrice
    };
  });

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-[#002D62]">
            📑 รายละเอียดการซื้อ / ทะเบียนคุมครุภัณฑ์
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            ทะเบียนครุภัณฑ์สำนักทรัพยากรการเรียนรู้คุณหญิงหลง อรรถกระวีสุนทร ปีงบประมาณ 2570 (ครบ 39 รายการข้อมูลมาตรฐาน)
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 text-xs">
            <button
              onClick={() => setViewMode('summary')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer ${
                viewMode === 'summary' ? 'bg-[#005691] text-white' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              📋 มุมมองสรุปจัดซื้อ
            </button>
            <button
              onClick={() => setViewMode('full39')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer ${
                viewMode === 'full39' ? 'bg-[#005691] text-white' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              📊 ตารางทะเบียนคุมครบ 39 คอลัมน์
            </button>
          </div>
          {canManage && (
            <button
              onClick={() => setFyModalOpen(true)}
              className="bg-[#005691] hover:bg-[#003B71] text-white text-xs font-bold py-2.5 px-4 rounded-xl shadow-sm transition flex items-center gap-1.5 cursor-pointer"
            >
              <span>+ เพิ่มปีงบประมาณ</span>
            </button>
          )}
          <button
            onClick={handleExportFull39CSV}
            className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold py-2.5 px-4 rounded-xl shadow-sm transition flex items-center gap-1.5 cursor-pointer"
          >
            <span>📥 ส่งออกไฟล์ CSV</span>
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs border-l-4 border-l-[#005691]">
          <div className="text-xs text-slate-500 font-semibold">รายการครุภัณฑ์</div>
          <div className="text-2xl font-extrabold text-[#002D62] mt-1">{filtered.length} <span className="text-xs font-normal text-slate-400">รายการ</span></div>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs border-l-4 border-l-emerald-500">
          <div className="text-xs text-emerald-700 font-semibold">มูลค่าราคาต่อหน่วยรวม</div>
          <div className="text-2xl font-extrabold text-slate-800 mt-1">
            {totalUnitPrice.toLocaleString('th-TH', { minimumFractionDigits: 2 })} <span className="text-xs font-normal text-slate-400">฿</span>
          </div>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs border-l-4 border-l-sky-500">
          <div className="text-xs text-sky-700 font-semibold">รวมค่าขนส่ง/ติดตั้ง/อื่นๆ</div>
          <div className="text-2xl font-extrabold text-slate-800 mt-1">
            {totalExtraCost.toLocaleString('th-TH', { minimumFractionDigits: 2 })} <span className="text-xs font-normal text-slate-400">฿</span>
          </div>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs border-l-4 border-l-amber-500">
          <div className="text-xs text-amber-700 font-semibold">ระบุเลขที่สัญญาแล้ว</div>
          <div className="text-2xl font-extrabold text-slate-800 mt-1">{withContractCount} <span className="text-xs font-normal text-slate-400">รายการ</span></div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <input
              type="text"
              placeholder="ค้นหารหัส, ชื่อครุภัณฑ์, ผู้ขาย (ซื้อจาก), เลขที่สัญญา, เลขที่ใบเบิก..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 pl-9 text-xs outline-none focus:ring-2 focus:ring-[#005691]"
            />
            <span className="absolute left-3 top-2.5 text-slate-400 text-xs">🔍</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap text-xs">
            <select
              value={fiscalFilter}
              onChange={e => setFiscalFilter(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 outline-none"
            >
              <option value="ทั้งหมด">ทุกปีงบประมาณ ▾</option>
              {allAvailableFiscalYears.map(fy => (
                <option key={fy} value={fy}>ปีงบประมาณ {fy}</option>
              ))}
            </select>
            <select
              value={methodFilter}
              onChange={e => setMethodFilter(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 outline-none"
            >
              <option value="ทั้งหมด">ทุกวิธีการจัดซื้อ ▾</option>
              <option value="เฉพาะเจาะจง">เฉพาะเจาะจง</option>
              <option value="ประกวดราคาอิเล็กทรอนิกส์ (e-bidding)">e-bidding</option>
              <option value="ตลาดอิเล็กทรอนิกส์ (e-market)">e-market</option>
              <option value="คัดเลือก">คัดเลือก</option>
              <option value="รับบริจาค/โอน">รับบริจาค/โอน</option>
            </select>
          </div>
        </div>

        {/* VIEW 1: แสดงโดยยึดปีงบประมาณเป็นหลัก + รายการทะเบียนรถจัดส่งและรายละเอียด */}
        {viewMode === 'summary' && (
          <div className="p-4 space-y-6 bg-slate-50/60">
            {fiscalGroups.map(group => (
              <div key={group.fiscalYear} className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
                {/* แถบหัวข้อปีงบประมาณหลัก */}
                <div className="bg-[#071d36] text-white px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <span className="font-extrabold text-base text-white">
                      งบประมาณปี {group.fiscalYear}
                    </span>
                    <span className="text-xs text-sky-300">
                      ({group.items.length} รายการครุภัณฑ์)
                    </span>
                  </div>
                  <div className="text-xs text-sky-200 font-semibold">
                    มูลค่ารวมปีงบ {group.fiscalYear}:{' '}
                    <span className="text-white font-extrabold text-sm">
                      {group.sumPrice.toLocaleString('th-TH', { minimumFractionDigits: 2 })} บาท
                    </span>
                  </div>
                </div>

                {/* ตารางรายการจัดส่งและรายละเอียดภายในปีงบประมาณนั้นๆ */}
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-100 text-xs">
                    <thead className="bg-slate-50 text-slate-500 uppercase font-semibold">
                      <tr>
                        <th className="px-4 py-3 text-center w-20">ลำดับ</th>
                        <th className="px-4 py-3 text-left">รหัสครุภัณฑ์</th>
                        <th className="px-4 py-3 text-left">ทะเบียนรถจัดส่ง</th>
                        <th className="px-4 py-3 text-left">ชื่อครุภัณฑ์ / รายละเอียด</th>
                        <th className="px-4 py-3 text-right">ราคาต่อหน่วย</th>
                        <th className="px-4 py-3 text-left">วิธีการจัดซื้อ / ซื้อจาก</th>
                        <th className="px-4 py-3 text-center">จัดการข้อมูลการซื้อ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {group.items.map((eq, idx) => {
                        const plate = (eq.license_plate && eq.license_plate !== '-') ? eq.license_plate : '-';
                        return (
                          <tr key={eq.id} className="hover:bg-sky-50/40 transition">
                            <td className="px-4 py-3.5 text-center font-extrabold text-[#002D62] whitespace-nowrap">
                              {idx + 1}
                            </td>
                            <td className="px-4 py-3.5 font-mono font-bold text-[#005691] whitespace-nowrap">
                              {getAssetCode(eq)}
                            </td>
                            <td className="px-4 py-3.5 whitespace-nowrap">
                              <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-amber-50 text-amber-800 border border-amber-200 font-mono font-bold text-xs">
                                {plate}
                              </span>
                            </td>
                            <td className="px-4 py-3.5">
                              <div className="font-bold text-slate-800">{eq.name}</div>
                              <div className="text-[11px] text-slate-400">
                                ยี่ห้อ: {eq.brand || '-'} • สถานที่: {eq.location || '-'}
                              </div>
                            </td>
                            <td className="px-4 py-3.5 text-right font-bold text-slate-800 whitespace-nowrap">
                              {getAssetPrice(eq).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                            </td>
                            <td className="px-4 py-3.5">
                              <div className="font-semibold text-sky-700">{eq.purchase_method || 'เฉพาะเจาะจง'}</div>
                              <div className="text-[11px] text-slate-500 truncate max-w-[180px]">
                                ซื้อจาก: {eq.vendor || 'ยังไม่ระบุผู้ขาย'}
                              </div>
                            </td>
                            <td className="px-4 py-3.5 text-center whitespace-nowrap">
                              <div className="inline-flex items-center gap-1.5">
                                <button
                                  onClick={() => openDetailModal(eq, false)}
                                  className="bg-sky-50 hover:bg-sky-100 text-[#005691] border border-sky-200 font-semibold px-2.5 py-1.5 rounded-lg text-[11px] cursor-pointer"
                                >
                                  ดูรายละเอียด
                                </button>
                                {canManage && (
                                  <button
                                    onClick={() => openDetailModal(eq, true)}
                                    className="bg-[#005691] hover:bg-[#003B71] text-white font-semibold px-2.5 py-1.5 rounded-lg text-[11px] cursor-pointer"
                                  >
                                    แก้ไขการซื้อ
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {group.items.length === 0 && (
                    <div className="p-8 text-center text-slate-400 text-xs">
                      ยังไม่มีรายการครุภัณฑ์ในปีงบประมาณ {group.fiscalYear} — สามารถเลือกปีงบประมาณนี้เมื่อกดรับเข้าครุภัณฑ์ใหม่ได้
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* VIEW 2: Full 39-Column Table */}
        {viewMode === 'full39' && (
          <div className="overflow-x-auto">
            <table className="min-w-max divide-y divide-slate-200 text-[11px]">
              <thead className="bg-slate-100 text-slate-700 font-bold">
                <tr>
                  <th className="px-3 py-2.5 border-r border-slate-200">1. ลำดับ</th>
                  <th className="px-3 py-2.5 border-r border-slate-200">2. รหัสครุภัณฑ์</th>
                  <th className="px-3 py-2.5 border-r border-slate-200">3. ชื่อครุภัณฑ์</th>
                  <th className="px-3 py-2.5 border-r border-slate-200">4. ประเภทครุภัณฑ์</th>
                  <th className="px-3 py-2.5 border-r border-slate-200">5. รายละเอียดครุภัณฑ์</th>
                  <th className="px-3 py-2.5 border-r border-slate-200">6. ยี่ห้อ</th>
                  <th className="px-3 py-2.5 border-r border-slate-200">7. SERIAL_NO</th>
                  <th className="px-3 py-2.5 border-r border-slate-200">8. หมายเลขป้ายทะเบียนรถ</th>
                  <th className="px-3 py-2.5 border-r border-slate-200 text-right">9. ราคาต่อหน่วย</th>
                  <th className="px-3 py-2.5 border-r border-slate-200 text-right">10. ค่าขนส่ง</th>
                  <th className="px-3 py-2.5 border-r border-slate-200 text-right">11. ค่าติดตั้ง</th>
                  <th className="px-3 py-2.5 border-r border-slate-200 text-right">12. ค่าใช้จ่ายอื่น</th>
                  <th className="px-3 py-2.5 border-r border-slate-200">13. สถานที่ใช้งาน</th>
                  <th className="px-3 py-2.5 border-r border-slate-200">14. รหัสส่วนงาน</th>
                  <th className="px-3 py-2.5 border-r border-slate-200">15. ชื่อส่วนงาน</th>
                  <th className="px-3 py-2.5 border-r border-slate-200">16. ปีงบประมาณ</th>
                  <th className="px-3 py-2.5 border-r border-slate-200">17. รหัสแหล่งเงิน</th>
                  <th className="px-3 py-2.5 border-r border-slate-200">18. แหล่งเงิน</th>
                  <th className="px-3 py-2.5 border-r border-slate-200">19. เลขที่ใบเบิก</th>
                  <th className="px-3 py-2.5 border-r border-slate-200">20. วันที่ใบเบิกครุภัณฑ์</th>
                  <th className="px-3 py-2.5 border-r border-slate-200">21. เลขที่เอกสารขออนุมัติซื้อ</th>
                  <th className="px-3 py-2.5 border-r border-slate-200">22. วันที่เอกสารขออนุมัติซื้อ</th>
                  <th className="px-3 py-2.5 border-r border-slate-200">23. วิธีการจัดซื้อ</th>
                  <th className="px-3 py-2.5 border-r border-slate-200">24. ซื้อจาก</th>
                  <th className="px-3 py-2.5 border-r border-slate-200">25. เลขที่เอกสารเบิกจ่าย</th>
                  <th className="px-3 py-2.5 border-r border-slate-200">26. เลขที่สัญญา</th>
                  <th className="px-3 py-2.5 border-r border-slate-200">27. วันเริ่มสัญญา</th>
                  <th className="px-3 py-2.5 border-r border-slate-200">28. วันสิ้นสุดสัญญา</th>
                  <th className="px-3 py-2.5 border-r border-slate-200">29. วันที่ตรวจรับ</th>
                  <th className="px-3 py-2.5 border-r border-slate-200">30. อายุการใช้งาน</th>
                  <th className="px-3 py-2.5 border-r border-slate-200 text-right">31. มูลค่าคงเหลือ</th>
                  <th className="px-3 py-2.5 border-r border-slate-200">32. ระยะเวลาประกัน</th>
                  <th className="px-3 py-2.5 border-r border-slate-200">33. วันสิ้นสุดประกัน</th>
                  <th className="px-3 py-2.5 border-r border-slate-200">34. สถานะ</th>
                  <th className="px-3 py-2.5 border-r border-slate-200">35. วันที่ตัดจำหน่าย</th>
                  <th className="px-3 py-2.5 border-r border-slate-200">36. เลขที่เอกสารตัดจำหน่าย</th>
                  <th className="px-3 py-2.5 border-r border-slate-200">37. หมายเหตุการตัดจำหน่าย</th>
                  <th className="px-3 py-2.5 border-r border-slate-200 text-center">38. ประวัติการซ่อมแซม</th>
                  <th className="px-3 py-2.5 border-r border-slate-200">39. หมายเหตุ</th>
                  <th className="px-3 py-2.5 text-center">แก้ไข</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {filtered.map((eq, idx) => (
                  <tr key={eq.id} className="hover:bg-sky-50/40">
                    <td className="px-3 py-2 text-center border-r border-slate-100 font-mono">{idx + 1}</td>
                    <td className="px-3 py-2 border-r border-slate-100 font-mono font-bold text-[#005691]">{getAssetCode(eq)}</td>
                    <td className="px-3 py-2 border-r border-slate-100 font-semibold text-slate-800">{eq.name}</td>
                    <td className="px-3 py-2 border-r border-slate-100">{eq.category || '-'}</td>
                    <td className="px-3 py-2 border-r border-slate-100">{eq.details || '-'}</td>
                    <td className="px-3 py-2 border-r border-slate-100">{eq.brand || '-'}</td>
                    <td className="px-3 py-2 border-r border-slate-100 font-mono">{eq.serial_no || '-'}</td>
                    <td className="px-3 py-2 border-r border-slate-100">{eq.license_plate || '-'}</td>
                    <td className="px-3 py-2 border-r border-slate-100 text-right font-semibold">{getAssetPrice(eq).toLocaleString('th-TH', { minimumFractionDigits: 2 })}</td>
                    <td className="px-3 py-2 border-r border-slate-100 text-right">{(parseFloat(eq.shipping_cost) || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })}</td>
                    <td className="px-3 py-2 border-r border-slate-100 text-right">{(parseFloat(eq.installation_cost) || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })}</td>
                    <td className="px-3 py-2 border-r border-slate-100 text-right">{(parseFloat(eq.other_cost) || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })}</td>
                    <td className="px-3 py-2 border-r border-slate-100">{eq.location || '-'}</td>
                    <td className="px-3 py-2 border-r border-slate-100 font-mono">{eq.dept_code || 'LRC-01'}</td>
                    <td className="px-3 py-2 border-r border-slate-100">{getAssetDepartment(eq)}</td>
                    <td className="px-3 py-2 border-r border-slate-100 text-center">{eq.fiscal_year || '2570'}</td>
                    <td className="px-3 py-2 border-r border-slate-100 font-mono">{eq.fund_code || 'BG-70'}</td>
                    <td className="px-3 py-2 border-r border-slate-100">{eq.fund_source || 'เงินงบประมาณแผ่นดิน'}</td>
                    <td className="px-3 py-2 border-r border-slate-100">{eq.requisition_no || '-'}</td>
                    <td className="px-3 py-2 border-r border-slate-100">{eq.requisition_date || '-'}</td>
                    <td className="px-3 py-2 border-r border-slate-100">{eq.purchase_approval_no || '-'}</td>
                    <td className="px-3 py-2 border-r border-slate-100">{eq.purchase_approval_date || '-'}</td>
                    <td className="px-3 py-2 border-r border-slate-100">{eq.purchase_method || 'เฉพาะเจาะจง'}</td>
                    <td className="px-3 py-2 border-r border-slate-100">{eq.vendor || '-'}</td>
                    <td className="px-3 py-2 border-r border-slate-100">{eq.payment_doc_no || '-'}</td>
                    <td className="px-3 py-2 border-r border-slate-100 font-mono">{eq.contract_no || '-'}</td>
                    <td className="px-3 py-2 border-r border-slate-100">{eq.contract_start_date || '-'}</td>
                    <td className="px-3 py-2 border-r border-slate-100">{eq.contract_end_date || '-'}</td>
                    <td className="px-3 py-2 border-r border-slate-100">{eq.received_date || '-'}</td>
                    <td className="px-3 py-2 border-r border-slate-100">{eq.useful_life || '5 ปี'}</td>
                    <td className="px-3 py-2 border-r border-slate-100 text-right">{(parseFloat(eq.salvage_value ?? 1)).toLocaleString('th-TH', { minimumFractionDigits: 2 })}</td>
                    <td className="px-3 py-2 border-r border-slate-100">{eq.warranty_period || '1 ปี'}</td>
                    <td className="px-3 py-2 border-r border-slate-100">{eq.warranty_end_date || '-'}</td>
                    <td className="px-3 py-2 border-r border-slate-100 font-semibold">{eq.status || 'พร้อมใช้งาน'}</td>
                    <td className="px-3 py-2 border-r border-slate-100">{eq.disposal_date || '-'}</td>
                    <td className="px-3 py-2 border-r border-slate-100">{eq.disposal_doc_no || '-'}</td>
                    <td className="px-3 py-2 border-r border-slate-100">{eq.disposal_note || '-'}</td>
                    <td className="px-3 py-2 border-r border-slate-100 text-center">{eq.repair_count || 0} ครั้ง</td>
                    <td className="px-3 py-2 border-r border-slate-100">{eq.remark || '-'}</td>
                    <td className="px-3 py-2 text-center">
                      <button
                        onClick={() => openDetailModal(eq, true)}
                        className="text-[#005691] hover:underline font-bold cursor-pointer"
                      >
                        ✏️ แก้ไข
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal แสดงและแก้ไขข้อมูลทะเบียนคุมครุภัณฑ์ครบ 39 ช่อง */}
      {selectedEq && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-4xl w-full shadow-2xl overflow-hidden border border-slate-200">
            <div className="bg-[#071d36] text-white p-4 px-6 flex justify-between items-center">
              <div>
                <h3 className="font-extrabold text-base flex items-center gap-2">
                  <span>📑</span>
                  <span>{isEditing ? 'แก้ไขรายละเอียดการจัดซื้อและทะเบียนคุมครุภัณฑ์' : 'รายละเอียดการจัดซื้อและทะเบียนคุมครุภัณฑ์'}</span>
                </h3>
                <p className="text-[11px] text-sky-300 mt-0.5">
                  [{getAssetCode(selectedEq)}] {selectedEq.name} — สำนักทรัพยากรการเรียนรู้คุณหญิงหลง อรรถกระวีสุนทร
                </p>
              </div>
              <div className="flex items-center gap-2">
                {!isEditing && canManage && (
                  <button
                    type="button"
                    onClick={() => setIsEditing(true)}
                    className="bg-sky-500 hover:bg-sky-600 text-white text-xs font-bold px-3 py-1.5 rounded-lg cursor-pointer"
                  >
                    ✏️ แก้ไขข้อมูล
                  </button>
                )}
                <button onClick={() => setSelectedEq(null)} className="text-slate-400 hover:text-white font-bold p-1 text-lg cursor-pointer">✕</button>
              </div>
            </div>

            <form onSubmit={handleSavePurchaseDetails} className="p-6 space-y-6 text-xs max-h-[80vh] overflow-y-auto">
              {/* หมวด 1: ราคาและค่าใช้จ่ายในการจัดซื้อ */}
              <div className="space-y-3">
                <h4 className="font-extrabold text-[#002D62] border-b border-slate-200 pb-1.5">
                  1. ราคาและค่าใช้จ่ายในการจัดซื้อ
                </h4>
                <div className="bg-sky-50 border border-sky-200 rounded-xl px-3.5 py-2.5 text-[11px] text-sky-800">
                  <span className="font-bold">หมายเหตุ:</span> ค่าขนส่ง / ค่าติดตั้ง / ค่าใช้จ่ายอื่น คือ <span className="font-semibold">ต้นทุนเริ่มแรกต่อหน่วย</span> เพื่อนำมารวมเป็นราคาทุนสินทรัพย์สำหรับคำนวณค่าเสื่อมราคา — หากรวมอยู่ในราคาต่อหน่วยแล้ว ให้ใส่ <span className="font-mono font-bold">0</span> ตามปกติ
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">ราคาต่อหน่วย (บาท)</label>
                    <input type="number" step="any" disabled={!isEditing} value={form.price} onChange={e => setForm({ ...form, price: e.target.value })}
                      className="w-full border border-slate-300 rounded-xl p-2 font-bold text-[#005691]" />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">ค่าขนส่ง (บาท)</label>
                    <input type="number" step="any" disabled={!isEditing} value={form.shipping_cost} onChange={e => setForm({ ...form, shipping_cost: e.target.value })}
                      className="w-full border border-slate-300 rounded-xl p-2" />
                    <p className="text-[10px] text-slate-400 mt-1">ต้นทุนเริ่มแรก / ถ้ารวมแล้วใส่ 0</p>
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">ค่าติดตั้ง (บาท)</label>
                    <input type="number" step="any" disabled={!isEditing} value={form.installation_cost} onChange={e => setForm({ ...form, installation_cost: e.target.value })}
                      className="w-full border border-slate-300 rounded-xl p-2" />
                    <p className="text-[10px] text-slate-400 mt-1">ต้นทุนเริ่มแรก / ถ้ารวมแล้วใส่ 0</p>
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">ค่าใช้จ่ายอื่น (บาท)</label>
                    <input type="number" step="any" disabled={!isEditing} value={form.other_cost} onChange={e => setForm({ ...form, other_cost: e.target.value })}
                      className="w-full border border-slate-300 rounded-xl p-2" />
                    <p className="text-[10px] text-slate-400 mt-1">ต้นทุนเริ่มแรก / ถ้ารวมแล้วใส่ 0</p>
                  </div>
                </div>
              </div>

              {/* หมวด 2: ข้อมูลการจัดซื้อ สัญญา และงบประมาณ */}
              <div className="space-y-3">
                <h4 className="font-extrabold text-[#002D62] border-b border-slate-200 pb-1.5">
                  2. รายละเอียดการจัดซื้อ แหล่งเงิน และสัญญา
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">ปีงบประมาณ</label>
                    <input type="text" disabled={!isEditing} value={form.fiscal_year} onChange={e => setForm({ ...form, fiscal_year: e.target.value })}
                      className="w-full border border-slate-300 rounded-xl p-2" />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">รหัสแหล่งเงิน</label>
                    <input type="text" disabled={!isEditing} value={form.fund_code} onChange={e => setForm({ ...form, fund_code: e.target.value })}
                      className="w-full border border-slate-300 rounded-xl p-2 font-mono" />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">แหล่งเงิน</label>
                    <input type="text" disabled={!isEditing} value={form.fund_source} onChange={e => setForm({ ...form, fund_source: e.target.value })}
                      placeholder="เช่น เงินงบประมาณแผ่นดิน / เงินรายได้" className="w-full border border-slate-300 rounded-xl p-2" />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">ทะเบียนรถจัดส่ง (แยกตามปีงบประมาณ)</label>
                    <DeliveryTruckSelect
                      fiscalYear={form.fiscal_year || '2570'}
                      value={form.license_plate}
                      onChange={val => setForm({ ...form, license_plate: val })}
                      deliveryTrucks={deliveryTrucks}
                      onTruckAdded={fetchAllData}
                      disabled={!isEditing}
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">เลขที่ใบเบิก</label>
                    <input type="text" disabled={!isEditing} value={form.requisition_no} onChange={e => setForm({ ...form, requisition_no: e.target.value })}
                      className="w-full border border-slate-300 rounded-xl p-2" />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">วันที่ใบเบิกครุภัณฑ์</label>
                    <input type="date" disabled={!isEditing} value={form.requisition_date} onChange={e => setForm({ ...form, requisition_date: e.target.value })}
                      className="w-full border border-slate-300 rounded-xl p-2" />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">วิธีการจัดซื้อ</label>
                    <select disabled={!isEditing} value={form.purchase_method} onChange={e => setForm({ ...form, purchase_method: e.target.value })}
                      className="w-full border border-slate-300 rounded-xl p-2 bg-white">
                      <option value="เฉพาะเจาะจง">เฉพาะเจาะจง</option>
                      <option value="ประกวดราคาอิเล็กทรอนิกส์ (e-bidding)">ประกวดราคาอิเล็กทรอนิกส์ (e-bidding)</option>
                      <option value="ตลาดอิเล็กทรอนิกส์ (e-market)">ตลาดอิเล็กทรอนิกส์ (e-market)</option>
                      <option value="คัดเลือก">คัดเลือก</option>
                      <option value="รับบริจาค/โอน">รับบริจาค/โอน</option>
                    </select>
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">เลขที่เอกสารขออนุมัติซื้อ</label>
                    <input type="text" disabled={!isEditing} value={form.purchase_approval_no} onChange={e => setForm({ ...form, purchase_approval_no: e.target.value })}
                      className="w-full border border-slate-300 rounded-xl p-2" />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">วันที่เอกสารขออนุมัติซื้อ</label>
                    <input type="date" disabled={!isEditing} value={form.purchase_approval_date} onChange={e => setForm({ ...form, purchase_approval_date: e.target.value })}
                      className="w-full border border-slate-300 rounded-xl p-2" />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">ซื้อจาก (บริษัท / ห้างหุ้นส่วน / ร้านค้า)</label>
                    <input type="text" disabled={!isEditing} value={form.vendor} onChange={e => setForm({ ...form, vendor: e.target.value })}
                      placeholder="เช่น บริษัท คอมพิวเตอร์ จำกัด" className="w-full border border-slate-300 rounded-xl p-2" />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">เลขที่เอกสารเบิกจ่าย</label>
                    <input type="text" disabled={!isEditing} value={form.payment_doc_no} onChange={e => setForm({ ...form, payment_doc_no: e.target.value })}
                      className="w-full border border-slate-300 rounded-xl p-2" />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">เลขที่สัญญา / ใบสั่งซื้อ</label>
                    <input type="text" disabled={!isEditing} value={form.contract_no} onChange={e => setForm({ ...form, contract_no: e.target.value })}
                      className="w-full border border-slate-300 rounded-xl p-2 font-mono" />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">วันที่ตรวจรับ</label>
                    <input type="date" disabled={!isEditing} value={form.received_date} onChange={e => setForm({ ...form, received_date: e.target.value })}
                      className="w-full border border-slate-300 rounded-xl p-2" />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">วันเริ่มสัญญา</label>
                    <input type="date" disabled={!isEditing} value={form.contract_start_date} onChange={e => setForm({ ...form, contract_start_date: e.target.value })}
                      className="w-full border border-slate-300 rounded-xl p-2" />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">วันสิ้นสุดสัญญา</label>
                    <input type="date" disabled={!isEditing} value={form.contract_end_date} onChange={e => setForm({ ...form, contract_end_date: e.target.value })}
                      className="w-full border border-slate-300 rounded-xl p-2" />
                  </div>
                </div>
              </div>

              {/* หมวด 3: อายุการใช้งาน การรับประกัน และการตัดจำหน่าย */}
              <div className="space-y-3">
                <h4 className="font-extrabold text-[#002D62] border-b border-slate-200 pb-1.5">
                  3. อายุการใช้งาน การรับประกัน และการตัดจำหน่าย
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">อายุการใช้งาน</label>
                    <input type="text" disabled={!isEditing} value={form.useful_life} onChange={e => setForm({ ...form, useful_life: e.target.value })}
                      placeholder="เช่น 5 ปี" className="w-full border border-slate-300 rounded-xl p-2" />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">มูลค่าคงเหลือ (บาท)</label>
                    <input type="number" step="any" disabled={!isEditing} value={form.salvage_value} onChange={e => setForm({ ...form, salvage_value: e.target.value })}
                      className="w-full border border-slate-300 rounded-xl p-2" />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">ระยะเวลาประกัน</label>
                    <input type="text" disabled={!isEditing} value={form.warranty_period} onChange={e => setForm({ ...form, warranty_period: e.target.value })}
                      placeholder="เช่น 1 ปี, 3 ปี" className="w-full border border-slate-300 rounded-xl p-2" />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">วันสิ้นสุดประกัน</label>
                    <input type="date" disabled={!isEditing} value={form.warranty_end_date} onChange={e => setForm({ ...form, warranty_end_date: e.target.value })}
                      className="w-full border border-slate-300 rounded-xl p-2" />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">สถานะ</label>
                    <input type="text" disabled={!isEditing} value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}
                      className="w-full border border-slate-300 rounded-xl p-2" />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">วันที่ตัดจำหน่าย</label>
                    <input type="date" disabled={!isEditing} value={form.disposal_date} onChange={e => setForm({ ...form, disposal_date: e.target.value })}
                      className="w-full border border-slate-300 rounded-xl p-2" />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">เลขที่เอกสารตัดจำหน่าย</label>
                    <input type="text" disabled={!isEditing} value={form.disposal_doc_no} onChange={e => setForm({ ...form, disposal_doc_no: e.target.value })}
                      className="w-full border border-slate-300 rounded-xl p-2" />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">ประวัติการซ่อมแซม</label>
                    <input type="text" disabled value={`${selectedEq.repair_count || 0} ครั้ง`}
                      className="w-full border border-slate-200 bg-slate-50 rounded-xl p-2 text-slate-500" />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block font-bold text-slate-700 mb-1">หมายเหตุการตัดจำหน่าย</label>
                    <input type="text" disabled={!isEditing} value={form.disposal_note} onChange={e => setForm({ ...form, disposal_note: e.target.value })}
                      className="w-full border border-slate-300 rounded-xl p-2" />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block font-bold text-slate-700 mb-1">หมายเหตุทั่วไป</label>
                    <input type="text" disabled={!isEditing} value={form.remark} onChange={e => setForm({ ...form, remark: e.target.value })}
                      className="w-full border border-slate-300 rounded-xl p-2" />
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button type="button" onClick={() => setSelectedEq(null)} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-medium cursor-pointer">
                  ปิดหน้าต่าง
                </button>
                {isEditing && (
                  <button type="submit" className="px-5 py-2 bg-[#005691] hover:bg-[#003B71] text-white rounded-xl font-bold shadow-md cursor-pointer">
                    ✓ บันทึกรายละเอียดการซื้อ
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal เพิ่มปีงบประมาณใหม่ */}
      {fyModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl overflow-hidden border border-slate-200">
            <div className="bg-[#071d36] text-white p-4 px-6 flex justify-between items-center">
              <div>
                <h3 className="font-extrabold text-base">📅 เพิ่มปีงบประมาณใหม่</h3>
                <p className="text-[11px] text-sky-300 mt-0.5">สร้างกลุ่มปีงบประมาณสำหรับบันทึกและจัดหมวดหมู่ครุภัณฑ์</p>
              </div>
              <button onClick={() => setFyModalOpen(false)} className="text-slate-400 hover:text-white font-bold p-1 text-lg cursor-pointer">✕</button>
            </div>
            <form onSubmit={handleAddFiscalYear} className="p-6 space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-800 mb-1">ปีงบประมาณ (พ.ศ.) <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  required
                  placeholder="เช่น 2571, 2572..."
                  value={newFyInput}
                  onChange={e => setNewFyInput(e.target.value)}
                  className="w-full border border-slate-300 rounded-xl p-2.5 font-bold text-[#002D62] outline-none focus:ring-2 focus:ring-[#005691]"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-800 mb-1">รายละเอียด / หมายเหตุปีงบประมาณ</label>
                <input
                  type="text"
                  placeholder="เช่น งบประมาณประจำปี พ.ศ. 2571"
                  value={newFyNote}
                  onChange={e => setNewFyNote(e.target.value)}
                  className="w-full border border-slate-300 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-[#005691]"
                />
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button type="button" onClick={() => setFyModalOpen(false)} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-medium cursor-pointer">
                  ยกเลิก
                </button>
                <button type="submit" className="px-5 py-2 bg-[#005691] hover:bg-[#003B71] text-white rounded-xl font-bold shadow-md cursor-pointer">
                  ✓ บันทึกปีงบประมาณ
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// =========================================================================
// 5h. หน้าซ่อมบำรุงครุภัณฑ์ (REPAIRS & MAINTENANCE PAGE)
// =========================================================================
function RepairsPage({ equipments = [], repairs = [], fetchAllData, currentUser }) {
  const isAdmin = currentUser?.role === 'admin';
  const isTechnician = currentUser?.role === 'technician';
  const isStaff = currentUser?.role === 'staff';
  const canResolve = isAdmin || isStaff || isTechnician; // เฉพาะ Admin, Staff, Technician ที่ปิดงานซ่อมได้
  const canReport = true; // ทุกสิทธิ์รวมถึงผู้ใช้งานทั่วไป (Viewer) สามารถส่งแจ้งซ่อมได้
  const [activeTab, setActiveTab] = useState('records'); // 'records' | 'select'
  const [statusFilter, setStatusFilter] = useState('ทั้งหมด');
  const [searchTerm, setSearchTerm] = useState('');

  // Modal แจ้งซ่อม
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [modalEqSearch, setModalEqSearch] = useState('');
  const [showEqDropdown, setShowEqDropdown] = useState(false);
  const [reportForm, setReportForm] = useState({ equipment_id: '', issue_detail: '' });

  // Modal ปิดงานซ่อม
  const [resolveModalRep, setResolveModalRep] = useState(null);
  const [repairCost, setRepairCost] = useState('0');

  const inProgressRepairs = repairs.filter(r => r.status === 'กำลังซ่อม');
  const completedRepairs = repairs.filter(r => r.status === 'ซ่อมเสร็จสิ้น');
  const totalRepairCost = repairs.reduce((sum, r) => sum + (parseFloat(r.cost) || 0), 0);

  const availableForRepair = equipments.filter(e => e.status !== 'จำหน่ายแล้ว' && e.status !== 'ส่งซ่อม');

  const openReportModal = (eq = null) => {
    const target = eq || availableForRepair[0] || null;
    setReportForm({
      equipment_id: target ? target.id : '',
      issue_detail: ''
    });
    setModalEqSearch(target ? `[${getAssetCode(target)}] ${target.name} (${getAssetDepartment(target)})` : '');
    setShowEqDropdown(false);
    setReportModalOpen(true);
  };

  const handleSubmitReport = async (e) => {
    e.preventDefault();
    if (!reportForm.equipment_id) {
      alert('กรุณาเลือกครุภัณฑ์ที่ต้องการแจ้งซ่อม');
      return;
    }
    if (!reportForm.issue_detail.trim()) {
      alert('กรุณาระบุอาการเสียหรือรายละเอียดปัญหา');
      return;
    }
    try {
      await axios.post('http://localhost:5000/api/maintenance', {
        equipment_id: reportForm.equipment_id,
        issue_detail: reportForm.issue_detail.trim(),
        reporter_name: currentUser?.full_name || currentUser?.username || 'ผู้ใช้งานทั่วไป'
      });
      setReportModalOpen(false);
      await fetchAllData();
    } catch (err) {
      alert('เกิดข้อผิดพลาดในการบันทึกการแจ้งซ่อม');
    }
  };

  const openResolveModal = (rep) => {
    setResolveModalRep(rep);
    setRepairCost(String(rep.cost || 0));
  };

  const handleSubmitResolve = async (e) => {
    e.preventDefault();
    if (!resolveModalRep) return;
    try {
      await axios.put(`http://localhost:5000/api/maintenance/resolve/${resolveModalRep.id}`, {
        equipment_id: resolveModalRep.equipment_id,
        cost: parseFloat(repairCost) || 0,
        resolved_by: currentUser?.full_name || currentUser?.username || 'ช่างซ่อมบำรุง'
      });
      setResolveModalRep(null);
      await fetchAllData();
    } catch (err) {
      alert('เกิดข้อผิดพลาดในการปิดงานซ่อม');
    }
  };

  const filteredRepairs = repairs.filter(r => {
    const matchStatus = statusFilter === 'ทั้งหมด' || r.status === statusFilter;
    const q = searchTerm.trim().toLowerCase();
    const matchSearch =
      !q ||
      (r.equipment_name || '').toLowerCase().includes(q) ||
      (r.equipment_code || '').toLowerCase().includes(q) ||
      (r.issue_detail || '').toLowerCase().includes(q) ||
      (r.equipment_department || '').toLowerCase().includes(q);
    return matchStatus && matchSearch;
  });

  const filteredCandidates = availableForRepair.filter(eq => {
    const q = searchTerm.trim().toLowerCase();
    return (
      !q ||
      (eq.name || '').toLowerCase().includes(q) ||
      getAssetCode(eq).toLowerCase().includes(q) ||
      getAssetDepartment(eq).toLowerCase().includes(q) ||
      (eq.location || '').toLowerCase().includes(q)
    );
  });

  const filteredModalEquipments = availableForRepair.filter(eq => {
    const q = modalEqSearch.trim().toLowerCase();
    if (!q) return true;
    const label = `[${getAssetCode(eq)}] ${eq.name} (${getAssetDepartment(eq)})`.toLowerCase();
    if (label === q) return true;
    return (
      getAssetCode(eq).toLowerCase().includes(q) ||
      (eq.name || '').toLowerCase().includes(q) ||
      getAssetDepartment(eq).toLowerCase().includes(q) ||
      (eq.serial_no || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-[#002D62]">🔧 ซ่อมบำรุงครุภัณฑ์</h1>
          <p className="text-xs text-slate-500 mt-1">บันทึกการแจ้งซ่อม ติดตามสถานะการซ่อม และบันทึกค่าใช้จ่ายในการซ่อมบำรุง</p>
        </div>
        {canReport && (
          <button
            onClick={() => openReportModal(null)}
            className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold py-2.5 px-4 rounded-xl shadow-sm transition flex items-center gap-2 cursor-pointer"
          >
            <span>+ ส่งแจ้งซ่อมครุภัณฑ์</span>
          </button>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs border-l-4 border-l-[#005691]">
          <div className="text-xs text-slate-500 font-semibold">รายการแจ้งซ่อมทั้งหมด</div>
          <div className="text-2xl font-extrabold text-[#002D62] mt-1">{repairs.length} <span className="text-xs font-normal text-slate-400">ครั้ง</span></div>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs border-l-4 border-l-amber-500">
          <div className="text-xs text-amber-700 font-semibold">กำลังดำเนินการซ่อม</div>
          <div className="text-2xl font-extrabold text-slate-800 mt-1">{inProgressRepairs.length} <span className="text-xs font-normal text-slate-400">รายการ</span></div>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs border-l-4 border-l-emerald-500">
          <div className="text-xs text-emerald-700 font-semibold">ซ่อมเสร็จสิ้นแล้ว</div>
          <div className="text-2xl font-extrabold text-slate-800 mt-1">{completedRepairs.length} <span className="text-xs font-normal text-slate-400">รายการ</span></div>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs border-l-4 border-l-sky-500">
          <div className="text-xs text-sky-700 font-semibold">ค่าใช้จ่ายในการซ่อมรวม</div>
          <div className="text-2xl font-extrabold text-slate-800 mt-1">
            {totalRepairCost.toLocaleString('th-TH', { minimumFractionDigits: 2 })} <span className="text-xs font-normal text-slate-400">บาท</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200 flex gap-8 text-xs font-semibold">
        <button
          onClick={() => setActiveTab('records')}
          className={`pb-3 transition cursor-pointer ${
            activeTab === 'records' ? 'text-[#005691] border-b-2 border-[#005691] font-bold' : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          🔧 รายการแจ้งซ่อม & ประวัติ ({repairs.length})
        </button>
        <button
          onClick={() => setActiveTab('select')}
          className={`pb-3 transition cursor-pointer ${
            activeTab === 'select' ? 'text-[#005691] border-b-2 border-[#005691] font-bold' : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          🗂️ เลือกครุภัณฑ์เพื่อแจ้งซ่อม ({availableForRepair.length})
        </button>
      </div>

      {/* TAB 1: รายการแจ้งซ่อมและประวัติ */}
      {activeTab === 'records' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-sm">
              <input
                type="text"
                placeholder="ค้นหารหัส, ชื่อครุภัณฑ์, อาการเสีย..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 pl-9 text-xs outline-none focus:ring-2 focus:ring-[#005691]"
              />
              <span className="absolute left-3 top-2.5 text-slate-400 text-xs">🔍</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 outline-none cursor-pointer"
              >
                <option value="ทั้งหมด">สถานะทั้งหมด</option>
                <option value="กำลังซ่อม">กำลังซ่อม</option>
                <option value="ซ่อมเสร็จสิ้น">ซ่อมเสร็จสิ้น</option>
              </select>
              <span className="text-slate-400">{filteredRepairs.length} รายการ</span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100 text-xs">
              <thead className="bg-slate-50 text-slate-400 uppercase font-semibold">
                <tr>
                  <th className="px-4 py-3 text-center w-10">ลำดับ</th>
                  <th className="px-4 py-3 text-left">รหัสครุภัณฑ์</th>
                  <th className="px-4 py-3 text-left">ชื่อครุภัณฑ์ / หน่วยงาน</th>
                  <th className="px-4 py-3 text-left">อาการเสีย / รายละเอียด</th>
                  <th className="px-4 py-3 text-left">วันที่แจ้งซ่อม</th>
                  <th className="px-4 py-3 text-left">วันที่ซ่อมเสร็จ</th>
                  <th className="px-4 py-3 text-right">ค่าซ่อม (บาท)</th>
                  <th className="px-4 py-3 text-left">สถานะ</th>
                  <th className="px-4 py-3 text-center">การดำเนินการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {filteredRepairs.map((rep, idx) => (
                  <tr key={rep.id} className="hover:bg-slate-50/80 transition">
                    <td className="px-4 py-3 text-center text-slate-400 font-mono">{idx + 1}</td>
                    <td className="px-4 py-3 font-mono font-bold text-[#005691] whitespace-nowrap">
                      {rep.equipment_code || `#${rep.equipment_id}`}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-800">{rep.equipment_name}</div>
                      <div className="text-[11px] text-slate-400">
                        {rep.equipment_department || '-'}{rep.equipment_location ? ` • ${rep.equipment_location}` : ''}
                      </div>
                      {rep.reporter_name && (
                        <div className="text-[10px] text-sky-700 font-medium mt-0.5">
                          👤 แจ้งโดย: {rep.reporter_name}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-700 max-w-xs">{rep.issue_detail || '-'}</td>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                      {rep.reported_date ? new Date(rep.reported_date).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' }) : '-'}
                    </td>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                      {rep.resolved_date ? new Date(rep.resolved_date).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' }) : '-'}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-700 whitespace-nowrap">
                      {(parseFloat(rep.cost) || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold inline-flex items-center gap-1 ${
                        rep.status === 'ซ่อมเสร็จสิ้น'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-amber-50 text-amber-700 border border-amber-200'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${rep.status === 'ซ่อมเสร็จสิ้น' ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
                        <span>{rep.status}</span>
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center whitespace-nowrap">
                      {rep.status === 'กำลังซ่อม' && canResolve ? (
                        <button
                          onClick={() => openResolveModal(rep)}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-3 py-1.5 rounded-lg text-[11px] transition cursor-pointer"
                        >
                          ✓ ปิดงานซ่อม
                        </button>
                      ) : rep.status === 'กำลังซ่อม' ? (
                        <span className="text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded-md text-[10px] font-medium">รอช่างดำเนินการ</span>
                      ) : (
                        <span className="text-slate-400 text-[11px]">เรียบร้อย</span>
                      )}
                    </td>
                  </tr>
                ))}
                {filteredRepairs.length === 0 && (
                  <tr>
                    <td colSpan="9" className="px-6 py-12 text-center text-slate-400">
                      ไม่พบรายการแจ้งซ่อม — กดปุ่ม "+ แจ้งซ่อมครุภัณฑ์" ด้านบนเพื่อบันทึกรายการใหม่
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: เลือกครุภัณฑ์เพื่อแจ้งซ่อม */}
      {activeTab === 'select' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between gap-3">
            <div className="relative flex-1 max-w-sm">
              <input
                type="text"
                placeholder="ค้นหาครุภัณฑ์ที่ต้องการแจ้งซ่อม..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 pl-9 text-xs outline-none focus:ring-2 focus:ring-[#005691]"
              />
              <span className="absolute left-3 top-2.5 text-slate-400 text-xs">🔍</span>
            </div>
            <span className="text-xs text-slate-400">{filteredCandidates.length} รายการ</span>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100 text-xs">
              <thead className="bg-slate-50 text-slate-400 uppercase font-semibold">
                <tr>
                  <th className="px-4 py-3 text-center w-10">ลำดับ</th>
                  <th className="px-4 py-3 text-left">รหัส</th>
                  <th className="px-4 py-3 text-left">ชื่อครุภัณฑ์</th>
                  <th className="px-4 py-3 text-left">หน่วยงาน / สถานที่</th>
                  <th className="px-4 py-3 text-center">ประวัติซ่อม</th>
                  <th className="px-4 py-3 text-left">สถานะปัจจุบัน</th>
                  <th className="px-4 py-3 text-center">จัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {filteredCandidates.map((eq, idx) => (
                  <tr key={eq.id} className="hover:bg-slate-50/80 transition">
                    <td className="px-4 py-3 text-center text-slate-400 font-mono">{idx + 1}</td>
                    <td className="px-4 py-3 font-mono font-bold text-[#005691]">{getAssetCode(eq)}</td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-800">{eq.name}</div>
                      <div className="text-[11px] text-slate-400">{eq.brand || '-'} • {eq.category}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      <div>{getAssetDepartment(eq)}</div>
                      <div className="text-[11px] text-slate-400">{eq.location || '-'}</div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                        (eq.repair_count || 0) > 0
                          ? 'bg-amber-50 text-amber-700 border border-amber-200'
                          : 'bg-slate-50 text-slate-400 border border-slate-200'
                      }`}>
                        {eq.repair_count || 0} ครั้ง
                      </span>
                    </td>
                    <td className="px-4 py-3">{eq.status}</td>
                    <td className="px-4 py-3 text-center">
                      {canReport && (
                        <button
                          onClick={() => openReportModal(eq)}
                          className="bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 font-semibold px-3 py-1.5 rounded-lg text-[11px] transition cursor-pointer"
                        >
                          🔧 แจ้งซ่อม
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {filteredCandidates.length === 0 && (
                  <tr>
                    <td colSpan="7" className="px-6 py-12 text-center text-slate-400">ไม่พบครุภัณฑ์ที่สามารถแจ้งซ่อมได้</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal แจ้งซ่อมครุภัณฑ์ */}
      {reportModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden border border-slate-200">
            <div className="bg-[#071d36] text-white p-4 px-6 flex justify-between items-center">
              <div>
                <h3 className="font-extrabold text-base">🔧 บันทึกการแจ้งซ่อมครุภัณฑ์</h3>
                <p className="text-[11px] text-sky-300 mt-0.5">ระบุครุภัณฑ์และอาการเสียเพื่อส่งซ่อมบำรุง</p>
              </div>
              <button onClick={() => setReportModalOpen(false)} className="text-slate-400 hover:text-white font-bold p-1 text-lg cursor-pointer">✕</button>
            </div>

            <form onSubmit={handleSubmitReport} className="p-6 space-y-4 text-xs">
              <div className="relative">
                <label className="block font-bold text-slate-800 mb-1">
                  เลือกครุภัณฑ์ที่ต้องการแจ้งซ่อม (พิมพ์ค้นหารหัส / ชื่อ / หน่วยงาน) <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={modalEqSearch}
                    onFocus={() => setShowEqDropdown(true)}
                    onChange={e => {
                      setModalEqSearch(e.target.value);
                      setShowEqDropdown(true);
                    }}
                    placeholder="พิมพ์รหัสครุภัณฑ์ ชื่อครุภัณฑ์ หรือหน่วยงาน..."
                    className="w-full border border-slate-300 rounded-xl p-2.5 pr-16 bg-white font-semibold outline-none focus:ring-2 focus:ring-[#005691]"
                  />
                  <div className="absolute right-2.5 top-2 flex items-center gap-1">
                    {modalEqSearch && (
                      <button
                        type="button"
                        onClick={() => {
                          setModalEqSearch('');
                          setReportForm({ ...reportForm, equipment_id: '' });
                          setShowEqDropdown(true);
                        }}
                        className="text-slate-400 hover:text-slate-600 px-1.5 py-0.5 rounded text-xs cursor-pointer"
                      >
                        ✕
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setShowEqDropdown(!showEqDropdown)}
                      className="text-slate-500 hover:text-slate-800 px-1 py-0.5 text-xs cursor-pointer"
                    >
                      ▾
                    </button>
                  </div>
                </div>

                {showEqDropdown && (
                  <div className="absolute z-30 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-xl max-h-48 overflow-y-auto divide-y divide-slate-100">
                    {filteredModalEquipments.map(eq => {
                      const isSelected = String(reportForm.equipment_id) === String(eq.id);
                      return (
                        <div
                          key={eq.id}
                          onClick={() => {
                            setReportForm({ ...reportForm, equipment_id: eq.id });
                            setModalEqSearch(`[${getAssetCode(eq)}] ${eq.name} (${getAssetDepartment(eq)})`);
                            setShowEqDropdown(false);
                          }}
                          className={`px-3.5 py-2.5 cursor-pointer transition flex items-center justify-between gap-2 ${
                            isSelected ? 'bg-sky-50 text-[#005691] font-bold' : 'hover:bg-slate-50 text-slate-700'
                          }`}
                        >
                          <div className="truncate">
                            <span className="font-mono font-bold text-[#005691] mr-2">[{getAssetCode(eq)}]</span>
                            <span className="font-semibold">{eq.name}</span>
                            <span className="text-slate-400 text-[11px] ml-1.5">({getAssetDepartment(eq)})</span>
                          </div>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 shrink-0">
                            {eq.status}
                          </span>
                        </div>
                      );
                    })}
                    {filteredModalEquipments.length === 0 && (
                      <div className="px-4 py-3 text-center text-slate-400">ไม่พบครุภัณฑ์ที่ตรงกับคำค้นหา</div>
                    )}
                  </div>
                )}
              </div>

              <div>
                <label className="block font-bold text-slate-800 mb-1">ผู้ส่งแจ้งซ่อม</label>
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-700 flex items-center justify-between text-xs">
                  <span className="font-semibold">👤 {currentUser?.full_name || currentUser?.username || 'ผู้ใช้งานทั่วไป'}</span>
                  <span className="text-[10px] text-slate-500 bg-white px-2 py-0.5 rounded border border-slate-200">
                    {ROLE_DEFINITIONS[currentUser?.role]?.shortLabel || 'ผู้ใช้งาน'}
                  </span>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-800 mb-1">อาการเสีย / รายละเอียดปัญหา <span className="text-red-500">*</span></label>
                <textarea
                  rows={3}
                  required
                  placeholder="เช่น เปิดไม่ติด, หน้าจอกระพริบ, แอร์ไม่เย็นมีน้ำหยด, หัวพิมพ์อุดตัน..."
                  value={reportForm.issue_detail}
                  onChange={e => setReportForm({ ...reportForm, issue_detail: e.target.value })}
                  className="w-full border border-slate-300 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-[#005691]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button type="button" onClick={() => setReportModalOpen(false)} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-medium cursor-pointer">
                  ยกเลิก
                </button>
                <button type="submit" className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold shadow-md cursor-pointer">
                  ✓ บันทึกการแจ้งซ่อม
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal ปิดงานซ่อมและบันทึกค่าใช้จ่าย */}
      {resolveModalRep && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl overflow-hidden border border-slate-200">
            <div className="bg-[#071d36] text-white p-4 px-6 flex justify-between items-center">
              <div>
                <h3 className="font-extrabold text-base">✓ ปิดงานซ่อมบำรุง</h3>
                <p className="text-[11px] text-sky-300 mt-0.5">
                  [{resolveModalRep.equipment_code || `#${resolveModalRep.equipment_id}`}] {resolveModalRep.equipment_name}
                </p>
              </div>
              <button onClick={() => setResolveModalRep(null)} className="text-slate-400 hover:text-white font-bold p-1 text-lg cursor-pointer">✕</button>
            </div>

            <form onSubmit={handleSubmitResolve} className="p-6 space-y-4 text-xs">
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-1">
                <div className="text-[11px] font-bold text-slate-400">อาการที่แจ้งซ่อม</div>
                <div className="text-slate-700 font-medium">{resolveModalRep.issue_detail || '-'}</div>
              </div>

              <div>
                <label className="block font-bold text-slate-800 mb-1">ค่าใช้จ่ายในการซ่อมจริง (บาท)</label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  required
                  value={repairCost}
                  onChange={e => setRepairCost(e.target.value)}
                  className="w-full border border-slate-300 rounded-xl p-2.5 font-bold text-[#002D62] outline-none focus:ring-2 focus:ring-[#005691]"
                />
                <p className="text-[11px] text-slate-400 mt-1">หากซ่อมเองหรืออยู่ในประกัน ให้ใส่ 0 — หลังบันทึกสถานะครุภัณฑ์จะกลับเป็น "พร้อมใช้งาน"</p>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button type="button" onClick={() => setResolveModalRep(null)} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-medium cursor-pointer">
                  ยกเลิก
                </button>
                <button type="submit" className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold shadow-md cursor-pointer">
                  ✓ ยืนยันปิดงานซ่อม
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// =========================================================================
// 6. หน้าภาพรวมระบบ (DASHBOARD) - โทน ม.อ.
// =========================================================================
function Dashboard({ equipments, logs, repairs, currentUser }) {
  const total = equipments.length;
  const available = equipments.filter(eq => eq.status === 'พร้อมใช้งาน').length;
  const borrowed = equipments.filter(eq => eq.status === 'กำลังถูกยืม').length;
  const repairing = equipments.filter(eq => eq.status === 'ส่งซ่อม').length;

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-[#002D62] font-heading">ภาพรวมระบบครุภัณฑ์</h1>
          <p className="text-xs text-slate-500 mt-1">
            มหาวิทยาลัยสงขลานครินทร์ (Prince of Songkla University)
          </p>
        </div>
        <div className="flex gap-2">
          <Link to="/manage" className="bg-[#005691] hover:bg-[#003B71] text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-sm transition">
            🗂️ ไปที่ทะเบียนครุภัณฑ์
          </Link>
          <Link to="/tags" className="bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-sm transition">
            🏷️ ป้ายรหัส & บาร์โค้ด
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs border-l-4 border-l-[#003B71]">
          <span className="text-xs font-semibold text-slate-500">ครุภัณฑ์ทั้งหมด</span>
          <p className="text-3xl font-extrabold text-[#002D62] mt-1.5">{total} <span className="text-xs font-normal text-slate-400">รายการ</span></p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs border-l-4 border-l-emerald-600">
          <span className="text-xs font-semibold text-emerald-700">พร้อมใช้งาน</span>
          <p className="text-3xl font-extrabold text-slate-800 mt-1.5">{available} <span className="text-xs font-normal text-slate-400">รายการ</span></p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs border-l-4 border-l-amber-500">
          <span className="text-xs font-semibold text-amber-700">กำลังถูกยืม</span>
          <p className="text-3xl font-extrabold text-slate-800 mt-1.5">{borrowed} <span className="text-xs font-normal text-slate-400">รายการ</span></p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs border-l-4 border-l-rose-600">
          <span className="text-xs font-semibold text-rose-700">ส่งซ่อม / ชำรุด</span>
          <p className="text-3xl font-extrabold text-slate-800 mt-1.5">{repairing} <span className="text-xs font-normal text-slate-400">รายการ</span></p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs">
          <h3 className="font-bold text-slate-800 text-sm mb-3">🕒 การยืม-คืนล่าสุด</h3>
          <div className="space-y-2.5 text-xs">
            {logs.slice(0, 5).map(log => (
              <div key={log.id} className="flex justify-between items-center border-b border-slate-100 pb-2">
                <div>
                  <span className="font-bold text-slate-800">{log.borrower_name}</span> 
                  <span className="text-slate-400"> ยืม </span>
                  <span className="text-[#005691] font-semibold">{log.equipment_name}</span>
                </div>
                <span className="px-2 py-0.5 rounded-full text-[10px] bg-slate-100 text-slate-600">{log.status}</span>
              </div>
            ))}
            {logs.length === 0 && <p className="text-slate-400 py-3 text-center">ยังไม่มีประวัติการยืม</p>}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs">
          <h3 className="font-bold text-slate-800 text-sm mb-3">🛠️ รายการแจ้งซ่อมล่าสุด</h3>
          <div className="space-y-2.5 text-xs">
            {repairs.slice(0, 5).map(rep => (
              <div key={rep.id} className="flex justify-between items-center border-b border-slate-100 pb-2">
                <div>
                  <span className="font-bold text-slate-800">{rep.equipment_name}</span>
                  <p className="text-[10px] text-slate-400">อาการ: {rep.issue_detail}</p>
                </div>
                <span className="px-2 py-0.5 rounded-full text-[10px] bg-amber-50 text-amber-700 border border-amber-200">{rep.status}</span>
              </div>
            ))}
            {repairs.length === 0 && <p className="text-slate-400 py-3 text-center">ยังไม่มีรายการแจ้งซ่อม</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

// =========================================================================
// 6. หน้าศูนย์ป้ายรหัส & บาร์โค้ด (TAG GALLERY & BATCH PRINT)
// =========================================================================
function AssetTagsPage({ equipments, onOpenSingleTag, onOpenBatchPrint }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);
  const [tagSize, setTagSize] = useState('standard');
  const [orgName, setOrgName] = useState('มหาวิทยาลัยสงขลานครินทร์ (PSU)');

  const filtered = equipments.filter(eq => 
    eq.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    getAssetCode(eq).toLowerCase().includes(searchTerm.toLowerCase())
  );

  const selectedEquipments = equipments.filter(e => selectedIds.includes(e.id));

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-[#002D62] font-heading">🏷️ ศูนย์ป้ายรหัส QR Code และบาร์โค้ด</h1>
          <p className="text-xs text-slate-500 mt-1">พิมพ์ป้ายสติกเกอร์ติดครุภัณฑ์ ทั้งแบบรายชิ้น และพิมพ์รวมหลายดวงบนแผ่น A4</p>
        </div>
        <div className="flex gap-2">
          {selectedIds.length > 0 && (
            <button 
              onClick={() => onOpenBatchPrint(selectedEquipments, tagSize, orgName)}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow transition"
            >
              🖨️ พิมพ์ป้ายที่เลือก ({selectedIds.length})
            </button>
          )}
          <button 
            onClick={() => onOpenBatchPrint(filtered, tagSize, orgName)}
            className="bg-[#005691] hover:bg-[#003B71] text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow transition"
          >
            🖨️ พิมพ์ป้ายทั้งหมด ({filtered.length})
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
        <div>
          <label className="block text-slate-500 font-semibold mb-1">ค้นหาครุภัณฑ์</label>
          <input 
            type="text" placeholder="พิมพ์ชื่อหรือรหัส..." 
            value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs outline-none focus:ring-2 focus:ring-[#005691]"
          />
        </div>
        <div>
          <label className="block text-slate-500 font-semibold mb-1">ชื่อสถาบันบนป้าย</label>
          <input 
            type="text" value={orgName} onChange={e => setOrgName(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs outline-none focus:ring-2 focus:ring-[#005691]"
          />
        </div>
        <div>
          <label className="block text-slate-500 font-semibold mb-1">ขนาดป้ายสำหรับพิมพ์</label>
          <select 
            value={tagSize} onChange={e => setTagSize(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs outline-none cursor-pointer"
          >
            <option value="standard">ขนาดมาตรฐาน (92 x 55 มม.)</option>
            <option value="compact">ขนาดกะทัดรัด (75 x 45 มม.)</option>
          </select>
        </div>
      </div>

      {/* Grid Gallery */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {filtered.map(eq => (
          <div key={eq.id} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs flex flex-col justify-between">
            <div className="py-2 flex justify-center">
              <AssetTag equipment={eq} orgName={orgName} size={tagSize} />
            </div>
            <div className="pt-3 border-t border-slate-100 flex gap-2">
              <button 
                onClick={() => onOpenSingleTag(eq)}
                className="flex-1 bg-sky-50 hover:bg-sky-100 text-[#005691] font-bold text-xs py-2 rounded-xl border border-sky-200 transition"
              >
                🖨️ สั่งพิมพ์ป้ายนี้
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// =========================================================================
// 7. หน้าจัดการผู้ใช้ & สิทธิ์ + รายงานสรุป (USER MANAGEMENT & REPORTS)
// =========================================================================
function UserManagement({ currentUser, equipments = [] }) {
  const [activeTab, setActiveTab] = useState('reports'); // 'reports' | 'users' | 'audit'

  // ===== Audit Logs state =====
  const [allAuditLogs, setAllAuditLogs] = useState([]);
  const [loadingAllLogs, setLoadingAllLogs] = useState(false);
  const [auditSearch, setAuditSearch] = useState('');

  const fetchAllAuditLogs = async () => {
    setLoadingAllLogs(true);
    try {
      const res = await axios.get('http://localhost:5000/api/equipment-logs');
      setAllAuditLogs(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error('Fetch all logs error:', err);
    } finally {
      setLoadingAllLogs(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'audit') {
      fetchAllAuditLogs();
    }
  }, [activeTab]);

  // ===== Users state =====
  const [users, setUsers] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('ทั้งหมด');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState('');
  const [notification, setNotification] = useState('');

  const [formData, setFormData] = useState({
    username: '',
    password: '',
    full_name: '',
    department: 'สำนักงานอธิการบดี ม.อ.',
    role: 'staff'
  });

  const fetchUsers = async () => {
    try {
      const res = await axios.get('http://localhost:5000/api/users');
      setUsers(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleOpenAdd = () => {
    setEditingUser(null);
    setFormData({ username: '', password: '', full_name: '', department: 'สำนักงานอธิการบดี ม.อ.', role: 'staff' });
    setFormError('');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (user) => {
    setEditingUser(user);
    setFormData({ username: user.username || '', password: '', full_name: user.full_name || '', department: user.department || 'สำนักงานอธิการบดี ม.อ.', role: user.role || 'staff' });
    setFormError('');
    setIsModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    setLoading(true);
    try {
      if (editingUser) {
        await axios.put(`http://localhost:5000/api/users/${editingUser.id}`, formData);
        setNotification(`แก้ไขข้อมูลผู้ใช้ ${formData.username} สำเร็จ`);
      } else {
        if (!formData.password) {
          setFormError('กรุณากำหนดรหัสผ่าน');
          setLoading(false);
          return;
        }
        await axios.post('http://localhost:5000/api/users', formData);
        setNotification(`เพิ่มผู้ใช้ใหม่ ${formData.username} สำเร็จ`);
      }
      setIsModalOpen(false);
      fetchUsers();
    } catch (err) {
      setFormError(err.response?.data?.error || 'เกิดข้อผิดพลาดในการบันทึกข้อมูล');
    } finally {
      setLoading(false);
      setTimeout(() => setNotification(''), 3000);
    }
  };

  const handleDelete = async (user) => {
    if (user.username === currentUser?.username) {
      alert('ไม่สามารถลบบัญชีที่กำลังล็อกอินอยู่ได้');
      return;
    }
    if (window.confirm(`ยืนยันการลบผู้ใช้ "${user.username}" ออกจากระบบ?`)) {
      try {
        await axios.delete(`http://localhost:5000/api/users/${user.id}`);
        setNotification(`ลบผู้ใช้ ${user.username} เรียบร้อย`);
        fetchUsers();
      } catch (err) {
        alert(err.response?.data?.error || 'เกิดข้อผิดพลาดในการลบ');
      }
    }
  };

  const filteredUsers = users.filter(u => {
    const matchesSearch = (u.username || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
                          (u.full_name || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRole = roleFilter === 'ทั้งหมด' || u.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  // ===== Reports calculations =====
  const [reportData, setReportData] = useState([]);
  const [reportEquipments, setReportEquipments] = useState([]);

  useEffect(() => {
    axios.get('http://localhost:5000/api/equipments').then(res => {
      setReportEquipments(Array.isArray(res.data) ? res.data : []);
    }).catch(() => {});
  }, []);

  const eqList = reportEquipments.length > 0 ? reportEquipments : equipments;

  const totalValue = eqList.reduce((s, e) => s + (parseFloat(e.price) || 0), 0);
  const statusGroups = {
    'พร้อมใช้งาน': eqList.filter(e => e.status === 'พร้อมใช้งาน'),
    'กำลังถูกยืม': eqList.filter(e => e.status === 'กำลังถูกยืม'),
    'ส่งซ่อม': eqList.filter(e => e.status === 'ส่งซ่อม'),
    'ชำรุด': eqList.filter(e => e.status === 'ชำรุด'),
    'จำหน่ายแล้ว': eqList.filter(e => e.status === 'จำหน่ายแล้ว'),
  };

  // จำนวน + มูลค่า แยกตามหมวดหมู่
  const byCategory = {};
  eqList.forEach(e => {
    const cat = e.category || 'ไม่ระบุ';
    if (!byCategory[cat]) byCategory[cat] = { count: 0, value: 0 };
    byCategory[cat].count++;
    byCategory[cat].value += parseFloat(e.price) || 0;
  });
  const categoryRows = Object.entries(byCategory).sort((a, b) => b[1].value - a[1].value);

  // จำนวน + มูลค่า แยกตามหน่วยงาน
  const byDept = {};
  eqList.forEach(e => {
    const dept = e.department || 'ไม่ระบุ';
    if (!byDept[dept]) byDept[dept] = { count: 0, value: 0 };
    byDept[dept].count++;
    byDept[dept].value += parseFloat(e.price) || 0;
  });
  const deptRows = Object.entries(byDept).sort((a, b) => b[1].value - a[1].value);

  // จำนวน + มูลค่า แยกตามปีงบประมาณ
  const byFiscal = {};
  eqList.forEach(e => {
    const fy = e.fiscal_year || 'ไม่ระบุ';
    if (!byFiscal[fy]) byFiscal[fy] = { count: 0, value: 0 };
    byFiscal[fy].count++;
    byFiscal[fy].value += parseFloat(e.price) || 0;
  });
  const fiscalRows = Object.entries(byFiscal).sort((a, b) => b[0].localeCompare(a[0]));

  const handlePrintReport = () => window.print();

  const handleExportReportCSV = () => {
    const rows = [
      ['รายงานสรุปครุภัณฑ์ มหาวิทยาลัยสงขลานครินทร์'],
      ['วันที่จัดทำ', new Date().toLocaleDateString('th-TH')],
      [],
      ['=== สรุปตามสถานะ ==='],
      ['สถานะ', 'จำนวน (รายการ)', 'สัดส่วน (%)'],
      ...Object.entries(statusGroups).map(([s, arr]) => [s, arr.length, eqList.length ? ((arr.length / eqList.length) * 100).toFixed(1) + '%' : '0%']),
      [],
      ['=== สรุปตามหมวดหมู่ ==='],
      ['หมวดหมู่', 'จำนวน (รายการ)', 'มูลค่ารวม (บาท)'],
      ...categoryRows.map(([cat, d]) => [cat, d.count, d.value.toFixed(2)]),
      [],
      ['=== สรุปตามหน่วยงาน ==='],
      ['หน่วยงาน', 'จำนวน (รายการ)', 'มูลค่ารวม (บาท)'],
      ...deptRows.map(([dept, d]) => [dept, d.count, d.value.toFixed(2)]),
      [],
      ['=== สรุปตามปีงบประมาณ ==='],
      ['ปีงบประมาณ', 'จำนวน (รายการ)', 'มูลค่ารวม (บาท)'],
      ...fiscalRows.map(([fy, d]) => [fy, d.count, d.value.toFixed(2)]),
    ];
    const csv = '\uFEFF' + rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `รายงานสรุปครุภัณฑ์_ม.อ._${new Date().toLocaleDateString('th-TH').replace(/\//g, '-')}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="p-6 space-y-6">
      {notification && (
        <div className="fixed top-20 right-6 z-50 bg-[#005691] text-white text-xs font-bold px-4 py-3 rounded-xl shadow-xl flex items-center gap-2">
          <span>✓</span> {notification}
        </div>
      )}

      {/* Title */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-[#002D62] font-heading">รายงานและผู้ใช้งาน</h1>
          <p className="text-xs text-slate-500 mt-1">สรุปภาพรวมครุภัณฑ์ และจัดการบัญชีผู้ใช้งานระบบ ม.อ.</p>
        </div>
        {activeTab === 'users' && (
          <button onClick={handleOpenAdd} className="bg-[#005691] hover:bg-[#003B71] text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-sm transition cursor-pointer">
            + เพิ่มผู้ใช้งานใหม่
          </button>
        )}
        {activeTab === 'reports' && (
          <div className="flex gap-2">
            <button onClick={handleExportReportCSV} className="bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold px-4 py-2.5 rounded-xl border border-slate-300 shadow-2xs transition cursor-pointer flex items-center gap-2">
              📥 ส่งออก CSV
            </button>
            <button onClick={handlePrintReport} className="bg-[#005691] hover:bg-[#003B71] text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-sm transition cursor-pointer flex items-center gap-2">
              🖨️ พิมพ์รายงาน
            </button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200 flex gap-8 text-xs font-semibold">
        <button
          onClick={() => setActiveTab('reports')}
          className={`pb-3 transition cursor-pointer flex items-center gap-1.5 ${activeTab === 'reports' ? 'text-[#005691] border-b-2 border-[#005691] font-bold' : 'text-slate-500 hover:text-slate-800'}`}
        >
          รายงานสรุปครุภัณฑ์
        </button>
        <button
          onClick={() => setActiveTab('users')}
          className={`pb-3 transition cursor-pointer flex items-center gap-1.5 ${activeTab === 'users' ? 'text-[#005691] border-b-2 border-[#005691] font-bold' : 'text-slate-500 hover:text-slate-800'}`}
        >
          จัดการผู้ใช้งาน ({users.length})
        </button>
        <button
          onClick={() => setActiveTab('audit')}
          className={`pb-3 transition cursor-pointer flex items-center gap-1.5 ${activeTab === 'audit' ? 'text-[#005691] border-b-2 border-[#005691] font-bold' : 'text-slate-500 hover:text-slate-800'}`}
        >
          📝 ประวัติการแก้ไขข้อมูล (Audit Trail)
        </button>
      </div>

      {/* ===== REPORTS TAB ===== */}
      {activeTab === 'reports' && (
        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs border-l-4 border-l-[#003B71]">
              <div className="text-xs text-slate-500 font-semibold">ครุภัณฑ์ทั้งหมด</div>
              <div className="text-2xl font-extrabold text-[#002D62] mt-1.5">{eqList.length.toLocaleString('th-TH')} <span className="text-xs font-normal text-slate-400">รายการ</span></div>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs border-l-4 border-l-emerald-500">
              <div className="text-xs text-slate-500 font-semibold">พร้อมใช้งาน</div>
              <div className="text-2xl font-extrabold text-emerald-700 mt-1.5">{statusGroups['พร้อมใช้งาน'].length} <span className="text-xs font-normal text-slate-400">รายการ</span></div>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs border-l-4 border-l-amber-500">
              <div className="text-xs text-slate-500 font-semibold">กำลังซ่อม / ยืม</div>
              <div className="text-2xl font-extrabold text-amber-600 mt-1.5">{(statusGroups['ส่งซ่อม'].length + statusGroups['กำลังถูกยืม'].length)} <span className="text-xs font-normal text-slate-400">รายการ</span></div>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs border-l-4 border-l-sky-500">
              <div className="text-xs text-slate-500 font-semibold">มูลค่ารวมทั้งหมด</div>
              <div className="text-xl font-extrabold text-slate-800 mt-1.5">{totalValue.toLocaleString('th-TH', { minimumFractionDigits: 0 })} <span className="text-xs font-normal text-slate-400">บาท</span></div>
            </div>
          </div>

          {/* สรุปตามสถานะ */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-100">
              <h3 className="font-extrabold text-sm text-[#002D62]">สรุปตามสถานะ</h3>
            </div>
            <div className="p-5 grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
              {Object.entries(statusGroups).map(([status, arr]) => {
                const pct = eqList.length > 0 ? ((arr.length / eqList.length) * 100).toFixed(1) : '0.0';
                const colorMap = {
                  'พร้อมใช้งาน': 'bg-emerald-100 text-emerald-800 border-emerald-300',
                  'กำลังถูกยืม': 'bg-sky-100 text-sky-800 border-sky-300',
                  'ส่งซ่อม': 'bg-amber-100 text-amber-800 border-amber-300',
                  'ชำรุด': 'bg-red-100 text-red-800 border-red-300',
                  'จำหน่ายแล้ว': 'bg-slate-100 text-slate-700 border-slate-300',
                };
                return (
                  <div key={status} className={`flex flex-col items-center p-3 rounded-xl border ${colorMap[status] || 'bg-slate-50 text-slate-700 border-slate-200'}`}>
                    <div className="font-bold text-base">{arr.length}</div>
                    <div className="font-semibold mt-0.5 text-center leading-tight">{status}</div>
                    <div className="text-[11px] opacity-70 mt-0.5">{pct}%</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* สรุปตามหมวดหมู่ + ปีงบประมาณ side by side */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* หมวดหมู่ */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-100 flex justify-between items-center">
                <h3 className="font-extrabold text-sm text-[#002D62]">สรุปตามหมวดหมู่</h3>
                <span className="text-xs text-slate-400">{categoryRows.length} หมวดหมู่</span>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-100 text-xs">
                  <thead className="bg-slate-50 text-slate-500 font-semibold">
                    <tr>
                      <th className="px-4 py-2.5 text-left">หมวดหมู่</th>
                      <th className="px-4 py-2.5 text-center">จำนวน</th>
                      <th className="px-4 py-2.5 text-right">มูลค่ารวม (บาท)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {categoryRows.map(([cat, d]) => (
                      <tr key={cat} className="hover:bg-slate-50">
                        <td className="px-4 py-2.5 font-semibold text-slate-700">{cat}</td>
                        <td className="px-4 py-2.5 text-center">
                          <span className="bg-[#005691]/10 text-[#005691] font-bold px-2 py-0.5 rounded-full">{d.count}</span>
                        </td>
                        <td className="px-4 py-2.5 text-right font-semibold text-slate-800">{d.value.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</td>
                      </tr>
                    ))}
                    <tr className="bg-slate-50 font-bold">
                      <td className="px-4 py-2.5 text-slate-700">รวมทั้งหมด</td>
                      <td className="px-4 py-2.5 text-center text-[#005691]">{eqList.length}</td>
                      <td className="px-4 py-2.5 text-right text-[#002D62]">{totalValue.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* ปีงบประมาณ */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-100 flex justify-between items-center">
                <h3 className="font-extrabold text-sm text-[#002D62]">สรุปตามปีงบประมาณ</h3>
                <span className="text-xs text-slate-400">{fiscalRows.length} ปี</span>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-100 text-xs">
                  <thead className="bg-slate-50 text-slate-500 font-semibold">
                    <tr>
                      <th className="px-4 py-2.5 text-left">ปีงบประมาณ</th>
                      <th className="px-4 py-2.5 text-center">จำนวน</th>
                      <th className="px-4 py-2.5 text-right">มูลค่ารวม (บาท)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {fiscalRows.map(([fy, d]) => (
                      <tr key={fy} className="hover:bg-slate-50">
                        <td className="px-4 py-2.5 font-bold text-[#005691]">พ.ศ. {fy}</td>
                        <td className="px-4 py-2.5 text-center">
                          <span className="bg-sky-100 text-sky-700 font-bold px-2 py-0.5 rounded-full">{d.count}</span>
                        </td>
                        <td className="px-4 py-2.5 text-right font-semibold text-slate-800">{d.value.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</td>
                      </tr>
                    ))}
                    <tr className="bg-slate-50 font-bold">
                      <td className="px-4 py-2.5 text-slate-700">รวมทั้งหมด</td>
                      <td className="px-4 py-2.5 text-center text-[#005691]">{eqList.length}</td>
                      <td className="px-4 py-2.5 text-right text-[#002D62]">{totalValue.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* สรุปตามหน่วยงาน */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-100 flex justify-between items-center">
              <h3 className="font-extrabold text-sm text-[#002D62]">สรุปตามหน่วยงาน</h3>
              <span className="text-xs text-slate-400">{deptRows.length} หน่วยงาน</span>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-100 text-xs">
                <thead className="bg-slate-50 text-slate-500 font-semibold">
                  <tr>
                    <th className="px-5 py-2.5 text-left">หน่วยงาน</th>
                    <th className="px-5 py-2.5 text-center w-24">จำนวน (รายการ)</th>
                    <th className="px-5 py-2.5 text-right w-40">มูลค่ารวม (บาท)</th>
                    <th className="px-5 py-2.5 text-right w-28">สัดส่วน</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {deptRows.map(([dept, d]) => {
                    const pct = totalValue > 0 ? ((d.value / totalValue) * 100).toFixed(1) : '0.0';
                    return (
                      <tr key={dept} className="hover:bg-slate-50">
                        <td className="px-5 py-2.5 font-semibold text-slate-700 max-w-[260px]">
                          <div className="truncate">{dept}</div>
                        </td>
                        <td className="px-5 py-2.5 text-center">
                          <span className="bg-[#005691]/10 text-[#005691] font-bold px-2 py-0.5 rounded-full">{d.count}</span>
                        </td>
                        <td className="px-5 py-2.5 text-right font-semibold text-slate-800">{d.value.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</td>
                        <td className="px-5 py-2.5 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <div className="w-16 bg-slate-100 rounded-full h-1.5">
                              <div className="bg-[#005691] h-1.5 rounded-full" style={{ width: `${pct}%` }}></div>
                            </div>
                            <span className="text-slate-500 w-10 text-right">{pct}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="bg-slate-50 font-bold">
                    <td className="px-5 py-2.5 text-slate-700">รวมทั้งหมด</td>
                    <td className="px-5 py-2.5 text-center text-[#005691]">{eqList.length}</td>
                    <td className="px-5 py-2.5 text-right text-[#002D62]">{totalValue.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</td>
                    <td className="px-5 py-2.5 text-right text-slate-500">100%</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ===== USERS TAB ===== */}
      {activeTab === 'users' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex gap-3 text-xs">
            <input 
              type="text" placeholder="🔍 ค้นหาผู้ใช้..." 
              value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
              className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-[#005691]"
            />
            <select 
              value={roleFilter} onChange={e => setRoleFilter(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 cursor-pointer outline-none"
            >
              <option value="ทั้งหมด">สิทธิ์ทั้งหมด</option>
              <option value="admin">ผู้ดูแลระบบ</option>
              <option value="staff">เจ้าหน้าที่พัสดุ</option>
              <option value="technician">ช่างซ่อมบำรุง</option>
              <option value="viewer">ผู้ใช้ทั่วไป</option>
            </select>
          </div>

          <table className="min-w-full divide-y divide-slate-100 text-xs">
            <thead className="bg-slate-50 text-slate-500 font-semibold">
              <tr>
                <th className="px-6 py-3 text-left">ผู้ใช้งาน</th>
                <th className="px-6 py-3 text-left">ชื่อ-นามสกุล</th>
                <th className="px-6 py-3 text-left">หน่วยงาน / แผนก</th>
                <th className="px-6 py-3 text-left">สิทธิ์การเข้าถึง (ROLE)</th>
                <th className="px-6 py-3 text-center">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {filteredUsers.map(u => {
                const roleInfo = ROLE_DEFINITIONS[u.role] || ROLE_DEFINITIONS.staff;
                return (
                  <tr key={u.id} className="hover:bg-slate-50">
                    <td className="px-6 py-3.5 font-bold text-slate-800">{u.username}</td>
                    <td className="px-6 py-3.5 text-slate-600">{u.full_name || '-'}</td>
                    <td className="px-6 py-3.5 text-slate-600">{u.department || 'สำนักงานอธิการบดี'}</td>
                    <td className="px-6 py-3.5">
                      <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border ${roleInfo.badgeColor}`}>
                        {roleInfo.icon} {roleInfo.label}
                      </span>
                    </td>
                    <td className="px-6 py-3.5 text-center space-x-2">
                      <button onClick={() => handleOpenEdit(u)} className="text-[#005691] hover:underline font-semibold cursor-pointer">✏️ แก้ไข</button>
                      <button onClick={() => handleDelete(u)} className="text-red-600 hover:underline font-semibold cursor-pointer">🗑️ ลบ</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ===== AUDIT TRAIL TAB ===== */}
      {activeTab === 'audit' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div className="relative w-full sm:w-72">
              <input
                type="text"
                placeholder="ค้นหารหัส, ชื่อครุภัณฑ์, ผู้แก้ไข..."
                value={auditSearch}
                onChange={e => setAuditSearch(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2 pl-9 text-xs outline-none focus:ring-2 focus:ring-[#005691]"
              />
              <span className="absolute left-3 top-2.5 text-slate-400 text-xs">🔍</span>
              {auditSearch && (
                <button onClick={() => setAuditSearch('')} className="absolute right-3 top-2 text-slate-400 hover:text-slate-600 text-xs cursor-pointer">✕</button>
              )}
            </div>

            <button
              onClick={fetchAllAuditLogs}
              disabled={loadingAllLogs}
              className="bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold px-3.5 py-2 rounded-xl border border-slate-300 shadow-2xs transition cursor-pointer flex items-center gap-1.5"
            >
              <span className={loadingAllLogs ? "animate-spin" : ""}>🔄</span>
              <span>รีเฟรชข้อมูล</span>
            </button>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
            {loadingAllLogs ? (
              <div className="py-12 text-center text-slate-400 text-xs">
                <span className="inline-block animate-spin mr-2">⏳</span> กำลังโหลดประวัติการแก้ไขข้อมูล...
              </div>
            ) : allAuditLogs.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-xs">
                ยังไม่มีบันทึกประวัติการแก้ไขในระบบ
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase text-[11px]">
                    <tr>
                      <th className="px-5 py-3.5 whitespace-nowrap">วัน-เวลาที่แก้ไข</th>
                      <th className="px-5 py-3.5 whitespace-nowrap">รหัส & ชื่อครุภัณฑ์</th>
                      <th className="px-5 py-3.5 whitespace-nowrap">การดำเนินการ</th>
                      <th className="px-5 py-3.5 whitespace-nowrap">ผู้ดำเนินการ</th>
                      <th className="px-5 py-3.5">รายละเอียดการเปลี่ยนแปลง</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {allAuditLogs
                      .filter(log => {
                        if (!auditSearch.trim()) return true;
                        const q = auditSearch.toLowerCase();
                        return (
                          (log.equipment_code || '').toLowerCase().includes(q) ||
                          (log.equipment_name || '').toLowerCase().includes(q) ||
                          (log.modified_by || '').toLowerCase().includes(q) ||
                          (log.changes || '').toLowerCase().includes(q) ||
                          (log.action || '').toLowerCase().includes(q)
                        );
                      })
                      .map((log) => {
                        const logDate = log.modified_at ? new Date(log.modified_at) : null;
                        const dateStr = logDate 
                          ? logDate.toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' }) + ' ' + 
                            logDate.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + ' น.'
                          : '-';

                        return (
                          <tr key={log.id} className="hover:bg-slate-50/80 transition">
                            <td className="px-5 py-3.5 whitespace-nowrap text-slate-500 font-mono text-[11px]">
                              🕒 {dateStr}
                            </td>
                            <td className="px-5 py-3.5 whitespace-nowrap">
                              <div className="font-bold text-[#005691] font-mono">{log.equipment_code || `#${log.equipment_id}`}</div>
                              <div className="text-slate-700 text-[11px] truncate max-w-xs">{log.equipment_name || 'ครุภัณฑ์ในระบบ'}</div>
                            </td>
                            <td className="px-5 py-3.5 whitespace-nowrap">
                              <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-blue-50 text-blue-800 border border-blue-200">
                                {log.action || 'แก้ไขข้อมูล'}
                              </span>
                            </td>
                            <td className="px-5 py-3.5 whitespace-nowrap">
                              <span className="font-semibold text-slate-800 bg-slate-100 px-2.5 py-1 rounded-lg text-[11px]">
                                👤 {log.modified_by || 'ผู้ดูแลระบบ'}
                              </span>
                            </td>
                            <td className="px-5 py-3.5 text-slate-600 font-mono text-[11px] leading-relaxed">
                              {log.changes || '-'}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal เพิ่ม / แก้ไข ผู้ใช้งาน */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl overflow-hidden border border-slate-200">
            <div className="bg-[#071d36] text-white p-4 flex justify-between items-center">
              <h3 className="font-bold text-sm">
                {editingUser ? `แก้ไขผู้ใช้: ${editingUser.username}` : 'เพิ่มผู้ใช้งานใหม่ ม.อ.'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-white font-bold cursor-pointer">✕</button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
              {formError && <div className="text-red-600 bg-red-50 p-2.5 rounded-lg border border-red-200">⚠️ {formError}</div>}
              <div>
                <label className="block font-bold text-slate-700 mb-1">ชื่อผู้ใช้งาน (Username)</label>
                <input 
                  type="text" required value={formData.username} onChange={e => setFormData({...formData, username: e.target.value})}
                  className="w-full border border-slate-300 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-[#005691]"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  รหัสผ่าน {editingUser && <span className="font-normal text-slate-400">(เว้นว่างไว้หากไม่ต้องการเปลี่ยน)</span>}
                </label>
                <div className="relative">
                  <input 
                    type={showPassword ? "text" : "password"}
                    required={!editingUser}
                    value={formData.password}
                    onChange={e => setFormData({...formData, password: e.target.value})}
                    placeholder={editingUser ? "🔒 รหัสผ่านถูกเข้ารหัสแล้ว — ระบุใหม่เพื่อเปลี่ยน" : ""}
                    className="w-full border border-slate-300 rounded-xl p-2.5 pr-10 outline-none focus:ring-2 focus:ring-[#005691]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(p => !p)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer text-base"
                    title={showPassword ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
                  >
                    {showPassword ? (
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      </svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>
                {editingUser && !formData.password && (
                  <p className="text-xs text-amber-600 mt-1">⚠️ รหัสผ่านเดิมถูกเข้ารหัส (bcrypt) ไม่สามารถแสดงได้ — เว้นว่างไว้เพื่อคงรหัสผ่านเดิม</p>
                )}
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">ชื่อ-นามสกุลจริง</label>
                <input 
                  type="text" value={formData.full_name} onChange={e => setFormData({...formData, full_name: e.target.value})}
                  className="w-full border border-slate-300 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-[#005691]"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">ระดับสิทธิ์ (Role)</label>
                <select 
                  value={formData.role} onChange={e => setFormData({...formData, role: e.target.value})}
                  className="w-full border border-slate-300 rounded-xl p-2.5 outline-none bg-white focus:ring-2 focus:ring-[#005691]"
                >
                  <option value="admin">🛡️ ผู้ดูแลระบบ (Administrator)</option>
                  <option value="staff">📋 เจ้าหน้าที่พัสดุ (Staff)</option>
                  <option value="technician">🔧 ช่างซ่อมบำรุง (Technician)</option>
                  <option value="viewer">👁️ ผู้ใช้งานทั่วไป (Viewer)</option>
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 bg-slate-100 rounded-xl cursor-pointer hover:bg-slate-200 transition">ยกเลิก</button>
                <button type="submit" disabled={loading} className="px-5 py-2 bg-[#005691] hover:bg-[#003B71] text-white rounded-xl font-bold cursor-pointer transition disabled:opacity-50">
                  {loading ? 'กำลังบันทึก...' : 'บันทึก'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// =========================================================================
// 8. MODAL พิมพ์ป้ายเดี่ยว & พิมพ์แผ่นรวม
// =========================================================================
function SingleTagModal({ equipment, onClose }) {
  const [size, setSize] = useState('standard');
  const [orgName, setOrgName] = useState('มหาวิทยาลัยสงขลานครินทร์ (PSU)');

  if (!equipment) return null;
  const assetCode = getAssetCode(equipment);

  return (
    <div className="single-tag-overlay fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
      <style>{`
        @media print {
          @page {
            size: auto;
            margin: 10mm;
          }
          .single-tag-overlay, .single-tag-card, .single-tag-content {
            position: static !important;
            inset: auto !important;
            width: 100% !important;
            height: auto !important;
            overflow: visible !important;
            background: transparent !important;
            border: none !important;
            box-shadow: none !important;
            padding: 0 !important;
            margin: 0 !important;
            display: flex !important;
            justify-content: center !important;
            align-items: flex-start !important;
          }
          #printable-single-tag {
            position: static !important;
            transform: none !important;
            width: 92mm !important;
            border: 2px solid #002D62 !important;
            padding: 12px !important;
            background: #ffffff !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            break-inside: avoid-page !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .no-print { display: none !important; }
        }
      `}</style>
      <div className="single-tag-card bg-white rounded-2xl max-w-md w-full shadow-2xl overflow-hidden border border-slate-200">
        <div className="bg-[#071d36] text-white p-4 flex justify-between items-center no-print">
          <h3 className="font-bold text-sm">🏷️ ป้ายทะเบียนครุภัณฑ์ ม.อ.</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white font-bold">✕</button>
        </div>
        <div className="single-tag-content p-6 bg-slate-100 flex flex-col items-center">
          <AssetTag id="printable-single-tag" equipment={equipment} orgName={orgName} size={size} />
        </div>
        <div className="p-4 bg-white border-t border-slate-200 flex gap-2 no-print">
          <button onClick={() => window.print()} className="flex-1 bg-[#005691] hover:bg-[#003B71] text-white font-bold py-2.5 rounded-xl text-xs">
            🖨️ สั่งพิมพ์ป้ายนี้ออกเครื่องพิมพ์
          </button>
          <button onClick={onClose} className="px-5 py-2.5 bg-slate-100 text-slate-700 font-semibold rounded-xl text-xs">ปิด</button>
        </div>
      </div>
    </div>
  );
}

function BatchPrintModal({ equipments, defaultSize = "standard", defaultOrg = "มหาวิทยาลัยสงขลานครินทร์ (PSU)", onClose }) {
  // Preset รูปแบบการจัดหน้ากระดาษ A4 ให้เต็มหน้า
  // 'a4-portrait-8' : A4 แนวตั้ง (8 ป้าย/แผ่น: 2x4 เต็มหน้า A4 สวยงามพอดี ไม่เหลือพื้นที่ว่าง)
  // 'a4-portrait-10': A4 แนวตั้ง (10 ป้าย/แผ่น: 2x5 ขนาดสติกเกอร์สำเร็จรูป)
  // 'a4-landscape-9': A4 แนวนอน (9 ป้าย/แผ่น: 3x3 เต็มหน้า A4 ทั้งกว้างและยาว)
  // 'a4-landscape-6': A4 แนวนอน (6 ป้าย/แผ่น: 3x2 ป้ายใหญ่)
  const [layoutPreset, setLayoutPreset] = useState('a4-portrait-8');
  const [orgName, setOrgName] = useState(defaultOrg);

  const isLandscape = layoutPreset.startsWith('a4-landscape');
  const isCompact = layoutPreset === 'a4-portrait-10' || layoutPreset === 'a4-landscape-9';
  const cols = isLandscape ? 3 : 2;
  const tagsPerPage = layoutPreset === 'a4-portrait-8' ? 8 : layoutPreset === 'a4-portrait-10' ? 10 : layoutPreset === 'a4-landscape-9' ? 9 : 6;
  const estimatedPages = Math.ceil(equipments.length / tagsPerPage);

  return (
    <div className="batch-print-overlay fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 z-50">
      <style>{`
        @media print {
          @page {
            size: ${isLandscape ? 'A4 landscape' : 'A4 portrait'};
            margin: ${isLandscape ? '6mm 6mm' : '7mm 6mm'};
          }
          .batch-print-overlay, .batch-print-card, .batch-print-content {
            position: static !important;
            inset: auto !important;
            width: 100% !important;
            max-width: 100% !important;
            height: auto !important;
            max-height: none !important;
            overflow: visible !important;
            background: transparent !important;
            border: none !important;
            box-shadow: none !important;
            padding: 0 !important;
            margin: 0 !important;
            display: block !important;
          }
          #printable-batch-area {
            position: static !important;
            display: grid !important;
            grid-template-columns: repeat(${cols}, 1fr) !important;
            column-gap: ${isLandscape ? '4mm' : '5mm'} !important;
            row-gap: ${isCompact ? '3.5mm' : '4.5mm'} !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow: visible !important;
          }
          .batch-tag-item {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            break-inside: avoid-page !important;
            display: flex !important;
            justify-content: center !important;
            align-items: flex-start !important;
            margin: 0 !important;
            padding: 0 !important;
            box-sizing: border-box !important;
            height: auto !important;
            width: 100% !important;
          }
          .asset-tag-card {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            break-inside: avoid-page !important;
            box-shadow: none !important;
            border: 2px solid #002D62 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            background-color: #ffffff !important;
            width: 100% !important;
          }
          .no-print { display: none !important; }
        }
      `}</style>
      <div className="batch-print-card bg-white rounded-2xl max-w-5xl w-full shadow-2xl overflow-hidden border border-slate-200 flex flex-col h-[92vh]">
        {/* Modal Header */}
        <div className="bg-[#071d36] text-white p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 no-print">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-lg">🖨️</span>
              <h3 className="font-bold text-sm">พิมพ์ป้ายครุภัณฑ์แบบแผ่น A4 ({equipments.length} ป้าย)</h3>
              <span className="bg-[#005691] text-sky-200 text-[11px] font-bold px-2 py-0.5 rounded-full">
                ประมาณ {estimatedPages} แผ่น A4
              </span>
            </div>
            <p className="text-[11px] text-slate-300 mt-0.5">จัดหน้ากระดาษ A4 ให้เต็มแผ่นอัตโนมัติ สแกนได้คมชัดทั้ง QR และ Barcode</p>
          </div>
          <button onClick={onClose} className="self-end md:self-auto text-slate-400 hover:text-white font-bold text-lg px-2">✕</button>
        </div>

        {/* Toolbar ปรับ Preset การจัดหน้า A4 ให้เต็มหน้า */}
        <div className="bg-slate-50 border-b border-slate-200 px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs no-print">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-slate-600 font-bold">📄 รูปแบบเต็มหน้า A4:</span>
            <button
              onClick={() => setLayoutPreset('a4-portrait-8')}
              className={`px-3 py-1.5 rounded-lg font-bold transition flex items-center gap-1.5 ${
                layoutPreset === 'a4-portrait-8'
                  ? 'bg-[#002D62] text-white shadow-xs'
                  : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-100'
              }`}
            >
              <span>📄 A4 แนวตั้ง (8 ป้าย/แผ่น)</span>
              <span className="text-[10px] opacity-80 font-normal">2x4 เต็มหน้า</span>
            </button>
            <button
              onClick={() => setLayoutPreset('a4-portrait-10')}
              className={`px-3 py-1.5 rounded-lg font-bold transition flex items-center gap-1.5 ${
                layoutPreset === 'a4-portrait-10'
                  ? 'bg-[#002D62] text-white shadow-xs'
                  : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-100'
              }`}
            >
              <span>📄 A4 แนวตั้ง (10 ป้าย/แผ่น)</span>
              <span className="text-[10px] opacity-80 font-normal">2x5 สติกเกอร์</span>
            </button>
            <button
              onClick={() => setLayoutPreset('a4-landscape-9')}
              className={`px-3 py-1.5 rounded-lg font-bold transition flex items-center gap-1.5 ${
                layoutPreset === 'a4-landscape-9'
                  ? 'bg-[#002D62] text-white shadow-xs'
                  : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-100'
              }`}
            >
              <span>📄 A4 แนวนอน (9 ป้าย/แผ่น)</span>
              <span className="text-[10px] opacity-80 font-normal">3x3 เต็มหน้า</span>
            </button>
            <button
              onClick={() => setLayoutPreset('a4-landscape-6')}
              className={`px-3 py-1.5 rounded-lg font-bold transition flex items-center gap-1.5 ${
                layoutPreset === 'a4-landscape-6'
                  ? 'bg-[#002D62] text-white shadow-xs'
                  : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-100'
              }`}
            >
              <span>📄 A4 แนวนอน (6 ป้าย/แผ่น)</span>
              <span className="text-[10px] opacity-80 font-normal">3x2 ป้ายใหญ่</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-slate-500 font-semibold text-[11px]">สถาบัน:</span>
            <input 
              type="text" 
              value={orgName} 
              onChange={e => setOrgName(e.target.value)}
              className="bg-white border border-slate-300 rounded-lg px-2 py-1 text-xs w-48 outline-none focus:ring-1 focus:ring-[#005691]"
            />
          </div>
        </div>

        {/* Content Area */}
        <div className="batch-print-content p-6 overflow-y-auto flex-1 bg-slate-100">
          <div 
            id="printable-batch-area" 
            className={`grid gap-4 ${
              cols === 3 ? 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3' : 'grid-cols-1 md:grid-cols-2'
            }`}
          >
            {equipments.map(eq => (
              <div key={eq.id} className="batch-tag-item flex justify-center">
                <AssetTag equipment={eq} orgName={orgName} size={isCompact ? 'compact' : 'standard'} />
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-white border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 no-print">
          <div className="text-xs text-slate-500">
            💡 <strong>คำแนะนำ:</strong> ในหน้าต่างพิมพ์ ให้เลือกขนาด <strong>A4</strong> และการวางแนวเป็น <strong>{isLandscape ? 'แนวนอน (Landscape)' : 'แนวตั้ง (Portrait)'}</strong> (ระบบกำหนดค่าให้อัตโนมัติ)
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            <button 
              onClick={() => window.print()} 
              className="flex-1 sm:flex-none bg-[#005691] hover:bg-[#003B71] text-white font-bold px-6 py-2.5 rounded-xl text-xs flex items-center justify-center gap-2 shadow transition"
            >
              <span>🖨️</span>
              <span>สั่งพิมพ์เต็มหน้า A4 ({equipments.length} ป้าย • ~{estimatedPages} แผ่น)</span>
            </button>
            <button onClick={onClose} className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-xs transition">
              ปิด
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// =========================================================================
// 8b. MODAL นำเข้าครุภัณฑ์จากไฟล์ Excel / CSV (IMPORT ASSETS MODAL)
// =========================================================================
function ImportAssetsModal({ onClose, onImportSuccess }) {
  const [fileName, setFileName] = useState('');
  const [parsedItems, setParsedItems] = useState([]);
  const [errorMsg, setErrorMsg] = useState('');
  const [isImporting, setIsImporting] = useState(false);

  const HEADER_MAP = {
    'รหัสครุภัณฑ์': 'code',
    'code': 'code',
    'ชื่อครุภัณฑ์': 'name',
    'name': 'name',
    'ประเภทครุภัณฑ์': 'category',
    'หมวดหมู่': 'category',
    'category': 'category',
    'รายละเอียดครุภัณฑ์': 'details',
    'details': 'details',
    'ยี่ห้อ': 'brand',
    'brand': 'brand',
    'serial_no': 'serial_no',
    'serial no': 'serial_no',
    'serial no.': 'serial_no',
    'หมายเลขป้ายทะเบียนรถ': 'license_plate',
    'ทะเบียนรถจัดส่ง': 'license_plate',
    'license_plate': 'license_plate',
    'ราคาต่อหน่วย': 'price',
    'มูลค่า (บาท)': 'price',
    'ราคา': 'price',
    'ราคา (บาท)': 'price',
    'price': 'price',
    'ค่าขนส่ง': 'shipping_cost',
    'ค่าติดตั้ง': 'installation_cost',
    'ค่าใช้จ่ายอื่น': 'other_cost',
    'สถานที่ใช้งาน': 'location',
    'สถานที่ติดตั้ง': 'location',
    'สถานที่': 'location',
    'location': 'location',
    'รหัสส่วนงาน': 'dept_code',
    'ชื่อส่วนงาน': 'department',
    'หน่วยงาน': 'department',
    'หน่วยงานรับผิดชอบ': 'department',
    'department': 'department',
    'ปีงบประมาณ': 'fiscal_year',
    'fiscal_year': 'fiscal_year',
    'รหัสแหล่งเงิน': 'fund_code',
    'แหล่งเงิน': 'fund_source',
    'เลขที่ใบเบิก': 'requisition_no',
    'วันที่ใบเบิกครุภัณฑ์': 'requisition_date',
    'เลขที่เอกสารขอนุมัติซื้อ': 'purchase_approval_no',
    'เลขที่เอกสารขออนุมัติซื้อ': 'purchase_approval_no',
    'วันที่เอกสารขอนุมัติซื้อ': 'purchase_approval_date',
    'วันที่เอกสารขออนุมัติซื้อ': 'purchase_approval_date',
    'วิธีการจัดซื้อ': 'purchase_method',
    'ซื้อจาก': 'vendor',
    'เลขที่เอกสารเบิกจ่าย': 'payment_doc_no',
    'เลขที่สัญญา': 'contract_no',
    'วันเริ่มสัญญา': 'contract_start_date',
    'วันสิ้นสุดสัญญา': 'contract_end_date',
    'วันที่ตรวจรับ': 'received_date',
    'อายุการใช้งาน': 'useful_life',
    'มูลค่าคงเหลือ': 'salvage_value',
    'ระยะเวลาประกัน': 'warranty_period',
    'วันสิ้นสุดประกัน': 'warranty_end_date',
    'สถานะ': 'status',
    'สถานะปัจจุบัน': 'status',
    'status': 'status',
    'วันที่ตัดจำหน่าย': 'disposal_date',
    'เลขที่เอกสารตัดจำหน่าย': 'disposal_doc_no',
    'หมายเหตุการตัดจำหน่าย': 'disposal_note',
    'หมายเหตุ': 'remark',
    'หมายเหต': 'remark',
    'remark': 'remark'
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMsg('');
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target.result);
        const workbook = XLSX.read(data, { type: 'array', cellDates: false });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

        if (!rows || rows.length === 0) {
          setErrorMsg('ไม่พบข้อมูลในไฟล์ที่อัปโหลด');
          setParsedItems([]);
          return;
        }

        // ค้นหาแถวหัวตารางอัตโนมัติ (รองรับไฟล์ที่มีหัวเรื่อง 1-2 แถวบน เช่น ทะเบียนคุมครุภัณฑ์_ปีงบ_70.xlsx)
        let headerRowIdx = -1;
        for (let i = 0; i < Math.min(rows.length, 15); i++) {
          const normalized = rows[i].map(cell => String(cell || '').trim().toLowerCase());
          const hasName = normalized.some(h => h === 'ชื่อครุภัณฑ์' || h === 'name');
          const hasCode = normalized.some(h => h === 'รหัสครุภัณฑ์' || h === 'code');
          if (hasName || hasCode) {
            headerRowIdx = i;
            break;
          }
        }

        if (headerRowIdx === -1) {
          setErrorMsg('ไม่พบหัวคอลัมน์ "ชื่อครุภัณฑ์" หรือ "รหัสครุภัณฑ์" ในไฟล์ กรุณาตรวจสอบรูปแบบหรือดาวน์โหลดไฟล์ตัวอย่าง');
          setParsedItems([]);
          return;
        }

        const headerRow = rows[headerRowIdx].map(c => String(c || '').trim());
        const colMapping = headerRow.map(h => HEADER_MAP[h.toLowerCase()] || HEADER_MAP[h] || null);

        const items = [];
        for (let r = headerRowIdx + 1; r < rows.length; r++) {
          const row = rows[r];
          if (!row || row.every(cell => String(cell ?? '').trim() === '')) continue;
          const obj = {};
          colMapping.forEach((field, colIdx) => {
            if (field && row[colIdx] !== undefined && row[colIdx] !== null) {
              const val = String(row[colIdx]).trim();
              if (val !== '') obj[field] = val;
            }
          });
          if (obj.name) {
            items.push({
              ...obj,
              category: obj.category || 'คอมพิวเตอร์และอุปกรณ์',
              department: obj.department || 'สำนักทรัพยากรการเรียนรู้คุณหญิงหลง อรรถกระวีสุนทร',
              fiscal_year: obj.fiscal_year || '2570',
              status: obj.status || 'พร้อมใช้งาน',
              price: parseFloat(String(obj.price ?? 0).replace(/,/g, '')) || 0
            });
          }
        }

        if (items.length === 0) {
          setErrorMsg('ไม่พบแถวข้อมูลที่มี "ชื่อครุภัณฑ์" ในไฟล์นี้');
          setParsedItems([]);
          return;
        }
        setParsedItems(items);
      } catch (err) {
        console.error(err);
        setErrorMsg('ไม่สามารถอ่านไฟล์ได้ กรุณาใช้ไฟล์ .xlsx, .xls หรือ .csv (UTF-8)');
        setParsedItems([]);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleDownloadTemplate = () => {
    const sampleRows = [
      [
        'ลำดับ', 'รหัสครุภัณฑ์', 'ชื่อครุภัณฑ์', 'ประเภทครุภัณฑ์', 'รายละเอียดครุภัณฑ์', 'ยี่ห้อ', 'SERIAL_NO',
        'หมายเลขป้ายทะเบียนรถ', 'ราคาต่อหน่วย', 'สถานที่ใช้งาน', 'ชื่อส่วนงาน', 'ปีงบประมาณ',
        'วิธีการจัดซื้อ', 'ซื้อจาก', 'เลขที่สัญญา'
      ],
      [
        1, 'ITs010', 'เครื่องคอมพิวเตอร์ตั้งโต๊ะ All-in-One', 'คอมพิวเตอร์และอุปกรณ์', 'Core i7 RAM 16GB SSD 512GB', 'HP', 'SN-HP257001',
        'กก2564', 28900, 'ห้องบริการคอมพิวเตอร์ ชั้น 2', 'สำนักทรัพยากรการเรียนรู้คุณหญิงหลง อรรถกระวีสุนทร', '2570',
        'เฉพาะเจาะจง', 'บริษัท ไอทีโซลูชั่น จำกัด', 'สญ.70/001'
      ],
      [
        2, 'AVs011', 'เครื่องฉายภาพโปรเจคเตอร์ 4000 Lumens', 'โสตทัศนูปกรณ์', 'ความละเอียด Full HD', 'Epson', 'SN-EP257002',
        'กก2565', 34500, 'ห้องประชุม 1 ชั้น 3', 'ฝ่ายบริการสารสนเทศ', '2570',
        'เฉพาะเจาะจง', 'หจก. โสตทัศน์ภาคใต้', 'สญ.70/002'
      ]
    ];
    const ws = XLSX.utils.aoa_to_sheet(sampleRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'ทะเบียนครุภัณฑ์');
    XLSX.writeFile(wb, 'ตัวอย่างไฟล์นำเข้าครุภัณฑ์_ม.อ.xlsx');
  };

  const handleConfirmImport = async () => {
    if (parsedItems.length === 0) return;
    setIsImporting(true);
    try {
      const res = await axios.post('http://localhost:5000/api/equipments/import', { items: parsedItems });
      alert(res.data?.message || `นำเข้าข้อมูลสำเร็จ ${parsedItems.length} รายการ`);
      if (onImportSuccess) await onImportSuccess();
      onClose();
    } catch (err) {
      alert(err.response?.data?.error || 'เกิดข้อผิดพลาดในการนำเข้าข้อมูล');
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl max-w-4xl w-full shadow-2xl overflow-hidden border border-slate-200 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-[#071d36] text-white p-4 px-6 flex justify-between items-center">
          <div>
            <h3 className="font-extrabold text-base flex items-center gap-2">
              <span>📤</span> นำเข้าครุภัณฑ์จากไฟล์ Excel / CSV
            </h3>
            <p className="text-[11px] text-sky-300 mt-0.5">
              รองรับไฟล์ .xlsx, .xls และ .csv รวมถึงไฟล์ทะเบียนคุมครุภัณฑ์ 39 คอลัมน์โดยอัตโนมัติ
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white font-bold p-1 text-lg cursor-pointer">✕</button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5 overflow-y-auto flex-1 text-xs">
          {/* Upload Zone + Template Download */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-50 p-4 rounded-2xl border border-dashed border-slate-300">
            <div className="space-y-1">
              <div className="font-bold text-slate-800 text-sm">เลือกไฟล์ Excel (.xlsx / .xls) หรือ CSV</div>
              <div className="text-[11px] text-slate-500">
                ระบบจะตรวจจับหัวคอลัมน์ให้อัตโนมัติ (ไม่จำเป็นต้องมีคอลัมน์ "สถานะ" ในไฟล์ ระบบจะตั้งค่าเริ่มต้นเป็น <span className="font-semibold text-emerald-700">"พร้อมใช้งาน"</span> ให้อัตโนมัติทุกรายการ)
              </div>
              {fileName && (
                <div className="text-[11px] font-bold text-[#005691] pt-1">
                  📎 ไฟล์ที่เลือก: {fileName}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0 flex-wrap">
              <button
                type="button"
                onClick={handleDownloadTemplate}
                className="bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-semibold px-3.5 py-2 rounded-xl transition cursor-pointer"
              >
                📄 ดาวน์โหลดไฟล์ตัวอย่าง (.xlsx)
              </button>
              <label className="bg-[#005691] hover:bg-[#003B71] text-white font-bold px-4 py-2 rounded-xl shadow-sm transition cursor-pointer">
                <span>📂 เลือกไฟล์</span>
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          {errorMsg && (
            <div className="bg-rose-50 border border-rose-200 text-rose-700 rounded-xl p-3 font-semibold">
              ⚠️ {errorMsg}
            </div>
          )}

          {/* Preview Table */}
          {parsedItems.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="font-bold text-emerald-700 text-sm">
                  ✅ พบข้อมูลพร้อมนำเข้าทั้งหมด {parsedItems.length} รายการ
                </div>
                {parsedItems.length > 10 && (
                  <span className="text-[11px] text-slate-400">แสดงตัวอย่าง 10 รายการแรก</span>
                )}
              </div>
              <div className="border border-slate-200 rounded-xl overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-100 text-[11px]">
                  <thead className="bg-slate-50 text-slate-500 font-semibold">
                    <tr>
                      <th className="px-3 py-2 text-center w-10">ลำดับ</th>
                      <th className="px-3 py-2 text-left">รหัส</th>
                      <th className="px-3 py-2 text-left">ชื่อครุภัณฑ์</th>
                      <th className="px-3 py-2 text-left">หมวดหมู่</th>
                      <th className="px-3 py-2 text-left">ยี่ห้อ</th>
                      <th className="px-3 py-2 text-left">หน่วยงาน</th>
                      <th className="px-3 py-2 text-left">สถานที่</th>
                      <th className="px-3 py-2 text-center">ปีงบ</th>
                      <th className="px-3 py-2 text-right">ราคา (บาท)</th>
                      <th className="px-3 py-2 text-center">สถานะ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {parsedItems.slice(0, 10).map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="px-3 py-2 text-center text-slate-400 font-mono">{idx + 1}</td>
                        <td className="px-3 py-2 font-mono font-bold text-[#005691]">{item.code || '(สร้างอัตโนมัติ)'}</td>
                        <td className="px-3 py-2 font-semibold text-slate-800">{item.name}</td>
                        <td className="px-3 py-2 text-slate-600">{item.category}</td>
                        <td className="px-3 py-2 text-slate-600">{item.brand || '-'}</td>
                        <td className="px-3 py-2 text-slate-600 max-w-[160px] truncate">{item.department}</td>
                        <td className="px-3 py-2 text-slate-500">{item.location || '-'}</td>
                        <td className="px-3 py-2 text-center font-bold text-[#005691]">{item.fiscal_year}</td>
                        <td className="px-3 py-2 text-right font-semibold text-slate-700">
                          {(parseFloat(item.price) || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700">
                            {item.status || 'พร้อมใช้งาน'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 px-6 bg-slate-50 border-t border-slate-200 flex justify-end gap-2 text-xs">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 rounded-xl font-semibold cursor-pointer"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            disabled={parsedItems.length === 0 || isImporting}
            onClick={handleConfirmImport}
            className={`px-5 py-2.5 rounded-xl font-bold shadow-md transition flex items-center gap-1.5 ${
              parsedItems.length === 0 || isImporting
                ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                : 'bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer'
            }`}
          >
            <span>{isImporting ? '⏳ กำลังนำเข้า...' : `✓ ยืนยันนำเข้า ${parsedItems.length} รายการ`}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// =========================================================================
// 9. COMPONENT หลัก (APP)
// =========================================================================
function App() {
  const [currentUser, setCurrentUser] = useState(() => {
    const saved = localStorage.getItem('user_profile');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) {}
    }
    const uname = localStorage.getItem('username');
    const role = localStorage.getItem('role') || 'admin';
    return uname ? { username: uname, role, full_name: 'ผู้ดูแลระบบ ม.อ.' } : null;
  });

  const [equipments, setEquipments] = useState([]);
  const [logs, setLogs] = useState([]);
  const [repairs, setRepairs] = useState([]);
  const [categories, setCategories] = useState([]);
  const [departmentsData, setDepartmentsData] = useState([]);
  const [locationsData, setLocationsData] = useState([]);
  const [audits, setAudits] = useState([]);
  const [disposals, setDisposals] = useState([]);
  const [fiscalYearsData, setFiscalYearsData] = useState([]);
  const [deliveryTrucks, setDeliveryTrucks] = useState([]);
  const [singleTagItem, setSingleTagItem] = useState(null);
  const [batchPrintData, setBatchPrintData] = useState(null);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const fetchAllData = async () => {
    try {
      const [eqRes, logsRes, repRes, catRes, deptRes, locRes, audRes, dispRes, fyRes, truckRes] = await Promise.all([
        axios.get('http://localhost:5000/api/equipments').catch(() => ({ data: [] })),
        axios.get('http://localhost:5000/api/logs').catch(() => ({ data: [] })),
        axios.get('http://localhost:5000/api/maintenance').catch(() => ({ data: [] })),
        axios.get('http://localhost:5000/api/categories').catch(() => ({ data: [] })),
        axios.get('http://localhost:5000/api/departments').catch(() => ({ data: [] })),
        axios.get('http://localhost:5000/api/locations').catch(() => ({ data: [] })),
        axios.get('http://localhost:5000/api/audits').catch(() => ({ data: [] })),
        axios.get('http://localhost:5000/api/disposals').catch(() => ({ data: [] })),
        axios.get('http://localhost:5000/api/fiscal-years').catch(() => ({ data: [] })),
        axios.get('http://localhost:5000/api/delivery-trucks').catch(() => ({ data: [] }))
      ]);
      setEquipments(Array.isArray(eqRes.data) ? eqRes.data : []);
      setLogs(Array.isArray(logsRes.data) ? logsRes.data : []);
      setRepairs(Array.isArray(repRes.data) ? repRes.data : []);
      setCategories(Array.isArray(catRes.data) ? catRes.data : []);
      setDepartmentsData(Array.isArray(deptRes.data) ? deptRes.data : []);
      setLocationsData(Array.isArray(locRes.data) ? locRes.data : []);
      setAudits(Array.isArray(audRes.data) ? audRes.data : []);
      setDisposals(Array.isArray(dispRes.data) ? dispRes.data : []);
      setFiscalYearsData(Array.isArray(fyRes.data) ? fyRes.data : []);
      setDeliveryTrucks(Array.isArray(truckRes.data) ? truckRes.data : []);
    } catch (error) {
      console.error(error);
    }
  };

  useEffect(() => {
    if (currentUser) fetchAllData();
  }, [currentUser]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    localStorage.removeItem('role');
    localStorage.removeItem('user_profile');
    setCurrentUser(null);
  };

  const handleOpenBatchPrint = (items, defaultSize = "standard", defaultOrg = "มหาวิทยาลัยสงขลานครินทร์ (PSU)") => {
    if (!items || items.length === 0) {
      alert('กรุณาเลือกครุภัณฑ์ที่ต้องการพิมพ์อย่างน้อย 1 รายการ');
      return;
    }
    setBatchPrintData({ items, size: defaultSize, org: defaultOrg });
  };

  if (!currentUser) {
    return <LoginPage onLoginSuccess={u => setCurrentUser(u)} equipmentsCount={equipments.length || 1248} />;
  }

  const role = currentUser?.role || 'viewer';
  const isAdmin = role === 'admin';
  const isStaff = role === 'staff';
  const isTechnician = role === 'technician';
  const canManage = isAdmin || isStaff;
  const canRepair = true; // ทุกสิทธิ์รวมถึงผู้ใช้งานทั่วไป (Viewer) สามารถเข้าดูและส่งแจ้งซ่อมได้

  return (
    <Router>
      <div className="flex h-screen overflow-hidden bg-slate-50 font-sans text-slate-800">
        {/* Sidebar — อยู่คงที่ fixed บนมือถือ, static/fixed ใน container บน desktop */}
        <Sidebar
          currentUser={currentUser}
          onLogout={handleLogout}
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />

        {/* Right Main Content — เลื่อนเฉพาะส่วน main ด้านใน */}
        <div className={`flex-1 flex flex-col h-screen overflow-hidden min-w-0 ${(batchPrintData || singleTagItem) ? 'no-print' : ''}`}>
          <Topbar
            currentUser={currentUser}
            onLogout={handleLogout}
            onMenuToggle={() => setSidebarOpen(o => !o)}
            equipments={equipments}
            repairs={repairs}
          />

          <main className="flex-1 overflow-y-auto">
            <Routes>
              {/* หน้าที่ทุกสิทธิ์เข้าดูได้ */}
              <Route path="/" element={<Dashboard equipments={equipments} logs={logs} repairs={repairs} currentUser={currentUser} />} />
              <Route path="/manage" element={<Management equipments={equipments} categoriesData={categories} departmentsData={departmentsData} deliveryTrucks={deliveryTrucks} fetchAllData={fetchAllData} currentUser={currentUser} onOpenSingleTag={eq => setSingleTagItem(eq)} onOpenBatchPrint={handleOpenBatchPrint} onOpenImport={() => setIsImportModalOpen(true)} allowAdd={false} />} />
              <Route path="/tags" element={role !== 'viewer' ? <AssetTagsPage equipments={equipments} onOpenSingleTag={eq => setSingleTagItem(eq)} onOpenBatchPrint={handleOpenBatchPrint} /> : <Navigate to="/manage" replace />} />

              {/* หน้าเฉพาะ Admin และ เจ้าหน้าที่พัสดุ (Staff) */}
              <Route path="/purchase" element={canManage ? <PurchaseDetailsPage equipments={equipments} fiscalYearsData={fiscalYearsData} deliveryTrucks={deliveryTrucks} fetchAllData={fetchAllData} currentUser={currentUser} /> : <Navigate to="/manage" replace />} />
              <Route path="/categories" element={canManage ? <CategoriesPage equipments={equipments} categories={categories} fetchAllData={fetchAllData} currentUser={currentUser} onOpenSingleTag={eq => setSingleTagItem(eq)} /> : <Navigate to="/manage" replace />} />
              <Route path="/departments" element={canManage ? <DepartmentsPage equipments={equipments} departmentsData={departmentsData} locationsData={locationsData} fetchAllData={fetchAllData} currentUser={currentUser} onOpenSingleTag={eq => setSingleTagItem(eq)} /> : <Navigate to="/manage" replace />} />
              <Route path="/receive" element={canManage ? <ReceivePage equipments={equipments} categories={categories} departmentsData={departmentsData} locationsData={locationsData} fiscalYearsData={fiscalYearsData} deliveryTrucks={deliveryTrucks} fetchAllData={fetchAllData} currentUser={currentUser} onOpenSingleTag={eq => setSingleTagItem(eq)} onOpenBatchPrint={handleOpenBatchPrint} onOpenImport={() => setIsImportModalOpen(true)} /> : <Navigate to="/manage" replace />} />
              <Route path="/transfer" element={canManage ? <TransferPage equipments={equipments} logs={logs} departmentsData={departmentsData} locationsData={locationsData} fetchAllData={fetchAllData} currentUser={currentUser} /> : <Navigate to="/manage" replace />} />
              <Route path="/audit" element={canManage ? <AuditPage equipments={equipments} audits={audits} fetchAllData={fetchAllData} currentUser={currentUser} /> : <Navigate to="/manage" replace />} />
              <Route path="/disposal" element={canManage ? <DisposalPage equipments={equipments} disposals={disposals} fetchAllData={fetchAllData} currentUser={currentUser} /> : <Navigate to="/manage" replace />} />
              <Route path="/logs" element={canManage ? <ReceivePage equipments={equipments} categories={categories} departmentsData={departmentsData} locationsData={locationsData} fiscalYearsData={fiscalYearsData} fetchAllData={fetchAllData} currentUser={currentUser} onOpenSingleTag={eq => setSingleTagItem(eq)} onOpenBatchPrint={handleOpenBatchPrint} onOpenImport={() => setIsImportModalOpen(true)} /> : <Navigate to="/manage" replace />} />

              {/* หน้าแจ้งซ่อม & ซ่อมบำรุง ทุกสิทธิ์รวมถึงผู้ใช้งานทั่วไป (Viewer) สามารถเข้าดูและส่งแจ้งซ่อมได้ */}
              <Route path="/repairs" element={<RepairsPage equipments={equipments} repairs={repairs} fetchAllData={fetchAllData} currentUser={currentUser} />} />

              {/* หน้าจัดการผู้ใช้ & สิทธิ์ เฉพาะ Admin เท่านั้น */}
              <Route 
                path="/users" 
                element={
                  isAdmin 
                    ? <UserManagement currentUser={currentUser} equipments={equipments} /> 
                    : <Navigate to="/manage" replace />
                } 
              />

              <Route path="*" element={<Navigate to="/manage" replace />} />
            </Routes>
          </main>
        </div>

        {/* Single Print Modal */}
        {singleTagItem && <SingleTagModal equipment={singleTagItem} onClose={() => setSingleTagItem(null)} />}

        {/* Batch Print Modal */}
        {batchPrintData && (
          <BatchPrintModal equipments={batchPrintData.items} defaultSize={batchPrintData.size} defaultOrg={batchPrintData.org} onClose={() => setBatchPrintData(null)} />
        )}

        {/* Import Excel / CSV Modal */}
        {isImportModalOpen && (
          <ImportAssetsModal onClose={() => setIsImportModalOpen(false)} onImportSuccess={fetchAllData} />
        )}
      </div>
    </Router>
  );
}

export default App;

