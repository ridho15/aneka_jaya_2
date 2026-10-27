"use client";

import { useState, useMemo } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { ConfirmationModal } from "@/components/ui/ConfirmationModal";
import { useToast } from "@/components/ui/ToastProvider";
import { INDONESIAN_BANKS } from "@/lib/paymentAccounts";
import type { EmployeeRow, OrgNode } from "@/lib/sdm/employeeStore";

type Props = {
  initialEmployees: EmployeeRow[];
  initialOrgTree: OrgNode[];
  canManage: boolean;
};

type EmployeeFormData = {
  nik: string;
  name: string;
  position: string;
  department: string;
  managerId: string;
  bankName: string;
  bankAccountNumber: string;
  notes: string;
};

const emptyFormData: EmployeeFormData = {
  nik: "",
  name: "",
  position: "",
  department: "Operasional",
  managerId: "",
  bankName: "BCA",
  bankAccountNumber: "",
  notes: ""
};

const COMMON_DEPARTMENTS = ["Manajemen", "Keuangan", "Operasional", "Logistik", "Penjualan", "Umum & Personalia"];

export function EmployeeManager({ initialEmployees, initialOrgTree, canManage }: Props) {
  const { showToast } = useToast();
  const [employees, setEmployees] = useState<EmployeeRow[]>(initialEmployees);
  const [orgTree, setOrgTree] = useState<OrgNode[]>(initialOrgTree);
  const [activeTab, setActiveTab] = useState<"list" | "tree">("list");

  // Filters
  const [search, setSearch] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("active");

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<EmployeeRow | null>(null);
  const [formData, setFormData] = useState<EmployeeFormData>(emptyFormData);
  const [isSaving, setIsSaving] = useState(false);

  // Toggle active confirmation
  const [employeeToToggle, setEmployeeToToggle] = useState<EmployeeRow | null>(null);

  const filteredEmployees = useMemo(() => {
    return employees.filter((emp) => {
      if (statusFilter === "active" && !emp.isActive) return false;
      if (statusFilter === "inactive" && emp.isActive) return false;
      if (departmentFilter && emp.department !== departmentFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return (
          emp.name.toLowerCase().includes(q) ||
          emp.position.toLowerCase().includes(q) ||
          (emp.nik && emp.nik.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [employees, statusFilter, departmentFilter, search]);

  const departments = useMemo(() => {
    const set = new Set<string>(COMMON_DEPARTMENTS);
    employees.forEach((e) => set.add(e.department));
    return Array.from(set);
  }, [employees]);

  const refreshOrgTree = async () => {
    try {
      const res = await fetch("/api/sdm/org-tree");
      const json = await res.json();
      if (json.success) setOrgTree(json.data);
    } catch {
      // ignore background refresh failure
    }
  };

  const openAddModal = () => {
    setEditingEmployee(null);
    setFormData(emptyFormData);
    setIsModalOpen(true);
  };

  const openEditModal = (emp: EmployeeRow) => {
    setEditingEmployee(emp);
    setFormData({
      nik: emp.nik || "",
      name: emp.name,
      position: emp.position,
      department: emp.department,
      managerId: emp.managerId || "",
      bankName: emp.bankName || "BCA",
      bankAccountNumber: emp.bankAccountNumber || "",
      notes: emp.notes || ""
    });
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.position.trim() || !formData.department.trim()) {
      showToast("Nama, posisi, dan departemen wajib diisi.", "error");
      return;
    }

    setIsSaving(true);
    try {
      const isEdit = Boolean(editingEmployee);
      const url = isEdit ? `/api/sdm/employees/${editingEmployee?.id}` : "/api/sdm/employees";
      const method = isEdit ? "PUT" : "POST";

      const payload = {
        ...formData,
        managerId: formData.managerId || null,
        nik: formData.nik || null,
        bankName: formData.bankName || null,
        bankAccountNumber: formData.bankAccountNumber || null,
        notes: formData.notes || null
      };

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const result = await res.json();

      if (result.success) {
        showToast(isEdit ? "Data karyawan berhasil diperbarui." : "Karyawan baru berhasil ditambahkan.", "success");
        setIsModalOpen(false);
        // Refresh local list
        if (isEdit) {
          setEmployees((prev) => prev.map((item) => (item.id === result.data.id ? result.data : item)));
        } else {
          setEmployees((prev) => [result.data, ...prev]);
        }
        refreshOrgTree();
      } else {
        showToast(result.message || "Gagal menyimpan data karyawan.", "error");
      }
    } catch {
      showToast("Terjadi kesalahan jaringan.", "error");
    } finally {
      setIsSaving(false);
    }
  };

  const confirmToggleStatus = async () => {
    if (!employeeToToggle) return;
    try {
      const newStatus = !employeeToToggle.isActive;
      const res = await fetch(`/api/sdm/employees/${employeeToToggle.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: employeeToToggle.name,
          position: employeeToToggle.position,
          department: employeeToToggle.department,
          isActive: newStatus
        })
      });
      const result = await res.json();
      if (result.success) {
        setEmployees((prev) =>
          prev.map((item) => (item.id === employeeToToggle.id ? { ...item, isActive: newStatus } : item))
        );
        showToast(
          newStatus ? `Karyawan ${employeeToToggle.name} diaktifkan.` : `Karyawan ${employeeToToggle.name} dinonaktifkan.`,
          "success"
        );
        refreshOrgTree();
      } else {
        showToast(result.message || "Gagal mengubah status karyawan.", "error");
      }
    } catch {
      showToast("Terjadi kesalahan jaringan.", "error");
    } finally {
      setEmployeeToToggle(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Tab Switcher & Actions */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-1 text-sm font-medium">
          <button
            type="button"
            onClick={() => setActiveTab("list")}
            className={`inline-flex items-center gap-2 rounded-md px-3.5 py-1.5 transition-colors ${
              activeTab === "list" ? "bg-white text-slate-900 shadow-xs font-semibold" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <svg className="h-4 w-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
            </svg>
            <span>Daftar Karyawan ({employees.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("tree")}
            className={`inline-flex items-center gap-2 rounded-md px-3.5 py-1.5 transition-colors ${
              activeTab === "tree" ? "bg-white text-slate-900 shadow-xs font-semibold" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <svg className="h-4 w-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            <span>Bagan Organisasi</span>
          </button>
        </div>

        {canManage && (
          <Button onClick={openAddModal} className="w-full sm:w-auto">
            + Tambah Karyawan
          </Button>
        )}
      </div>

      {activeTab === "list" ? (
        <section className="aj-surface overflow-hidden">
          {/* Filters Bar */}
          <div className="border-b border-slate-100 p-4 sm:p-5 bg-white">
            <div className="grid gap-3 sm:grid-cols-3">
              <Input
                placeholder="Cari nama, NIK, jabatan..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <Select value={departmentFilter} onChange={(e) => setDepartmentFilter(e.target.value)}>
                <option value="">Semua Departemen</option>
                {departments.map((dept) => (
                  <option key={dept} value={dept}>
                    {dept}
                  </option>
                ))}
              </Select>
              <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as "all" | "active" | "inactive")}>
                <option value="active">Status: Aktif Saja</option>
                <option value="inactive">Status: Nonaktif Saja</option>
                <option value="all">Semua Status</option>
              </Select>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-700">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-5 py-3">Nama / NIK</th>
                  <th className="px-5 py-3">Jabatan & Departemen</th>
                  <th className="px-5 py-3">Atasan Langsung</th>
                  <th className="px-5 py-3">Rekening Bank</th>
                  <th className="px-5 py-3">Status</th>
                  {canManage && <th className="px-5 py-3 text-right">Aksi</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredEmployees.length === 0 ? (
                  <tr>
                    <td colSpan={canManage ? 6 : 5} className="px-5 py-8 text-center text-slate-500">
                      Tidak ada karyawan yang sesuai filter.
                    </td>
                  </tr>
                ) : (
                  filteredEmployees.map((emp) => (
                    <tr key={emp.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-5 py-3.5">
                        <div className="font-semibold text-slate-900">{emp.name}</div>
                        {emp.nik && <div className="text-xs text-slate-500">NIK: {emp.nik}</div>}
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="font-medium text-slate-800">{emp.position}</div>
                        <div className="text-xs text-slate-500">{emp.department}</div>
                      </td>
                      <td className="px-5 py-3.5">
                        {emp.manager ? (
                          <span className="inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-700">
                            {emp.manager.name}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">— Direksi / Root —</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        {emp.bankAccountNumber ? (
                          <div className="text-xs">
                            <span className="font-medium text-slate-700">{emp.bankName || "Bank"}:</span>{" "}
                            <span className="font-mono text-slate-800">{emp.bankAccountNumber}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">— Belum ada —</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        <span
                          className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                            emp.isActive
                              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                              : "border-slate-200 bg-slate-100 text-slate-600"
                          }`}
                        >
                          {emp.isActive ? "Aktif" : "Nonaktif"}
                        </span>
                      </td>
                      {canManage && (
                        <td className="px-5 py-3.5 text-right">
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => openEditModal(emp)}
                              className="rounded border border-emerald-200 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50 transition-colors"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => setEmployeeToToggle(emp)}
                              className={`rounded px-2.5 py-1 text-xs font-medium border transition-colors ${
                                emp.isActive
                                  ? "text-rose-700 hover:bg-rose-50 border-rose-200"
                                  : "text-slate-700 hover:bg-slate-50 border-slate-200"
                              }`}
                            >
                              {emp.isActive ? "Nonaktifkan" : "Aktifkan"}
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <section className="aj-surface overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 p-5 bg-white">
            <div>
              <h3 className="text-base font-bold text-slate-800">Hierarki & Struktur Organisasi</h3>
              <p className="mt-0.5 text-xs text-slate-500">Pohon organisasi otomatis dibentuk dari data atasan langsung setiap karyawan.</p>
            </div>
            <Button variant="secondary" onClick={refreshOrgTree} className="text-xs px-3 py-1.5">
              Segarkan
            </Button>
          </div>

          {orgTree.length === 0 ? (
            <div className="p-12 text-center text-slate-500 text-sm">
              Belum ada data hierarki organisasi. Tentukan atasan langsung pada karyawan untuk membentuk bagan hierarki.
            </div>
          ) : (
            <div className="p-5 sm:p-6 space-y-3">
              {orgTree.map((node) => (
                <OrgTreeNodeView key={node.id} node={node} level={0} />
              ))}
            </div>
          )}
        </section>
      )}

      {/* Add / Edit Employee Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[120] grid place-items-center bg-slate-950/50 p-4 backdrop-blur-sm transition-opacity duration-150">
          <div className="w-full max-w-lg rounded-sm bg-white p-5 sm:p-6 shadow-xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">
                {editingEmployee ? `Edit Karyawan: ${editingEmployee.name}` : "Tambah Karyawan Baru"}
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                disabled={isSaving}
                aria-label="Tutup dialog"
                className="grid h-8 w-8 shrink-0 place-items-center rounded-sm text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50 cursor-pointer transition-colors"
              >
                <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSave} className="mt-4 space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Nama Lengkap *</label>
                  <Input
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Nama karyawan"
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">NIK (Nomor Induk)</label>
                  <Input
                    value={formData.nik}
                    onChange={(e) => setFormData({ ...formData, nik: e.target.value })}
                    placeholder="Contoh: 320101..."
                    className="mt-1"
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Jabatan / Posisi *</label>
                  <Input
                    required
                    value={formData.position}
                    onChange={(e) => setFormData({ ...formData, position: e.target.value })}
                    placeholder="Contoh: Staff Keuangan / Kurir"
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Departemen *</label>
                  <Input
                    required
                    list="dept-options"
                    value={formData.department}
                    onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                    placeholder="Pilih atau ketik departemen"
                    className="mt-1"
                  />
                  <datalist id="dept-options">
                    {departments.map((d) => (
                      <option key={d} value={d} />
                    ))}
                  </datalist>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">Atasan Langsung (Manager)</label>
                <Select
                  value={formData.managerId}
                  onChange={(e) => setFormData({ ...formData, managerId: e.target.value })}
                  className="mt-1"
                >
                  <option value="">— Tidak ada (Level Direksi/Owner) —</option>
                  {employees
                    .filter((emp) => !editingEmployee || emp.id !== editingEmployee.id)
                    .map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.name} ({emp.position} - {emp.department})
                      </option>
                    ))}
                </Select>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Nama Bank</label>
                  <Select
                    value={formData.bankName}
                    onChange={(e) => setFormData({ ...formData, bankName: e.target.value })}
                    className="mt-1"
                  >
                    {INDONESIAN_BANKS.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Nomor Rekening</label>
                  <Input
                    value={formData.bankAccountNumber}
                    onChange={(e) => setFormData({ ...formData, bankAccountNumber: e.target.value })}
                    placeholder="Nomor rekening"
                    className="mt-1"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">Catatan Karyawan</label>
                <Input
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Catatan tambahan (opsional)"
                  className="mt-1"
                />
              </div>

              <div className="mt-6 flex justify-end gap-3 pt-3 border-t border-slate-200">
                <Button type="button" variant="secondary" onClick={() => setIsModalOpen(false)} disabled={isSaving}>
                  Batal
                </Button>
                <Button type="submit" disabled={isSaving}>
                  {isSaving ? "Menyimpan..." : "Simpan Data Karyawan"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Toggle Status Confirmation Modal */}
      {employeeToToggle && (
        <ConfirmationModal
          isOpen={Boolean(employeeToToggle)}
          title={employeeToToggle.isActive ? "Nonaktifkan Karyawan?" : "Aktifkan Karyawan?"}
          message={
            employeeToToggle.isActive
              ? `Karyawan ${employeeToToggle.name} tidak akan muncul lagi di pilihan transaksi pengeluaran baru.`
              : `Karyawan ${employeeToToggle.name} akan diaktifkan kembali.`
          }
          confirmLabel={employeeToToggle.isActive ? "Nonaktifkan" : "Aktifkan"}
          variant={employeeToToggle.isActive ? "danger" : "primary"}
          onConfirm={confirmToggleStatus}
          onCancel={() => setEmployeeToToggle(null)}
        />
      )}
    </div>
  );
}

function OrgTreeNodeView({ node, level }: { node: OrgNode; level: number }) {
  const [isExpanded, setIsExpanded] = useState(true);
  const hasChildren = node.children && node.children.length > 0;

  return (
    <div className={`space-y-2 ${level > 0 ? "ml-5 pl-4 border-l-2 border-slate-200" : ""}`}>
      <div className="flex items-center gap-3 rounded border border-slate-200 bg-white p-3 shadow-2xs hover:border-slate-300 transition-colors">
        {hasChildren ? (
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex h-6 w-6 items-center justify-center rounded border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
          >
            {isExpanded ? "▾" : "▸"}
          </button>
        ) : (
          <span className="h-6 w-6 flex items-center justify-center text-slate-300 text-xs">•</span>
        )}
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-bold text-slate-900 text-sm">{node.name}</span>
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
              {node.position}
            </span>
            <span className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-600">
              {node.department}
            </span>
          </div>
        </div>
        {hasChildren && (
          <span className="text-xs text-slate-500 font-medium">
            {node.children.length} bawahan langsung
          </span>
        )}
      </div>

      {hasChildren && isExpanded && (
        <div className="space-y-2 pt-1">
          {node.children.map((child) => (
            <OrgTreeNodeView key={child.id} node={child} level={level + 1} />
          ))}
        </div>
      )}
    </div>
  );
}
