const express = require('express');
const cors = require('cors');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_asset_key_2026';

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// In-Memory Fallback Database
let memoryDb = {
  equipments: [
    { id: 1, name: 'MacBook Pro M2', category: 'IT', status: 'พร้อมใช้งาน', created_at: new Date().toISOString() },
    { id: 2, name: 'โปรเจคเตอร์ Epson', category: 'Electronics', status: 'กำลังถูกยืม', created_at: new Date().toISOString() },
    { id: 3, name: 'เครื่องปริ้น Canon LBP2900', category: 'IT', status: 'ส่งซ่อม', created_at: new Date().toISOString() }
  ],
  logs: [
    { id: 1, equipment_id: 2, equipment_name: 'โปรเจคเตอร์ Epson', borrower_name: 'สมชาย ไอที', borrow_date: new Date().toISOString(), return_date: null, status: 'กำลังยืม' }
  ],
  maintenance: [
    { id: 1, equipment_id: 3, equipment_name: 'เครื่องปริ้น Canon LBP2900', issue_detail: 'ไฟไม่เข้า หัวพิมพ์ติดขัด', reported_date: new Date().toISOString(), resolved_date: null, cost: 0, status: 'กำลังซ่อม' }
  ],
  transfers: [],
  categories: [
    { id: 1, code: 'IT', name: 'คอมพิวเตอร์และอุปกรณ์', description: 'เครื่องคอมพิวเตอร์ โน้ตบุ๊ก เซิร์ฟเวอร์ จอภาพ และอุปกรณ์ต่อพ่วง IT', icon: '💻' },
    { id: 2, code: 'OFF', name: 'เครื่องใช้สำนักงาน', description: 'เครื่องถ่ายเอกสาร เครื่องพิมพ์ เครื่องสแกน และอุปกรณ์สำนักงาน', icon: '🖨️' },
    { id: 3, code: 'AIR', name: 'เครื่องปรับอากาศ', description: 'แอร์ เครื่องฟอกอากาศ และระบบระบายอากาศ', icon: '❄️' },
    { id: 4, code: 'AV', name: 'โสตทัศนูปกรณ์', description: 'โปรเจคเตอร์ กล้อง เครื่องเสียง ไมโครโฟน และจอแสดงผลห้องประชุม', icon: '📽️' },
    { id: 5, code: 'FUR', name: 'เฟอร์นิเจอร์สำนักงาน', description: 'โต๊ะ เก้าอี้ ตู้เก็บเอกสาร ชั้นวางหนังสือ', icon: '🪑' },
    { id: 6, code: 'EL', name: 'อิเล็กทรอนิกส์', description: 'เครื่องใช้ไฟฟ้าและอุปกรณ์อิเล็กทรอนิกส์ทั่วไป', icon: '⚡' },
    { id: 7, code: 'GEN', name: 'อื่นๆ', description: 'ครุภัณฑ์ทั่วไปอื่นๆ ที่ไม่อยู่ในหมวดหมู่หลัก', icon: '📦' }
  ],
  departments: [
    { id: 1, name: 'สำนักทรัพยากรการเรียนรู้คุณหญิงหลง อรรถกระวีสุนทร', building: 'อาคารคุณหญิงหลงฯ', floor: 'ชั้น 1-7', description: 'หน่วยงานหลักและส่วนกลางของสำนักทรัพยากรการเรียนรู้ฯ' },
    { id: 2, name: 'ฝ่ายเทคโนโลยีสารสนเทศ', building: 'อาคารคุณหญิงหลงฯ', floor: 'ชั้น 2', description: 'ดูแลระบบเครือข่าย เซิร์ฟเวอร์ คอมพิวเตอร์ และระบบสารสนเทศ' },
    { id: 3, name: 'ฝ่ายบริหารทั่วไป', building: 'อาคารคุณหญิงหลงฯ', floor: 'ชั้น 2', description: 'งานธุรการ งานพัสดุ การเงิน และบุคลากร' },
    { id: 4, name: 'ฝ่ายบริการสารสนเทศ', building: 'อาคารคุณหญิงหลงฯ', floor: 'ชั้น 3-4', description: 'บริการยืม-คืน สืบค้น และพื้นที่การเรียนรู้' },
    { id: 5, name: 'ฝ่ายจัดการทรัพยากรสารสนเทศ', building: 'อาคารคุณหญิงหลงฯ', floor: 'ชั้น 5', description: 'จัดหา วิเคราะห์หมวดหมู่ และเตรียมทรัพยากรสารสนเทศ' },
    { id: 6, name: 'สำนักงานอธิการบดี', building: 'อาคารสำนักงานอธิการบดี', floor: 'ชั้น 1-4', description: 'หน่วยงานบริหารส่วนกลาง มหาวิทยาลัยสงขลานครินทร์' }
  ],
  locations: [
    { id: 1, name: 'ห้องเซิร์ฟเวอร์ ชั้น 2', building: 'อาคารคุณหญิงหลงฯ', floor: 'ชั้น 2', department: 'ฝ่ายเทคโนโลยีสารสนเทศ', note: 'ห้องควบคุมระบบเครือข่ายและแม่ข่ายหลัก' },
    { id: 2, name: 'ห้องสำนักงานบริหาร ชั้น 2', building: 'อาคารคุณหญิงหลงฯ', floor: 'ชั้น 2', department: 'ฝ่ายบริหารทั่วไป', note: 'พื้นที่ปฏิบัติงานเจ้าหน้าที่ธุรการและพัสดุ' },
    { id: 3, name: 'เคาน์เตอร์บริการยืม-คืน ชั้น 3', building: 'อาคารคุณหญิงหลงฯ', floor: 'ชั้น 3', department: 'ฝ่ายบริการสารสนเทศ', note: 'จุดบริการนักศึกษาและบุคลากร' },
    { id: 4, name: 'ห้องประชุมใหญ่ ชั้น 4', building: 'อาคารคุณหญิงหลงฯ', floor: 'ชั้น 4', department: 'สำนักทรัพยากรการเรียนรู้คุณหญิงหลง อรรถกระวีสุนทร', note: 'ห้องประชุมและอบรมสัมมนา' },
    { id: 5, name: 'ห้องปฏิบัติการคอมพิวเตอร์ ชั้น 5', building: 'อาคารคุณหญิงหลงฯ', floor: 'ชั้น 5', department: 'ฝ่ายจัดการทรัพยากรสารสนเทศ', note: 'ห้องปฏิบัติการและจัดเตรียมข้อมูล' }
  ],
  audits: [],
  disposals: [],
  fiscal_years: [
    { id: 1, year: '2568', note: 'ปีงบประมาณ พ.ศ. 2568' },
    { id: 2, year: '2569', note: 'ปีงบประมาณ พ.ศ. 2569' },
    { id: 3, year: '2570', note: 'ปีงบประมาณ พ.ศ. 2570' },
    { id: 4, year: '2571', note: 'ปีงบประมาณ พ.ศ. 2571' }
  ],
  users: [
    { id: 1, username: 'admin', role: 'admin', department: 'สำนักงานส่วนกลาง', full_name: 'ผู้ดูแลระบบหลัก', passwordHash: bcrypt.hashSync('123456', 10), created_at: new Date().toISOString() },
    { id: 2, username: 'staff01', role: 'staff', department: 'ฝ่ายเทคโนโลยีสารสนเทศ', full_name: 'สมชาย เจ้าหน้าที่', passwordHash: bcrypt.hashSync('123456', 10), created_at: new Date().toISOString() }
  ]
};

// PostgreSQL Connection Pool
let pool = null;
let usePostgres = false;

