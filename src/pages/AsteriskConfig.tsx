import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Server, RefreshCw, Download, Activity, CheckCircle, XCircle, Loader, Plus, Edit3, Trash2, Zap, AlertTriangle, BookOpen, Send, ShieldCheck, Layers, Copy as CopyIcon } from 'lucide-react';
import { Card } from '../components/UI/Card';
import { exportCSV, exportExcel } from '../services/exportService';
import { Button } from '../components/UI/Button';
import { Badge } from '../components/UI/Badge';
import { Input } from '../components/UI/Input';
import { Modal } from '../components/UI/Modal';
import { api } from '../services/api';
import { useToast } from '../components/UI/Toast';

type SipServer = {
  id: number;
  name: string;
  ami_host: string;
  ami_port: number;
  sip_host: string;
  sip_port: number;
  ami_username: string;
  ami_secret?: string;
  transport: 'udp' | 'tcp' | 'tls';
  dialplan_context: string;
  priority: number;
  is_active: boolean;
  last_health_status: 'ok' | 'down' | 'unknown' | string;
  last_health_latency_ms: number | null;
  last_health_at: string | null;
  last_dlr_pushed_at?: string | null;
  last_dlr_push_route?: string | 'webhook' | 'esme' | 'java_unreachable' | string | null;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
};

type ChecklistItem = { label: string; ok: boolean; detail: string };
type Tip = { code: string; severity: 'critical' | 'high' | 'medium' | 'warning' | 'low'; message: string; action: string; affected_servers: number[] };
type ListenerState = {
  server_id: number; name: string;
  logged_in: boolean; sock_alive: boolean; reconnect_pending: boolean;
  events: { ts: string; event: string; call_id: string | null; extra: any }[];
};

const blankServer: Omit<SipServer, 'id' | 'last_health_status' | 'last_health_latency_ms' | 'last_health_at'> = {
  name: '', ami_host: '', ami_port: 5038, sip_host: '', sip_port: 5060,
  ami_username: 'net2app', ami_secret: 'net2app_secret', transport: 'udp',
  dialplan_context: 'net2app-otp', priority: 10, is_active: true,
};

const severityStyles: Record<string, { bg: string; fg: string; ring: string }> = {
  critical: { bg: 'bg-rose-50',  fg: 'text-rose-800',  ring: 'ring-rose-200' },
  high:     { bg: 'bg-orange-50', fg: 'text-orange-800', ring: 'ring-orange-200' },
  medium:   { bg: 'bg-amber-50',  fg: 'text-amber-800',  ring: 'ring-amber-200' },
  warning:  { bg: 'bg-yellow-50', fg: 'text-yellow-800', ring: 'ring-yellow-200' },
  low:      { bg: 'bg-slate-50',  fg: 'text-slate-700',  ring: 'ring-slate-200' },
};

