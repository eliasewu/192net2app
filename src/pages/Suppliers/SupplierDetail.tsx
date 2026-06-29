import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Edit, Trash2, Wifi, WifiOff, RefreshCw, TestTube, Phone, Globe, Server, Loader2, Zap, ExternalLink, MessageCircle, Send } from 'lucide-react';
import { useData } from '../../store/DataContext';
import { bindService } from '../../services/apiServices';
import { api } from '../../services/api';
import { useToast } from '../../components/UI/Toast';
import { Card } from '../../components/UI/Card';
import { Button } from '../../components/UI/Button';
import { Badge } from '../../components/UI/Badge';
import { Input } from '../../components/UI/Input';
import { Modal } from '../../components/UI/Modal';

export const SupplierDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { getSupplierById, updateSupplier, deleteSupplier, smsLogs, invoices, socialApiSuppliers } = useData();
  const supplier = id ? getSupplierById(id) : undefined;
  const [showTopup, setShowTopup] = useState(false);
  const [topupAmount, setTopupAmount] = useState(5000);
  const [activeTab, setActiveTab] = useState<'overview' | 'cdr' | 'usage' | 'payments'>('overview');
  const [testResult, setTestResult] = useState<{success:boolean;msg:string;negotiatedVersion?:string}|null>(null);
  const [testing, setTesting] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [voiceOTPConfigs, setVoiceOTPConfigs] = useState<any[]>([]);
  const [apiConnectors, setApiConnectors] = useState<any[]>([]);

  // Fetch linked configs on mount
  useEffect(() => {
    api.get('/voice-otp/configs').then((r: any) => {
      if (r?.success && Array.isArray(r.data)) setVoiceOTPConfigs(r.data);
    }).catch(() => {});
    api.get('/api-connectors').then((r: any) => {
      if (r?.success && Array.isArray(r.data)) setApiConnectors(r.data);
    }).catch(() => {});
  }, []);

  const { addToast } = useToast();
  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteSupplier(supplier!.id);
      // Navigate immediately — the page change itself is the success feedback.
      // A success toast here would be invisible because unmount removes the container.
      navigate('/suppliers');
    } catch (e: any) {
      addToast('error', 'Failed to delete supplier: ' + (e?.message || 'Unknown error'));
    } finally {
      setDeleting(false);
    }
  };

  if (!supplier) {
    return <div className="text-center py-12"><p className="text-gray-600 text-lg">Supplier not found</p><Button variant="secondary" onClick={() => navigate('/suppliers')} className="mt-4">Back to Suppliers</Button></div>;
  }

  const supplierSMS = smsLogs.filter(l => l.supplier_id === supplier.id);
  const supplierInvoices = invoices.filter(i => i.entity_id === supplier.id && i.entity_type === 'supplier');
  const supplierPayments = [{id:'1',amount:25000,date:'2024-02-15',method:'Bank Transfer',reference:'BT-901234',status:'completed'}];

  const handleTopup = () => {
    updateSupplier(supplier.id, { balance: (supplier.balance||0) + topupAmount });
    setShowTopup(false);
  };

  const handleTestConnection = async () => {
    setTestResult(null);
    setTesting(true);
    try {
      // Map the supplier's smpp_version string to an interface_version byte
      // (null for 'auto' so Java does v5.0 → v3.4 → v3.3 negotiation).
      const versionMap: Record<string, number | null> = { '3.3': 0x33, '3.4': 0x34, '5.0': 0x50 };
      const interfaceVersion = supplier.smpp_version
        ? (versionMap[supplier.smpp_version] ?? null)
        : null;

      const result = await bindService.testSMPP({
        host: supplier.smpp_host,
        port: supplier.smpp_port || 2775,
        username: supplier.smpp_username,
        password: supplier.smpp_password || '',
        interface_version: interfaceVersion,
        supplier_id: supplier.id,
      });

      setTestResult({
        success: result.connected === true,
        msg: result.message || 'Test completed',
        negotiatedVersion: result.negotiated_version,
      });
    } catch (e: any) {
      setTestResult({ success: false, msg: e.message || 'Test failed' });
    } finally {
      setTesting(false);
    }
  };

  const handleReconnect = async () => {
    updateSupplier(supplier.id, { bind_status: 'binding', consecutive_failures: 0 });
    try {
      await bindService.reconnect(supplier.id);
    } catch { /* keep current state on error */ }
  };

  const handleDisconnect = async () => {
    updateSupplier(supplier.id, { bind_status: 'unbound' });
    try {
      await bindService.unbindSMPP(supplier.id);
    } catch { /* keep current state on error */ }
  };

  const usageData = [{month:'Jan',sms:180000,cost:2700},{month:'Feb',sms:210000,cost:3150},{month:'Mar',sms:250000,cost:3750},{month:'Apr',sms:220000,cost:3300},{month:'May',sms:280000,cost:4200},{month:'Jun',sms:300000,cost:4500}];

  const connLabel: Record<string,string> = {smpp:'SMPP',http:'HTTP API',ott_whatsapp:'WhatsApp',ott_telegram:'Telegram',voice_otp:'Voice OTP',local_bypass:'Local Bypass',rcs:'RCS',flash_sms:'Flash SMS',email:'Email'};

  // ─── compute linked devices / configs ────────────────────────
  const s = supplier as any;
  const linkedVoiceConfig = voiceOTPConfigs.find((v: any) => String(v.id) === String(s.voice_otp_config_id));
  const linkedApiConnector = apiConnectors.find((c: any) => String(c.id) === String(s.api_connector_id));
  const linkedWhatsAppDevices = socialApiSuppliers.filter((d: any) =>
    Array.isArray(s.whatsapp_device_ids) && s.whatsapp_device_ids.map(String).includes(String(d.id))
  );
  const linkedTelegramDevices = socialApiSuppliers.filter((d: any) =>
    Array.isArray(s.telegram_device_ids) && s.telegram_device_ids.map(String).includes(String(d.id))
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="p-2 hover:bg-gray-100 rounded-lg"><ArrowLeft size={20} className="text-gray-600" /></button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-800">{supplier.company_name}</h1>
              <Badge variant={supplier.status==='active'?'success':supplier.status==='suspended'?'danger':'warning'}>{supplier.status}</Badge>
            </div>
            <p className="text-gray-500">{supplier.supplier_code} • {connLabel[supplier.connection_type]||supplier.connection_type}{supplier.is_inbound ? ' • Inbound' : ''}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" icon={<Edit size={16}/>} onClick={()=>navigate(`/suppliers/${supplier.id}/edit`)}>Edit</Button>
          {!supplier.is_inbound && (supplier.bind_status==='bound'?<Button variant="secondary" icon={<WifiOff size={16}/>} onClick={handleDisconnect}>Disconnect</Button>:<Button variant="success" icon={<RefreshCw size={16}/>} onClick={handleReconnect}>Reconnect</Button>)}
          <Button variant="danger" icon={<Trash2 size={16}/>} onClick={()=>setShowDelete(true)}>Delete</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl p-5 text-white"><Wifi size={20} className="mb-2" /><p className="text-sm opacity-80">Bind Status</p><div className="flex items-center gap-2 mt-1">{supplier.bind_status==='bound'?<Wifi size={18}/>:<WifiOff size={18}/>}<Badge variant={supplier.bind_status==='bound'?'success':'danger'}>{supplier.bind_status}</Badge></div></div>
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-5 text-white"><Server size={20} className="mb-2" /><p className="text-sm opacity-80">Failures</p><p className={`text-2xl font-bold mt-1 ${supplier.consecutive_failures>10?'text-red-200':supplier.consecutive_failures>0?'text-yellow-200':'text-white'}`}>{supplier.consecutive_failures}{supplier.consecutive_failures>=20&&<span className="text-sm ml-2">⚠ BLOCKED</span>}</p></div>
        <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl p-5 text-white"><Phone size={20} className="mb-2" /><p className="text-sm opacity-80">Balance</p><p className="text-2xl font-bold">€{(supplier.balance||0).toLocaleString()}</p></div>
        <div className="bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-xl p-5 text-white"><Globe size={20} className="mb-2" /><p className="text-sm opacity-80">Credit Limit</p><p className="text-2xl font-bold">€{(supplier.credit_limit||0).toLocaleString()}</p></div>
        <div className="bg-white rounded-xl p-5 border border-gray-200"><p className="text-sm text-gray-500">Actions</p><Button size="sm" onClick={()=>setShowTopup(true)} className="mt-2 w-full">Top Up</Button>{!supplier.is_inbound && <Button size="sm" variant="secondary" onClick={handleTestConnection} disabled={testing} className="mt-2 w-full" icon={testing ? <Loader2 size={14} className="animate-spin"/> : <TestTube size={14}/>}>{testing ? 'Testing...' : 'Test Connection'}</Button>}</div>
      </div>

      {testResult && (
        <div className={`p-4 rounded-lg border ${testResult.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
          <div className="flex items-start gap-3">
            <div className={`mt-0.5 p-1 rounded-full ${testResult.success ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
              {testResult.success ? <Zap size={14} /> : <WifiOff size={14} />}
            </div>
            <div className="flex-1">
              <p className={`text-sm font-semibold ${testResult.success ? 'text-green-800' : 'text-red-800'}`}>
                {testResult.msg}
              </p>
              {testResult.negotiatedVersion && (
                <p className="text-xs text-green-700 mt-1 font-mono bg-green-100 inline-block px-2 py-0.5 rounded">
                  Negotiated: SMPP v{testResult.negotiatedVersion}
                </p>
              )}
              {testResult.success && !testResult.negotiatedVersion && (
                <p className="text-xs text-gray-500 mt-1">
                  Connected but version not reported by gateway
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="flex gap-2 border-b border-gray-200">
        {(['overview','cdr','usage','payments'] as const).map(tab=><button key={tab} onClick={()=>setActiveTab(tab)} className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors capitalize ${activeTab===tab?'border-blue-600 text-blue-600':'border-transparent text-gray-500 hover:text-gray-700'}`}>{tab}</button>)}
      </div>

      {activeTab==='overview'&&<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="Connection Details"><div className="grid grid-cols-2 gap-4 text-sm">
          <div><p className="text-gray-500">Connection Type</p><Badge variant="info">{connLabel[supplier.connection_type]||supplier.connection_type}</Badge></div>
          <div><p className="text-gray-500">Status</p><Badge variant={supplier.status==='active'?'success':'danger'} dot>{supplier.status}</Badge></div>
          {(supplier.connection_type==='smpp'||supplier.connection_type==='voice_otp'||supplier.connection_type==='email')&&<><div><p className="text-gray-500">Host</p><p className="font-mono">{supplier.smpp_host||'N/A'}</p></div><div><p className="text-gray-500">Port</p><p>{supplier.smpp_port||'N/A'}</p></div><div><p className="text-gray-500">Username</p><p className="font-mono">{supplier.smpp_username||'N/A'}</p></div><div><p className="text-gray-500">System ID</p><p>{supplier.system_id||'N/A'}</p></div>          <div><p className="text-gray-500">SMPP Version</p>{supplier.smpp_version && supplier.smpp_version !== 'auto' ? <Badge variant="info">v{supplier.smpp_version}</Badge> : <Badge variant="success">Auto-detect</Badge>}</div>          <div><p className="text-gray-500">System Type</p><Badge variant={supplier.smpp_system_type ? 'info' : 'default'}>{supplier.smpp_system_type || '(empty)'}</Badge></div><div><p className="text-gray-500">Bind Type</p><Badge variant="info">{supplier.smpp_bind_type || 'trx'}</Badge></div><div><p className="text-gray-500">Address TON/NPI</p><Badge variant="default">TON={supplier.smpp_addr_ton ?? 0}, NPI={supplier.smpp_addr_npi ?? 0}</Badge></div><div><p className="text-gray-500">Address Range</p><Badge variant="default">{supplier.smpp_addr_range || 'system_id'}</Badge></div><div className="col-span-2"><p className="text-gray-500">Direction</p>{supplier.is_inbound ? <Badge variant="warning">Inbound (connects to us)</Badge> : <Badge variant="info">Outbound (we connect)</Badge>}</div></>}
          <div><p className="text-gray-500">Force DLR</p><Badge variant={supplier.force_dlr ? 'success' : 'default'}>{supplier.force_dlr ? 'Yes' : 'No'}</Badge></div>
          {supplier.force_dlr && <div><p className="text-gray-500">DLR Timeout</p><p className="font-mono">{supplier.force_dlr_timeout_mode === 'fixed' ? `${supplier.dlr_timeout || 150}s` : supplier.force_dlr_timeout_mode === 'random_0_5' ? 'Random 0–5s' : 'Random 0–10s'}</p></div>}
          {supplier.connection_type==='http'&&<><div><p className="text-gray-500">API URL</p><p className="text-xs font-mono">{supplier.api_url||'N/A'}</p></div><div><p className="text-gray-500">Method</p><p>{supplier.api_method||'POST'}</p></div></>}
          {supplier.connection_type==='ott_telegram'&&<div className="col-span-2"><p className="text-gray-500">Bot Token</p><p className="font-mono text-xs">{supplier.api_key?.slice(0,20)+'...'||'N/A'}</p></div>}
        </div>

        {/* ── Linked Connectors / Devices ── */}
        {supplier.connection_type === 'voice_otp' && linkedVoiceConfig && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <p className="text-xs font-semibold text-purple-600 uppercase tracking-wider mb-2 flex items-center gap-1.5"><Phone size={12}/>Linked Voice OTP Config</p>
            <div className="grid grid-cols-2 gap-3 p-3 bg-purple-50 rounded-lg border border-purple-100">
              <div><p className="text-xs text-gray-500">Caller ID</p><p className="text-sm font-mono font-medium text-purple-700">{linkedVoiceConfig.caller_id || 'N/A'}</p></div>
              <div><p className="text-xs text-gray-500">Language</p><p className="text-sm">{linkedVoiceConfig.language || linkedVoiceConfig.language_code || 'N/A'}</p></div>
              <div className="col-span-2"><p className="text-xs text-gray-500">Country Prefixes</p><p className="text-sm font-mono">{linkedVoiceConfig.country_prefix || 'All'}</p></div>
            </div>
            <button onClick={() => navigate('/suppliers/voice-otp')} className="inline-flex items-center gap-1 mt-2 text-xs text-purple-600 hover:text-purple-800 transition-colors"><ExternalLink size={12}/>View all Voice OTP Configs</button>
          </div>
        )}
        {supplier.connection_type === 'voice_otp' && !linkedVoiceConfig && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-xs text-yellow-700">No Voice OTP config linked.{' '}<button onClick={() => navigate('/suppliers/voice-otp')} className="underline font-medium text-yellow-700 hover:text-yellow-900">Configure one →</button></p>
            </div>
          </div>
        )}

        {(supplier.connection_type === 'http' || supplier.connection_type === 'rcs' || supplier.connection_type === 'flash_sms') && linkedApiConnector && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <p className="text-xs font-semibold text-blue-600 uppercase tracking-wider mb-2 flex items-center gap-1.5"><Globe size={12}/>Linked API Connector</p>
            <div className="grid grid-cols-2 gap-3 p-3 bg-blue-50 rounded-lg border border-blue-100">
              <div><p className="text-xs text-gray-500">Name</p><p className="text-sm font-medium">{linkedApiConnector.name || linkedApiConnector.provider || 'N/A'}</p></div>
              <div><p className="text-xs text-gray-500">Method</p><p className="text-sm font-mono">{linkedApiConnector.http_method || linkedApiConnector.method || 'POST'}</p></div>
              <div className="col-span-2"><p className="text-xs text-gray-500">Send URL</p><p className="text-xs font-mono text-blue-700 truncate">{linkedApiConnector.send_url || linkedApiConnector.url || 'N/A'}</p></div>
            </div>
            <button onClick={() => navigate('/suppliers/api-connectors')} className="inline-flex items-center gap-1 mt-2 text-xs text-blue-600 hover:text-blue-800 transition-colors"><ExternalLink size={12}/>View all API Connectors</button>
          </div>
        )}
        {(supplier.connection_type === 'http' || supplier.connection_type === 'rcs' || supplier.connection_type === 'flash_sms') && !linkedApiConnector && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-xs text-yellow-700">No API connector linked.{' '}<button onClick={() => navigate('/suppliers/api-connectors')} className="underline font-medium text-yellow-700 hover:text-yellow-900">Configure one →</button></p>
            </div>
          </div>
        )}

        {supplier.connection_type === 'ott_whatsapp' && linkedWhatsAppDevices.length > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <p className="text-xs font-semibold text-green-600 uppercase tracking-wider mb-2 flex items-center gap-1.5"><MessageCircle size={12}/>Linked WhatsApp Devices</p>
            <div className="space-y-2">
              {linkedWhatsAppDevices.map((d: any) => (
                <div key={d.id} className="grid grid-cols-2 gap-3 p-3 bg-green-50 rounded-lg border border-green-100">
                  <div><p className="text-xs text-gray-500">Device</p><p className="text-sm font-medium">{d.name}</p></div>
                  <div><p className="text-xs text-gray-500">Status</p><Badge variant={d.is_active ? 'success' : 'warning'} size="sm">{d.is_active ? 'Active' : 'Inactive'}</Badge></div>
                  <div className="col-span-2"><p className="text-xs text-gray-500">Phone Number ID</p><p className="text-xs font-mono">{d.phone_number_id || 'N/A'}</p></div>
                </div>
              ))}
            </div>
            <button onClick={() => navigate('/suppliers/social-api')} className="inline-flex items-center gap-1 mt-2 text-xs text-green-600 hover:text-green-800 transition-colors"><ExternalLink size={12}/>Manage Social API Devices</button>
          </div>
        )}
        {supplier.connection_type === 'ott_whatsapp' && linkedWhatsAppDevices.length === 0 && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-xs text-yellow-700">No WhatsApp devices linked.{' '}<button onClick={() => navigate('/suppliers/social-api')} className="underline font-medium text-yellow-700 hover:text-yellow-900">Pair devices →</button></p>
            </div>
          </div>
        )}

        {supplier.connection_type === 'ott_telegram' && linkedTelegramDevices.length > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <p className="text-xs font-semibold text-sky-600 uppercase tracking-wider mb-2 flex items-center gap-1.5"><Send size={12}/>Linked Telegram Bots</p>
            <div className="space-y-2">
              {linkedTelegramDevices.map((d: any) => (
                <div key={d.id} className="grid grid-cols-2 gap-3 p-3 bg-sky-50 rounded-lg border border-sky-100">
                  <div><p className="text-xs text-gray-500">Bot</p><p className="text-sm font-medium">{d.name}</p></div>
                  <div><p className="text-xs text-gray-500">Status</p><Badge variant={d.is_active ? 'success' : 'warning'} size="sm">{d.is_active ? 'Active' : 'Inactive'}</Badge></div>
                  <div className="col-span-2"><p className="text-xs text-gray-500">Username</p><p className="text-xs font-mono">@{d.bot_username || 'N/A'}</p></div>
                </div>
              ))}
            </div>
            <button onClick={() => navigate('/suppliers/social-api')} className="inline-flex items-center gap-1 mt-2 text-xs text-sky-600 hover:text-sky-800 transition-colors"><ExternalLink size={12}/>Manage Social API Bots</button>
          </div>
        )}
        {supplier.connection_type === 'ott_telegram' && linkedTelegramDevices.length === 0 && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-xs text-yellow-700">No Telegram bots linked.{' '}<button onClick={() => navigate('/suppliers/social-api')} className="underline font-medium text-yellow-700 hover:text-yellow-900">Configure bots →</button></p>
            </div>
          </div>
        )}
        </Card>
        <Card title="Contact Information"><div className="grid grid-cols-2 gap-4 text-sm">
          <div><p className="text-gray-500">Company</p><p className="font-medium">{supplier.company_name}</p></div>
          <div><p className="text-gray-500">Code</p><p className="font-mono">{supplier.supplier_code}</p></div>
          <div><p className="text-gray-500">Contact</p><p>{supplier.contact_person}</p></div>
          <div><p className="text-gray-500">Email</p><p>{supplier.email}</p></div>
          <div className="col-span-2"><p className="text-gray-500">Phone</p><p>{supplier.phone}</p></div>
        </div></Card>
        <Card title="Billing"><div className="space-y-3">
          <div className="flex justify-between p-3 bg-gray-50 rounded-lg"><span className="text-gray-600">Balance</span><span className="font-semibold">€{(supplier.balance||0).toLocaleString()}</span></div>
          <div className="flex justify-between p-3 bg-gray-50 rounded-lg"><span className="text-gray-600">Credit Limit</span><span className="font-semibold">€{(supplier.credit_limit||0).toLocaleString()}</span></div>
          <div className="flex justify-between p-3 bg-gray-50 rounded-lg"><span className="text-gray-600">Currency</span><Badge>{supplier.currency||'EUR'}</Badge></div>
        </div></Card>
        <Card title="Recent Invoices">{supplierInvoices.length===0?<p className="text-gray-500 text-sm">No invoices</p>:<div className="space-y-3">{supplierInvoices.slice(0,3).map(inv=><div key={inv.id} className="flex justify-between p-3 bg-gray-50 rounded-lg"><div><p className="font-medium">{inv.invoice_number}</p><p className="text-xs text-gray-500">{new Date(inv.period_start).toLocaleDateString()}</p></div><div className="text-right"><p className="font-semibold">€{inv.grand_total.toLocaleString()}</p><Badge variant={inv.status==='paid'?'success':inv.status==='overdue'?'danger':'warning'}>{inv.status}</Badge></div></div>)}</div>}</Card>
      </div>}

      {activeTab==='cdr'&&<Card title="CDR" noPadding><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="bg-gray-50 border-b"><th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Message ID</th><th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Destination</th><th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Status</th><th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Supplier Rate</th><th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Time</th></tr></thead><tbody className="divide-y">{supplierSMS.slice(0,20).map(sms=><tr key={sms.id} className="hover:bg-gray-50"><td className="px-4 py-3"><span className="font-mono text-xs">{sms.message_id.slice(0,12)}...</span></td><td className="px-4 py-3"><span className="font-mono text-xs">{sms.destination}</span></td><td className="px-4 py-3"><Badge variant={sms.status==='delivered'?'success':sms.status==='failed'?'danger':'warning'} size="sm">{sms.status}</Badge></td><td className="px-4 py-3">€{sms.supplier_rate.toFixed(4)}</td><td className="px-4 py-3 text-gray-500 text-xs">{new Date(sms.submit_time).toLocaleString()}</td></tr>)}</tbody></table></div></Card>}

      {activeTab==='usage'&&<Card title="Monthly Usage"><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="bg-gray-50"><th className="px-4 py-3 text-left font-medium text-gray-500">Month</th><th className="px-4 py-3 text-right font-medium text-gray-500">SMS</th><th className="px-4 py-3 text-right font-medium text-gray-500">Cost</th></tr></thead><tbody className="divide-y">{usageData.map((r,i)=><tr key={i}><td className="px-4 py-3 font-medium">{r.month}</td><td className="px-4 py-3 text-right">{r.sms.toLocaleString()}</td><td className="px-4 py-3 text-right font-semibold">€{r.cost.toLocaleString()}</td></tr>)}</tbody></table></div></Card>}

      {activeTab==='payments'&&<Card title="Payment History" noPadding><table className="w-full text-sm"><thead><tr className="bg-gray-50 border-b"><th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Reference</th><th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Method</th><th className="px-4 py-3 text-right text-xs font-medium text-gray-500">Amount</th><th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Date</th><th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Status</th></tr></thead><tbody className="divide-y">{supplierPayments.map(p=><tr key={p.id}><td className="px-4 py-3 font-mono text-xs">{p.reference}</td><td className="px-4 py-3">{p.method}</td><td className="px-4 py-3 text-right font-semibold">€{p.amount.toLocaleString()}</td><td className="px-4 py-3">{p.date}</td><td className="px-4 py-3"><Badge variant="success">{p.status}</Badge></td></tr>)}</tbody></table></Card>}

      <Modal isOpen={showTopup} onClose={()=>setShowTopup(false)} title="Top Up Balance" footer={<div className="flex justify-end gap-3"><Button variant="secondary" onClick={()=>setShowTopup(false)}>Cancel</Button><Button onClick={handleTopup}>Confirm</Button></div>}>
        <div className="space-y-4"><div className="bg-blue-50 p-4 rounded-lg"><p className="text-sm text-blue-700">Current: <strong>€{(supplier.balance||0).toLocaleString()}</strong></p></div><Input label="Amount (EUR)" type="number" value={topupAmount} onChange={e=>setTopupAmount(Number(e.target.value))} min={1}/><div className="bg-green-50 p-4 rounded-lg"><p className="text-sm text-green-700">New: <strong>€{((supplier.balance||0)+topupAmount).toLocaleString()}</strong></p></div></div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={showDelete}
        onClose={() => setShowDelete(false)}
        title="Delete Supplier"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setShowDelete(false)}>Cancel</Button>
            <Button variant="danger" onClick={handleDelete} disabled={deleting} loading={deleting}>Delete Supplier</Button>
          </div>
        }
      >
        <p className="text-gray-600">
          Are you sure you want to delete <strong>{supplier.company_name}</strong>?
          This action cannot be undone.
        </p>
      </Modal>
    </div>
  );
};