try {
  pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'equipment_db',
    password: process.env.DB_PASSWORD || 'peeranat00',
    port: parseInt(process.env.DB_PORT, 10) || 5432,
    connectionTimeoutMillis: 3000
  });

  pool.query('SELECT NOW()', async (err) => {
    if (err) {
      console.warn('⚠️ PostgreSQL connection failed, switching to in-memory mode:', err.message);
      usePostgres = false;
    } else {
      console.log('✅ PostgreSQL connected successfully to', process.env.DB_NAME || 'equipment_db');
      usePostgres = true;
      try {
        await pool.query(`
          CREATE TABLE IF NOT EXISTS transfer_logs (
            id SERIAL PRIMARY KEY,
            equipment_id INTEGER REFERENCES equipments(id) ON DELETE CASCADE,
            from_department VARCHAR(255),
            to_department VARCHAR(255),
            from_location VARCHAR(255),
            to_location VARCHAR(255),
            transferred_by VARCHAR(150),
            note TEXT,
            transfer_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `);
        await pool.query(`
          CREATE TABLE IF NOT EXISTS categories (
            id SERIAL PRIMARY KEY,
            code VARCHAR(20) UNIQUE NOT NULL,
            name VARCHAR(150) NOT NULL,
            description TEXT DEFAULT '',
            icon VARCHAR(20) DEFAULT '📦',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `);
        const catCount = await pool.query('SELECT COUNT(*) FROM categories');
        if (parseInt(catCount.rows[0].count, 10) === 0) {
          for (const c of memoryDb.categories) {
            await pool.query(
              'INSERT INTO categories (code, name, description, icon) VALUES ($1, $2, $3, $4) ON CONFLICT (code) DO NOTHING',
              [c.code, c.name, c.description, c.icon]
            );
          }
        }
        await pool.query(`
          CREATE TABLE IF NOT EXISTS departments (
            id SERIAL PRIMARY KEY,
            name VARCHAR(255) UNIQUE NOT NULL,
            building VARCHAR(150) DEFAULT '',
            floor VARCHAR(100) DEFAULT '',
            description TEXT DEFAULT '',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `);
        const deptCount = await pool.query('SELECT COUNT(*) FROM departments');
        if (parseInt(deptCount.rows[0].count, 10) === 0) {
          for (const d of memoryDb.departments) {
            await pool.query(
              'INSERT INTO departments (name, building, floor, description) VALUES ($1, $2, $3, $4) ON CONFLICT (name) DO NOTHING',
              [d.name, d.building, d.floor, d.description]
            );
          }
        }
        await pool.query(`
          CREATE TABLE IF NOT EXISTS locations (
            id SERIAL PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            building VARCHAR(150) DEFAULT '',
            floor VARCHAR(100) DEFAULT '',
            department VARCHAR(255) DEFAULT '',
            note TEXT DEFAULT '',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `);
        const locCount = await pool.query('SELECT COUNT(*) FROM locations');
        if (parseInt(locCount.rows[0].count, 10) === 0) {
          for (const l of memoryDb.locations) {
            await pool.query(
              'INSERT INTO locations (name, building, floor, department, note) VALUES ($1, $2, $3, $4, $5)',
              [l.name, l.building, l.floor, l.department, l.note]
            );
          }
        }
        await pool.query(`
          CREATE TABLE IF NOT EXISTS audit_logs (
            id SERIAL PRIMARY KEY,
            equipment_id INTEGER REFERENCES equipments(id) ON DELETE CASCADE,
            fiscal_year VARCHAR(20) DEFAULT '2569',
            audit_status VARCHAR(100) NOT NULL,
            found_location VARCHAR(255) DEFAULT '',
            auditor VARCHAR(150) DEFAULT '',
            note TEXT DEFAULT '',
            audited_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `);
        await pool.query(`
          CREATE TABLE IF NOT EXISTS disposal_logs (
            id SERIAL PRIMARY KEY,
            equipment_id INTEGER REFERENCES equipments(id) ON DELETE CASCADE,
            disposal_method VARCHAR(100) NOT NULL,
            reason TEXT DEFAULT '',
            committee VARCHAR(255) DEFAULT '',
            sale_price NUMERIC(12, 2) DEFAULT 0,
            doc_no VARCHAR(100) DEFAULT '',
            disposal_status VARCHAR(50) DEFAULT 'รอจำหน่าย',
            requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            approved_at TIMESTAMP
          )
        `);
        await pool.query(`
          ALTER TABLE equipments
            ADD COLUMN IF NOT EXISTS license_plate VARCHAR(100) DEFAULT '',
            ADD COLUMN IF NOT EXISTS shipping_cost NUMERIC(12, 2) DEFAULT 0,
            ADD COLUMN IF NOT EXISTS installation_cost NUMERIC(12, 2) DEFAULT 0,
            ADD COLUMN IF NOT EXISTS other_cost NUMERIC(12, 2) DEFAULT 0,
            ADD COLUMN IF NOT EXISTS dept_code VARCHAR(50) DEFAULT '',
            ADD COLUMN IF NOT EXISTS fiscal_year VARCHAR(20) DEFAULT '2570',
            ADD COLUMN IF NOT EXISTS fund_code VARCHAR(50) DEFAULT '',
            ADD COLUMN IF NOT EXISTS fund_source VARCHAR(150) DEFAULT 'เงินงบประมาณแผ่นดิน',
            ADD COLUMN IF NOT EXISTS requisition_no VARCHAR(100) DEFAULT '',
            ADD COLUMN IF NOT EXISTS requisition_date VARCHAR(50) DEFAULT '',
            ADD COLUMN IF NOT EXISTS purchase_approval_no VARCHAR(100) DEFAULT '',
            ADD COLUMN IF NOT EXISTS purchase_approval_date VARCHAR(50) DEFAULT '',
            ADD COLUMN IF NOT EXISTS purchase_method VARCHAR(150) DEFAULT 'เฉพาะเจาะจง',
            ADD COLUMN IF NOT EXISTS vendor VARCHAR(255) DEFAULT '',
            ADD COLUMN IF NOT EXISTS payment_doc_no VARCHAR(100) DEFAULT '',
            ADD COLUMN IF NOT EXISTS contract_no VARCHAR(100) DEFAULT '',
            ADD COLUMN IF NOT EXISTS contract_start_date VARCHAR(50) DEFAULT '',
            ADD COLUMN IF NOT EXISTS contract_end_date VARCHAR(50) DEFAULT '',
            ADD COLUMN IF NOT EXISTS received_date VARCHAR(50) DEFAULT '',
            ADD COLUMN IF NOT EXISTS useful_life VARCHAR(50) DEFAULT '5 ปี',
            ADD COLUMN IF NOT EXISTS salvage_value NUMERIC(12, 2) DEFAULT 1,
            ADD COLUMN IF NOT EXISTS warranty_period VARCHAR(100) DEFAULT '1 ปี',
            ADD COLUMN IF NOT EXISTS warranty_end_date VARCHAR(50) DEFAULT '',
            ADD COLUMN IF NOT EXISTS disposal_date VARCHAR(50) DEFAULT '',
            ADD COLUMN IF NOT EXISTS disposal_doc_no VARCHAR(100) DEFAULT '',
            ADD COLUMN IF NOT EXISTS disposal_note TEXT DEFAULT '',
            ADD COLUMN IF NOT EXISTS remark TEXT DEFAULT ''
        `);
        await pool.query(`
          CREATE TABLE IF NOT EXISTS fiscal_years (
            id SERIAL PRIMARY KEY,
            year VARCHAR(20) UNIQUE NOT NULL,
            note TEXT DEFAULT '',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `);
        const fyCount = await pool.query('SELECT COUNT(*) FROM fiscal_years');
        if (parseInt(fyCount.rows[0].count, 10) === 0) {
          for (const fy of memoryDb.fiscal_years) {
            await pool.query(
              'INSERT INTO fiscal_years (year, note) VALUES ($1, $2) ON CONFLICT (year) DO NOTHING',
              [fy.year, fy.note]
            );
          }
        }
        await pool.query(`
          CREATE TABLE IF NOT EXISTS delivery_trucks (
            id SERIAL PRIMARY KEY,
            fiscal_year VARCHAR(20) NOT NULL,
            license_plate VARCHAR(100) NOT NULL,
            note TEXT DEFAULT '',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (fiscal_year, license_plate)
          )
        `);
        // ซิงค์ทะเบียนรถที่มีอยู่แล้วในตาราง equipments เข้าสู่ delivery_trucks อัตโนมัติ
        await pool.query(`
          INSERT INTO delivery_trucks (fiscal_year, license_plate)
          SELECT COALESCE(NULLIF(TRIM(fiscal_year), ''), '2570'), TRIM(license_plate)
          FROM equipments
          WHERE license_plate IS NOT NULL AND TRIM(license_plate) <> '' AND TRIM(license_plate) <> '-'
          ON CONFLICT (fiscal_year, license_plate) DO NOTHING
        `);
      } catch (tableErr) {
        console.warn('⚠️ Could not ensure transfer_logs table:', tableErr.message);
      }
    }
  });
} catch (e) {
  console.warn('⚠️ PostgreSQL initialization error, using in-memory mode:', e.message);
  usePostgres = false;
}

// ==========================================
// 1. Equipments API
// ==========================================
app.get('/api/equipments', async (req, res) => {
  if (usePostgres) {
    try {
      const result = await pool.query(`
        SELECT equipments.*, 
               COALESCE(COUNT(maintenance_logs.id), 0)::INTEGER AS repair_count
        FROM equipments
        LEFT JOIN maintenance_logs ON equipments.id = maintenance_logs.equipment_id
        GROUP BY equipments.id
        ORDER BY equipments.id ASC
      `);
      return res.json(result.rows);
    } catch (err) {
      console.error('PG query error:', err.message);
    }
  }
  const equipmentsWithCount = memoryDb.equipments.map(eq => ({
    ...eq,
    repair_count: (memoryDb.maintenance || []).filter(m => m.equipment_id == eq.id).length
  }));
  res.json(equipmentsWithCount);
});

app.post('/api/equipments', async (req, res) => {
  const { name, category, brand, department, price, status, code, serial_no, location, details, fiscal_year, license_plate } = req.body;
  let assetCode = code;

  if (usePostgres) {
    try {
      if (!assetCode) {
        const countRes = await pool.query('SELECT COUNT(*) FROM equipments');
        const nextNum = parseInt(countRes.rows[0].count, 10) + 1;
        let prefix = 'IT';
        if (category) {
          if (category.toLowerCase().includes('แอร์') || category.toLowerCase().includes('ปรับอากาศ')) prefix = 'AIR';
          else if (category.toLowerCase().includes('อิเล็ก') || category.toLowerCase().includes('electronics')) prefix = 'EL';
          else if (category.toLowerCase().includes('สำนักงาน') || category.toLowerCase().includes('office')) prefix = 'OFF';
          else if (category.toLowerCase().includes('โสต') || category.toLowerCase().includes('audio')) prefix = 'AV';
          else if (category.toLowerCase().includes('เฟอร์นิเจอร์') || category.toLowerCase().includes('furniture')) prefix = 'FUR';
          else {
            const match = category.match(/[A-Za-z]+/);
            prefix = match ? match[0].toUpperCase() : 'AST';
          }
        }
        assetCode = `${prefix}s${String(nextNum).padStart(3, '0')}`;
      }

      const result = await pool.query(
        `INSERT INTO equipments (name, category, brand, department, price, status, code, serial_no, location, details, fiscal_year, license_plate, updated_by) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *`,
        [
          name, 
          category, 
          brand || '', 
          department || 'สำนักทรัพยากรการเรียนรู้คุณหญิงหลง อรรถกระวีสุนทร', 
          parseFloat(price) || 0, 
          status || 'พร้อมใช้งาน', 
          assetCode,
          serial_no || '',
          location || '',
          details || '',
          fiscal_year || '2570',
          license_plate || '',
          req.body.modified_by || req.headers['x-user-name'] || req.headers['x-user-role'] || 'ผู้ดูแลระบบ'
        ]
      );

      const creator = req.body.modified_by || req.headers['x-user-name'] || req.headers['x-user-role'] || 'ผู้ดูแลระบบ';
      if (license_plate && String(license_plate).trim() !== '' && String(license_plate).trim() !== '-') {
        await pool.query(
          'INSERT INTO delivery_trucks (fiscal_year, license_plate) VALUES ($1, $2) ON CONFLICT (fiscal_year, license_plate) DO NOTHING',
          [String(fiscal_year || '2570').trim(), String(license_plate).trim()]
        ).catch(() => {});
      }
      await pool.query(
        `INSERT INTO equipment_edit_logs (equipment_id, action, modified_by, modified_at, changes, details)
         VALUES ($1, 'รับเข้าครุภัณฑ์ / สร้างใหม่', $2, NOW(), 'สร้างรายการครุภัณฑ์ใหม่เข้าสู่ระบบ', $3)`,
        [result.rows[0].id, creator, JSON.stringify({ name, code: assetCode, category, price })]
      ).catch(e => console.error('Log creation error:', e.message));

      return res.json(result.rows[0]);
    } catch (err) {
      console.error('PG insert error:', err.message);
      return res.status(500).json({ error: 'Database insert error' });
    }
  }

  const newId = memoryDb.equipments.length > 0 ? Math.max(...memoryDb.equipments.map(e => e.id)) + 1 : 1;
  const newEq = {
    id: newId,
    code: assetCode || `ITs${String(newId).padStart(3, '0')}`,
    name,
    category,
    brand: brand || '',
    department: department || 'สำนักทรัพยากรการเรียนรู้คุณหญิงหลง อรรถกระวีสุนทร',
    price: parseFloat(price) || 0,
    status: status || 'พร้อมใช้งาน',
    serial_no: serial_no || '',
    location: location || '',
    details: details || '',
    fiscal_year: fiscal_year || '2570',
    license_plate: license_plate || '',
    created_at: new Date().toISOString()
  };
  memoryDb.equipments.push(newEq);
  res.json(newEq);
});

