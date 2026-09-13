import { useState, useEffect, useMemo } from "react";
import {
  Users, QrCode, Calendar, Wallet, BarChart3, Plus, Search,
  Check, X, ArrowLeft, Clock, Building2, LogIn, Trash2, RotateCcw,
  ChevronDown, AlertCircle
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import Papa from "papaparse";

const colors = {
  bg: "#FAF9F6",
  surface: "#FFFFFF",
  surfaceAlt: "#F5F3EE",
  border: "#E5E0D6",
  ink: "#2E2E2E",
  inkMuted: "#75726A",
  sage: "#5B8A7D",
  sageDark: "#4A7367",
  sageSoft: "#E4EEE9",
  clay: "#C9A08A",
  claySoft: "#F3E7DF",
  sand: "#EFE7D8",
  powder: "#B9CBD3",
  good: "#6F9C7D",
  goodSoft: "#E6F0E8",
  warn: "#C7A25C",
  warnSoft: "#F5EBD6",
  bad: "#B5645A",
  badSoft: "#F5E3E0",
};

const FONT_IMPORT = `@import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap');`;

const STORAGE_KEY = "threshold-platform-data";

function uid(prefix) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr + "T00:00:00");
  const now = new Date(todayStr() + "T00:00:00");
  return Math.round((d - now) / 86400000);
}

