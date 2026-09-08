"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { ConfirmationModal } from "@/components/ui/ConfirmationModal";
import { useToast } from "@/components/ui/ToastProvider";
import { ROLES, roleLabel, type Role } from "@/lib/auth/roles";

export type UserRow = {
  id: string;
  externalId: string;
  email?: string | null;
  name: string;
  role: Role;
  isActive: boolean;
  hasPassword: boolean;
  lastLoginAt?: string | null;
};

export function UserManager({ users: initial }: { users: UserRow[] }) {
  const { showToast } = useToast();
  const [users, setUsers] = useState(initial);
  const [externalId, setExternalId] = useState("");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("VIEWER");
  const [password, setPassword] = useState("");
  const [resetPasswords, setResetPasswords] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const [userToToggle, setUserToToggle] = useState<{ user: UserRow; targetStatus: boolean } | null>(null);
  const [userToResetPassword, setUserToResetPassword] = useState<{ user: UserRow; newPass: string } | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  const formatLastLogin = (value?: string | null) =>
    value
      ? new Intl.DateTimeFormat("id-ID", {
          dateStyle: "medium",
          timeStyle: "short",
          timeZone: "Asia/Jakarta"
        }).format(new Date(value))
      : "-";

  const addUser = async () => {
    if (!externalId.trim() || !name.trim() || !password.trim()) {
      showToast("External ID, nama, dan password awal wajib diisi.", "error");
      return;
    }
    if (password.trim().length < 8) {
      showToast("Password awal minimal 8 karakter.", "error");
      return;
    }
    setSaving(true);
    try {
      const response = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          externalId: externalId.trim(),
          email: email.trim(),
          name: name.trim(),
          role,
          password
        })
      });
      const result = await response.json();
      if (result.success) {
        setUsers((prev) => [...prev, result.data]);
        setExternalId("");
        setEmail("");
        setName("");
        setRole("VIEWER");
        setPassword("");
        showToast("User berhasil ditambahkan.", "success");
      } else {
        showToast(result.message || "Gagal menambah user.", "error");
      }
    } catch {
      showToast("Terjadi kesalahan jaringan saat menambah user.", "error");
    } finally {
      setSaving(false);
    }
  };

  const updateUserRole = async (user: UserRow, newRole: Role) => {
    try {
      const response = await fetch(`/api/users/${user.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...user, role: newRole })
      });
      const result = await response.json();
      if (result.success) {
        setUsers((prev) => prev.map((item) => (item.id === user.id ? result.data : item)));
        showToast(`Role ${user.name} berhasil diubah menjadi ${roleLabel(newRole)}.`, "success");
      } else {
        showToast(result.message || "Gagal mengubah role user.", "error");
      }
    } catch {
      showToast("Terjadi kesalahan jaringan saat mengubah role.", "error");
    }
  };

  const confirmToggleStatus = async () => {
    if (!userToToggle) return;
    setIsUpdating(true);
    try {
      const updated = { ...userToToggle.user, isActive: userToToggle.targetStatus };
      const response = await fetch(`/api/users/${userToToggle.user.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updated)
      });
      const result = await response.json();
      if (result.success) {
        setUsers((prev) =>
          prev.map((item) => (item.id === userToToggle.user.id ? result.data : item))
        );
        showToast(
          `User ${userToToggle.user.name} berhasil ${
            userToToggle.targetStatus ? "diaktifkan" : "dinonaktifkan"
          }.`,
          "success"
        );
        setUserToToggle(null);
      } else {
        showToast(result.message || "Gagal memperbarui status user.", "error");
      }
    } catch {
      showToast("Terjadi kesalahan jaringan saat memperbarui status.", "error");
    } finally {
      setIsUpdating(false);
    }
  };

  const confirmResetPassword = async () => {
    if (!userToResetPassword) return;
    if (userToResetPassword.newPass.trim().length < 8) {
      showToast("Password baru minimal 8 karakter.", "error");
      return;
    }
    setIsUpdating(true);
    try {
      const updated = {
        ...userToResetPassword.user,
        password: userToResetPassword.newPass.trim()
      };
      const response = await fetch(`/api/users/${userToResetPassword.user.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updated)
      });
      const result = await response.json();
      if (result.success) {
        setUsers((prev) =>
          prev.map((item) => (item.id === userToResetPassword.user.id ? result.data : item))
        );
        setResetPasswords((prev) => ({ ...prev, [userToResetPassword.user.id]: "" }));
        showToast(`Password user ${userToResetPassword.user.name} berhasil direset.`, "success");
        setUserToResetPassword(null);
      } else {
        showToast(result.message || "Gagal mereset password user.", "error");
      }
    } catch {
      showToast("Terjadi kesalahan jaringan saat mereset password.", "error");
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="aj-surface overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-5 py-3">User</th>
              <th className="px-5 py-3">External ID</th>
              <th className="px-5 py-3">Role</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3">Password</th>
              <th className="px-5 py-3">Last login</th>
              <th className="px-5 py-3">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-b border-slate-100 align-top">
                <td className="px-5 py-4">
                  <b>{user.name}</b>
                  <p className="mt-1 text-xs text-slate-500">{user.email || "-"}</p>
                </td>
                <td className="px-5 py-4 font-mono text-xs text-slate-600">{user.externalId}</td>
                <td className="px-5 py-4 min-w-36">
                  <Select
                    value={user.role}
                    onChange={(event) => updateUserRole(user, event.target.value as Role)}
                  >
                    {ROLES.map((item) => (
                      <option key={item} value={item}>
                        {roleLabel(item)}
                      </option>
                    ))}
                  </Select>
                </td>
                <td className="px-5 py-4">
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                      user.isActive
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {user.isActive ? "Aktif" : "Nonaktif"}
                  </span>
                </td>
                <td className="px-5 py-4 min-w-52">
                  <p
                    className={`mb-2 text-xs font-semibold ${
                      user.hasPassword ? "text-emerald-700" : "text-amber-700"
                    }`}
                  >
                    {user.hasPassword ? "Sudah diset" : "Belum diset"}
                  </p>
                  <div className="flex gap-2">
                    <Input
                      type="password"
                      value={resetPasswords[user.id] || ""}
                      onChange={(event) =>
                        setResetPasswords((prev) => ({
                          ...prev,
                          [user.id]: event.target.value
                        }))
                      }
                      placeholder="Password baru"
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() =>
                        setUserToResetPassword({
                          user,
                          newPass: resetPasswords[user.id] || ""
                        })
                      }
                      disabled={!resetPasswords[user.id]?.trim()}
                    >
                      Reset
                    </Button>
                  </div>
                </td>
                <td className="px-5 py-4 text-slate-600">{formatLastLogin(user.lastLoginAt)}</td>
                <td className="px-5 py-4">
                  <Button
                    type="button"
                    variant={user.isActive ? "danger" : "secondary"}
                    onClick={() =>
                      setUserToToggle({
                        user,
                        targetStatus: !user.isActive
                      })
                    }
                  >
                    {user.isActive ? "Nonaktifkan" : "Aktifkan"}
                  </Button>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-10 text-center text-slate-500">
                  Belum ada user.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="aj-surface max-w-3xl p-5 sm:p-6">
        <h3 className="font-bold">Tambah User</h3>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium text-slate-700">
            <span className="mb-1 block">
              Username / External ID <span className="text-red-500">*</span>
            </span>
            <Input
              value={externalId}
              onChange={(event) => setExternalId(event.target.value)}
              placeholder="username-login"
            />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            <span className="mb-1 block">
              Nama <span className="text-red-500">*</span>
            </span>
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Nama user"
            />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            <span className="mb-1 block">Email</span>
            <Input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="nama@perusahaan.com"
            />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            <span className="mb-1 block">Role</span>
            <Select
              value={role}
              onChange={(event) => setRole(event.target.value as Role)}
            >
              {ROLES.map((item) => (
                <option key={item} value={item}>
                  {roleLabel(item)}
                </option>
              ))}
            </Select>
          </label>
          <label className="block text-sm font-medium text-slate-700">
            <span className="mb-1 block">
              Password awal <span className="text-red-500">*</span>
            </span>
            <Input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Minimal 8 karakter"
            />
          </label>
        </div>
        <Button className="mt-4" onClick={addUser} disabled={saving}>
          {saving ? "Menyimpan..." : "Tambah User"}
        </Button>
      </section>

      {/* Confirmation Modal for Toggle Status */}
      <ConfirmationModal
        isOpen={Boolean(userToToggle)}
        title={userToToggle?.targetStatus ? "Aktifkan Akun User" : "Nonaktifkan Akun User"}
        message={
          userToToggle
            ? userToToggle.targetStatus
              ? `Aktifkan kembali akun "${userToToggle.user.name}" (${userToToggle.user.externalId})? Pengguna akan dapat login kembali ke aplikasi.`
              : `Nonaktifkan akun "${userToToggle.user.name}" (${userToToggle.user.externalId})? Pengguna tidak akan dapat login lagi ke dalam sistem.`
            : ""
        }
        confirmLabel={userToToggle?.targetStatus ? "Ya, Aktifkan" : "Ya, Nonaktifkan"}
        cancelLabel="Batal"
        variant={userToToggle?.targetStatus ? "primary" : "danger"}
        isLoading={isUpdating}
        onConfirm={confirmToggleStatus}
        onCancel={() => {
          if (!isUpdating) setUserToToggle(null);
        }}
      />

      {/* Confirmation Modal for Reset Password */}
      <ConfirmationModal
        isOpen={Boolean(userToResetPassword)}
        title="Reset Password User"
        message={
          userToResetPassword
            ? `Apakah Anda yakin ingin mereset password untuk user "${userToResetPassword.user.name}" (${userToResetPassword.user.externalId})?`
            : ""
        }
        confirmLabel="Ya, Reset Password"
        cancelLabel="Batal"
        variant="warning"
        isLoading={isUpdating}
        onConfirm={confirmResetPassword}
        onCancel={() => {
          if (!isUpdating) setUserToResetPassword(null);
        }}
      />
    </div>
  );
}
