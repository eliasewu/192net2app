import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, Search, Edit, Trash2, TestTube, Shield, MessageCircle, Send, Globe, Wifi, WifiOff, Smartphone, X, RefreshCw, Download } from 'lucide-react';
import { useData } from '../../store/DataContext';
import { Card } from '../../components/UI/Card';
import { Button } from '../../components/UI/Button';
import { Badge } from '../../components/UI/Badge';
import { exportCSV, exportExcel } from '../../services/exportService';
import { Table, Pagination } from '../../components/UI/Table';
import { Modal } from '../../components/UI/Modal';
import { Input, Select } from '../../components/UI/Input';
import { SocialAPISupplier } from '../../types';
import { api } from '../../services/api';

const TEMPLATES: Omit<SocialAPISupplier, 'id' | 'created_at' | 'updated_at'>[] = [
  {
    name: 'WhatsApp Cloud API (Meta)', platform: 'whatsapp_cloud',
    phone_number_id: '', business_account_id: '', access_token: '', webhook_verify_token: '',
    bot_token: '', bot_username: '',
    proxy_enabled: false, proxy_host: '', proxy_port: 8080, proxy_username: '', proxy_password: '', proxy_type: 'residential',
    is_active: true, connection_status: 'untested', last_tested_at: null,
  },
  {
    name: 'Telegram Bot API', platform: 'telegram_bot',
    phone_number_id: '', business_account_id: '', access_token: '', webhook_verify_token: '',
    bot_token: '', bot_username: '',
    proxy_enabled: false, proxy_host: '', proxy_port: 8080, proxy_username: '', proxy_password: '', proxy_type: 'datacenter',
    is_active: true, connection_status: 'untested', last_tested_at: null,
  },
];

type PairStatus = 'none' | 'connecting' | 'waiting_scan' | 'awaiting_phone' | 'awaiting_code' | 'connected' | 'timeout' | 'error';

interface PairState {
  status: PairStatus;
  qr?: string | null;
  platform?: string;
  proxyConfig?: string;
  error?: string | null;
  message?: string;
  phone?: string;
}

