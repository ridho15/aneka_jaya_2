"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/ToastProvider";
import type { OrgHierarchyNode } from "@/lib/sdm/hierarchyStore";

type Props = {
  initialRoots: OrgHierarchyNode[];
  totalEmployees: number;
  departmentCounts: Record<string, number>;
  allEmployees: { id: string; name: string; position: string; department: string }[];
  canManage: boolean;
};

export function OrgChartViewer({
  initialRoots,
  totalEmployees,
  departmentCounts,
  allEmployees,
  canManage
}: Props) {
  const { showToast } = useToast();
  const [roots, setRoots] = useState<OrgHierarchyNode[]>(initialRoots);
  const [selectedDept, setSelectedDept] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [collapsedNodes, setCollapsedNodes] = useState<Set<string>>(new Set());

  // Supervisor assignment state
  const [editingEmployee, setEditingEmployee] = useState<OrgHierarchyNode | null>(null);
  const [newSupervisorId, setNewSupervisorId] = useState<string>("");
  const [isUpdating, setIsUpdating] = useState(false);

  const toggleCollapse = (nodeId: string) => {
    setCollapsedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  };

  const refreshHierarchy = async () => {
    try {
      const res = await fetch("/api/sdm/hierarchy");
      const json = await res.json();
      if (json.success) {
        setRoots(json.data.roots);
      }
    } catch (e) {
      console.error("Gagal memperbarui bagan organisasi:", e);
    }
  };

  const handleAssignSupervisor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEmployee) return;

    try {
      setIsUpdating(true);
      const res = await fetch("/api/sdm/hierarchy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: editingEmployee.id,
          supervisorId: newSupervisorId || null
        })
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || "Gagal memperbarui atasan.");
      }

      showToast(`Struktur atasan untuk ${editingEmployee.name} berhasil diperbarui.`, "success");
      setEditingEmployee(null);
      await refreshHierarchy();
    } catch (err: any) {
      showToast(err.message || "Terjadi kesalahan saat menyimpan struktur.", "error");
    } finally {
      setIsUpdating(false);
    }
  };

  // Recursive render of hierarchy node
  const renderNode = (node: OrgHierarchyNode, depth = 0) => {
    const isCollapsed = collapsedNodes.has(node.id);
    const hasChildren = node.children.length > 0;
    const matchesSearch =
      !searchQuery.trim() ||
      node.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      node.position.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesDept = selectedDept === "ALL" || node.department === selectedDept;

    return (
      <div key={node.id} className="relative flex flex-col items-start">
        {/* Node Card */}
        <div
          className={`group relative mb-3 rounded-md border p-3 shadow-sm transition-all ${
            matchesDept
              ? "border-slate-200 bg-white hover:border-emerald-500/50"
              : "border-slate-200 bg-slate-50 opacity-60"
          } ${matchesSearch && searchQuery ? "ring-2 ring-emerald-500/60" : ""} w-72`}
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-xs text-slate-900 tracking-tight">
                  {node.name}
                </span>
                {!node.isActive && (
                  <span className="rounded bg-rose-50 px-1 py-0.2 text-[9px] font-medium text-rose-700">
                    Non-Aktif
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">{node.position}</p>
            </div>

            {hasChildren && (
              <button
                type="button"
                onClick={() => toggleCollapse(node.id)}
                className="flex h-5 w-5 items-center justify-center rounded bg-slate-100 text-[10px] text-slate-500 hover:bg-slate-200 hover:text-slate-900 font-mono transition"
                title={isCollapsed ? "Buka Bawahan" : "Tutup Bawahan"}
              >
                {isCollapsed ? "+" : "−"}
              </button>
            )}
          </div>

          <div className="mt-2.5 flex items-center justify-between border-t border-slate-200 pt-2 text-[10px]">
            <span className="rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-700">
              {node.department}
            </span>

            <div className="flex items-center gap-2">
              {node.subordinateCount > 0 && (
                <span className="font-semibold text-emerald-700">
                  {node.subordinateCount} bawahan
                </span>
              )}

              {canManage && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingEmployee(node);
                    setNewSupervisorId(node.managerId || "");
                  }}
                  className="text-[10px] text-slate-500 hover:text-slate-900 underline transition"
                >
                  Ubah Atasan
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Children Branching */}
        {hasChildren && !isCollapsed && (
          <div className="relative ml-6 border-l-2 border-slate-300 pl-6 space-y-2">
            {node.children.map((child) => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  const departments = Object.keys(departmentCounts);

  return (
    <div className="space-y-6">
      {/* Top Filter & Metrics Bar */}
      <div className="aj-surface p-4 border border-slate-200 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        {/* Department chips */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setSelectedDept("ALL")}
            className={`px-3 py-1.5 rounded text-xs font-semibold uppercase tracking-wider transition ${
              selectedDept === "ALL"
                ? "bg-slate-900 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            Semua ({totalEmployees})
          </button>
          {departments.map((dept) => (
            <button
              key={dept}
              type="button"
              onClick={() => setSelectedDept(dept)}
              className={`px-3 py-1.5 rounded text-xs font-semibold uppercase tracking-wider transition ${
                selectedDept === dept
                  ? "bg-slate-900 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {dept} ({departmentCounts[dept]})
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="w-full md:w-64">
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari nama atau jabatan..."
            className="w-full text-xs"
          />
        </div>
      </div>

      {/* Org Tree Canvas */}
      <div className="aj-surface p-6 border border-slate-200 overflow-x-auto min-h-[450px]">
        {roots.length === 0 ? (
          <div className="py-16 text-center text-slate-500 text-xs">
            Belum ada data struktur organisasi.
          </div>
        ) : (
          <div className="space-y-6">
            {roots.map((root) => renderNode(root))}
          </div>
        )}
      </div>

      {/* Assign Supervisor Modal */}
      {editingEmployee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="aj-surface w-full max-w-md border border-slate-200 shadow-2xl p-6">
            <h3 className="text-base font-semibold tracking-tight text-slate-900 uppercase mb-1">
              Tetapkan Atasan Langsung
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Ubah supervisor untuk <strong className="text-slate-900">{editingEmployee.name}</strong> ({editingEmployee.position})
            </p>

            <form onSubmit={handleAssignSupervisor} className="space-y-4">
              <div>
                <label className="block text-xs font-medium uppercase tracking-wider text-slate-500 mb-1.5">
                  Atasan Langsung (Manager / Supervisor)
                </label>
                <Select
                  value={newSupervisorId}
                  onChange={(e) => setNewSupervisorId(e.target.value)}
                  className="w-full text-xs"
                >
                  <option value="">-- Tanpa Atasan (Tingkat Paling Atas / Direksi) --</option>
                  {allEmployees
                    .filter((e) => e.id !== editingEmployee.id)
                    .map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name} - {e.position} ({e.department})
                      </option>
                    ))}
                </Select>
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-slate-200 pt-4">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setEditingEmployee(null)}
                  disabled={isUpdating}
                  className="text-xs"
                >
                  Batal
                </Button>
                <Button type="submit" disabled={isUpdating} className="text-xs">
                  {isUpdating ? "Menyimpan..." : "Simpan Perubahan"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