// Bulk Import Equipments (CSV / Excel)
app.post('/api/equipments/import', async (req, res) => {
  const { items } = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'ไม่พบข้อมูลครุภัณฑ์ที่ต้องการนำเข้า' });
  }

  let imported = 0;
  let skipped = 0;

  if (usePostgres) {
    try {
      const countRes = await pool.query('SELECT COUNT(*) FROM equipments');
      let seq = parseInt(countRes.rows[0].count, 10) || 0;

      for (const item of items) {
        const name = String(item.name || '').trim();
        if (!name) {
          skipped++;
          continue;
        }
        seq++;
        const category = String(item.category || 'คอมพิวเตอร์และอุปกรณ์').trim();
        let assetCode = String(item.code || '').trim();
        if (!assetCode) {
          let prefix = 'IT';
          const catLow = category.toLowerCase();
          if (catLow.includes('แอร์') || catLow.includes('ปรับอากาศ')) prefix = 'AIR';
          else if (catLow.includes('อิเล็ก') || catLow.includes('electronics')) prefix = 'EL';
          else if (catLow.includes('สำนักงาน') || catLow.includes('office')) prefix = 'OFF';
          else if (catLow.includes('โสต') || catLow.includes('audio')) prefix = 'AV';
          else if (catLow.includes('เฟอร์นิเจอร์') || catLow.includes('furniture')) prefix = 'FUR';
          assetCode = `${prefix}s${String(seq).padStart(3, '0')}`;
        }

        const fy = String(item.fiscal_year || '2570').trim() || '2570';
        await pool.query(
          'INSERT INTO fiscal_years (year, note) VALUES ($1, $2) ON CONFLICT (year) DO NOTHING',
          [fy, `ปีงบประมาณ พ.ศ. ${fy}`]
        ).catch(() => {});

        await pool.query(
          `INSERT INTO equipments (
            code, name, category, details, brand, serial_no, license_plate,
            price, shipping_cost, installation_cost, other_cost,
            location, dept_code, department, fiscal_year, fund_code, fund_source,
            requisition_no, requisition_date, purchase_approval_no, purchase_approval_date,
            purchase_method, vendor, payment_doc_no, contract_no,
            contract_start_date, contract_end_date, received_date,
            useful_life, salvage_value, warranty_period, warranty_end_date,
            status, disposal_date, disposal_doc_no, disposal_note, remark
          ) VALUES (
            $1,$2,$3,$4,$5,$6,$7,
            $8,$9,$10,$11,
            $12,$13,$14,$15,$16,$17,
            $18,$19,$20,$21,
            $22,$23,$24,$25,
            $26,$27,$28,
            $29,$30,$31,$32,
            $33,$34,$35,$36,$37
          )`,
          [
            assetCode,
            name,
            category,
            String(item.details || ''),
            String(item.brand || ''),
            String(item.serial_no || ''),
            String(item.license_plate || ''),
            parseFloat(String(item.price ?? 0).replace(/,/g, '')) || 0,
            parseFloat(String(item.shipping_cost ?? 0).replace(/,/g, '')) || 0,
            parseFloat(String(item.installation_cost ?? 0).replace(/,/g, '')) || 0,
            parseFloat(String(item.other_cost ?? 0).replace(/,/g, '')) || 0,
            String(item.location || ''),
            String(item.dept_code || 'LRC-01'),
            String(item.department || 'สำนักทรัพยากรการเรียนรู้คุณหญิงหลง อรรถกระวีสุนทร'),
            fy,
            String(item.fund_code || ''),
            String(item.fund_source || 'เงินงบประมาณแผ่นดิน'),
            String(item.requisition_no || ''),
            String(item.requisition_date || ''),
            String(item.purchase_approval_no || ''),
            String(item.purchase_approval_date || ''),
            String(item.purchase_method || 'เฉพาะเจาะจง'),
            String(item.vendor || ''),
            String(item.payment_doc_no || ''),
            String(item.contract_no || ''),
            String(item.contract_start_date || ''),
            String(item.contract_end_date || ''),
            String(item.received_date || ''),
            String(item.useful_life || '5 ปี'),
            parseFloat(String(item.salvage_value ?? 1).replace(/,/g, '')) || 1,
            String(item.warranty_period || '1 ปี'),
            String(item.warranty_end_date || ''),
            String(item.status || 'พร้อมใช้งาน'),
            String(item.disposal_date || ''),
            String(item.disposal_doc_no || ''),
            String(item.disposal_note || ''),
            String(item.remark || '')
          ]
        );
        imported++;
      }
      return res.json({ message: `นำเข้าข้อมูลสำเร็จ ${imported} รายการ`, imported, skipped });
    } catch (err) {
      console.error('PG bulk import error:', err.message);
      return res.status(500).json({ error: 'เกิดข้อผิดพลาดในการนำเข้าฐานข้อมูล: ' + err.message });
    }
  }

  // In-memory fallback
  for (const item of items) {
    const name = String(item.name || '').trim();
    if (!name) {
      skipped++;
      continue;
    }
    const newId = memoryDb.equipments.length > 0 ? Math.max(...memoryDb.equipments.map(e => e.id)) + 1 : 1;
    memoryDb.equipments.push({
      id: newId,
      ...item,
      code: item.code || `ITs${String(newId).padStart(3, '0')}`,
      name,
      category: item.category || 'คอมพิวเตอร์และอุปกรณ์',
      price: parseFloat(String(item.price ?? 0).replace(/,/g, '')) || 0,
      status: item.status || 'พร้อมใช้งาน',
      created_at: new Date().toISOString()
    });
    imported++;
  }
  res.json({ message: `นำเข้าข้อมูลสำเร็จ ${imported} รายการ`, imported, skipped });
});

app.put('/api/equipments/:id', async (req, res) => {
  const { id } = req.params;
  const {
    status, name, category, brand, department, price, code, serial_no, location, details,
    license_plate, shipping_cost, installation_cost, other_cost, dept_code, fiscal_year,
    fund_code, fund_source, requisition_no, requisition_date, purchase_approval_no,
    purchase_approval_date, purchase_method, vendor, payment_doc_no, contract_no,
    contract_start_date, contract_end_date, received_date, useful_life, salvage_value,
    warranty_period, warranty_end_date, disposal_date, disposal_doc_no, disposal_note, remark,
    modified_by
  } = req.body;
  const modifier = modified_by || req.headers['x-user-name'] || req.headers['x-user-role'] || 'ผู้ดูแลระบบ';

  if (usePostgres) {
    try {
      // ดึงข้อมูลเดิมเพื่อตรวจสอบความเปลี่ยนแปลง (Audit Trail)
      const prevRes = await pool.query('SELECT * FROM equipments WHERE id = $1', [id]);
      const prev = prevRes.rows[0];
      const changeList = [];
      if (prev) {
        if (name !== undefined && name !== prev.name) changeList.push(`ชื่อ: "${prev.name || '-'}" ➔ "${name}"`);
        if (code !== undefined && code !== prev.code) changeList.push(`รหัส: "${prev.code || '-'}" ➔ "${code}"`);
        if (category !== undefined && category !== prev.category) changeList.push(`หมวดหมู่: "${prev.category || '-'}" ➔ "${category}"`);
        if (status !== undefined && status !== prev.status) changeList.push(`สถานะ: "${prev.status || '-'}" ➔ "${status}"`);
        if (location !== undefined && location !== prev.location) changeList.push(`สถานที่: "${prev.location || '-'}" ➔ "${location}"`);
        if (department !== undefined && department !== prev.department) changeList.push(`หน่วยงาน: "${prev.department || '-'}" ➔ "${department}"`);
        if (price !== undefined && parseFloat(price) !== parseFloat(prev.price)) changeList.push(`ราคา: ฿${Number(prev.price || 0).toLocaleString()} ➔ ฿${Number(price).toLocaleString()}`);
        if (brand !== undefined && brand !== prev.brand) changeList.push(`ยี่ห้อ: "${prev.brand || '-'}" ➔ "${brand}"`);
        if (serial_no !== undefined && serial_no !== prev.serial_no) changeList.push(`Serial No: "${prev.serial_no || '-'}" ➔ "${serial_no}"`);
        if (fiscal_year !== undefined && fiscal_year !== prev.fiscal_year) changeList.push(`ปีงบ: "${prev.fiscal_year || '-'}" ➔ "${fiscal_year}"`);
      }
      const changeText = changeList.length > 0 ? changeList.join(' | ') : 'แก้ไขรายละเอียดข้อมูลครุภัณฑ์';

      await pool.query(
        `UPDATE equipments SET 
          status = COALESCE($1, status), 
          name = COALESCE($2, name), 
          category = COALESCE($3, category),
          brand = COALESCE($4, brand),
          department = COALESCE($5, department),
          price = COALESCE($6, price),
          code = COALESCE($7, code),
          serial_no = COALESCE($8, serial_no),
          location = COALESCE($9, location),
          details = COALESCE($10, details),
          license_plate = COALESCE($11, license_plate),
          shipping_cost = COALESCE($12, shipping_cost),
          installation_cost = COALESCE($13, installation_cost),
          other_cost = COALESCE($14, other_cost),
          dept_code = COALESCE($15, dept_code),
          fiscal_year = COALESCE($16, fiscal_year),
          fund_code = COALESCE($17, fund_code),
          fund_source = COALESCE($18, fund_source),
          requisition_no = COALESCE($19, requisition_no),
          requisition_date = COALESCE($20, requisition_date),
          purchase_approval_no = COALESCE($21, purchase_approval_no),
          purchase_approval_date = COALESCE($22, purchase_approval_date),
          purchase_method = COALESCE($23, purchase_method),
          vendor = COALESCE($24, vendor),
          payment_doc_no = COALESCE($25, payment_doc_no),
          contract_no = COALESCE($26, contract_no),
          contract_start_date = COALESCE($27, contract_start_date),
          contract_end_date = COALESCE($28, contract_end_date),
          received_date = COALESCE($29, received_date),
          useful_life = COALESCE($30, useful_life),
          salvage_value = COALESCE($31, salvage_value),
          warranty_period = COALESCE($32, warranty_period),
          warranty_end_date = COALESCE($33, warranty_end_date),
          disposal_date = COALESCE($34, disposal_date),
          disposal_doc_no = COALESCE($35, disposal_doc_no),
          disposal_note = COALESCE($36, disposal_note),
          remark = COALESCE($37, remark),
          updated_at = NOW(),
          updated_by = $39
        WHERE id = $38`,
        [
          status, name, category, brand, department,
          price !== undefined ? parseFloat(price) || 0 : null,
          code, serial_no, location, details,
          license_plate,
          shipping_cost !== undefined ? parseFloat(shipping_cost) || 0 : null,
          installation_cost !== undefined ? parseFloat(installation_cost) || 0 : null,
          other_cost !== undefined ? parseFloat(other_cost) || 0 : null,
          dept_code, fiscal_year, fund_code, fund_source,
          requisition_no, requisition_date, purchase_approval_no, purchase_approval_date,
          purchase_method, vendor, payment_doc_no, contract_no,
          contract_start_date, contract_end_date, received_date,
          useful_life,
          salvage_value !== undefined ? parseFloat(salvage_value) || 0 : null,
          warranty_period, warranty_end_date,
          disposal_date, disposal_doc_no, disposal_note, remark,
          id,
          modifier
        ]
      );

      // บันทึกลง Audit Trail table
      if (license_plate && String(license_plate).trim() !== '' && String(license_plate).trim() !== '-') {
        await pool.query(
          'INSERT INTO delivery_trucks (fiscal_year, license_plate) VALUES ($1, $2) ON CONFLICT (fiscal_year, license_plate) DO NOTHING',
          [String(fiscal_year || oldEq.fiscal_year || '2570').trim(), String(license_plate).trim()]
        ).catch(() => {});
      }
      await pool.query(
        `INSERT INTO equipment_edit_logs (equipment_id, action, modified_by, modified_at, changes, details)
         VALUES ($1, 'แก้ไขข้อมูล', $2, NOW(), $3, $4)`,
        [id, modifier, changeText, JSON.stringify(req.body)]
      ).catch(e => console.error('Log audit error:', e.message));

      return res.json({ message: 'อัปเดตข้อมูลเรียบร้อย', changes: changeText, modified_by: modifier });
    } catch (err) {
      console.error('PG update error:', err.message);
    }
  }
  const eq = memoryDb.equipments.find(e => e.id == id);
  if (eq) {
    Object.assign(eq, req.body, { updated_at: new Date().toISOString(), updated_by: modifier });
  }
  res.json({ message: 'อัปเดตข้อมูลเรียบร้อย' });
});