function fmtTime(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function fmtDuration(startIso, endIso) {
  const ms = new Date(endIso) - new Date(startIso);
  const mins = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

const emptyData = { orgs: [], members: {}, sessions: {} };

export default function App() {
  const [data, setData] = useState(emptyData);
  const [loaded, setLoaded] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [currentOrgId, setCurrentOrgId] = useState(null);
  const [view, setView] = useState("admin"); // 'admin' | 'attend'
  const [attendOrgId, setAttendOrgId] = useState(null);
  const [adminTab, setAdminTab] = useState("dashboard");
  const [showNewOrg, setShowNewOrg] = useState(false);
  const [showOrgSwitcher, setShowOrgSwitcher] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("attendance-platform-data");
      if (raw) {
        const parsed = JSON.parse(raw);
        setData(parsed);
        if (parsed.orgs.length) setCurrentOrgId(parsed.orgs[0].id);
      }
    } catch (e) {
      // no existing data, that's fine
    } finally {
      setLoaded(true);
    }
  }, []);

  function persist(next) {
    setData(next);
    try {
      localStorage.setItem("attendance-platform-data", JSON.stringify(next));
      setSaveError(false);
    } catch (e) {
      setSaveError(true);
    }
  }

  const currentOrg = data.orgs.find((o) => o.id === currentOrgId) || null;
  const attendOrg = data.orgs.find((o) => o.id === attendOrgId) || null;

  function createOrg({ name, type, address, hours }) {
    const org = {
      id: uid("org"),
      name,
      type,
      address,
      hours,
      token: uid("tok"),
      settings: { allowMultiSession: false, autoCloseTime: "22:00" },
    };
    const next = {
      ...data,
      orgs: [...data.orgs, org],
      members: { ...data.members, [org.id]: [] },
      sessions: { ...data.sessions, [org.id]: [] },
    };
    persist(next);
    setCurrentOrgId(org.id);
    setShowNewOrg(false);
    setAdminTab("members");
  }

  function addMember(orgId, member) {
    const m = { id: uid("mem"), status: "active", feeStatus: "due", ...member };
    const next = {
      ...data,
      members: { ...data.members, [orgId]: [...(data.members[orgId] || []), m] },
    };
    persist(next);
  }

  function importMembers(orgId, rows) {
    const additions = rows
      .filter((r) => r.name && r.dob)
      .map((r) => ({
        id: uid("mem"),
        name: r.name.trim(),
        dob: r.dob.trim(),
        seatNumber: r.seatNumber ? String(r.seatNumber).trim() : "",
        contact: r.contact || "",
        plan: r.plan || "",
        feeAmount: r.feeAmount || "",
        joinDate: r.joinDate || todayStr(),
        expiryDate: r.expiryDate || "",
        status: "active",
        feeStatus: "due",
      }));
    const next = {
      ...data,
      members: { ...data.members, [orgId]: [...(data.members[orgId] || []), ...additions] },
    };
    persist(next);
    return additions.length;
  }

  function removeMember(orgId, memberId) {
    const next = {
      ...data,
      members: { ...data.members, [orgId]: data.members[orgId].filter((m) => m.id !== memberId) },
    };
    persist(next);
  }

  function markFeePaid(orgId, memberId) {
    const next = {
      ...data,
      members: {
        ...data.members,
        [orgId]: data.members[orgId].map((m) =>
          m.id === memberId ? { ...m, feeStatus: "paid" } : m
        ),
      },
    };
    persist(next);
  }

  function regenerateToken(orgId) {
    const next = {
      ...data,
      orgs: data.orgs.map((o) => (o.id === orgId ? { ...o, token: uid("tok") } : o)),
    };
    persist(next);
  }

  function markAttendance(orgId, memberId) {
    const sessions = data.sessions[orgId] || [];
    const today = todayStr();
    const openIdx = sessions.findIndex(
      (s) => s.memberId === memberId && s.date === today && !s.exitTime
    );
    let resultSessions;
    let result;
    if (openIdx >= 0) {
      const s = sessions[openIdx];
      const exitTime = new Date().toISOString();
      resultSessions = sessions.map((sess, i) =>
        i === openIdx ? { ...sess, exitTime } : sess
      );
      result = { type: "exit", entryTime: s.entryTime, exitTime };
    } else {
      const entryTime = new Date().toISOString();
      const newSession = { id: uid("sess"), memberId, date: today, entryTime, exitTime: null, autoClosed: false };
      resultSessions = [...sessions, newSession];
      result = { type: "entry", entryTime };
    }
    const next = { ...data, sessions: { ...data.sessions, [orgId]: resultSessions } };
    persist(next);
    return result;
  }

  function resetDemo() {
    try {
      localStorage.setItem("attendance-platform-data", JSON.stringify(emptyData));
    } catch (e) {}
    setData(emptyData);
    setCurrentOrgId(null);
    setView("admin");
    setAdminTab("dashboard");
  }

  if (!loaded) {
    return (
      <div style={{ background: colors.bg, minHeight: 400 }} className="flex items-center justify-center p-12">
        <style>{FONT_IMPORT}</style>
        <p style={{ color: colors.inkMuted, fontFamily: "Manrope, sans-serif" }}>Loading…</p>
      </div>
    );
  }

  return (
    <div style={{ background: colors.bg, fontFamily: "Manrope, sans-serif", color: colors.ink, minHeight: 500 }} className="w-full">
      <style>{FONT_IMPORT}</style>

      {view === "attend" && attendOrg ? (
        <AttendPage
          org={attendOrg}
          members={data.members[attendOrg.id] || []}
          onBack={() => setView("admin")}
          onMark={(memberId) => markAttendance(attendOrg.id, memberId)}
        />
      ) : data.orgs.length === 0 || showNewOrg ? (
        <OnboardingScreen
          hasOrgs={data.orgs.length > 0}
          onCancel={data.orgs.length > 0 ? () => setShowNewOrg(false) : null}
          onCreate={createOrg}
        />
      ) : (
        <AdminShell
          data={data}
          org={currentOrg}
          orgs={data.orgs}
          tab={adminTab}
          setTab={setAdminTab}
          onSwitchOrg={(id) => { setCurrentOrgId(id); setShowOrgSwitcher(false); }}
          showSwitcher={showOrgSwitcher}
          setShowSwitcher={setShowOrgSwitcher}
          onNewOrg={() => setShowNewOrg(true)}
          onAddMember={(m) => addMember(currentOrg.id, m)}
          onImportMembers={(rows) => importMembers(currentOrg.id, rows)}
          onRemoveMember={(id) => removeMember(currentOrg.id, id)}
          onMarkFeePaid={(id) => markFeePaid(currentOrg.id, id)}
          onRegenerateToken={() => regenerateToken(currentOrg.id)}
          onSimulateScan={() => { setAttendOrgId(currentOrg.id); setView("attend"); }}
          onReset={resetDemo}
          saveError={saveError}
        />
      )}
    </div>
  );
}