export const AsteriskConfig: React.FC = () => {
  const { addToast } = useToast();
  const [ast, setAst] = useState<any>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [gen, setGen] = useState<any>(null);
  const [servers, setServers] = useState<SipServer[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<SipServer | null>(null);
  const [draft, setDraft] = useState<any>(blankServer);
  const [testResult, setTestResult] = useState<Record<number, { ok: boolean; latency_ms?: number; error?: string } | null>>({});
  const [routingPreview, setRoutingPreview] = useState<any>(null);
  const [useExisting, setUseExisting] = useState<boolean>(true);
  const [checklist, setChecklist] = useState<ChecklistItem[] | null>(null);
  const [installResult, setInstallResult] = useState<any>(null);
  const [tipsOpen, setTipsOpen] = useState(true);
  const [tips, setTips] = useState<Tip[]>([]);
  const [severityCounts, setSeverityCounts] = useState<Record<string, number>>({});
  const [listenerState, setListenerState] = useState<Record<number, ListenerState>>({});
  const [dlrTestResult, setDlrTestResult] = useState<Record<number, any>>({});

  const loadServers = useCallback(async () => {
    try {
      const r = await api.get('/asterisk/servers');
      if (r?.success) setServers(r.data || []);
    } catch (_) {}
  }, []);

  const loadStatus = async () => {
    setBusy('load');
    try {
      const r = await api.get('/asterisk/status');
      if (r?.success && r?.data?.bridge) setAst(r.data.bridge);
    } catch (_) {} finally { setBusy(null); }
  };

  const loadHealth = useCallback(async () => {
    try {
      const r = await api.get('/asterisk/health');
      if (r?.success) {
        const byId: Record<number, any> = {};
        (r.results || []).forEach((h: any) => { byId[h.server_id] = h; });
        setServers((cur) => cur.map((s) => byId[s.id]
          ? { ...s, last_health_status: byId[s.id].ok ? 'ok' : 'down', last_health_latency_ms: byId[s.id].latency_ms ?? null }
          : s));
        setTips(Array.isArray(r.tips) ? r.tips : []);
        setSeverityCounts(r.severity_counts || {});
        setListenerState(r.listener_state || {});
      }
    } catch (_) {}
  }, []);

  const loadChecklist = useCallback(async () => {
    try {
      const r = await api.get('/asterisk/post-install-checklist');
      if (r?.success) setChecklist(r.data || []);
    } catch (_) {}
  }, []);

  useEffect(() => { loadStatus(); loadServers(); loadHealth(); loadChecklist(); }, [loadServers, loadHealth, loadChecklist]);
  useEffect(() => { if (ast?.use_existing_config !== undefined) setUseExisting(!!ast.use_existing_config); }, [ast?.use_existing_config]);

  // Auto-refresh listener rings every 8s while the page is mounted.
  useEffect(() => {
    const h = setInterval(() => { loadHealth(); }, 8000);
    return () => clearInterval(h);
  }, [loadHealth]);

  const tryInstall = async () => {
    if (!confirm('This will run apt-get install asterisk + write manager.conf + systemctl enable/restart. Continue? (sudo required)')) return;
    setBusy('install');
    setInstallResult(null);
    try {
      // Capture the install POST response so we can render per-step status
      // (apt_install / manager_conf_written / systemctl_enable / etc.) in the
      // post-install card. Pre-fix the handler dropped this on the floor and
      // only showed a single boolean.
      const installResp = await api.post('/asterisk/install', {});
      const steps = (installResp && Array.isArray(installResp.steps)) ? installResp.steps : [];
      const all_ok = !!(installResp && installResp.all_ok);
      setInstallResult({ ok: all_ok, steps, all_ok, ran_at: new Date().toISOString() });
      await loadChecklist();
      await loadStatus();
      await api.post('/asterisk/regenerate-config', {});
      const r = await api.get('/asterisk/post-install-checklist');
      setChecklist(r?.data || null);
      setInstallResult((cur: any) => cur ? { ...cur, ok: !!r?.all_ok, checklist: r?.data } : cur);
    } catch (e: any) { addToast('error', 'Install error: ' + e.message); }
    finally { setBusy(null); }
  };

  const regenerate = async () => {
    setBusy('regen');
    try {
      const r = await api.post('/asterisk/regenerate-config', {});
      setGen(r?.data || null);
      await loadChecklist();
    } catch (e: any) { addToast('error', 'Regenerate error: ' + e.message); }
    finally { setBusy(null); }
  };

  const save = async () => {
    setBusy('save');
    try {
      await api.put('/asterisk/settings', {
        sip_host: ast?.sip_host, sip_port: ast?.sip_port,
        ami_host: ast?.ami_host, ami_port: ast?.ami_port,
        ami_username: ast?.ami_username, ami_secret: ast?.ami_secret,
        dialplan_context: ast?.dialplan_context,
        retries_2_wait_seconds: ast?.retries_2_wait_seconds,
        retries_3_wait_seconds: ast?.retries_3_wait_seconds,
        poll_interval_seconds: ast?.poll_interval_seconds,
        max_retries: ast?.max_retries,
        use_existing_config: ast?.use_existing_config,
      });
      addToast('success', 'Saved. Run on the Asterisk host: asterisk -rx "reload"');
      await loadHealth();
    } catch (e: any) { addToast('error', 'Save error: ' + e.message); }
    finally { setBusy(null); }
  };

  const openAdd = () => { setDraft({ ...blankServer, name: '' }); setEditing(null); setShowAdd(true); };
  const openEdit = (s: SipServer) => { setDraft({ ...s }); setEditing(s); setShowAdd(true); };
  const closeModal = () => { setShowAdd(false); setEditing(null); setDraft({ ...blankServer }); };

  const saveServer = async () => {
    setBusy('save-server');
    try {
      const payload = {
        ...draft,
        ami_port: parseInt(draft.ami_port) || 5038,
        sip_port: parseInt(draft.sip_port) || 5060,
        priority: parseInt(draft.priority) || 10,
        is_active: !!draft.is_active,
      };
      if (editing) await api.put(`/asterisk/servers/${editing.id}`, payload);
      else await api.post('/asterisk/servers', payload);
      await loadServers(); await loadHealth();
      closeModal();
    } catch (e: any) { addToast('error', 'Save server failed: ' + (e?.message || 'unknown')); }
    finally { setBusy(null); }
  };

  const archiveServer = async (s: SipServer) => {
    if (!confirm(`Archive server "${s.name}"? Existing call history is preserved.`)) return;
    try { await api.delete(`/asterisk/servers/${s.id}`); await loadServers(); await loadHealth(); addToast('success', 'Server archived'); }
    catch (e: any) { addToast('error', 'Archive failed: ' + e.message); }
  };

  const testServer = async (s: SipServer) => {
    setBusy('test-' + s.id);
    setTestResult((cur) => ({ ...cur, [s.id]: null }));
    try {
      const r = await api.post(`/asterisk/servers/${s.id}/test`, {});
      setTestResult((cur) => ({ ...cur, [s.id]: r?.data || { ok: false, error: 'no response' } }));
      await loadHealth();
    } catch (e: any) { setTestResult((cur) => ({ ...cur, [s.id]: { ok: false, error: e.message } })); }
    finally { setBusy(null); }
  };

  const testDlrPush = async (s: SipServer) => {
    setBusy('dlr-' + s.id);
    setDlrTestResult((cur) => ({ ...cur, [s.id]: null }));
    try {
      // Synthetic DLR push probe — anywhere we have an active client_id in
      // sip_servers.last_dlr_push_route metadata would be a good first
      // target; fall back to client_id=1 (admin seed) for the smoke test.
      const r = await api.post('/asterisk/dlr-push-test', { client_id: 1, server_id: s.id, message_id: `PROBE_${s.id}_${Date.now()}` });
      setDlrTestResult((cur) => ({ ...cur, [s.id]: r?.data || { ok: false, error: 'no response' } }));
    } catch (e: any) { setDlrTestResult((cur) => ({ ...cur, [s.id]: { ok: false, error: e.message } })); }
    finally { setBusy(null); }
  };

  const previewRouting = async (strategy: 'priority' | 'round_robin') => {
    try {
      const r = await api.get(`/asterisk/routing-decision?strategy=${strategy}`);
      if (r?.success) setRoutingPreview({ strategy, server: r.data?.server });
    } catch (_) {}
  };

  const copyToClipboard = (s: string) => { try { navigator.clipboard?.writeText(s); } catch (_) {} };

  const healthDot = (status?: string) => {
    if (status === 'ok') return <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />;
    if (status === 'down') return <span className="inline-block w-2 h-2 rounded-full bg-rose-500" />;
    return <span className="inline-block w-2 h-2 rounded-full bg-gray-300" />;
  };

  const listenerBadge = (id: number) => {
    const ls = listenerState[id];
    if (!ls) return <Badge variant="default">—</Badge>;
    if (ls.logged_in) return <Badge variant="success" dot>Logged in</Badge>;
    if (ls.reconnect_pending) return <Badge variant="warning" dot>Reconnecting</Badge>;
    return <Badge variant="default" dot>Idle</Badge>;
  };

  const upCount = useMemo(() => servers.filter((s) => s.last_health_status === 'ok').length, [servers]);

  if (!ast) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-800">Asterisk / SIP Configuration</h1>
        <Card><div className="text-center py-12"><Loader className="animate-spin inline-block mr-2" />Loading…</div></Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2"><Server size={20} />Asterisk / SIP Configuration</h1>
          <p className="text-gray-500 mt-1">Multi-server fleet with per-server AMI listener, priority-based failover, and live DLR push to bound ESME clients.</p>
        </div>
        <Button variant="secondary" icon={<RefreshCw size={16} />} onClick={() => { loadStatus(); loadServers(); loadHealth(); loadChecklist(); }} loading={busy === 'load'}>Refresh</Button>
        <Button variant="secondary" icon={<Download size={16}/>} onClick={()=>exportCSV('asterisk_servers_export.csv',['Name','AMI Host:Port','SIP Host:Port','Transport','Priority','Health','Active'],servers.map(s=>[s.name,`${s.ami_host}:${s.ami_port}`,`${s.sip_host}:${s.sip_port}`,s.transport,String(s.priority),s.last_health_status||'unknown',s.is_active?'Yes':'No']))}>Export CSV</Button>
        <Button variant="secondary" icon={<Download size={16}/>} onClick={()=>exportExcel('asterisk_servers_export.xlsx','Asterisk SIP Servers',['Name','AMI Host:Port','SIP Host:Port','Transport','Priority','Health','Active'],servers.map(s=>[s.name,`${s.ami_host}:${s.ami_port}`,`${s.sip_host}:${s.sip_port}`,s.transport,String(s.priority),s.last_health_status||'unknown',s.is_active?'Yes':'No']))}>Export Excel</Button>
      </div>

      {/* Installation + Pre-flight checklist */}
      <Card
        title={ast.asterisk_installed && ast.asterisk_running ? 'Asterisk is installed ✓' : 'Asterisk is missing or not running'}
        subtitle={ast.asterisk_installed ? 'manager.conf + pjsip.conf + extensions.conf + modules.conf + rtp.conf live under /etc/asterisk (or data/asterisk fallback).' : 'Run the install + regenerate flow to bootstrap the bridge end-to-end.'}
      >
        <div className="flex flex-wrap items-center gap-2 mb-4">
          {ast.asterisk_installed ? <Badge variant="success" dot>Binary installed</Badge> : <Badge variant="danger" dot>Binary missing</Badge>}
          {ast.asterisk_running ? <Badge variant="success" dot>Process running</Badge> : <Badge variant="warning" dot>Process not running</Badge>}
          {ast.use_existing_config ? <Badge variant="default" dot>Use existing dialplan</Badge> : <Badge variant="info" dot>Hub-managed dialplan</Badge>}
        </div>
        {checklist && checklist.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-3">
            {checklist.map((c) => (
              <div key={c.label} className={`flex items-start gap-2 text-sm rounded-md px-3 py-2 ${c.ok ? 'bg-emerald-50 ring-1 ring-emerald-200' : 'bg-rose-50 ring-1 ring-rose-200'}`}>
                {c.ok ? <CheckCircle size={16} className="text-emerald-600 mt-0.5 shrink-0" /> : <XCircle size={16} className="text-rose-600 mt-0.5 shrink-0" />}
                <div>
                  <div className={`font-medium ${c.ok ? 'text-emerald-800' : 'text-rose-800'}`}>{c.label}</div>
                  <div className="text-xs text-gray-600">{c.detail}</div>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <Button icon={<Download size={16} />} onClick={tryInstall} loading={busy === 'install'}>
            {ast.asterisk_installed ? 'Re-run install + regenerate' : 'Install Asterisk'}
          </Button>
          <Button variant="secondary" icon={<BookOpen size={16} />} onClick={loadChecklist} loading={busy === 'load'}>Re-check prerequisites</Button>
          <Button variant="secondary" icon={<Layers size={16} />} onClick={regenerate} loading={busy === 'regen'} disabled={useExisting}
            title={useExisting ? 'Disabled: use-existing-config mode' : 'Writes pjsip + extensions + manager + modules + rtp.conf'}>
            Regenerate 5-file config
          </Button>
        </div>
      </Card>

      {/* Status row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white border rounded-xl p-4">
          <p className="text-xs text-gray-500 flex items-center gap-1"><ShieldCheck size={12} />Fleet health</p>
          <div className="mt-2">
            {servers.length === 0 ? <Badge variant="warning" dot>No servers</Badge>
              : upCount === servers.length ? <Badge variant="success" dot>{upCount} / {servers.length} up</Badge>
              : upCount === 0 ? <Badge variant="danger" dot>{servers.length} / {servers.length} down</Badge>
              : <Badge variant="warning" dot>{upCount} / {servers.length} up</Badge>}
          </div>
        </div>
        <div className="bg-white border rounded-xl p-4">
          <p className="text-xs text-gray-500">Active server</p>
          {servers.find((s) => s.last_health_status === 'ok')
            ? <p className="font-mono text-sm mt-2">{servers.find((s) => s.last_health_status === 'ok')!.ami_host}:{servers.find((s) => s.last_health_status === 'ok')!.ami_port}</p>
            : <p className="text-sm mt-2 text-gray-400">no healthy server</p>}
          <p className="text-xs text-gray-500 mt-1">pickServer('priority') default</p>
        </div>
        <div className="bg-white border rounded-xl p-4">
          <p className="text-xs text-gray-500">Retry policy</p>
          <p className="text-sm mt-2">2 retries → wait <strong>{ast.retries_2_wait_seconds}s</strong></p>
          <p className="text-sm">3 retries → wait <strong>{ast.retries_3_wait_seconds}s</strong></p>
          <p className="text-xs text-gray-500 mt-1">DLR poll: every {ast.poll_interval_seconds}s</p>
        </div>
        <div className="bg-white border rounded-xl p-4">
          <p className="text-xs text-gray-500">Last DLR push</p>
          {(() => {
            const last = servers.map((s) => s.last_dlr_pushed_at).filter(Boolean).sort().pop();
            return last
              ? <p className="text-sm mt-2">{new Date(last as string).toLocaleString()}</p>
              : <p className="text-sm mt-2 text-gray-400">never</p>;
          })()}
          <p className="text-xs text-gray-500 mt-1">Node → Java /dlr_event</p>
        </div>
      </div>

      {/* Tips-to-fix panel */}
      {tips.length > 0 && (
        <Card
          title={`Tips to fix (${tips.length})`}
          action={<span className="text-xs font-medium text-gray-600">{severityCounts.critical || 0}C · {severityCounts.high || 0}H · {severityCounts.medium || 0}M · {severityCounts.warning || 0}W · {severityCounts.low || 0}L</span>}
              subtitle={`${severityCounts.critical || 0} critical · ${severityCounts.high || 0} high · ${severityCounts.medium || 0} medium · ${severityCounts.warning || 0} warning · ${severityCounts.low || 0} low`}>
          <button className="text-xs text-blue-600 hover:underline mb-2" onClick={() => setTipsOpen(!tipsOpen)}>{tipsOpen ? 'Collapse' : 'Expand'}</button>
          {tipsOpen && (
            <div className="space-y-2">
              {tips.map((t) => {
                const sty = severityStyles[t.severity] || severityStyles.low;
                return (
                  <div key={`${t.code}-${t.message}`} className={`rounded-md p-3 ${sty.bg} ring-1 ${sty.ring}`}>
                    <div className="flex items-center justify-between">
                      <div className={`font-semibold text-sm ${sty.fg}`}>
                        <span className="uppercase mr-2 text-xs">{t.severity}</span>
                        {t.code}
                      </div>
                      {t.affected_servers && t.affected_servers.length > 0 && (
                        <div className="text-xs text-gray-700">affects server{t.affected_servers.length > 1 ? 's' : ''} #{t.affected_servers.join(', #')}</div>
                      )}
                    </div>
                    <p className="text-sm text-gray-800 mt-1">{t.message}</p>
                    <div className="mt-2 flex items-start gap-2">
                      <code className="flex-1 bg-white/60 ring-1 ring-black/10 px-2 py-1 rounded text-xs font-mono whitespace-pre-wrap break-all">{t.action}</code>
                      <button title="Copy action" onClick={() => copyToClipboard(t.action)} className="p-1 rounded hover:bg-white/70"><CopyIcon size={14} /></button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {/* Per-step install result (rendered after a successful POST /asterisk/install) */}
      {installResult && Array.isArray(installResult.steps) && installResult.steps.length > 0 && (
        <Card
          title={`Install steps (${installResult.steps.length})`}
          subtitle={`Last run at ${installResult.ran_at ? new Date(installResult.ran_at).toLocaleString() : 'unknown'} — ${installResult.all_ok ? 'all passed' : 'one or more steps failed'}`}
        >
          <div className="space-y-1">
            {installResult.steps.map((s: any) => (
              <div key={s.step} className={`flex items-start gap-2 text-sm rounded-md px-3 py-2 ${s.ok ? 'bg-emerald-50 ring-1 ring-emerald-200' : 'bg-rose-50 ring-1 ring-rose-200'}`}>
                {s.ok
                  ? <CheckCircle size={16} className="text-emerald-600 mt-0.5 shrink-0" />
                  : <XCircle size={16} className="text-rose-600 mt-0.5 shrink-0" />}
                <div className="flex-1">
                  <div className={`font-medium ${s.ok ? 'text-emerald-800' : 'text-rose-800'}`}>{s.step}</div>
                  {s.path && <div className="text-xs text-gray-600 font-mono">path = {s.path}</div>}
                  {s.installed !== undefined && <div className="text-xs text-gray-600">installed={String(s.installed)} running={String(s.running)}</div>}
                  {s.error && <div className="text-xs text-rose-700 font-mono mt-0.5">{s.error}</div>}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Multi-server fleet */}
      <Card title="SIP Servers" subtitle="Each server runs its own AMI listener. pickServer() chooses the highest-priority healthy server; on failure the next retry skips the broken one. Listener badge shows live AMI socket state.">
        <div className="flex justify-between items-center mb-3">
          <div className="flex gap-2">
            <Button variant="secondary" icon={<Activity size={14} />} onClick={loadHealth}>Re-probe all</Button>
            <Button variant="secondary" onClick={() => previewRouting('priority')}>Preview pickServer('priority')</Button>
            <Button variant="secondary" onClick={() => previewRouting('round_robin')}>Preview pickServer('round_robin')</Button>
          </div>
          <Button icon={<Plus size={14} />} onClick={openAdd}>Add server</Button>
        </div>

        {routingPreview && (
          <div className="text-xs bg-blue-50 border border-blue-200 rounded p-2 mb-3 text-blue-800">
            strategy=<code>{routingPreview.strategy}</code> would pick <strong>{routingPreview.server?.name || 'NONE'}</strong> ({routingPreview.server?.ami_host}:{routingPreview.server?.ami_port}, priority {routingPreview.server?.priority})
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-xs uppercase">
              <tr>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-left">Listener</th>
                <th className="px-3 py-2 text-left">Name</th>
                <th className="px-3 py-2 text-left">AMI</th>
                <th className="px-3 py-2 text-left">SIP</th>
                <th className="px-3 py-2 text-left">Priority</th>
                <th className="px-3 py-2 text-left">Last probe</th>
                <th className="px-3 py-2 text-left">Last DLR push</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {servers.map((s) => (
                <tr key={s.id} className="border-t hover:bg-gray-50">
                  <td className="px-3 py-2">{healthDot(s.last_health_status)} <Badge variant={s.is_active ? 'success' : 'default'}>{s.is_active ? 'active' : 'archived'}</Badge></td>
                  <td className="px-3 py-2">{listenerBadge(s.id)}</td>
                  <td className="px-3 py-2 font-medium">{s.name}</td>
                  <td className="px-3 py-2 font-mono text-xs">{s.ami_host}:{s.ami_port}</td>
                  <td className="px-3 py-2 font-mono text-xs">{s.sip_host}:{s.sip_port}<span className="text-gray-400 ml-1">/{s.transport}</span></td>
                  <td className="px-3 py-2">{s.priority}</td>
                  <td className="px-3 py-2 text-xs text-gray-500">{s.last_health_latency_ms != null ? `${s.last_health_latency_ms}ms` : '—'}{s.last_health_at && <span className="ml-1">{new Date(s.last_health_at).toLocaleTimeString()}</span>}</td>
                  <td className="px-3 py-2 text-xs text-gray-500">
                    {s.last_dlr_pushed_at ? <span>{new Date(s.last_dlr_pushed_at).toLocaleTimeString()}{s.last_dlr_push_route ? <span className="ml-1 font-mono">({s.last_dlr_push_route})</span> : null}</span> : '—'}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button onClick={() => testServer(s)} className="text-blue-600 hover:underline mr-3" disabled={busy === 'test-' + s.id}><Zap size={12} className="inline" /> Test</button>
                    <button onClick={() => testDlrPush(s)} className="text-indigo-600 hover:underline mr-3" disabled={busy === 'dlr-' + s.id}><Send size={12} className="inline" /> DLR</button>
                    <button onClick={() => openEdit(s)} className="text-gray-600 hover:underline mr-3"><Edit3 size={12} className="inline" /> Edit</button>
                    {s.is_active && (<button onClick={() => archiveServer(s)} className="text-rose-600 hover:underline"><Trash2 size={12} className="inline" /> Archive</button>)}
                  </td>
                </tr>
              ))}
              {servers.length === 0 && (
                <tr><td colSpan={9} className="px-3 py-8 text-center text-gray-400"><AlertTriangle size={16} className="inline mr-2" />No SIP servers configured. Click "Add server" to bootstrap the fleet.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {Object.entries(testResult).map(([id, r]) => r && (
          <div key={id} className={`text-xs mt-2 px-3 py-2 rounded ${r.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'}`}>
            <strong>Server #{id} AMI test</strong>: {r.ok ? `OK (${r.latency_ms ?? '?'}ms)` : `FAIL — ${r.error || 'unknown'}`}
          </div>
        ))}
        {Object.entries(dlrTestResult).map(([id, r]) => r && (
          <div key={`dlr-${id}`} className={`text-xs mt-2 px-3 py-2 rounded ${r.ok ? 'bg-indigo-50 text-indigo-800' : 'bg-rose-50 text-rose-800'}`}>
            <strong>Server #{id} DLR push probe</strong>: {r.ok ? `OK route=<code>${r.route || 'unknown'}</code>` : `FAIL — ${r.error || r.route || 'unknown'}`}
          </div>
        ))}
      </Card>

      {/* Add / Edit modal */}
      {showAdd && (
        <Modal isOpen={showAdd} onClose={closeModal} title={editing ? `Edit SIP server #${editing.id}` : 'Add SIP server'}>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Name" value={draft.name || ''} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="primary / failover-us-east" />
            <Input label="Priority (lower = higher priority)" type="number" value={draft.priority ?? 10} onChange={(e) => setDraft({ ...draft, priority: parseInt(e.target.value) || 10 })} />
            <Input label="AMI host" value={draft.ami_host || ''} onChange={(e) => setDraft({ ...draft, ami_host: e.target.value })} placeholder="198.27.80.229" />
            <Input label="AMI port" type="number" value={draft.ami_port ?? 5038} onChange={(e) => setDraft({ ...draft, ami_port: parseInt(e.target.value) || 5038 })} />
            <Input label="AMI username" value={draft.ami_username || 'net2app'} onChange={(e) => setDraft({ ...draft, ami_username: e.target.value })} />
            <Input label="AMI secret" type="password" value={draft.ami_secret || ''} onChange={(e) => setDraft({ ...draft, ami_secret: e.target.value })} />
            <Input label="SIP host (pjsip bind)" value={draft.sip_host || ''} onChange={(e) => setDraft({ ...draft, sip_host: e.target.value })} placeholder="198.27.80.229" />
            <Input label="SIP port" type="number" value={draft.sip_port ?? 5060} onChange={(e) => setDraft({ ...draft, sip_port: parseInt(e.target.value) || 5060 })} />
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Transport</label>
              <div className="flex gap-2">
                {(['udp', 'tcp', 'tls'] as const).map((t) => (
                  <label key={t} className="flex items-center gap-1 text-sm"><input type="radio" name="transport" value={t} checked={draft.transport === t} onChange={() => setDraft({ ...draft, transport: t })} />{t.toUpperCase()}</label>
                ))}
              </div>
            </div>
            <Input label="Dialplan context" value={draft.dialplan_context || 'net2app-otp'} onChange={(e) => setDraft({ ...draft, dialplan_context: e.target.value })} />
            <label className="flex items-center gap-2 mt-3 text-sm">
              <input type="checkbox" checked={!!draft.is_active} onChange={(e) => setDraft({ ...draft, is_active: e.target.checked })} />Active (eligible for pickServer)
            </label>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="secondary" onClick={closeModal}>Cancel</Button>
            <Button onClick={saveServer} loading={busy === 'save-server'}>{editing ? 'Save' : 'Create'}</Button>
          </div>
        </Modal>
      )}

      {/* Detection mode */}
      <Card title="Detection mode" subtitle="By default the bridge reads your existing dialplan over AMI and never overwrites files on disk. Opt in to generation only when you're on a fresh install or want a Hub-managed dialplan.">
        <label className="flex items-start gap-3 cursor-pointer">
          <input type="checkbox" checked={useExisting} onChange={(e) => { const v = e.target.checked; setUseExisting(v); setAst({ ...ast, use_existing_config: v }); }} className="mt-1 w-4 h-4 rounded" />
          <div>
            <p className="font-medium text-gray-800">Use existing Asterisk configuration</p>
            <p className="text-sm text-gray-600 mt-1">When checked, the bridge connects to AMI on each registered server and never rewrites pjsip.conf or extensions.conf. The SIP Servers list above is the source of truth for fleet topology.</p>
          </div>
        </label>
      </Card>

      {/* Legacy single-row settings (kept for backwards-compat) */}
      <Card title="Legacy settings (single-row fallback)">
        <div className="grid grid-cols-2 gap-4">
          <Input label="AMI host" value={ast.ami_host || '127.0.0.1'} onChange={(e) => setAst({ ...ast, ami_host: e.target.value })} />
          <Input label="AMI port" type="number" value={ast.ami_port || 5038} onChange={(e) => setAst({ ...ast, ami_port: parseInt(e.target.value) })} />
          <Input label="AMI username" value={ast.ami_username || 'net2app'} onChange={(e) => setAst({ ...ast, ami_username: e.target.value })} />
          <Input label="AMI secret" type="password" value={ast.ami_secret || ''} onChange={(e) => setAst({ ...ast, ami_secret: e.target.value })} />
          <Input label="SIP host (pjsip bind)" value={ast.sip_host || '127.0.0.1'} onChange={(e) => setAst({ ...ast, sip_host: e.target.value })} />
          <Input label="SIP port" type="number" value={ast.sip_port || 5060} onChange={(e) => setAst({ ...ast, sip_port: parseInt(e.target.value) })} />
          <Input label="Dialplan context" value={ast.dialplan_context || 'net2app-otp'} onChange={(e) => setAst({ ...ast, dialplan_context: e.target.value })} />
          <Input label="Max retries" type="number" value={ast.max_retries || 3} onChange={(e) => setAst({ ...ast, max_retries: parseInt(e.target.value) })} />
          <Input label="Retry-2 wait (s)" type="number" value={ast.retries_2_wait_seconds || 70} onChange={(e) => setAst({ ...ast, retries_2_wait_seconds: parseInt(e.target.value) })} />
          <Input label="Retry-3 wait (s)" type="number" value={ast.retries_3_wait_seconds || 105} onChange={(e) => setAst({ ...ast, retries_3_wait_seconds: parseInt(e.target.value) })} />
          <Input label="DLR poll interval (s)" type="number" value={ast.poll_interval_seconds || 5} onChange={(e) => setAst({ ...ast, poll_interval_seconds: parseInt(e.target.value) })} />
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="secondary" icon={<RefreshCw size={16} />} onClick={regenerate} loading={busy === 'regen'} disabled={useExisting}
            title={useExisting ? 'Disabled: use-existing-config mode' : 'Writes 5 files then core reload'}>
            Regenerate config
          </Button>
          <Button onClick={save} loading={busy === 'save'}>Save</Button>
        </div>
      </Card>

      {gen && (
        <Card title="Last regeneration">
          <p className="text-sm text-gray-700">Wrote <strong>{gen.files?.length || 0}</strong> file(s) under <code>{gen.path_base}</code>:</p>
          <ul className="text-sm font-mono text-gray-700 mt-2">{gen.files?.map?.((f: string) => <li key={f}>• {f}</li>) || null}</ul>
          {gen.manager_conf_path && <p className="text-xs text-gray-500 mt-2">manager.conf: <code>{gen.manager_conf_path}</code></p>}
          <p className="text-xs text-gray-500 mt-3">On Asterisk: <code>asterisk -rx reload</code>. Settings: see <code>pjsip.conf</code> + <code>extensions.conf</code> for the dialplan Node originated against.</p>
        </Card>
      )}
    </div>
  );
};