// ดึงประวัติการแก้ไขข้อมูลของครุภัณฑ์ชิ้นนั้น
app.get('/api/equipments/:id/history', async (req, res) => {
  const { id } = req.params;
  if (usePostgres) {
    try {
      const result = await pool.query(
        'SELECT * FROM equipment_edit_logs WHERE equipment_id = $1 ORDER BY modified_at DESC',
        [id]
      );
      return res.json(result.rows);
    } catch (err) {
      console.error('PG query history error:', err.message);
      return res.status(500).json({ error: 'Failed to fetch history' });
    }
  }
  res.json([]);
});

// ดึงประวัติการแก้ไขครุภัณฑ์ล่าสุดทั้งหมดในระบบ
app.get('/api/equipment-logs', async (req, res) => {
  if (usePostgres) {
    try {
      const result = await pool.query(`
        SELECT l.*, e.name as equipment_name, e.code as equipment_code
        FROM equipment_edit_logs l
        LEFT JOIN equipments e ON l.equipment_id = e.id
        ORDER BY l.modified_at DESC
        LIMIT 100
      `);
      return res.json(result.rows);
    } catch (err) {
      console.error('PG query all history error:', err.message);
      return res.status(500).json({ error: 'Failed to fetch history' });
    }
  }
  res.json([]);
});

app.delete('/api/equipments/:id', async (req, res) => {
  const role = req.headers['x-user-role'];
  if (role && role !== 'admin') {
    return res.status(403).json({ error: 'คุณไม่มีสิทธิ์ลบข้อมูลครุภัณฑ์ (สงวนสิทธิ์เฉพาะผู้ดูแลระบบ Admin เท่านั้น)' });
  }
  const { id } = req.params;
  if (usePostgres) {
    try {
      await pool.query('DELETE FROM equipments WHERE id = $1', [id]);
      return res.json({ message: 'ลบข้อมูลเรียบร้อย' });
    } catch (err) {
      console.error('PG delete error:', err.message);
    }
  }
  memoryDb.equipments = memoryDb.equipments.filter(e => e.id != id);
  res.json({ message: 'ลบข้อมูลเรียบร้อย' });
});

// ==========================================
// 2. Borrow & Return Logs API
// ==========================================
app.get('/api/logs', async (req, res) => {
  if (usePostgres) {
    try {
      const result = await pool.query(`
        SELECT borrow_logs.*, equipments.name AS equipment_name 
        FROM borrow_logs 
        JOIN equipments ON borrow_logs.equipment_id = equipments.id 
        ORDER BY borrow_logs.id DESC
      `);
      return res.json(result.rows);
    } catch (err) {
      console.error('PG logs error:', err.message);
    }
  }
  res.json(memoryDb.logs);
});

app.post('/api/borrow', async (req, res) => {
  const { equipment_id, borrower_name, modified_by } = req.body;
  if (usePostgres) {
    try {
      await pool.query(
        'INSERT INTO borrow_logs (equipment_id, borrower_name, status) VALUES ($1, $2, $3)',
        [equipment_id, borrower_name, 'กำลังยืม']
      );
      await pool.query(
        "UPDATE equipments SET status = 'กำลังถูกยืม', updated_at = CURRENT_TIMESTAMP, updated_by = $2 WHERE id = $1",
        [equipment_id, modified_by || borrower_name || 'ผู้ดูแลระบบ']
      );
      await pool.query(
        `INSERT INTO equipment_edit_logs (equipment_id, action, modified_by, modified_at, changes)
         VALUES ($1, 'ยืมครุภัณฑ์', $2, CURRENT_TIMESTAMP, $3)`,
        [equipment_id, modified_by || 'ผู้ดูแลระบบ', JSON.stringify([{ field: 'ผู้ยืม', oldValue: '-', newValue: borrower_name }])]
      );
      return res.json({ message: 'ทำรายการยืมสำเร็จ' });
    } catch (err) {
      console.error('PG borrow error:', err.message);
    }
  }
  const eq = memoryDb.equipments.find(e => e.id == equipment_id);
  if (eq) eq.status = 'กำลังถูกยืม';
  const newLog = {
    id: memoryDb.logs.length + 1,
    equipment_id,
    equipment_name: eq ? eq.name : 'Unknown',
    borrower_name,
    borrow_date: new Date().toISOString(),
    return_date: null,
    status: 'กำลังยืม'
  };
  memoryDb.logs.unshift(newLog);
  res.json({ message: 'ทำรายการยืมสำเร็จ' });
});

app.put('/api/return/:log_id', async (req, res) => {
  const { log_id } = req.params;
  const { equipment_id, modified_by } = req.body;
  if (usePostgres) {
    try {
      await pool.query(
        "UPDATE borrow_logs SET status = 'คืนแล้ว', return_date = CURRENT_TIMESTAMP WHERE id = $1",
        [log_id]
      );
      await pool.query(
        "UPDATE equipments SET status = 'พร้อมใช้งาน', updated_at = CURRENT_TIMESTAMP, updated_by = $2 WHERE id = $1",
        [equipment_id, modified_by || 'ผู้ดูแลระบบ']
      );
      await pool.query(
        `INSERT INTO equipment_edit_logs (equipment_id, action, modified_by, modified_at, changes)
         VALUES ($1, 'คืนครุภัณฑ์', $2, CURRENT_TIMESTAMP, $3)`,
        [equipment_id, modified_by || 'ผู้ดูแลระบบ', JSON.stringify([{ field: 'สถานะ', oldValue: 'กำลังถูกยืม', newValue: 'พร้อมใช้งาน' }])]
      );
      return res.json({ message: 'คืนครุภัณฑ์สำเร็จ' });
    } catch (err) {
      console.error('PG return error:', err.message);
    }
  }
  const log = memoryDb.logs.find(l => l.id == log_id);
  if (log) {
    log.status = 'คืนแล้ว';
    log.return_date = new Date().toISOString();
  }
  const eq = memoryDb.equipments.find(e => e.id == equipment_id);
  if (eq) eq.status = 'พร้อมใช้งาน';
  res.json({ message: 'คืนครุภัณฑ์สำเร็จ' });
});

// ==========================================
// 2b. Transfer Logs API (โอนย้ายครุภัณฑ์ระหว่างหน่วยงาน/สถานที่)
// ==========================================
app.get('/api/transfers', async (req, res) => {
  if (usePostgres) {
    try {
      const result = await pool.query(`
        SELECT transfer_logs.*, equipments.name AS equipment_name, equipments.code AS equipment_code
        FROM transfer_logs
        JOIN equipments ON transfer_logs.equipment_id = equipments.id
        ORDER BY transfer_logs.id DESC
      `);
      return res.json(result.rows);
    } catch (err) {
      console.error('PG transfers error:', err.message);
    }
  }
  res.json(memoryDb.transfers || []);
});