// ---------- Onboarding ----------
function OnboardingScreen({ onCreate, onCancel, hasOrgs }) {
  const [name, setName] = useState("");
  const [type, setType] = useState("gym");
  const [address, setAddress] = useState("");
  const [hours, setHours] = useState("");

  return (
    <div className="flex items-center justify-center p-8" style={{ minHeight: 480 }}>
      <div
        style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 16 }}
        className="w-full max-w-md p-8 shadow-sm"
      >
        <div className="flex items-center gap-2 mb-1">
          <div style={{ background: colors.sageSoft, borderRadius: 10 }} className="p-2">
            <Building2 size={20} color={colors.sageDark} />
          </div>
          <h1 style={{ color: colors.ink }} className="text-xl font-bold">
            {hasOrgs ? "Register a new organization" : "Set up your organization"}
          </h1>
        </div>
        <p style={{ color: colors.inkMuted }} className="text-sm mb-6">
          Each organization gets its own isolated member list, QR code, and dashboard.
        </p>

        <div className="flex flex-col gap-4">
          <Field label="Organization name">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Riverside Fitness Club"
              style={inputStyle}
            />
          </Field>

          <Field label="Organization type">
            <div className="flex gap-2">
              {[
                { key: "gym", label: "Gym" },
                { key: "library", label: "Library" },
                { key: "other", label: "Other" },
              ].map((t) => (
                <button
                  key={t.key}
                  onClick={() => setType(t.key)}
                  style={{
                    borderRadius: 10,
                    border: `1px solid ${type === t.key ? colors.sage : colors.border}`,
                    background: type === t.key ? colors.sageSoft : colors.surface,
                    color: type === t.key ? colors.sageDark : colors.inkMuted,
                  }}
                  className="flex-1 py-2 text-sm font-semibold"
                >
                  {t.label}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Address">
            <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Optional" style={inputStyle} />
          </Field>
          <Field label="Operating hours">
            <input value={hours} onChange={(e) => setHours(e.target.value)} placeholder="e.g. 6 AM – 10 PM" style={inputStyle} />
          </Field>
        </div>

        <div className="flex gap-3 mt-7">
          {onCancel && (
            <button onClick={onCancel} style={secondaryBtn} className="flex-1 py-2.5 text-sm font-semibold">
              Cancel
            </button>
          )}
          <button
            disabled={!name.trim()}
            onClick={() => onCreate({ name: name.trim(), type, address, hours })}
            style={{ ...primaryBtn, opacity: name.trim() ? 1 : 0.5 }}
            className="flex-1 py-2.5 text-sm font-semibold"
          >
            Create organization
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- Admin Shell ----------
function AdminShell(props) {
  const { data, org, orgs, tab, setTab, onSwitchOrg, showSwitcher, setShowSwitcher, onNewOrg, onReset, saveError } = props;
  const members = data.members[org.id] || [];
  const sessions = data.sessions[org.id] || [];

  const tabs = [
    { key: "dashboard", label: "Dashboard", icon: BarChart3 },
    { key: "members", label: "Members", icon: Users },
    { key: "attendance", label: "Attendance", icon: Clock },
    { key: "fees", label: "Fees", icon: Wallet },
    { key: "qr", label: "QR code", icon: QrCode },
    { key: "reports", label: "Reports", icon: Calendar },
  ];

  return (
    <div>
      {/* Header */}
      <div style={{ borderBottom: `1px solid ${colors.border}`, background: colors.surface }} className="px-6 py-4 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div style={{ background: colors.sageSoft, borderRadius: 10 }} className="p-2">
            <Building2 size={18} color={colors.sageDark} />
          </div>
          <div>
            <p style={{ color: colors.ink }} className="font-bold text-sm leading-tight">{org.name}</p>
            <p style={{ color: colors.inkMuted }} className="text-xs capitalize">{org.type}</p>
          </div>
        </div>

        <div className="relative flex items-center gap-2">
          <button
            onClick={() => setShowSwitcher(!showSwitcher)}
            style={{ border: `1px solid ${colors.border}`, borderRadius: 10, background: colors.surface, color: colors.ink }}
            className="px-3 py-2 text-xs font-semibold flex items-center gap-1.5"
          >
            Switch organization <ChevronDown size={14} />
          </button>
          {showSwitcher && (
            <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 12, top: "110%" }} className="absolute right-0 w-56 shadow-md z-10 overflow-hidden">
              {orgs.map((o) => (
                <button
                  key={o.id}
                  onClick={() => onSwitchOrg(o.id)}
                  style={{ color: o.id === org.id ? colors.sageDark : colors.ink, background: o.id === org.id ? colors.sageSoft : "transparent" }}
                  className="w-full text-left px-4 py-2.5 text-sm font-medium flex items-center justify-between"
                >
                  {o.name}
                  {o.id === org.id && <Check size={14} />}
                </button>
              ))}
              <button onClick={onNewOrg} style={{ borderTop: `1px solid ${colors.border}`, color: colors.sageDark }} className="w-full text-left px-4 py-2.5 text-sm font-semibold flex items-center gap-1.5">
                <Plus size={14} /> New organization
              </button>
            </div>
          )}
        </div>
      </div>

      {saveError && (
        <div style={{ background: colors.badSoft, color: colors.bad }} className="px-6 py-2 text-xs flex items-center gap-2">
          <AlertCircle size={14} /> Changes couldn't be saved. They'll be lost on refresh.
        </div>
      )}

      {/* Tabs */}
      <div style={{ borderBottom: `1px solid ${colors.border}`, background: colors.surface }} className="px-6 flex gap-1 overflow-x-auto">
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                borderBottom: active ? `2px solid ${colors.sage}` : "2px solid transparent",
                color: active ? colors.sageDark : colors.inkMuted,
              }}
              className="px-3 py-3 text-sm font-semibold flex items-center gap-1.5 whitespace-nowrap"
            >
              <Icon size={15} /> {t.label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="p-6">
        {tab === "dashboard" && <DashboardTab org={org} members={members} sessions={sessions} onSimulateScan={props.onSimulateScan} />}
        {tab === "members" && (
          <MembersTab
            org={org}
            members={members}
            onAdd={props.onAddMember}
            onImport={props.onImportMembers}
            onRemove={props.onRemoveMember}
          />
        )}
        {tab === "attendance" && <AttendanceTab members={members} sessions={sessions} />}
        {tab === "fees" && <FeesTab members={members} onMarkPaid={props.onMarkFeePaid} />}
        {tab === "qr" && <QrTab org={org} onRegenerate={props.onRegenerateToken} onSimulateScan={props.onSimulateScan} />}
        {tab === "reports" && <ReportsTab members={members} sessions={sessions} />}
      </div>

      <div className="px-6 pb-6 flex justify-end">
        <button onClick={onReset} style={{ color: colors.inkMuted }} className="text-xs flex items-center gap-1.5">
          <RotateCcw size={12} /> Reset demo data
        </button>
      </div>
    </div>
  );
}

