import { useState, useEffect } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';

// Modal component for Add / Edit User
function UserFormModal({ isOpen, onClose, onSubmit, initialData }) {
  const [form, setForm] = useState({
    username: '',
    password: '',
    role: 'staff',
    department: ''
  });

  useEffect(() => {
    if (initialData) {
      setForm({
        username: initialData.username || '',
        password: '', // keep empty, only change if user types new
        role: initialData.role || 'staff',
        department: initialData.department || ''
      });
    } else {
      setForm({ username: '', password: '', role: 'staff', department: '' });
    }
  }, [initialData]);

  const handleChange = e => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = e => {
    e.preventDefault();
    onSubmit(form);
  };

  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-lg">
        <h2 className="text-lg font-bold mb-4">{initialData ? 'แก้ไขผู้ใช้' : 'เพิ่มผู้ใช้'}</h2>
        <form onSubmit={handleSubmit} className="space-y-4 text-sm">
          <div>
            <label className="block font-medium mb-1">ชื่อผู้ใช้</label>
            <input
              type="text"
              name="username"
              required
              value={form.username}
              onChange={handleChange}
              className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#005691]"
            />
          </div>
          <div>
            <label className="block font-medium mb-1">รหัสผ่าน{initialData ? ' (เว้นว่างหากไม่เปลี่ยน)' : ''}</label>
            <input
              type="password"
              name="password"
              placeholder={initialData ? '******' : ''}
              value={form.password}
              onChange={handleChange}
              className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#005691]"
            />
          </div>
          <div>
            <label className="block font-medium mb-1">ตำแหน่ง (role)</label>
            <select name="role" value={form.role} onChange={handleChange} className="w-full border rounded px-3 py-2">
              <option value="admin">ผู้ดูแลระบบ</option>
              <option value="staff">เจ้าหน้าที่พัสดุ</option>
              <option value="technician">ช่างซ่อมบำรุง</option>
              <option value="viewer">ผู้ใช้งานทั่วไป</option>
            </select>
          </div>
          <div>
            <label className="block font-medium mb-1">หน่วยงาน</label>
            <input
              type="text"
              name="department"
              value={form.department}
              onChange={handleChange}
              className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#005691]"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 bg-slate-200 hover:bg-slate-300 rounded">
              ยกเลิก
            </button>
            <button type="submit" className="px-4 py-2 bg-[#005691] hover:bg-[#003B71] text-white rounded">
              บันทึก
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function UserManagement() {
  const [users, setUsers] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editUser, setEditUser] = useState(null);

  const fetchUsers = async () => {
    try {
      const res = await axios.get('http://localhost:5000/api/users');
      setUsers(res.data);
    } catch (e) {
      console.error('Failed to fetch users', e);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleDelete = async id => {
    if (!window.confirm('ยืนยันการลบผู้ใช้?')) return;
    await axios.delete(`http://localhost:5000/api/users/${id}`);
    fetchUsers();
  };

  const handleSubmit = async formData => {
    if (editUser) {
      const payload = { ...formData };
      if (!payload.password) delete payload.password; // keep old password if blank
      await axios.put(`http://localhost:5000/api/users/${editUser.id}`, payload);
    } else {
      await axios.post('http://localhost:5000/api/users', formData);
    }
    setModalOpen(false);
    setEditUser(null);
    fetchUsers();
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-[#002D62] mb-4">จัดการผู้ใช้ระบบ</h1>
      <button
        onClick={() => { setEditUser(null); setModalOpen(true); }}
        className="mb-4 px-4 py-2 bg-[#005691] hover:bg-[#003B71] text-white rounded"
      >
        + เพิ่มผู้ใช้
      </button>

      <table className="min-w-full bg-white border border-gray-200">
        <thead className="bg-[#071d36] text-white">
          <tr>
            <th className="px-4 py-2 text-left">ID</th>
            <th className="px-4 py-2 text-left">ชื่อผู้ใช้</th>
            <th className="px-4 py-2 text-left">ตำแหน่ง</th>
            <th className="px-4 py-2 text-left">หน่วยงาน</th>
            <th className="px-4 py-2 text-center">Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.map(u => (
            <tr key={u.id} className="border-t">
              <td className="px-4 py-2">{u.id}</td>
              <td className="px-4 py-2">{u.username}</td>
              <td className="px-4 py-2 capitalize">{u.role}</td>
              <td className="px-4 py-2">{u.department}</td>
              <td className="px-4 py-2 text-center space-x-2">
                <button
                  onClick={() => { setEditUser(u); setModalOpen(true); }}
                  className="text-sm text-[#005691] hover:underline"
                >แก้ไข</button>
                <button
                  onClick={() => handleDelete(u.id)}
                  className="text-sm text-red-600 hover:underline"
                >ลบ</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <UserFormModal
        isOpen={modalOpen}
        onClose={() => { setModalOpen(false); setEditUser(null); }}
        onSubmit={handleSubmit}
        initialData={editUser}
      />
    </div>
  );
}
