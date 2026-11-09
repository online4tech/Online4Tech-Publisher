import { useEffect, useState, type ReactNode, type FormEvent } from "react";
import { Activity, CalendarDays, CheckCircle2, ChevronLeft, Clock3, FileImage, FolderOpen, Instagram, LayoutDashboard, Link2, ListChecks, Menu, MessageSquareText, Plus, Settings2, ShieldCheck, Sparkles, TrendingUp, X, Facebook, CircleAlert, LogOut, LockKeyhole } from "lucide-react";
type AuthState = "checking" | "signed-out" | "signed-in" | "unavailable";

export default function App() {
  const [auth, setAuth] = useState<AuthState>("checking");
  const checkSession = async () => {
    try {
      const response = await fetch("/api/admin/session", { credentials: "include" });
      setAuth(response.ok ? "signed-in" : response.status === 401 ? "signed-out" : "unavailable");
    } catch { setAuth("unavailable"); }
  };
  useEffect(() => { void checkSession(); }, []);
  const logout = async () => {
    try { await fetch("/api/admin/logout", { method: "POST", credentials: "include" }); }
    finally { setAuth("signed-out"); }
  };
  if (auth === "checking") return <AuthLoading />;
  if (auth === "unavailable") return <AuthUnavailable onRetry={checkSession} />;
  if (auth === "signed-out") return <LoginScreen onSuccess={() => setAuth("signed-in")} />;
  return <Dashboard onLogout={logout} />;
}
function AuthLoading() {
  return <div className="auth-shell"><div className="auth-card"><div className="auth-logo">O4T</div><div className="auth-spinner"/><b>جاري التحقق من جلسة الدخول</b><p>لحظة واحدة...</p></div></div>;
}
function AuthUnavailable({ onRetry }: { onRetry: () => void }) {
  return <div className="auth-shell"><div className="auth-card"><div className="auth-logo">O4T</div><div className="auth-symbol warning"><CircleAlert size={24}/></div><h1>مش قادرين نوصل للخادم</h1><p>تأكد إن API شغّال، وبعدها جرّب تاني.</p><button className="primary-btn auth-submit" onClick={onRetry}>إعادة المحاولة</button></div></div>;
}
function LoginScreen({ onSuccess }: { onSuccess: () => void }) {
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/admin/request-login-link", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) {
        setError(result.error === "LOGIN_LINK_RATE_LIMITED"
          ? "طلبت روابط دخول كتير. استنى شوية وجرب تاني."
          : "تعذر إرسال رابط الدخول. راجع إعدادات البريد وحاول مرة أخرى.");
        return;
      }
      setSent(true);
    } catch {
      setError("تعذر الاتصال بالخادم. تأكد إنه شغّال وحاول تاني.");
    } finally {
      setBusy(false);
    }
  };
  return <div className="auth-shell"><div className="auth-card">
    <div className="auth-brand"><div className="auth-logo">O4T</div><div><b>Online4Tech</b><small>Publisher Studio</small></div></div>
    <div className="auth-symbol"><LockKeyhole size={23}/></div>
    <div className="auth-heading"><h1>تسجيل دخول الإدارة</h1><p>هنبعت رابط دخول آمن على بريد الإدارة المسجّل.</p></div>
    {sent ? <div className="auth-success" role="status"><ShieldCheck size={18}/> لو إعدادات البريد سليمة، هيوصلك رابط الدخول خلال دقائق. الرابط صالح 10 دقائق ولمرة واحدة.</div> : <form onSubmit={submit} className="auth-form">
      {error && <div className="auth-error" role="alert"><CircleAlert size={15}/>{error}</div>}
      <button className="primary-btn auth-submit" type="submit" disabled={busy}>{busy ? "جاري إرسال الرابط..." : "إرسال رابط الدخول"}<ChevronLeft size={17}/></button>
    </form>}
    <div className="auth-foot"><ShieldCheck size={15}/> رابط لمرة واحدة وجلسة تنتهي تلقائيًا بعد 8 ساعات</div>
  </div></div>;
}