// ---------- Dashboard ----------
function DashboardTab({ org, members, sessions, onSimulateScan }) {
  const today = todayStr();
  const active = members.filter((m) => m.status === "active").length;
  const checkedIn = sessions.filter((s) => s.date === today && !s.exitTime).length;
  const expiringSoon = members.filter((m) => {
    const d = daysUntil(m.expiryDate);
    return d !== null && d >= 0 && d <= 7;
  }).length;
  const pendingFees = members.filter((m) => m.feeStatus !== "paid").length;
  const todayCount = sessions.filter((s) => s.date === today).length;

  const stats = [
    { label: "Active members", value: active, color: colors.sage },
    { label: "Currently checked in", value: checkedIn, color: colors.good },
    { label: "Expiring this week", value: expiringSoon, color: colors.warn },
    { label: "Fees pending", value: pendingFees, color: colors.bad },
  ];

  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {stats.map((s) => (
          <div key={s.label} style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 14 }} className="p-4">
            <p style={{ color: s.color }} className="text-2xl font-extrabold">{s.value}</p>
            <p style={{ color: colors.inkMuted }} className="text-xs mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 14 }} className="p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p style={{ color: colors.ink }} className="font-bold text-sm">Today's activity</p>
            <p style={{ color: colors.inkMuted }} className="text-xs">{todayCount} attendance event{todayCount === 1 ? "" : "s"} logged so far today</p>
          </div>
          <button onClick={onSimulateScan} style={{ ...primaryBtn }} className="px-4 py-2 text-xs font-semibold flex items-center gap-1.5">
            <LogIn size={14} /> Open member attendance page
          </button>
        </div>
        {members.length === 0 && (
          <EmptyState text="No members yet. Add your first member to get started." />
        )}
      </div>
    </div>
  );
}