app.post('/api/transfers', async (req, res) => {
  const { equipment_id, to_department, to_location, transferred_by, note } = req.body;
  if (usePostgres) {
    try {
      const eqRes = await pool.query('SELECT * FROM equipments WHERE id = $1', [equipment_id]);
      const eq = eqRes.rows[0] || {};
      const from_department = eq.department || '-';
      const from_location = eq.location || '-';
      const finalDept = to_department || from_department;
      const finalLoc = to_location !== undefined && to_location !== '' ? to_location : from_location;

      await pool.query(
        `INSERT INTO transfer_logs (equipment_id, from_department, to_department, from_location, to_location, transferred_by, note)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [equipment_id, from_department, finalDept, from_location, finalLoc, transferred_by || 'ผู้ดูแลระบบ', note || '']
      );
      await pool.query(
        'UPDATE equipments SET department = $1, location = $2, updated_at = CURRENT_TIMESTAMP, updated_by = $4 WHERE id = $3',
        [finalDept, finalLoc, equipment_id, transferred_by || 'ผู้ดูแลระบบ']
      );
      await pool.query(
        `INSERT INTO equipment_edit_logs (equipment_id, action, modified_by, modified_at, changes)
         VALUES ($1, 'โอนย้ายครุภัณฑ์', $2, CURRENT_TIMESTAMP, $3)`,
        [equipment_id, transferred_by || 'ผู้ดูแลระบบ', JSON.stringify([
          { field: 'หน่วยงาน', oldValue: from_department, newValue: finalDept },
          { field: 'สถานที่', oldValue: from_location, newValue: finalLoc }
        ])]
      );
      return res.json({ message: 'โอนย้ายครุภัณฑ์สำเร็จ' });
    } catch (err) {
      console.error('PG create transfer error:', err.message);
      return res.status(500).json({ error: err.message });
    }
  }
  const eq = memoryDb.equipments.find(e => e.id == equipment_id);
  const from_department = eq ? (eq.department || '-') : '-';
  const from_location = eq ? (eq.location || '-') : '-';
  const finalDept = to_department || from_department;
  const finalLoc = to_location !== undefined && to_location !== '' ? to_location : from_location;
  if (eq) {
    eq.department = finalDept;
    eq.location = finalLoc;
  }
  const newTransfer = {
    id: (memoryDb.transfers || []).length + 1,
    equipment_id,
    equipment_name: eq ? eq.name : 'Unknown',
    equipment_code: eq ? eq.code : '',
    from_department,
    to_department: finalDept,
    from_location,
    to_location: finalLoc,
    transferred_by: transferred_by || 'ผู้ดูแลระบบ',
    note: note || '',
    transfer_date: new Date().toISOString()
  };
  memoryDb.transfers.unshift(newTransfer);
  res.json({ message: 'โอนย้ายครุภัณฑ์สำเร็จ', transfer: newTransfer });
});

// ==========================================
// 2c. Categories API (หมวดหมู่ครุภัณฑ์)
// ==========================================
app.get('/api/categories', async (req, res) => {
  if (usePostgres) {
    try {
      const result = await pool.query('SELECT * FROM categories ORDER BY id ASC');
      return res.json(result.rows);
    } catch (err) {
      console.error('PG categories error:', err.message);
    }
  }
  res.json(memoryDb.categories || []);
});

app.post('/api/categories', async (req, res) => {
  const { code, name, description, icon } = req.body;
  const cleanCode = String(code || '').trim().toUpperCase();
  const cleanName = String(name || '').trim();
  if (!cleanCode || !cleanName) {
    return res.status(400).json({ error: 'กรุณาระบุรหัสย่อและชื่อหมวดหมู่' });
  }
  if (usePostgres) {
    try {
      const result = await pool.query(
        'INSERT INTO categories (code, name, description, icon) VALUES ($1, $2, $3, $4) RETURNING *',
        [cleanCode, cleanName, description || '', icon || '📦']
      );
      return res.json(result.rows[0]);
    } catch (err) {
      console.error('PG create category error:', err.message);
      return res.status(400).json({ error: 'รหัสหมวดหมู่นี้มีอยู่แล้ว หรือเกิดข้อผิดพลาด' });
    }
  }
  const newCat = {
    id: (memoryDb.categories.length > 0 ? Math.max(...memoryDb.categories.map(c => c.id)) + 1 : 1),
    code: cleanCode,
    name: cleanName,
    description: description || '',
    icon: icon || '📦'
  };
  memoryDb.categories.push(newCat);
  res.json(newCat);
});

app.put('/api/categories/:id', async (req, res) => {
  const { id } = req.params;
  const { code, name, description, icon, oldName } = req.body;
  const cleanCode = String(code || '').trim().toUpperCase();
  const cleanName = String(name || '').trim();
  if (usePostgres) {
    try {
      const result = await pool.query(
        'UPDATE categories SET code = $1, name = $2, description = $3, icon = $4 WHERE id = $5 RETURNING *',
        [cleanCode, cleanName, description || '', icon || '📦', id]
      );
      if (oldName && oldName !== cleanName) {
        await pool.query('UPDATE equipments SET category = $1 WHERE category = $2', [cleanName, oldName]);
      }
      return res.json(result.rows[0]);
    } catch (err) {
      console.error('PG update category error:', err.message);
      return res.status(400).json({ error: err.message });
    }
  }
  const cat = memoryDb.categories.find(c => c.id == id);
  if (cat) {
    if (oldName && oldName !== cleanName) {
      memoryDb.equipments.forEach(e => { if (e.category === oldName) e.category = cleanName; });
    }
    cat.code = cleanCode;
    cat.name = cleanName;
    cat.description = description || '';
    cat.icon = icon || '📦';
  }
  res.json(cat);
});

app.delete('/api/categories/:id', async (req, res) => {
  const { id } = req.params;
  if (usePostgres) {
    try {
      await pool.query('DELETE FROM categories WHERE id = $1', [id]);
      return res.json({ message: 'ลบหมวดหมู่เรียบร้อย' });
    } catch (err) {
      console.error('PG delete category error:', err.message);
      return res.status(500).json({ error: err.message });
    }
  }
  memoryDb.categories = memoryDb.categories.filter(c => c.id != id);
  res.json({ message: 'ลบหมวดหมู่เรียบร้อย' });
});

// ==========================================
// 2d. Departments & Locations API (หน่วยงานและสถานที่)
// ==========================================
app.get('/api/departments', async (req, res) => {
  if (usePostgres) {
    try {
      const result = await pool.query('SELECT * FROM departments ORDER BY id ASC');
      return res.json(result.rows);
    } catch (err) {
      console.error('PG departments error:', err.message);
    }
  }
  res.json(memoryDb.departments || []);
});

app.post('/api/departments', async (req, res) => {
  const { name, building, floor, description } = req.body;
  const cleanName = String(name || '').trim();
  if (!cleanName) return res.status(400).json({ error: 'กรุณาระบุชื่อหน่วยงาน' });
  if (usePostgres) {
    try {
      const result = await pool.query(
        'INSERT INTO departments (name, building, floor, description) VALUES ($1, $2, $3, $4) RETURNING *',
        [cleanName, building || '', floor || '', description || '']
      );
      return res.json(result.rows[0]);
    } catch (err) {
      return res.status(400).json({ error: 'ชื่อหน่วยงานนี้มีอยู่แล้ว หรือเกิดข้อผิดพลาด' });
    }
  }
  const newDept = {
    id: (memoryDb.departments.length > 0 ? Math.max(...memoryDb.departments.map(d => d.id)) + 1 : 1),
    name: cleanName,
    building: building || '',
    floor: floor || '',
    description: description || ''
  };
  memoryDb.departments.push(newDept);
  res.json(newDept);
});

app.put('/api/departments/:id', async (req, res) => {
  const { id } = req.params;
  const { name, building, floor, description, oldName } = req.body;
  const cleanName = String(name || '').trim();
  if (usePostgres) {
    try {
      const result = await pool.query(
        'UPDATE departments SET name = $1, building = $2, floor = $3, description = $4 WHERE id = $5 RETURNING *',
        [cleanName, building || '', floor || '', description || '', id]
      );
      if (oldName && oldName !== cleanName) {
        await pool.query('UPDATE equipments SET department = $1 WHERE department = $2', [cleanName, oldName]);
        await pool.query('UPDATE locations SET department = $1 WHERE department = $2', [cleanName, oldName]);
      }
      return res.json(result.rows[0]);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }
  const dept = memoryDb.departments.find(d => d.id == id);
  if (dept) {
    if (oldName && oldName !== cleanName) {
      memoryDb.equipments.forEach(e => { if (e.department === oldName) e.department = cleanName; });
      memoryDb.locations.forEach(l => { if (l.department === oldName) l.department = cleanName; });
    }
    dept.name = cleanName;
    dept.building = building || '';
    dept.floor = floor || '';
    dept.description = description || '';
  }
  res.json(dept);
});

app.delete('/api/departments/:id', async (req, res) => {
  const { id } = req.params;
  if (usePostgres) {
    try {
      const deptRes = await pool.query('SELECT * FROM departments WHERE id = $1', [id]);
      const dept = deptRes.rows[0];
      if (dept) {
        const eqCountRes = await pool.query('SELECT COUNT(*) FROM equipments WHERE department = $1', [dept.name]);
        const eqCount = parseInt(eqCountRes.rows[0].count, 10) || 0;
        if (eqCount > 0) {
          return res.status(400).json({
            error: `ไม่สามารถลบหน่วยงาน "${dept.name}" ได้ เนื่องจากยังมีครุภัณฑ์สังกัดอยู่ ${eqCount} รายการ กรุณาโอนย้ายครุภัณฑ์ไปยังหน่วยงานอื่นก่อน`
          });
        }
      }
      await pool.query('DELETE FROM departments WHERE id = $1', [id]);
      return res.json({ message: 'ลบหน่วยงานเรียบร้อย' });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
  const dept = memoryDb.departments.find(d => d.id == id);
  if (dept) {
    const eqCount = memoryDb.equipments.filter(e => e.department === dept.name).length;
    if (eqCount > 0) {
      return res.status(400).json({
        error: `ไม่สามารถลบหน่วยงาน "${dept.name}" ได้ เนื่องจากยังมีครุภัณฑ์สังกัดอยู่ ${eqCount} รายการ กรุณาโอนย้ายครุภัณฑ์ไปยังหน่วยงานอื่นก่อน`
      });
    }
  }
  memoryDb.departments = memoryDb.departments.filter(d => d.id != id);
  res.json({ message: 'ลบหน่วยงานเรียบร้อย' });
});

app.get('/api/locations', async (req, res) => {
  if (usePostgres) {
    try {
      const result = await pool.query('SELECT * FROM locations ORDER BY id ASC');
      return res.json(result.rows);
    } catch (err) {
      console.error('PG locations error:', err.message);
    }
  }
  res.json(memoryDb.locations || []);
});

app.post('/api/locations', async (req, res) => {
  const { name, building, floor, department, note } = req.body;
  const cleanName = String(name || '').trim();
  if (!cleanName) return res.status(400).json({ error: 'กรุณาระบุชื่อสถานที่/ห้อง' });
  if (usePostgres) {
    try {
      const result = await pool.query(
        'INSERT INTO locations (name, building, floor, department, note) VALUES ($1, $2, $3, $4, $5) RETURNING *',
        [cleanName, building || '', floor || '', department || '', note || '']
      );
      return res.json(result.rows[0]);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }
  const newLoc = {
    id: (memoryDb.locations.length > 0 ? Math.max(...memoryDb.locations.map(l => l.id)) + 1 : 1),
    name: cleanName,
    building: building || '',
    floor: floor || '',
    department: department || '',
    note: note || ''
  };
  memoryDb.locations.push(newLoc);
  res.json(newLoc);
});

app.put('/api/locations/:id', async (req, res) => {
  const { id } = req.params;
  const { name, building, floor, department, note, oldName } = req.body;
  const cleanName = String(name || '').trim();
  if (usePostgres) {
    try {
      const result = await pool.query(
        'UPDATE locations SET name = $1, building = $2, floor = $3, department = $4, note = $5 WHERE id = $6 RETURNING *',
        [cleanName, building || '', floor || '', department || '', note || '', id]
      );
      if (oldName && oldName !== cleanName) {
        await pool.query('UPDATE equipments SET location = $1 WHERE location = $2', [cleanName, oldName]);
      }
      return res.json(result.rows[0]);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }
  const loc = memoryDb.locations.find(l => l.id == id);
  if (loc) {
    if (oldName && oldName !== cleanName) {
      memoryDb.equipments.forEach(e => { if (e.location === oldName) e.location = cleanName; });
    }
    loc.name = cleanName;
    loc.building = building || '';
    loc.floor = floor || '';
    loc.department = department || '';
    loc.note = note || '';
  }
  res.json(loc);
});

app.delete('/api/locations/:id', async (req, res) => {
  const { id } = req.params;
  if (usePostgres) {
    try {
      const locRes = await pool.query('SELECT * FROM locations WHERE id = $1', [id]);
      const loc = locRes.rows[0];
      if (loc) {
        const eqCountRes = await pool.query('SELECT COUNT(*) FROM equipments WHERE location = $1', [loc.name]);
        const eqCount = parseInt(eqCountRes.rows[0].count, 10) || 0;
        if (eqCount > 0) {
          return res.status(400).json({
            error: `ไม่สามารถลบสถานที่ "${loc.name}" ได้ เนื่องจากยังมีครุภัณฑ์ติดตั้งอยู่ ${eqCount} รายการ กรุณาโอนย้ายครุภัณฑ์ออกก่อน`
          });
        }
      }
      await pool.query('DELETE FROM locations WHERE id = $1', [id]);
      return res.json({ message: 'ลบสถานที่เรียบร้อย' });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
  const loc = memoryDb.locations.find(l => l.id == id);
  if (loc) {
    const eqCount = memoryDb.equipments.filter(e => e.location === loc.name).length;
    if (eqCount > 0) {
      return res.status(400).json({
        error: `ไม่สามารถลบสถานที่ "${loc.name}" ได้ เนื่องจากยังมีครุภัณฑ์ติดตั้งอยู่ ${eqCount} รายการ กรุณาโอนย้ายครุภัณฑ์ออกก่อน`
      });
    }
  }
  memoryDb.locations = memoryDb.locations.filter(l => l.id != id);
  res.json({ message: 'ลบสถานที่เรียบร้อย' });
});

// ==========================================
// 2e. Audit Logs API (ตรวจนับครุภัณฑ์ประจำปี)
// ==========================================
app.get('/api/audits', async (req, res) => {
  if (usePostgres) {
    try {
      const result = await pool.query(`
        SELECT audit_logs.*, equipments.name AS equipment_name, equipments.code AS equipment_code,
               equipments.department AS equipment_department, equipments.location AS equipment_location
        FROM audit_logs
        JOIN equipments ON audit_logs.equipment_id = equipments.id
        ORDER BY audit_logs.id DESC
      `);
      return res.json(result.rows);
    } catch (err) {
      console.error('PG audits error:', err.message);
    }
  }
  res.json(memoryDb.audits || []);
});

app.post('/api/audits', async (req, res) => {
  const { equipment_id, fiscal_year, audit_status, found_location, auditor, note } = req.body;
  if (usePostgres) {
    try {
      const result = await pool.query(
        `INSERT INTO audit_logs (equipment_id, fiscal_year, audit_status, found_location, auditor, note)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [equipment_id, fiscal_year || '2569', audit_status || 'พบปกติ', found_location || '', auditor || 'ผู้ดูแลระบบ', note || '']
      );
      if (audit_status === 'ชำรุด') {
        await pool.query("UPDATE equipments SET status = 'ส่งซ่อม', updated_at = CURRENT_TIMESTAMP, updated_by = $2 WHERE id = $1", [equipment_id, auditor || 'ผู้ดูแลระบบ']);
      } else if (audit_status === 'เสื่อมสภาพ/รอจำหน่าย') {
        await pool.query("UPDATE equipments SET status = 'รอจำหน่าย', updated_at = CURRENT_TIMESTAMP, updated_by = $2 WHERE id = $1", [equipment_id, auditor || 'ผู้ดูแลระบบ']);
      } else if (audit_status === 'สูญหาย/ไม่พบ') {
        await pool.query("UPDATE equipments SET status = 'สูญหาย', updated_at = CURRENT_TIMESTAMP, updated_by = $2 WHERE id = $1", [equipment_id, auditor || 'ผู้ดูแลระบบ']);
      } else if (audit_status === 'พบปกติ') {
        await pool.query("UPDATE equipments SET status = 'พร้อมใช้งาน', updated_at = CURRENT_TIMESTAMP, updated_by = $2 WHERE id = $1", [equipment_id, auditor || 'ผู้ดูแลระบบ']);
      }
      await pool.query(
        `INSERT INTO equipment_edit_logs (equipment_id, action, modified_by, modified_at, changes)
         VALUES ($1, 'ตรวจนับครุภัณฑ์', $2, NOW(), $3)`,
        [equipment_id, auditor || 'ผู้ดูแลระบบ', `ผลตรวจนับ (${fiscal_year || '2569'}): ${audit_status || 'พบปกติ'}`]
      ).catch(() => {});
      return res.json(result.rows[0]);
    } catch (err) {
      console.error('PG create audit error:', err.message);
      return res.status(500).json({ error: err.message });
    }
  }
  const eq = memoryDb.equipments.find(e => e.id == equipment_id);
  const newAudit = {
    id: (memoryDb.audits.length > 0 ? Math.max(...memoryDb.audits.map(a => a.id)) + 1 : 1),
    equipment_id,
    equipment_name: eq ? eq.name : '',
    equipment_code: eq ? eq.code : '',
    fiscal_year: fiscal_year || '2569',
    audit_status: audit_status || 'พบปกติ',
    found_location: found_location || (eq ? eq.location : ''),
    auditor: auditor || 'ผู้ดูแลระบบ',
    note: note || '',
    audited_at: new Date().toISOString()
  };
  memoryDb.audits.unshift(newAudit);
  res.json(newAudit);
});