type Health = { status: string };
type MetaStatus = { oauthConfigured: boolean; connected: boolean; connectionStatus: string; grantedPermissions: string[]; missingPermissions: string[]; facebookReady: boolean; instagramReady: boolean; publishingEnabled: boolean; accounts: Array<{ id: string; platform: "FACEBOOK" | "INSTAGRAM"; platformId: string; name: string; username?: string | null }> };
const navItems = [
  { label: "لوحة التحكم", icon: LayoutDashboard, active: true },
  { label: "مكتبة المحتوى", icon: FolderOpen },
  { label: "إنشاء منشور", icon: Plus },
  { label: "التقويم والجدولة", icon: CalendarDays },
  { label: "سجل النشر", icon: ListChecks },
  { label: "التحليلات", icon: TrendingUp },
];

function Dashboard({ onLogout }: { onLogout: () => void }) {
  const [health, setHealth] = useState<"checking" | "online" | "offline">("checking");
  const [menuOpen, setMenuOpen] = useState(false);
  const [metaStatus, setMetaStatus] = useState<MetaStatus | null>(null);
  const [metaLoading, setMetaLoading] = useState(true);
  const [metaError, setMetaError] = useState("");
  const [metaNotice, setMetaNotice] = useState("");
  useEffect(() => {
    fetch("/api/health").then(r => { if (!r.ok) throw new Error("API unavailable"); return r.json() as Promise<Health>; })
      .then(() => setHealth("online")).catch(() => setHealth("offline"));
  }, []);
  const loadMetaStatus = async () => {
    setMetaLoading(true); setMetaError("");
    try {
      const response = await fetch("/api/admin/meta/status", { credentials: "include" });
      if (!response.ok) throw new Error("تعذر تحميل حالة ربط Meta.");
      setMetaStatus(await response.json() as MetaStatus);
    } catch (error) { setMetaError(error instanceof Error ? error.message : "تعذر تحميل حالة Meta."); }
    finally { setMetaLoading(false); }
  };
  useEffect(() => {
    void loadMetaStatus();
    const params = new URLSearchParams(window.location.search);
    const result = params.get("meta");
    const reason = params.get("reason");
    if (result === "connected") setMetaNotice(reason === "permissions_missing" ? "تم الاتصال، لكن بعض الصلاحيات المطلوبة ناقصة. راجع القائمة أدناه." : "تم التحقق من الاتصال واكتشاف الحسابات.");
    else if (result === "error") setMetaNotice("لم يكتمل ربط Meta. السبب: " + (reason ?? "unknown"));
    if (result) window.history.replaceState({}, "", window.location.pathname);
  }, []);
  const startMetaOAuth = () => { window.location.href = "/api/admin/meta/oauth/start"; };
  return <div className="app-shell">
    <aside className={`sidebar ${menuOpen ? "sidebar-open" : ""}`}>
      <div className="brand"><div className="brand-mark"><span>O4T</span><i /></div><div><strong>Online4Tech</strong><small>Publisher Studio</small></div><button className="icon-btn mobile-close" onClick={() => setMenuOpen(false)} aria-label="إغلاق القائمة"><X size={18}/></button></div>
      <div className="workspace-label">مساحة العمل</div>
      <nav className="main-nav">{navItems.map(({label,icon:Icon,active})=><button className={`nav-item ${active?"active":""}`} key={label}><Icon size={18}/><span>{label}</span>{label==="إنشاء منشور"&&<kbd>+</kbd>}</button>)}</nav>
      <div className="sidebar-divider"/>
      <button className="nav-item"><Settings2 size={18}/><span>الإعدادات</span></button>
      <div className="sidebar-bottom"><div className="secure-note"><ShieldCheck size={17}/><span>اتصال آمن<br/><b>بياناتك تحت سيطرتك</b></span></div><div className="profile"><div className="avatar">O</div><div><b>Online4Tech</b><small>المدير</small></div><Settings2 size={17}/></div></div>
    </aside>
    {menuOpen&&<button className="mobile-scrim" onClick={()=>setMenuOpen(false)} aria-label="إغلاق القائمة"/>}
    <main className="main-content">
      <header className="topbar"><div className="topbar-start"><button className="icon-btn mobile-menu" onClick={()=>setMenuOpen(true)} aria-label="فتح القائمة"><Menu size={20}/></button><div className="breadcrumb">مساحة العمل <ChevronLeft size={14}/> <b>لوحة التحكم</b></div></div>
        <div className="topbar-actions"><span className="timezone"><Clock3 size={15}/> توقيت القاهرة</span><div className="system-status"><span className={`status-dot ${health}`}/>{health==="online"?"الخادم متصل":health==="offline"?"الخادم غير متصل":"جاري الفحص"}</div><button className="logout-btn" onClick={onLogout}><LogOut size={15}/> خروج</button><div className="avatar small-avatar">O</div></div>
      </header>
      <div className="page-wrap">
        <section className="welcome-row"><div><div className="eyebrow"><Sparkles size={14}/> مركز إدارة المحتوى</div><h1>كل محتواك… في مكان واحد.</h1><p>جهّز منشوراتك، نظّم حملاتك، وتابع النشر على منصات Meta من لوحة واحدة.</p></div><button className="primary-btn" onClick={()=>window.alert("محرر المنشورات سيتم تفعيله في المرحلة التالية.")}><Plus size={18}/> إنشاء منشور جديد</button></section>
        <section className="meta-connection-panel"><div className="meta-panel-head"><div className="connection-icon"><Link2 size={22}/></div><div className="connection-copy"><b>ربط حسابات Meta</b><span>اربط صفحة Facebook وحساب Instagram الاحترافي المرتبط بيها.</span></div><div className="meta-actions"><button className="primary-btn" onClick={startMetaOAuth} disabled={metaLoading || !metaStatus?.oauthConfigured}>{metaStatus?.connected ? "إعادة ربط Meta" : "ربط حساب Meta"} <Link2 size={16}/></button><button className="meta-refresh" onClick={loadMetaStatus} disabled={metaLoading}>تحديث</button></div></div>{!metaLoading && metaStatus && !metaStatus.oauthConfigured && <div className="meta-error">إعدادات Meta أو مفتاح التشفير غير مكتملة على الخادم. زر الربط هيتاح بعد ضبطها.</div>}{metaNotice && <div className="meta-notice">{metaNotice}</div>}{metaError && <div className="meta-error">{metaError}</div>}{metaLoading ? <div className="meta-empty">جاري تحميل حالة الاتصال...</div> : metaStatus ? <><div className="meta-readiness"><span className={metaStatus.facebookReady ? "ready" : "not-ready"}><Facebook size={15}/> Facebook: {metaStatus.facebookReady ? "جاهز للصلاحيات" : "غير جاهز"}</span><span className={metaStatus.instagramReady ? "ready" : "not-ready"}><Instagram size={15}/> Instagram: {metaStatus.instagramReady ? "جاهز للصلاحيات" : "غير جاهز"}</span></div>{metaStatus.accounts.length ? <div className="meta-accounts">{metaStatus.accounts.map(account => <div className="meta-account" key={account.platform + account.platformId}><span className="meta-account-icon">{account.platform === "FACEBOOK" ? <Facebook size={17}/> : <Instagram size={17}/>}</span><div><b>{account.name}</b><small>{account.platform === "FACEBOOK" ? "صفحة Facebook" : "حساب Instagram"}{account.username ? " · @" + account.username : ""}</small></div><span className="account-status">تم الاكتشاف</span></div>)}</div> : <div className="meta-empty">{metaStatus.connected ? "تم الاتصال، لكن لم يتم اكتشاف صفحات متاحة. راجع صلاحية الصفحات وربط Instagram." : "لا يوجد حساب Meta متصل حتى الآن."}</div>}{metaStatus.missingPermissions.length > 0 && <div className="missing-permissions"><b>صلاحيات مطلوبة وغير ممنوحة:</b><span>{metaStatus.missingPermissions.join(" · ")}</span></div>}<div className="publishing-lock"><ShieldCheck size={15}/> النشر متوقف عمدًا لحين اكتمال الصلاحيات والاختبار.</div></> : null}</section>
        <section className="stats-grid"><Stat icon={<MessageSquareText/>} label="إجمالي المنشورات" value="—" note="هيظهر بعد إضافة المحتوى"/><Stat icon={<CalendarDays/>} label="منشورات مجدولة" value="—" note="جدولة الخادم لم تُفعّل بعد"/><Stat icon={<CheckCircle2/>} label="تم نشرها" value="—" note="بانتظار أول نشر تجريبي"/><Stat icon={<Activity/>} label="معدل نجاح النشر" value="—" note="لا توجد بيانات كافية"/></section>
        <section className="content-grid"><div className="panel planner-panel"><div className="panel-heading"><div><h2>مساحة التخطيط</h2><p>نظرة سريعة على المحتوى القادم</p></div><button className="text-btn">عرض التقويم <ChevronLeft size={15}/></button></div><div className="empty-state"><div className="empty-illustration"><CalendarDays size={31}/><span><Instagram size={16}/><Facebook size={16}/></span></div><b>لسه بنجهّز مساحة النشر</b><p>بعد ربط حساباتك، هتقدر تشوف المنشورات وتدير مواعيدها من هنا.</p><span className="muted-pill"><Clock3 size={13}/> التقويم قيد التجهيز</span></div></div>
          <div className="panel checklist-panel"><div className="panel-heading"><div><h2>خطوات التجهيز</h2><p>المراحل الأساسية لتشغيل النظام</p></div><span className="progress-count">٢ / ٥</span></div><div className="progress-track"><span/></div><div className="check-list"><CheckRow done title="إنشاء المستودع والتوثيق" detail="تم تجهيز أساس المشروع"/><CheckRow done title="تأسيس قاعدة البيانات والبنية" detail="ملفات الإعداد الأولية جاهزة"/><CheckRow title="إعداد تطبيق Meta" detail="مطلوب إنشاء التطبيق من حسابك"/><CheckRow title="ربط Facebook وInstagram" detail="بعد اعتماد الصلاحيات وOAuth"/><CheckRow title="اختبار الجدولة والنشر" detail="اختبار حقيقي قبل التشغيل"/></div></div></section>
        <section className="bottom-grid"><div className="panel quick-panel"><div className="panel-heading"><div><h2>مكتبة المحتوى</h2><p>صور وفيديوهات ونصوص حملاتك</p></div><FileImage size={19}/></div><div className="quick-empty"><FolderOpen size={20}/><span>مكتبة الوسائط هتظهر هنا بعد تفعيل التخزين.</span></div></div>
          <div className="panel quick-panel"><div className="panel-heading"><div><h2>حالة النظام</h2><p>الخدمات الأساسية</p></div><CircleAlert size={19}/></div><div className="service-row"><span><i className={`status-dot ${health}`}/>واجهة API</span><b>{health==="online"?"تعمل":health==="offline"?"غير متاحة":"فحص..."}</b></div><div className="service-row"><span><i className="status-dot pending"/>قاعدة البيانات</span><b>تحتاج تشغيل محلي</b></div><div className="service-row"><span><i className="status-dot pending"/>محرك الجدولة</span><b>لم يُفعّل بعد</b></div></div></section>
        <footer>Online4Tech Publisher <span>•</span> إصدار تأسيسي 0.1.0 <span>•</span> النشر غير مفعّل حتى اكتمال الاختبارات</footer>
      </div>
    </main>
  </div>;
}
function Stat({icon,label,value,note}:{icon:ReactNode;label:string;value:string;note:string}){return <div className="stat-card"><div className="stat-top"><span>{label}</span><i>{icon}</i></div><strong>{value}</strong><small>{note}</small></div>}
function CheckRow({done=false,title,detail}:{done?:boolean;title:string;detail:string}){return <div className="check-row"><span className={done?"check-icon done":"check-icon"}>{done?<CheckCircle2 size={16}/>:<span/>}</span><div><b>{title}</b><small>{detail}</small></div></div>}