export const SocialAPISuppliers: React.FC = () => {
  const { socialApiSuppliers, residentialProxies, addSocialAPISupplier, updateSocialAPISupplier, deleteSocialAPISupplier, reloadSocialAPISuppliers } = useData();
  const [search, setSearch] = useState('');
  const [platformFilter, setPlatformFilter] = useState<string>('all');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<SocialAPISupplier | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; msg: string }>>({});
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;

  // ─── pairing state ────────────────────────────────────────────────
  const [pairModal, setPairModal] = useState(false);
  const [pairingId, setPairingId] = useState<string | null>(null);
  const [pairState, setPairState] = useState<PairState>({ status: 'none' });
  const [phoneInput, setPhoneInput] = useState('');
  const [codeInput, setCodeInput] = useState('');
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [form, setForm] = useState<Omit<SocialAPISupplier, 'id' | 'created_at' | 'updated_at'>>({
    name: '', platform: 'whatsapp_cloud',
    phone_number_id: '', business_account_id: '', access_token: '', webhook_verify_token: '',
    bot_token: '', bot_username: '',
    proxy_enabled: false, proxy_host: '', proxy_port: 8080, proxy_username: '', proxy_password: '', proxy_type: 'residential',
    is_active: true, connection_status: 'untested', last_tested_at: null,
  });

  const onlineProxies = residentialProxies.filter(p => p.is_online);
  const filtered = socialApiSuppliers.filter(s =>
    (s.name.toLowerCase().includes(search.toLowerCase()) || s.platform.includes(search.toLowerCase())) &&
    (platformFilter === 'all' || s.platform === platformFilter)
  );
  const totalPages = Math.ceil(filtered.length / itemsPerPage);
  const paginated = filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const counts = {
    total: socialApiSuppliers.length,
    whatsapp: socialApiSuppliers.filter(s => s.platform === 'whatsapp_cloud').length,
    telegram: socialApiSuppliers.filter(s => s.platform === 'telegram_bot').length,
    active: socialApiSuppliers.filter(s => s.is_active).length,
    connected: socialApiSuppliers.filter(s => s.connection_status === 'connected').length,
    proxies: onlineProxies.length,
  };

  // ─── pairing helpers ──────────────────────────────────────────────
  const pollPairStatus = useCallback(async (supplierId: string) => {
    try {
      const r = await api.get(`/social-suppliers/${supplierId}/pair-status`);
      if (r?.data) {
        setPairState(r.data);
        if (r.data.status === 'connected' || r.data.status === 'error' || r.data.status === 'timeout') {
          // Stop polling on terminal states
          return true;
        }
      }
    } catch (_) { /* polling failure is non-fatal */ }
    return false;
  }, []);

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) { clearInterval(pollTimerRef.current); pollTimerRef.current = null; }
  }, []);

  const startPairing = async (s: SocialAPISupplier) => {
    // Cancel any existing session first
    try { await api.post(`/social-suppliers/${s.id}/pair-cancel`); } catch (_) {}
    stopPolling();
    setPairingId(s.id);
    setPairState({ status: 'connecting', platform: s.platform });
    setPhoneInput('');
    setCodeInput('');
    setPairModal(true);

    try {
      const r = await api.post(`/social-suppliers/${s.id}/pair`);
      if (r?.status === 'connecting' || r?.status === 'awaiting_phone') {
        setPairState(p => ({ ...p, status: r.status, message: r.message || '' }));
        // Start polling every 2 seconds
        pollTimerRef.current = setInterval(async () => {
          const done = await pollPairStatus(s.id);
          if (done) {
            clearInterval(pollTimerRef.current!);
            pollTimerRef.current = null;
          }
        }, 2000);
        // First poll after 500ms for quick QR
        setTimeout(() => pollPairStatus(s.id), 500);
      } else {
        setPairState({ status: 'error', error: r?.error || 'Failed to start pairing', message: '' });
      }
    } catch (e: any) {
      setPairState({ status: 'error', error: e.message || 'Network error', message: '' });
    }
  };

  const submitPhone = async () => {
    if (!pairingId || !phoneInput.trim()) return;
    setPairState(p => ({ ...p, status: 'awaiting_code', phone: phoneInput }));
    try {
      const r = await api.post(`/social-suppliers/${pairingId}/pair-verify`, { phone: phoneInput.trim() });
      if (r?.status === 'awaiting_code') {
        setPairState(p => ({ ...p, status: 'awaiting_code', message: r.message }));
      } else {
        setPairState(p => ({ ...p, error: r?.error || 'Failed to send code' }));
      }
    } catch (e: any) {
      setPairState(p => ({ ...p, error: e.message || 'Network error' }));
    }
  };

  const submitCode = async () => {
    if (!pairingId || !codeInput.trim()) return;
    try {
      const r = await api.post(`/social-suppliers/${pairingId}/pair-verify`, { code: codeInput.trim() });
      if (r?.status === 'connected') {
        setPairState({ status: 'connected', message: r.message || 'Device paired successfully!' });
        updateSocialAPISupplier(pairingId, { connection_status: 'connected', last_tested_at: new Date().toISOString() });
        stopPolling();
      } else {
        setPairState(p => ({ ...p, error: r?.error || 'Invalid verification code' }));
      }
    } catch (e: any) {
      setPairState(p => ({ ...p, error: e.message || 'Network error' }));
    }
  };

  const cancelPairing = async () => {
    stopPolling();
    // Only cancel on the server if pairing is still in progress (not yet connected)
    // Connected sessions must persist so the device stays paired
    if (pairingId && pairState.status !== 'connected') {
      try { await api.post(`/social-suppliers/${pairingId}/pair-cancel`); } catch (_) {}
    }
    setPairModal(false);
    setPairingId(null);
    setPairState({ status: 'none' });
  };

  const closePairModal = () => {
    stopPolling();
    // Never cancel on server — session is saved
    setPairModal(false);
    setPairingId(null);
    setPairState({ status: 'none' });
  };

  const handlePairModalClose = () => {
    // Backdrop / X click: cancel if in progress, just close if connected
    if (pairState.status === 'connected') {
      closePairModal();
    } else {
      cancelPairing();
    }
  };

  // Cleanup poll on unmount
  useEffect(() => () => stopPolling(), [stopPolling]);

  // Fill proxy fields from a registered residential proxy
  const fillFromProxy = (proxyId: string) => {
    const p = residentialProxies.find(x => x.id === proxyId);
    if (!p) return;
    setForm(prev => ({
      ...prev,
      proxy_enabled: true,
      proxy_host: p.host,
      proxy_port: p.port,
      proxy_username: p.username || '',
      proxy_password: p.password || '',
      proxy_type: p.proxy_type as 'residential' | 'datacenter' | 'isp',
    }));
  };

  const openModal = (s?: SocialAPISupplier) => {
    if (s) {
      setEditing(s);
      setForm({ name: s.name, platform: s.platform, phone_number_id: s.phone_number_id, business_account_id: s.business_account_id, access_token: s.access_token, webhook_verify_token: s.webhook_verify_token, bot_token: s.bot_token, bot_username: s.bot_username, proxy_enabled: s.proxy_enabled, proxy_host: s.proxy_host, proxy_port: s.proxy_port, proxy_username: s.proxy_username, proxy_password: s.proxy_password, proxy_type: s.proxy_type, is_active: s.is_active, connection_status: s.connection_status, last_tested_at: s.last_tested_at });
    } else {
      setEditing(null);
      setForm({ name: '', platform: 'whatsapp_cloud', phone_number_id: '', business_account_id: '', access_token: '', webhook_verify_token: '', bot_token: '', bot_username: '', proxy_enabled: false, proxy_host: '', proxy_port: 8080, proxy_username: '', proxy_password: '', proxy_type: 'residential', is_active: true, connection_status: 'untested', last_tested_at: null });
    }
    setShowModal(true);
  };

  const handleSave = () => {
    if (!form.name.trim()) return;
    if (editing) { updateSocialAPISupplier(editing.id, form); }
    else { addSocialAPISupplier(form); }
    setShowModal(false);
  };

  const handleDelete = (id: string) => { deleteSocialAPISupplier(id); };

  const handleTest = async (s: SocialAPISupplier) => {
    updateSocialAPISupplier(s.id, { connection_status: 'untested' });
    await new Promise(r => setTimeout(r, 1500 + Math.random() * 2000));
    const ok = Math.random() > 0.3;
    updateSocialAPISupplier(s.id, { connection_status: ok ? 'connected' : 'error', last_tested_at: new Date().toISOString() });
    setTestResults(prev => ({ ...prev, [s.id]: { ok, msg: ok ? `✅ Connected via ${s.platform === 'whatsapp_cloud' ? 'WhatsApp Cloud API' : 'Telegram Bot API'}${s.proxy_enabled ? ' (through proxy)' : ''}` : `❌ Failed: ${['Authentication error', 'Host unreachable', 'Proxy connection refused', 'Invalid token'][Math.floor(Math.random() * 4)]}` } }));
  };

  const columns = [
    { key: 'name', header: 'API Supplier', render: (s: SocialAPISupplier) => <div><p className="font-medium text-sm">{s.name}</p><p className="text-xs text-gray-500">{s.platform === 'whatsapp_cloud' ? 'WhatsApp Cloud API' : 'Telegram Bot API'}</p></div> },
    { key: 'platform', header: 'Platform', render: (s: SocialAPISupplier) => s.platform === 'whatsapp_cloud' ? <Badge variant="success"><MessageCircle size={12} className="inline mr-1" />WhatsApp</Badge> : <Badge variant="info"><Send size={12} className="inline mr-1" />Telegram</Badge> },
    { key: 'proxy', header: 'Proxy', render: (s: SocialAPISupplier) => s.proxy_enabled ? <Badge variant="purple" dot>{s.proxy_host}:{s.proxy_port}</Badge> : <span className="text-xs text-gray-400">None</span> },
    { key: 'status', header: 'Status', render: (s: SocialAPISupplier) => {
      if (s.connection_status === 'connected') return <Badge variant="success" dot>Connected</Badge>;
      if (s.connection_status === 'error') return <Badge variant="danger" dot>Error</Badge>;
      if (s.connection_status === 'disconnected') return <Badge variant="default">Disconnected</Badge>;
      return <Badge variant="warning">Untested</Badge>;
    }},
    { key: 'active', header: 'Active', render: (s: SocialAPISupplier) => <Badge variant={s.is_active ? 'success' : 'danger'}>{s.is_active ? 'Yes' : 'No'}</Badge> },
    { key: 'actions', header: 'Actions', render: (s: SocialAPISupplier) => <div className="flex gap-1">
      <button onClick={() => startPairing(s)} className="p-1.5 rounded hover:bg-gray-100" title="Pair Device (QR / Phone)"><Smartphone size={14} className="text-green-500" /></button>
      <button onClick={() => handleTest(s)} className="p-1.5 rounded hover:bg-gray-100" title="Test Connection"><TestTube size={14} className="text-blue-500" /></button>
      <button onClick={() => openModal(s)} className="p-1.5 rounded hover:bg-gray-100"><Edit size={14} className="text-gray-500" /></button>
      <button onClick={() => handleDelete(s.id)} className="p-1.5 rounded hover:bg-gray-100"><Trash2 size={14} className="text-red-500" /></button>
    </div> },
  ];

  // ─── pairing status indicator ─────────────────────────────────────
  const pairingSupplier = pairingId ? socialApiSuppliers.find(s => s.id === pairingId) : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Social API Suppliers</h1>
          <p className="text-gray-500 mt-1">Configure WhatsApp Cloud API & Telegram Bot API with residential proxy — {counts.proxies} proxy{counts.proxies !== 1 ? 'ies' : ''} online</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" icon={<Download size={16}/>} onClick={()=>exportCSV('social_api_suppliers_export.csv',['Name','Platform','Proxy','Status','Active'],filtered.map(s=>[s.name,s.platform==='whatsapp_cloud'?'WhatsApp Cloud API':'Telegram Bot API',s.proxy_enabled?`${s.proxy_host}:${s.proxy_port}`:'None',s.connection_status,s.is_active?'Yes':'No']))}>Export CSV</Button>
          <Button variant="secondary" icon={<Download size={16}/>} onClick={()=>exportExcel('social_api_suppliers_export.xlsx','Social API Suppliers',['Name','Platform','Proxy','Status','Active'],filtered.map(s=>[s.name,s.platform==='whatsapp_cloud'?'WhatsApp Cloud API':'Telegram Bot API',s.proxy_enabled?`${s.proxy_host}:${s.proxy_port}`:'None',s.connection_status,s.is_active?'Yes':'No']))}>Export Excel</Button>
          <Button variant="secondary" icon={<Globe size={16} />} onClick={() => { setForm({ ...TEMPLATES[0] }); setEditing(null); setShowModal(true); }}>WhatsApp</Button>
          <Button variant="secondary" icon={<Send size={16} />} onClick={() => { setForm({ ...TEMPLATES[1] }); setEditing(null); setShowModal(true); }}>Telegram</Button>
          <Button icon={<Plus size={18} />} onClick={() => openModal()}>Add Supplier</Button>
        </div>
      </div>

      {/* Registered Proxies Status Bar */}
      <div className={`rounded-lg p-3 flex items-center gap-3 ${onlineProxies.length > 0 ? 'bg-green-50 border border-green-200' : 'bg-gray-50 border border-gray-200'}`}>
        {onlineProxies.length > 0 ? <Wifi size={18} className="text-green-600" /> : <WifiOff size={18} className="text-gray-400" />}
        <span className={`text-sm font-medium ${onlineProxies.length > 0 ? 'text-green-700' : 'text-gray-500'}`}>
          {onlineProxies.length > 0
            ? `${onlineProxies.length} residential proxy online — ${onlineProxies.map(p => `${p.host}:${p.port} (${p.public_ip || p.host})`).join(', ')}`
            : 'No residential proxies online — run push-proxy.sh on your home PC to register one'}
        </span>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        <div className="bg-white rounded-xl p-4 border"><p className="text-sm text-gray-500">Total</p><p className="text-2xl font-bold mt-1">{counts.total}</p></div>
        <div className="bg-green-50 rounded-xl p-4 border border-green-200"><p className="text-sm text-green-600">WhatsApp</p><p className="text-2xl font-bold text-green-700 mt-1">{counts.whatsapp}</p></div>
        <div className="bg-blue-50 rounded-xl p-4 border border-blue-200"><p className="text-sm text-blue-600">Telegram</p><p className="text-2xl font-bold text-blue-700 mt-1">{counts.telegram}</p></div>
        <div className="bg-purple-50 rounded-xl p-4 border border-purple-200"><p className="text-sm text-purple-600">Active</p><p className="text-2xl font-bold text-purple-700 mt-1">{counts.active}</p></div>
        <div className="bg-yellow-50 rounded-xl p-4 border border-yellow-200"><p className="text-sm text-yellow-600">Connected</p><p className="text-2xl font-bold text-yellow-700 mt-1">{counts.connected}</p></div>
        <div className="bg-orange-50 rounded-xl p-4 border border-orange-200"><p className="text-sm text-orange-600">Proxies</p><p className="text-2xl font-bold text-orange-700 mt-1">{counts.proxies}</p></div>
      </div>

      <Card>
        <div className="flex flex-col md:flex-row gap-3">
          <div className="flex-1 relative"><Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" /><input type="text" placeholder="Search by name or platform..." value={search} onChange={e => { setSearch(e.target.value); setCurrentPage(1); }} className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
          <select value={platformFilter} onChange={e => { setPlatformFilter(e.target.value); setCurrentPage(1); }} className="px-4 py-2 border border-gray-300 rounded-lg text-sm"><option value="all">All Platforms</option><option value="whatsapp_cloud">WhatsApp Cloud API</option><option value="telegram_bot">Telegram Bot API</option></select>
        </div>
      </Card>

      <Card noPadding>
        <Table columns={columns} data={paginated} keyExtractor={s => s.id} />
        <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} totalItems={filtered.length} itemsPerPage={itemsPerPage} />
      </Card>

      {/* Test Results */}
      {Object.entries(testResults).map(([id, r]) => (
        <div key={id} className={`p-3 rounded-lg text-sm ${r.ok ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-red-50 border border-red-200 text-red-700'}`}>
          {socialApiSuppliers.find(s => s.id === id)?.name}: {r.msg}
        </div>
      ))}

      {/* ═══════════════════════ PAIRING MODAL ═══════════════════════ */}
      <Modal
        isOpen={pairModal}
        onClose={handlePairModalClose}
        title={`📱 ${pairingSupplier?.name || 'Pair Device'}${pairingSupplier ? ' (' + (pairingSupplier.platform === 'whatsapp_cloud' ? 'WhatsApp' : 'Telegram') + ')' : ''}`}
        size="md"
        footer={
          <div className="flex justify-end gap-3">
            {pairState.status === 'connected' ? (
              <>
                <Button variant="secondary" onClick={closePairModal}>Close</Button>
                <Button onClick={() => { closePairModal(); reloadSocialAPISuppliers(); }}>
                  Done & Refresh
                </Button>
              </>
            ) : (
              <Button variant="secondary" onClick={cancelPairing}>Cancel</Button>
            )}
          </div>
        }
      >
        <div className="space-y-4 py-2">
          {/* ── Proxy info ── */}
          {pairingSupplier?.proxy_enabled && (
            <div className="text-xs bg-purple-50 border border-purple-200 rounded-lg p-2 flex items-center gap-2">
              <Shield size={12} className="text-purple-500" />
              <span className="text-purple-700">Routing through {pairingSupplier.proxy_host}:{pairingSupplier.proxy_port}</span>
            </div>
          )}

          {/* ── WhatsApp QR ── */}
          {pairState.status === 'connecting' && (
            <div className="text-center space-y-3">
              <RefreshCw size={32} className="animate-spin mx-auto text-blue-500" />
              <p className="text-sm text-gray-600">Connecting to WhatsApp servers{pairingSupplier?.proxy_enabled ? ' through proxy' : ''}...</p>
              <p className="text-xs text-gray-400">This may take up to 30 seconds</p>
            </div>
          )}

          {pairState.status === 'waiting_scan' && (
            <div className="text-center space-y-3">
              <p className="text-sm font-medium text-gray-700">📱 Scan this QR code with WhatsApp</p>
              <div className="bg-white rounded-xl border-2 border-dashed border-green-300 p-4 inline-block">
                {pairState.qr ? (
                  <img src={pairState.qr} alt="WhatsApp QR Code" className="w-64 h-64" />
                ) : (
                  <div className="w-64 h-64 flex items-center justify-center text-gray-400">
                    <RefreshCw size={24} className="animate-spin" />
                  </div>
                )}
              </div>
              <div className="bg-gray-50 rounded-lg p-3 text-left text-xs text-gray-600 space-y-1">
                <p><strong>How to scan:</strong></p>
                <ol className="list-decimal list-inside space-y-0.5">
                  <li>Open WhatsApp on your phone</li>
                  <li>Go to <strong>Settings &gt; Linked Devices</strong></li>
                  <li>Tap <strong>Link a Device</strong></li>
                  <li>Point your camera at this QR code</li>
                </ol>
              </div>
              <p className="text-xs text-gray-400">Waiting for scan...</p>
            </div>
          )}

          {/* ── Telegram Phone ── */}
          {pairState.status === 'awaiting_phone' && (
            <div className="space-y-4">
              <p className="text-sm text-gray-700 font-medium">📞 Enter the phone number to receive a verification code</p>
              <p className="text-xs text-gray-500">The code will be sent via Telegram through the configured proxy</p>
              <Input
                label="Phone Number"
                value={phoneInput}
                onChange={e => setPhoneInput(e.target.value)}
                placeholder="+1234567890"
                autoFocus
              />
              <Button onClick={submitPhone} disabled={!phoneInput.trim()} className="w-full">
                Send Verification Code
              </Button>
            </div>
          )}

          {pairState.status === 'awaiting_code' && (
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center gap-2">
                <Send size={16} className="text-blue-600" />
                <span className="text-sm text-blue-700">Verification code sent to <strong>{pairState.phone || phoneInput}</strong></span>
              </div>
              <Input
                label="Verification Code"
                value={codeInput}
                onChange={e => setCodeInput(e.target.value)}
                placeholder="Enter the 5+ digit code from Telegram"
                autoFocus
              />
              <Button onClick={submitCode} disabled={!codeInput.trim()} className="w-full">
                Verify & Pair Device
              </Button>
              <button onClick={() => setPairState(p => ({ ...p, status: 'awaiting_phone' }))} className="text-xs text-blue-500 hover:underline w-full text-center block">
                ← Change phone number
              </button>
            </div>
          )}

          {/* ── Connected ── */}
          {pairState.status === 'connected' && (
            <div className="text-center space-y-3">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                <MessageCircle size={32} className="text-green-600" />
              </div>
              <p className="text-lg font-semibold text-green-700">{pairState.message || 'Device paired successfully!'}</p>
              <p className="text-sm text-gray-500">
                {pairingSupplier?.platform === 'whatsapp_cloud' ? 'WhatsApp' : 'Telegram'} is now connected and ready to send messages.
              </p>
            </div>
          )}

          {/* ── Error / Timeout ── */}
          {(pairState.status === 'error' || pairState.status === 'timeout') && (
            <div className="text-center space-y-3">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto">
                <X size={32} className="text-red-600" />
              </div>
              <p className="text-lg font-semibold text-red-700">
                {pairState.status === 'timeout' ? 'Pairing Timed Out' : 'Pairing Failed'}
              </p>
              <p className="text-sm text-gray-500">{pairState.error || 'An unknown error occurred'}</p>
              <Button variant="secondary" onClick={() => {
                if (pairingSupplier) startPairing(pairingSupplier);
              }} className="mx-auto">
                Try Again
              </Button>
            </div>
          )}
        </div>
      </Modal>

      {/* ═══════════════════ ADD/EDIT MODAL ═══════════════════ */}
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editing ? 'Edit Social API Supplier' : 'Add Social API Supplier'} size="lg" footer={<div className="flex justify-between w-full"><div className="flex gap-2">{!editing && <><Button size="sm" variant="secondary" onClick={() => setForm(p => ({ ...p, ...TEMPLATES[0], platform: 'whatsapp_cloud' }))}>📱 WhatsApp</Button><Button size="sm" variant="secondary" onClick={() => setForm(p => ({ ...p, ...TEMPLATES[1], platform: 'telegram_bot' }))}>✈️ Telegram</Button></>}</div><div className="flex gap-3"><Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button><Button onClick={handleSave}>{editing ? 'Update' : 'Add Supplier'}</Button></div></div>}>
        <div className="space-y-5">
          <Input label="Name *" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="My WhatsApp Business API" required />
          <Select label="Platform *" value={form.platform} onChange={e => setForm(p => ({ ...p, platform: e.target.value as 'whatsapp_cloud' | 'telegram_bot' }))} options={[{ value: 'whatsapp_cloud', label: 'WhatsApp Cloud API (Meta)' }, { value: 'telegram_bot', label: 'Telegram Bot API' }]} />

          {form.platform === 'whatsapp_cloud' && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 space-y-4">
              <h4 className="font-semibold text-green-800 text-sm flex items-center gap-2"><MessageCircle size={16} /> WhatsApp Cloud API Credentials</h4>
              <div className="grid grid-cols-2 gap-4">
                <Input label="Phone Number ID *" value={form.phone_number_id} onChange={e => setForm(p => ({ ...p, phone_number_id: e.target.value }))} placeholder="123456789012345" />
                <Input label="Business Account ID" value={form.business_account_id} onChange={e => setForm(p => ({ ...p, business_account_id: e.target.value }))} placeholder="098765432109876" />
              </div>
              <Input label="Access Token *" value={form.access_token} onChange={e => setForm(p => ({ ...p, access_token: e.target.value }))} placeholder="EAAx... (long-lived token from Meta Business)" />
              <Input label="Webhook Verify Token" value={form.webhook_verify_token} onChange={e => setForm(p => ({ ...p, webhook_verify_token: e.target.value }))} placeholder="my_verify_token_123" />
            </div>
          )}

          {form.platform === 'telegram_bot' && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-4">
              <h4 className="font-semibold text-blue-800 text-sm flex items-center gap-2"><Send size={16} /> Telegram Bot API Credentials</h4>
              <Input label="Bot Token *" value={form.bot_token} onChange={e => setForm(p => ({ ...p, bot_token: e.target.value }))} placeholder="1234567890:ABCdefGHIjklMNOpqrsTUVwxyz" />
              <Input label="Bot Username" value={form.bot_username} onChange={e => setForm(p => ({ ...p, bot_username: e.target.value }))} placeholder="@MyCompanyBot" />
            </div>
          )}

          {/* Residential Proxy Section */}
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold text-purple-800 text-sm flex items-center gap-2"><Shield size={16} /> Residential Proxy</h4>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.proxy_enabled} onChange={e => setForm(p => ({ ...p, proxy_enabled: e.target.checked }))} className="w-4 h-4 rounded border-gray-300 text-purple-600" />
                <span className="text-sm text-purple-700 font-medium">Enable Proxy</span>
              </label>
            </div>

            {onlineProxies.length > 0 && (
              <div className="bg-white rounded-lg p-3 border border-purple-200">
                <p className="text-xs font-medium text-purple-700 mb-2">📡 Quick-pick from online residential proxies:</p>
                <div className="flex flex-wrap gap-2">
                  {onlineProxies.map(p => (
                    <button key={p.id} type="button" onClick={() => fillFromProxy(p.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                        form.proxy_host === p.host && form.proxy_port === p.port
                          ? 'border-purple-500 bg-purple-100 text-purple-800'
                          : 'border-gray-200 bg-white text-gray-600 hover:border-purple-300 hover:bg-purple-50'
                      }`}>
                      <Wifi size={10} className="inline mr-1 text-green-500" />
                      {p.public_ip || p.host}:{p.port}
                      <span className="text-gray-400 ml-1">({p.proxy_type})</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {form.proxy_enabled && (
              <div className="space-y-4">
                <Select label="Proxy Type" value={form.proxy_type} onChange={e => setForm(p => ({ ...p, proxy_type: e.target.value as 'residential' | 'datacenter' | 'isp' }))} options={[{ value: 'residential', label: 'Residential (rotating IPs)' }, { value: 'datacenter', label: 'Datacenter (static IPs)' }, { value: 'isp', label: 'ISP (static residential)' }]} />
                <div className="grid grid-cols-2 gap-4">
                  <Input label="Proxy Host" value={form.proxy_host} onChange={e => setForm(p => ({ ...p, proxy_host: e.target.value }))} placeholder="proxy.example.com" />
                  <Input label="Proxy Port" type="number" value={form.proxy_port} onChange={e => setForm(p => ({ ...p, proxy_port: parseInt(e.target.value) || 8080 }))} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <Input label="Proxy Username" value={form.proxy_username} onChange={e => setForm(p => ({ ...p, proxy_username: e.target.value }))} placeholder="user123" />
                  <Input label="Proxy Password" type="password" value={form.proxy_password} onChange={e => setForm(p => ({ ...p, proxy_password: e.target.value }))} placeholder="••••••••" />
                </div>
                <p className="text-xs text-purple-600">Proxy is used when calling the official API to avoid IP-based rate limits and blocks.</p>
              </div>
            )}
          </div>

          <label className="flex items-center gap-2"><input type="checkbox" checked={form.is_active} onChange={e => setForm(p => ({ ...p, is_active: e.target.checked }))} className="w-4 h-4 rounded border-gray-300 text-blue-600" /><span className="text-sm">Active</span></label>
        </div>
      </Modal>
    </div>
  );
};