// ---------- Members ----------
function MembersTab({ org, members, onAdd, onImport, onRemove }) {
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [query, setQuery] = useState("");
  const [csvText, setCsvText] = useState("");
  const [importMsg, setImportMsg] = useState("");

  const filtered = members.filter((m) =>
    (m.name || "").toLowerCase().includes(query.toLowerCase()) ||
    (m.seatNumber || "").toLowerCase().includes(query.toLowerCase())
  );

  function handleImport() {
    const parsed = Papa.parse(csvText.trim(), { header: true, skipEmptyLines: true });
    const count = onImport(parsed.data);
    setImportMsg(`Imported ${count} member${count === 1 ? "" : "s"}.`);
    setCsvText("");
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 10 }} className="flex items-center gap-2 px-3 py-2 w-full max-w-xs">
          <Search size={14} color={colors.inkMuted} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={org.type === "library" ? "Search by name or seat" : "Search by name"}
            style={{ border: "none", outline: "none", background: "transparent", width: "100%", color: colors.ink, fontFamily: "inherit" }}
            className="text-sm"
          />
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowImport(!showImport)} style={secondaryBtn} className="px-3 py-2 text-xs font-semibold">
            Bulk import (CSV)
          </button>
          <button onClick={() => setShowForm(!showForm)} style={primaryBtn} className="px-3 py-2 text-xs font-semibold flex items-center gap-1.5">
            <Plus size={14} /> Add member
          </button>
        </div>
      </div>

      {showImport && (
        <div style={{ background: colors.surfaceAlt, border: `1px solid ${colors.border}`, borderRadius: 12 }} className="p-4 mb-4">
          <p style={{ color: colors.ink }} className="text-sm font-semibold mb-1">Paste CSV data</p>
          <p style={{ color: colors.inkMuted }} className="text-xs mb-2">
            Header row: name,dob,{org.type === "library" ? "seatNumber," : ""}contact,plan,feeAmount,joinDate,expiryDate
          </p>
          <textarea
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            rows={5}
            style={{ ...inputStyle, fontFamily: "monospace", fontSize: 12 }}
            placeholder={`name,dob,${org.type === "library" ? "seatNumber," : ""}contact,plan,feeAmount,joinDate,expiryDate`}
          />
          <div className="flex items-center gap-3 mt-2">
            <button onClick={handleImport} style={primaryBtn} className="px-4 py-2 text-xs font-semibold">Import rows</button>
            {importMsg && <span style={{ color: colors.sageDark }} className="text-xs">{importMsg}</span>}
          </div>
        </div>
      )}

      {showForm && (
        <MemberForm
          org={org}
          onCancel={() => setShowForm(false)}
          onSave={(m) => { onAdd(m); setShowForm(false); }}
        />
      )}

      {filtered.length === 0 ? (
        <EmptyState text={members.length === 0 ? "No members yet. Add someone to get started." : "No members match your search."} />
      ) : (
        <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 14 }} className="overflow-hidden">
          {filtered.map((m, i) => (
            <div key={m.id} style={{ borderTop: i === 0 ? "none" : `1px solid ${colors.border}` }} className="flex items-center justify-between px-4 py-3 flex-wrap gap-2">
              <div>
                <p style={{ color: colors.ink }} className="text-sm font-semibold">
                  {m.name} {org.type === "library" && m.seatNumber && <span style={{ color: colors.inkMuted }} className="font-normal">· Seat {m.seatNumber}</span>}
                </p>
                <p style={{ color: colors.inkMuted }} className="text-xs">
                  DOB {m.dob || "—"} · Plan {m.plan || "—"} · Joined {m.joinDate || "—"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <ExpiryBadge date={m.expiryDate} />
                <button onClick={() => onRemove(m.id)} style={{ color: colors.bad }} className="p-1.5">
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MemberForm({ org, onSave, onCancel }) {
  const [form, setForm] = useState({
    name: "", dob: "", seatNumber: "", contact: "", plan: "", feeAmount: "",
    joinDate: todayStr(), expiryDate: "",
  });
  const set = (k, v) => setForm({ ...form, [k]: v });

  return (
    <div style={{ background: colors.surfaceAlt, border: `1px solid ${colors.border}`, borderRadius: 12 }} className="p-4 mb-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Field label="Full name"><input style={inputStyle} value={form.name} onChange={(e) => set("name", e.target.value)} /></Field>
        <Field label="Date of birth"><input type="date" style={inputStyle} value={form.dob} onChange={(e) => set("dob", e.target.value)} /></Field>
        {org.type === "library" && (
          <Field label="Seat number"><input style={inputStyle} value={form.seatNumber} onChange={(e) => set("seatNumber", e.target.value)} /></Field>
        )}
        <Field label="Contact number"><input style={inputStyle} value={form.contact} onChange={(e) => set("contact", e.target.value)} /></Field>
        <Field label="Plan"><input style={inputStyle} placeholder="e.g. Monthly" value={form.plan} onChange={(e) => set("plan", e.target.value)} /></Field>
        <Field label="Fee amount"><input style={inputStyle} value={form.feeAmount} onChange={(e) => set("feeAmount", e.target.value)} /></Field>
        <Field label="Joining date"><input type="date" style={inputStyle} value={form.joinDate} onChange={(e) => set("joinDate", e.target.value)} /></Field>
        <Field label="Membership expiry"><input type="date" style={inputStyle} value={form.expiryDate} onChange={(e) => set("expiryDate", e.target.value)} /></Field>
      </div>
      <div className="flex gap-3 mt-4">
        <button onClick={onCancel} style={secondaryBtn} className="px-4 py-2 text-xs font-semibold">Cancel</button>
        <button
          disabled={!form.name.trim() || !form.dob}
          onClick={() => onSave(form)}
          style={{ ...primaryBtn, opacity: form.name.trim() && form.dob ? 1 : 0.5 }}
          className="px-4 py-2 text-xs font-semibold"
        >
          Save member
        </button>
      </div>
    </div>
  );
}

// ---------- Attendance ----------
function AttendanceTab({ members, sessions }) {
  const sorted = [...sessions].sort((a, b) => (a.entryTime < b.entryTime ? 1 : -1));
  const nameOf = (id) => members.find((m) => m.id === id)?.name || "Unknown";

  return (
    <div>
      <p style={{ color: colors.ink }} className="font-bold text-sm mb-3">Attendance log</p>
      {sorted.length === 0 ? (
        <EmptyState text="No attendance recorded yet." />
      ) : (
        <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 14 }} className="overflow-hidden">
          {sorted.map((s, i) => (
            <div key={s.id} style={{ borderTop: i === 0 ? "none" : `1px solid ${colors.border}` }} className="flex items-center justify-between px-4 py-3 flex-wrap gap-2">
              <div>
                <p style={{ color: colors.ink }} className="text-sm font-semibold">{nameOf(s.memberId)}</p>
                <p style={{ color: colors.inkMuted }} className="text-xs">{s.date} · In {fmtTime(s.entryTime)} — Out {s.exitTime ? fmtTime(s.exitTime) : "—"}</p>
              </div>
              <div className="flex items-center gap-2">
                {s.exitTime ? (
                  <span style={{ background: colors.sageSoft, color: colors.sageDark }} className="text-xs font-semibold px-2.5 py-1 rounded-full">
                    {fmtDuration(s.entryTime, s.exitTime)}
                  </span>
                ) : (
                  <span style={{ background: colors.goodSoft, color: colors.good }} className="text-xs font-semibold px-2.5 py-1 rounded-full">
                    Checked in
                  </span>
                )}
                {s.autoClosed && <span style={{ color: colors.warn }} className="text-xs">auto-closed</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- Fees ----------
function FeesTab({ members, onMarkPaid }) {
  return (
    <div>
      <p style={{ color: colors.ink }} className="font-bold text-sm mb-3">Fees & membership</p>
      {members.length === 0 ? (
        <EmptyState text="No members yet." />
      ) : (
        <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 14 }} className="overflow-hidden">
          {members.map((m, i) => (
            <div key={m.id} style={{ borderTop: i === 0 ? "none" : `1px solid ${colors.border}` }} className="flex items-center justify-between px-4 py-3 flex-wrap gap-2">
              <div>
                <p style={{ color: colors.ink }} className="text-sm font-semibold">{m.name}</p>
                <p style={{ color: colors.inkMuted }} className="text-xs">Plan {m.plan || "—"} · Fee {m.feeAmount || "—"} · Expires {m.expiryDate || "—"}</p>
              </div>
              <div className="flex items-center gap-2">
                <FeeBadge status={m.feeStatus} />
                {m.feeStatus !== "paid" && (
                  <button onClick={() => onMarkPaid(m.id)} style={primaryBtn} className="px-3 py-1.5 text-xs font-semibold">
                    Mark as paid
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- QR ----------
function QrTab({ org, onRegenerate, onSimulateScan }) {
  const url = `https://yourapp.example/attend/${org.token}`;
  const qrImg = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=10&color=46-56-52&bgcolor=250-249-246&data=${encodeURIComponent(url)}`;

  return (
    <div className="flex flex-col md:flex-row gap-6">
      <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 16 }} className="p-6 flex flex-col items-center text-center max-w-xs">
        <img src={qrImg} alt="Attendance QR code" style={{ borderRadius: 12, border: `1px solid ${colors.border}` }} width={180} height={180} />
        <p style={{ color: colors.ink }} className="text-sm font-semibold mt-4">{org.name}'s attendance QR</p>
        <p style={{ color: colors.inkMuted }} className="text-xs mt-1 break-all">{url}</p>
        <div className="flex gap-2 mt-4 w-full">
          <button onClick={onRegenerate} style={secondaryBtn} className="flex-1 py-2 text-xs font-semibold">Regenerate</button>
          <button onClick={onSimulateScan} style={primaryBtn} className="flex-1 py-2 text-xs font-semibold">Simulate scan</button>
        </div>
      </div>
      <div style={{ background: colors.surfaceAlt, border: `1px solid ${colors.border}`, borderRadius: 16 }} className="p-5 flex-1">
        <p style={{ color: colors.ink }} className="text-sm font-bold mb-2">How this works</p>
        <ul style={{ color: colors.inkMuted }} className="text-sm space-y-2 list-disc pl-4">
          <li>Any phone camera or Google Lens can scan this — no app install needed.</li>
          <li>The URL's token is what enforces isolation: it only ever resolves to {org.name}'s member list, never another organization's.</li>
          <li>Regenerating creates a new token and invalidates the old QR immediately.</li>
          <li>"Simulate scan" opens the public attendance page exactly as a member's phone would see it.</li>
        </ul>
      </div>
    </div>
  );
}

// ---------- Reports ----------
function ReportsTab({ members, sessions }) {
  const last7 = useMemo(() => {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const label = d.toLocaleDateString([], { weekday: "short" });
      const count = sessions.filter((s) => s.date === key).length;
      days.push({ label, count });
    }
    return days;
  }, [sessions]);

  const pendingCount = members.filter((m) => m.feeStatus !== "paid").length;

  return (
    <div>
      <p style={{ color: colors.ink }} className="font-bold text-sm mb-3">Attendance, last 7 days</p>
      <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 14 }} className="p-4 mb-6" >
        <div style={{ width: "100%", height: 220 }}>
          <ResponsiveContainer>
            <BarChart data={last7}>
              <CartesianGrid stroke={colors.border} vertical={false} />
              <XAxis dataKey="label" stroke={colors.inkMuted} fontSize={12} tickLine={false} axisLine={false} />
              <YAxis stroke={colors.inkMuted} fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip contentStyle={{ borderRadius: 10, border: `1px solid ${colors.border}`, fontSize: 12 }} />
              <Bar dataKey="count" fill={colors.sage} radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 14 }} className="p-4">
        <p style={{ color: colors.ink }} className="text-sm font-semibold">Fees pending</p>
        <p style={{ color: colors.warn }} className="text-2xl font-extrabold mt-1">{pendingCount}</p>
        <p style={{ color: colors.inkMuted }} className="text-xs mt-1">members with a due or overdue balance</p>
      </div>
    </div>
  );
}

// ---------- Attend (public) page ----------
function AttendPage({ org, members, onBack, onMark }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(null);
  const [dob, setDob] = useState("");
  const [error, setError] = useState("");
  const [confirmation, setConfirmation] = useState(null);

  const filtered = members.filter((m) => {
    const q = query.toLowerCase();
    if (!q) return false;
    if (org.type === "library") return (m.seatNumber || "").toLowerCase().includes(q) || m.name.toLowerCase().includes(q);
    return m.name.toLowerCase().includes(q);
  }).slice(0, 6);

  function submit() {
    if (!selected) return;
    if (dob !== selected.dob) {
      setError("Details don't match. Please try again.");
      return;
    }
    const result = onMark(org.id, selected.id);
    setError("");
    setConfirmation({ ...result, name: selected.name });
  }

  function reset() {
    setSelected(null);
    setDob("");
    setError("");
    setQuery("");
    setConfirmation(null);
  }

  return (
    <div className="flex items-center justify-center p-6" style={{ minHeight: 480 }}>
      <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 18 }} className="w-full max-w-sm p-6">
        <button onClick={onBack} style={{ color: colors.inkMuted }} className="text-xs flex items-center gap-1 mb-4">
          <ArrowLeft size={13} /> Back to admin (demo only)
        </button>

        <div className="text-center mb-5">
          <p style={{ color: colors.inkMuted }} className="text-xs uppercase tracking-wide">{org.name}</p>
          <p style={{ color: colors.ink }} className="text-lg font-bold mt-0.5">Mark your attendance</p>
        </div>

        {confirmation ? (
          <div className="text-center py-6">
            <div style={{ background: colors.goodSoft, borderRadius: "50%" }} className="w-14 h-14 flex items-center justify-center mx-auto mb-4">
              <Check size={26} color={colors.good} />
            </div>
            {confirmation.type === "entry" ? (
              <p style={{ color: colors.ink }} className="font-semibold">
                {confirmation.name}, you're checked in at {fmtTime(confirmation.entryTime)}.
              </p>
            ) : (
              <p style={{ color: colors.ink }} className="font-semibold">
                {confirmation.name}, checked out at {fmtTime(confirmation.exitTime)}.<br />
                <span style={{ color: colors.inkMuted, fontWeight: 500 }}>Session: {fmtDuration(confirmation.entryTime, confirmation.exitTime)}</span>
              </p>
            )}
            <button onClick={reset} style={{ ...secondaryBtn, marginTop: 20 }} className="px-4 py-2 text-xs font-semibold">
              Mark another member
            </button>
          </div>
        ) : !selected ? (
          <>
            <div style={{ background: colors.surfaceAlt, border: `1px solid ${colors.border}`, borderRadius: 10 }} className="flex items-center gap-2 px-3 py-2.5">
              <Search size={14} color={colors.inkMuted} />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={org.type === "library" ? "Enter your seat number or name" : "Enter your name"}
                style={{ border: "none", outline: "none", background: "transparent", width: "100%", color: colors.ink, fontFamily: "inherit" }}
                className="text-sm"
              />
            </div>
            {query && (
              <div className="mt-2 flex flex-col gap-1">
                {filtered.length === 0 ? (
                  <p style={{ color: colors.inkMuted }} className="text-xs px-1 py-2">No matches.</p>
                ) : (
                  filtered.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => setSelected(m)}
                      style={{ border: `1px solid ${colors.border}`, borderRadius: 10, textAlign: "left" }}
                      className="px-3 py-2.5 text-sm font-medium hover:opacity-80"
                    >
                      {org.type === "library" ? `Seat ${m.seatNumber} — ${m.name}` : m.name}
                    </button>
                  ))
                )}
              </div>
            )}
          </>
        ) : (
          <div>
            <p style={{ color: colors.ink }} className="text-sm font-semibold mb-1">
              {org.type === "library" ? `Seat ${selected.seatNumber} — ${selected.name}` : selected.name}
            </p>
            <p style={{ color: colors.inkMuted }} className="text-xs mb-3">Enter your date of birth to confirm it's you.</p>
            <input
              type="date"
              value={dob}
              onChange={(e) => { setDob(e.target.value); setError(""); }}
              style={inputStyle}
            />
            {error && <p style={{ color: colors.bad }} className="text-xs mt-2 flex items-center gap-1"><AlertCircle size={12} /> {error}</p>}
            <div className="flex gap-3 mt-4">
              <button onClick={() => { setSelected(null); setDob(""); setError(""); }} style={secondaryBtn} className="flex-1 py-2.5 text-xs font-semibold">
                Not me
              </button>
              <button onClick={submit} disabled={!dob} style={{ ...primaryBtn, opacity: dob ? 1 : 0.5 }} className="flex-1 py-2.5 text-xs font-semibold">
                Confirm
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- Small shared components ----------
function Field({ label, children }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span style={{ color: colors.inkMuted }} className="text-xs font-semibold">{label}</span>
      {children}
    </label>
  );
}

function EmptyState({ text }) {
  return (
    <div style={{ border: `1px dashed ${colors.border}`, borderRadius: 14, color: colors.inkMuted }} className="p-8 text-center text-sm">
      {text}
    </div>
  );
}

function ExpiryBadge({ date }) {
  const d = daysUntil(date);
  if (d === null) return <span style={{ color: colors.inkMuted }} className="text-xs">No expiry set</span>;
  let bg = colors.goodSoft, fg = colors.good, label = `${d}d left`;
  if (d < 0) { bg = colors.badSoft; fg = colors.bad; label = "Expired"; }
  else if (d <= 7) { bg = colors.warnSoft; fg = colors.warn; label = `${d}d left`; }
  return <span style={{ background: bg, color: fg }} className="text-xs font-semibold px-2.5 py-1 rounded-full">{label}</span>;
}

function FeeBadge({ status }) {
  const map = {
    paid: { bg: colors.goodSoft, fg: colors.good, label: "Paid" },
    due: { bg: colors.warnSoft, fg: colors.warn, label: "Due" },
    overdue: { bg: colors.badSoft, fg: colors.bad, label: "Overdue" },
  };
  const s = map[status] || map.due;
  return <span style={{ background: s.bg, color: s.fg }} className="text-xs font-semibold px-2.5 py-1 rounded-full">{s.label}</span>;
}

const inputStyle = {
  border: `1px solid ${colors.border}`,
  borderRadius: 10,
  padding: "9px 12px",
  fontSize: 14,
  fontFamily: "inherit",
  color: colors.ink,
  background: colors.surface,
  outline: "none",
  width: "100%",
};

const primaryBtn = {
  background: colors.sage,
  color: "#FFFFFF",
  borderRadius: 10,
  border: "none",
};

const secondaryBtn = {
  background: colors.surface,
  color: colors.ink,
  borderRadius: 10,
  border: `1px solid ${colors.border}`,
};