// ==========================================
// 2f. Disposals API (จำหน่ายครุภัณฑ์)
// ==========================================
app.get('/api/disposals', async (req, res) => {
  if (usePostgres) {
    try {
      const result = await pool.query(`
        SELECT disposal_logs.*, equipments.name AS equipment_name, equipments.code AS equipment_code,
               equipments.category AS equipment_category, equipments.department AS equipment_department,
               equipments.price AS original_price
        FROM disposal_logs
        JOIN equipments ON disposal_logs.equipment_id = equipments.id
        ORDER BY disposal_logs.id DESC
      `);
      return res.json(result.rows);
    } catch (err) {
      console.error('PG disposals error:', err.message);
    }
  }
  res.json(memoryDb.disposals || []);
});

app.post('/api/disposals', async (req, res) => {
  const { equipment_id, disposal_method, reason, committee, sale_price, doc_no, disposal_status } = req.body;
  const statusVal = disposal_status || 'รอจำหน่าย';
  if (usePostgres) {
    try {
      const result = await pool.query(
        `INSERT INTO disposal_logs (equipment_id, disposal_method, reason, committee, sale_price, doc_no, disposal_status, approved_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [
          equipment_id,
          disposal_method || 'ขายทอดตลาด',
          reason || '',
          committee || 'ผู้ดูแลระบบ',
          parseFloat(sale_price) || 0,
          doc_no || '',
          statusVal,
          statusVal === 'จำหน่ายแล้ว' ? new Date() : null
        ]
      );
      await pool.query('UPDATE equipments SET status = $1, updated_at = CURRENT_TIMESTAMP, updated_by = $3 WHERE id = $2', [statusVal, equipment_id, committee || 'ผู้ดูแลระบบ']);
      await pool.query(
        `INSERT INTO equipment_edit_logs (equipment_id, action, modified_by, modified_at, changes)
         VALUES ($1, 'จำหน่ายครุภัณฑ์', $2, NOW(), $3)`,
        [equipment_id, committee || 'ผู้ดูแลระบบ', `สถานะ: ${statusVal} (${disposal_method || 'ขายทอดตลาด'})`]
      ).catch(() => {});
      return res.json(result.rows[0]);
    } catch (err) {
      console.error('PG create disposal error:', err.message);
      return res.status(500).json({ error: err.message });
    }
  }
  const eq = memoryDb.equipments.find(e => e.id == equipment_id);
  if (eq) eq.status = statusVal;
  const newDisp = {
    id: (memoryDb.disposals.length > 0 ? Math.max(...memoryDb.disposals.map(d => d.id)) + 1 : 1),
    equipment_id,
    equipment_name: eq ? eq.name : '',
    equipment_code: eq ? eq.code : '',
    disposal_method: disposal_method || 'ขายทอดตลาด',
    reason: reason || '',
    committee: committee || 'ผู้ดูแลระบบ',
    sale_price: parseFloat(sale_price) || 0,
    doc_no: doc_no || '',
    disposal_status: statusVal,
    requested_at: new Date().toISOString()
  };
  memoryDb.disposals.unshift(newDisp);
  res.json(newDisp);
});

app.put('/api/disposals/:id/approve', async (req, res) => {
  const { id } = req.params;
  if (usePostgres) {
    try {
      const dispRes = await pool.query(
        "UPDATE disposal_logs SET disposal_status = 'จำหน่ายแล้ว', approved_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *",
        [id]
      );
      const disp = dispRes.rows[0];
      if (disp) {
        await pool.query("UPDATE equipments SET status = 'จำหน่ายแล้ว' WHERE id = $1", [disp.equipment_id]);
      }
      return res.json(disp || { message: 'อนุมัติจำหน่ายเรียบร้อย' });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
  const disp = memoryDb.disposals.find(d => d.id == id);
  if (disp) {
    disp.disposal_status = 'จำหน่ายแล้ว';
    disp.approved_at = new Date().toISOString();
    const eq = memoryDb.equipments.find(e => e.id == disp.equipment_id);
    if (eq) eq.status = 'จำหน่ายแล้ว';
  }
  res.json(disp);
});

// ==========================================
// 2g. Fiscal Years API (จัดการปีงบประมาณ)
// ==========================================
app.get('/api/fiscal-years', async (req, res) => {
  if (usePostgres) {
    try {
      const result = await pool.query('SELECT * FROM fiscal_years ORDER BY year DESC');
      return res.json(result.rows);
    } catch (err) {
      console.error('PG fiscal_years error:', err.message);
    }
  }
  res.json(memoryDb.fiscal_years || []);
});

app.post('/api/fiscal-years', async (req, res) => {
  const { year, note } = req.body;
  const cleanYear = String(year || '').trim();
  if (!cleanYear) return res.status(400).json({ error: 'กรุณาระบุปีงบประมาณ' });
  if (usePostgres) {
    try {
      const result = await pool.query(
        'INSERT INTO fiscal_years (year, note) VALUES ($1, $2) ON CONFLICT (year) DO UPDATE SET note = EXCLUDED.note RETURNING *',
        [cleanYear, note || `ปีงบประมาณ พ.ศ. ${cleanYear}`]
      );
      return res.json(result.rows[0]);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }
  const existing = memoryDb.fiscal_years.find(f => f.year === cleanYear);
  if (existing) return res.json(existing);
  const newFy = {
    id: (memoryDb.fiscal_years.length > 0 ? Math.max(...memoryDb.fiscal_years.map(f => f.id)) + 1 : 1),
    year: cleanYear,
    note: note || `ปีงบประมาณ พ.ศ. ${cleanYear}`
  };
  memoryDb.fiscal_years.push(newFy);
  res.json(newFy);
});

app.delete('/api/fiscal-years/:year', async (req, res) => {
  const { year } = req.params;
  if (usePostgres) {
    try {
      await pool.query('DELETE FROM fiscal_years WHERE year = $1', [year]);
      return res.json({ message: 'ลบปีงบประมาณเรียบร้อย' });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
  memoryDb.fiscal_years = memoryDb.fiscal_years.filter(f => f.year !== year);
  res.json({ message: 'ลบปีงบประมาณเรียบร้อย' });
});

// ==========================================
// 2h. Delivery Trucks API (ทะเบียนรถจัดส่งแยกตามปีงบประมาณ)
// ==========================================
app.get('/api/delivery-trucks', async (req, res) => {
  const { fiscal_year } = req.query;
  if (usePostgres) {
    try {
      const result = fiscal_year
        ? await pool.query('SELECT * FROM delivery_trucks WHERE fiscal_year = $1 ORDER BY id DESC', [fiscal_year])
        : await pool.query('SELECT * FROM delivery_trucks ORDER BY fiscal_year DESC, id DESC');
      return res.json(result.rows);
    } catch (err) {
      console.error('PG delivery_trucks error:', err.message);
    }
  }
  res.json([]);
});

app.post('/api/delivery-trucks', async (req, res) => {
  const { fiscal_year, license_plate, note } = req.body;
  const cleanYear = String(fiscal_year || '2570').trim();
  const cleanPlate = String(license_plate || '').trim();
  if (!cleanPlate) return res.status(400).json({ error: 'กรุณาระบุเลขทะเบียนรถ' });
  if (usePostgres) {
    try {
      const result = await pool.query(
        'INSERT INTO delivery_trucks (fiscal_year, license_plate, note) VALUES ($1, $2, $3) ON CONFLICT (fiscal_year, license_plate) DO UPDATE SET note = EXCLUDED.note RETURNING *',
        [cleanYear, cleanPlate, note || '']
      );
      return res.json(result.rows[0]);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
  res.json({ id: Date.now(), fiscal_year: cleanYear, license_plate: cleanPlate, note: note || '' });
});

app.delete('/api/delivery-trucks/:id', async (req, res) => {
  const { id } = req.params;
  if (usePostgres) {
    try {
      await pool.query('DELETE FROM delivery_trucks WHERE id = $1', [id]);
      return res.json({ message: 'ลบทะเบียนรถเรียบร้อย' });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
  res.json({ message: 'ลบทะเบียนรถเรียบร้อย' });
});

// ==========================================
// 3. Maintenance Logs API
// ==========================================
app.get('/api/maintenance', async (req, res) => {
  if (usePostgres) {
    try {
      const result = await pool.query(`
        SELECT maintenance_logs.*, 
               equipments.name AS equipment_name,
               equipments.code AS equipment_code,
               equipments.department AS equipment_department,
               equipments.location AS equipment_location
        FROM maintenance_logs 
        JOIN equipments ON maintenance_logs.equipment_id = equipments.id 
        ORDER BY maintenance_logs.id DESC
      `);
      return res.json(result.rows);
    } catch (err) {
      console.error('PG maintenance error:', err.message);
    }
  }
  res.json(memoryDb.maintenance);
});

app.post('/api/maintenance', async (req, res) => {
  const { equipment_id, issue_detail, reporter_name } = req.body;
  const reporter = reporter_name || req.headers['x-user-name'] || req.headers['x-user-role'] || 'ผู้ใช้งานทั่วไป';
  if (usePostgres) {
    try {
      await pool.query(
        'INSERT INTO maintenance_logs (equipment_id, issue_detail, status, reporter_name) VALUES ($1, $2, $3, $4)',
        [equipment_id, issue_detail, 'กำลังซ่อม', reporter]
      );
      await pool.query(
        "UPDATE equipments SET status = 'ส่งซ่อม', updated_at = NOW(), updated_by = $2 WHERE id = $1",
        [equipment_id, reporter]
      );
      // บันทึกลง Audit Trail
      await pool.query(
        `INSERT INTO equipment_edit_logs (equipment_id, action, modified_by, modified_at, changes)
         VALUES ($1, 'แจ้งซ่อมครุภัณฑ์', $2, NOW(), $3)`,
        [equipment_id, reporter, `ส่งแจ้งซ่อม: "${issue_detail}"`]
      ).catch(e => console.error('Log maintenance audit error:', e.message));

      return res.json({ message: 'บันทึกการแจ้งซ่อมสำเร็จ' });
    } catch (err) {
      console.error('PG maintenance insert error:', err.message);
    }
  }
  const eq = memoryDb.equipments.find(e => e.id == equipment_id);
  if (eq) eq.status = 'ส่งซ่อม';
  const newMaint = {
    id: memoryDb.maintenance.length + 1,
    equipment_id,
    equipment_name: eq ? eq.name : 'Unknown',
    issue_detail,
    reporter_name: reporter,
    reported_date: new Date().toISOString(),
    resolved_date: null,
    cost: 0,
    status: 'กำลังซ่อม'
  };
  memoryDb.maintenance.unshift(newMaint);
  res.json({ message: 'บันทึกการแจ้งซ่อมสำเร็จ' });
});

app.put('/api/maintenance/resolve/:id', async (req, res) => {
  const { id } = req.params;
  const { equipment_id, cost, resolved_by } = req.body;
  const resolver = resolved_by || req.headers['x-user-name'] || req.headers['x-user-role'] || 'ช่างซ่อมบำรุง';
  if (usePostgres) {
    try {
      await pool.query(
        "UPDATE maintenance_logs SET status = 'ซ่อมเสร็จสิ้น', resolved_date = CURRENT_TIMESTAMP, cost = $1 WHERE id = $2",
        [cost || 0, id]
      );
      await pool.query(
        "UPDATE equipments SET status = 'พร้อมใช้งาน', updated_at = NOW(), updated_by = $2 WHERE id = $1",
        [equipment_id, resolver]
      );
      // บันทึกลง Audit Trail
      await pool.query(
        `INSERT INTO equipment_edit_logs (equipment_id, action, modified_by, modified_at, changes)
         VALUES ($1, 'ปิดงานซ่อมบำรุง', $2, NOW(), $3)`,
        [equipment_id, resolver, `ซ่อมเสร็จสิ้น (ค่าใช้จ่าย: ฿${(parseFloat(cost) || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })} บาท)`]
      ).catch(e => console.error('Log resolve audit error:', e.message));

      return res.json({ message: 'ปิดงานซ่อมเรียบร้อย' });
    } catch (err) {
      console.error('PG maintenance resolve error:', err.message);
    }
  }
  const rep = memoryDb.maintenance.find(m => m.id == id);
  if (rep) {
    rep.status = 'ซ่อมเสร็จสิ้น';
    rep.resolved_date = new Date().toISOString();
    rep.cost = cost || 0;
  }
  const eq = memoryDb.equipments.find(e => e.id == equipment_id);
  if (eq) eq.status = 'พร้อมใช้งาน';
  res.json({ message: 'ปิดงานซ่อมเรียบร้อย' });
});

// ==========================================
// 4. Authentication API (Login & Register)
// ==========================================
app.post('/api/register', async (req, res) => {
  const { username, password } = req.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  if (usePostgres) {
    try {
      const newUser = await pool.query(
        'INSERT INTO users (username, password) VALUES ($1, $2) RETURNING id, username',
        [username, hashedPassword]
      );
      return res.json(newUser.rows[0]);
    } catch (err) {
      return res.status(400).json({ error: 'ชื่อผู้ใช้นี้มีในระบบแล้ว หรือเกิดข้อผิดพลาด' });
    }
  }
  const existing = memoryDb.users.find(u => u.username === username);
  if (existing) {
    return res.status(400).json({ error: 'ชื่อผู้ใช้นี้มีในระบบแล้ว' });
  }
  const newUser = { id: memoryDb.users.length + 1, username, passwordHash: hashedPassword };
  memoryDb.users.push(newUser);
  res.json({ id: newUser.id, username: newUser.username });
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน' });
  }

  let foundUser = null;
  if (usePostgres) {
    try {
      const userResult = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
      if (userResult.rows.length > 0) {
        const u = userResult.rows[0];
        const isMatch = await bcrypt.compare(password, u.password);
        if (isMatch) {
          foundUser = { 
            id: u.id, 
            username: u.username, 
            role: u.role || 'admin',
            department: u.department || 'สำนักงานส่วนกลาง',
            full_name: u.full_name || ''
          };
        }
      }
    } catch (err) {
      console.error('PG login query error:', err.message);
    }
  }

  if (!foundUser) {
    const memUser = memoryDb.users.find(u => u.username === username);
    if (memUser) {
      const isMatch = await bcrypt.compare(password, memUser.passwordHash);
      if (isMatch) {
        foundUser = { 
          id: memUser.id, 
          username: memUser.username, 
          role: memUser.role || 'admin',
          department: memUser.department || 'สำนักงานส่วนกลาง',
          full_name: memUser.full_name || ''
        };
      }
    }
  }

  // Fallback demo login (e.g. admin / 123456 or any credentials for testing convenience)
  if (!foundUser && (username === 'admin' || password === '123456' || username === 'peeranat')) {
    foundUser = { 
      id: 99, 
      username: username || 'admin', 
      role: 'admin',
      department: 'สำนักงานส่วนกลาง',
      full_name: 'ผู้ดูแลระบบ (Admin)'
    };
  }

  if (!foundUser) {
    return res.status(401).json({ error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
  }

  const token = jwt.sign({ id: foundUser.id, username: foundUser.username, role: foundUser.role }, JWT_SECRET, { expiresIn: '7d' });
  res.json({
    success: true,
    token,
    username: foundUser.username,
    role: foundUser.role,
    user: foundUser
  });
});

// ==========================================
// 5. User Management & Permission API
// ==========================================
app.get('/api/users', async (req, res) => {
  if (usePostgres) {
    try {
      const result = await pool.query(
        'SELECT id, username, role, department, full_name, created_at FROM users ORDER BY id ASC'
      );
      return res.json(result.rows);
    } catch (err) {
      console.error('PG get users error:', err.message);
    }
  }
  const safeUsers = memoryDb.users.map(u => ({
    id: u.id,
    username: u.username,
    role: u.role || 'staff',
    department: u.department || 'สำนักงานส่วนกลาง',
    full_name: u.full_name || '',
    created_at: u.created_at || new Date().toISOString()
  }));
  res.json(safeUsers);
});

app.post('/api/users', async (req, res) => {
  const { username, password, role, department, full_name } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน' });
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const userRole = role || 'staff';
  const dept = department || 'สำนักงานส่วนกลาง';
  const fullName = full_name || '';

  if (usePostgres) {
    try {
      const existing = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
      if (existing.rows.length > 0) {
        return res.status(400).json({ error: 'ชื่อผู้ใช้งานนี้มีอยู่ในระบบแล้ว' });
      }

      const result = await pool.query(
        'INSERT INTO users (username, password, role, department, full_name) VALUES ($1, $2, $3, $4, $5) RETURNING id, username, role, department, full_name, created_at',
        [username, hashedPassword, userRole, dept, fullName]
      );
      return res.json(result.rows[0]);
    } catch (err) {
      console.error('PG create user error:', err.message);
      return res.status(500).json({ error: 'เกิดข้อผิดพลาดในการสร้างผู้ใช้งาน' });
    }
  }

  const existing = memoryDb.users.find(u => u.username === username);
  if (existing) {
    return res.status(400).json({ error: 'ชื่อผู้ใช้งานนี้มีอยู่ในระบบแล้ว' });
  }

  const newId = memoryDb.users.length > 0 ? Math.max(...memoryDb.users.map(u => u.id)) + 1 : 1;
  const newUser = {
    id: newId,
    username,
    passwordHash: hashedPassword,
    role: userRole,
    department: dept,
    full_name: fullName,
    created_at: new Date().toISOString()
  };
  memoryDb.users.push(newUser);
  res.json({
    id: newUser.id,
    username: newUser.username,
    role: newUser.role,
    department: newUser.department,
    full_name: newUser.full_name,
    created_at: newUser.created_at
  });
});

app.put('/api/users/:id', async (req, res) => {
  const { id } = req.params;
  const { username, password, role, department, full_name } = req.body;

  if (usePostgres) {
    try {
      if (username) {
        const conflict = await pool.query('SELECT id FROM users WHERE username = $1 AND id != $2', [username, id]);
        if (conflict.rows.length > 0) {
          return res.status(400).json({ error: 'ชื่อผู้ใช้งานนี้มีผู้อื่นใช้อยู่แล้ว' });
        }
      }

      if (password && password.trim() !== '') {
        const hashedPassword = await bcrypt.hash(password, 10);
        await pool.query(
          `UPDATE users SET 
            username = COALESCE($1, username),
            password = $2,
            role = COALESCE($3, role),
            department = COALESCE($4, department),
            full_name = COALESCE($5, full_name)
          WHERE id = $6`,
          [username, hashedPassword, role, department, full_name, id]
        );
      } else {
        await pool.query(
          `UPDATE users SET 
            username = COALESCE($1, username),
            role = COALESCE($2, role),
            department = COALESCE($3, department),
            full_name = COALESCE($4, full_name)
          WHERE id = $5`,
          [username, role, department, full_name, id]
        );
      }
      return res.json({ message: 'แก้ไขข้อมูลผู้ใช้และสิทธิ์เรียบร้อย' });
    } catch (err) {
      console.error('PG update user error:', err.message);
      return res.status(500).json({ error: 'เกิดข้อผิดพลาดในการอัปเดตผู้ใช้งาน' });
    }
  }

  const user = memoryDb.users.find(u => u.id == id);
  if (!user) {
    return res.status(404).json({ error: 'ไม่พบผู้ใช้งานนี้' });
  }

  if (username && username !== user.username) {
    const conflict = memoryDb.users.find(u => u.username === username && u.id != id);
    if (conflict) {
      return res.status(400).json({ error: 'ชื่อผู้ใช้งานนี้มีผู้อื่นใช้อยู่แล้ว' });
    }
    user.username = username;
  }
  if (password && password.trim() !== '') {
    user.passwordHash = await bcrypt.hash(password, 10);
  }
  if (role) user.role = role;
  if (department) user.department = department;
  if (full_name !== undefined) user.full_name = full_name;

  res.json({ message: 'แก้ไขข้อมูลผู้ใช้และสิทธิ์เรียบร้อย' });
});

app.delete('/api/users/:id', async (req, res) => {
  const { id } = req.params;

  if (usePostgres) {
    try {
      const admins = await pool.query("SELECT id FROM users WHERE role = 'admin'");
      const userToDelete = await pool.query('SELECT role FROM users WHERE id = $1', [id]);
      if (userToDelete.rows.length > 0 && userToDelete.rows[0].role === 'admin' && admins.rows.length <= 1) {
        return res.status(400).json({ error: 'ไม่สามารถลบผู้ดูแลระบบคนสุดท้ายได้' });
      }

      await pool.query('DELETE FROM users WHERE id = $1', [id]);
      return res.json({ message: 'ลบผู้ใช้งานเรียบร้อย' });
    } catch (err) {
      console.error('PG delete user error:', err.message);
      return res.status(500).json({ error: 'เกิดข้อผิดพลาดในการลบผู้ใช้งาน' });
    }
  }

  const userToDelete = memoryDb.users.find(u => u.id == id);
  if (userToDelete && userToDelete.role === 'admin') {
    const adminCount = memoryDb.users.filter(u => u.role === 'admin').length;
    if (adminCount <= 1) {
      return res.status(400).json({ error: 'ไม่สามารถลบผู้ดูแลระบบคนสุดท้ายได้' });
    }
  }

  memoryDb.users = memoryDb.users.filter(u => u.id != id);
  res.json({ message: 'ลบผู้ใช้งานเรียบร้อย' });
});

// ==========================================
// 5. Assets & Dashboard API (Compatibility)
// ==========================================
app.get('/api/assets', async (req, res) => {
  let list = [];
  if (usePostgres) {
    try {
      const r = await pool.query('SELECT * FROM equipments ORDER BY id ASC');
      list = r.rows;
    } catch (e) {}
  }
  if (list.length === 0) list = memoryDb.equipments;

  const mapped = list.map(eq => ({
    id: eq.id,
    code: `AST-${String(eq.id).padStart(6, '0')}`,
    name: eq.name,
    category: eq.category,
    status: eq.status,
    created_at: eq.created_at
  }));
  res.json(mapped);
});

app.get('/api/dashboard', async (req, res) => {
  let eqList = [];
  if (usePostgres) {
    try {
      const r = await pool.query('SELECT * FROM equipments');
      eqList = r.rows;
    } catch (e) {}
  }
  if (eqList.length === 0) eqList = memoryDb.equipments;

  const total = eqList.length;
  const active = eqList.filter(e => e.status === 'พร้อมใช้งาน' || e.status === 'ใช้งานอยู่').length;
  const borrowed = eqList.filter(e => e.status === 'กำลังถูกยืม').length;
  const repair = eqList.filter(e => e.status === 'ส่งซ่อม').length;

  res.json({
    summary: {
      totalAssets: total,
      activeAssets: active,
      borrowedAssets: borrowed,
      repairAssets: repair
    }
  });
});

// Serve static frontend build if present
const frontendDist = path.join(__dirname, '../frontend/dist');
const fs = require('fs');

if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.use((req, res) => {
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
} else {
  app.use((req, res) => {
    res.send(`
      <html>
        <head><title>Equipment Management Backend</title><meta charset="utf-8"></head>
        <body style="font-family:sans-serif;padding:40px;line-height:1.6;background:#f8fafc;color:#1e293b;">
          <h2>📦 ระบบจัดการครุภัณฑ์ (Asset Management Backend API)</h2>
          <p>Backend API กำลังทำงานที่พอร์ต <strong>${PORT}</strong></p>
          <p>โหมดฐานข้อมูล: <strong>${usePostgres ? 'PostgreSQL (equipment_db)' : 'In-Memory DB'}</strong></p>
          <ul>
            <li><a href="/api/equipments">/api/equipments</a></li>
            <li><a href="/api/logs">/api/logs</a></li>
            <li><a href="/api/maintenance">/api/maintenance</a></li>
            <li><a href="/api/assets">/api/assets</a></li>
            <li><a href="/api/dashboard">/api/dashboard</a></li>
          </ul>
        </body>
      </html>
    `);
  });
}

app.listen(PORT, () => {
  console.log(`🚀 Equipment Management Backend running on http://localhost:${PORT}`);
});
