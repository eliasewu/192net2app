import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Save, RefreshCw, Smartphone, Globe, Zap, MessageCircle, Send, Link, GitBranch, ArrowRight } from 'lucide-react';
import { useData } from '../../store/DataContext';
import { Card } from '../../components/UI/Card';
import { Button } from '../../components/UI/Button';
import { Badge } from '../../components/UI/Badge';
import { Input, Select, Textarea } from '../../components/UI/Input';
import { Client, BillingMode, Currency, ConnectionType } from '../../types';
import { api } from '../../services/api';

export const AddClient: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { addClient, updateClient, getClientById, routePlans, routes, trunks, suppliers, socialApiSuppliers } = useData();
  const existingClient = id ? getClientById(id) : undefined;
  const isEditing = !!existingClient;
  
  const defaultForm = {
    client_code: '', company_name: '', contact_person: '', email: '', phone: '', address: '', country: '',
    smpp_username: '', smpp_password: '', smpp_ip: '', client_ips: '', smpp_port: 2775, system_type: 'SMPP', max_tps: 100,
    billing_mode: 'dlr' as BillingMode, currency: 'EUR' as Currency, balance: 0, credit_limit: 0,
    api_enabled: false, webhook_url: '', force_dlr: true, force_dlr_timeout_mode: 'fixed' as const, dlr_timeout: 150, routing_plan_id: '',
    status: 'active' as const,
    connection_type: 'smpp' as ConnectionType,
  };

  const initForm = existingClient ? {
    client_code: existingClient.client_code, company_name: existingClient.company_name,
    contact_person: existingClient.contact_person, email: existingClient.email,
    phone: existingClient.phone, address: existingClient.address, country: existingClient.country,
    smpp_username: existingClient.smpp_username, smpp_password: existingClient.smpp_password,
    smpp_ip: existingClient.smpp_ip, client_ips: (existingClient as any).client_ips || '', smpp_port: existingClient.smpp_port,
    system_type: existingClient.system_type, max_tps: existingClient.max_tps,
    billing_mode: existingClient.billing_mode, currency: existingClient.currency,
    balance: existingClient.balance, credit_limit: existingClient.credit_limit,
    api_enabled: existingClient.api_enabled, webhook_url: existingClient.webhook_url,
    force_dlr: existingClient.force_dlr, force_dlr_timeout_mode: existingClient.force_dlr_timeout_mode || 'fixed', dlr_timeout: existingClient.dlr_timeout || 150, routing_plan_id: existingClient.routing_plan_id || '',
    status: existingClient.status as 'active'|'inactive'|'suspended',
    connection_type: (existingClient.connection_type || 'smpp') as ConnectionType,
  } : defaultForm;

  const [formData, setFormData] = useState(initForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  // ─── device/connector picker state ──────────────────────────
  const [selectedHttpConnector, setSelectedHttpConnector] = useState('');
  const [selectedWhatsAppIds, setSelectedWhatsAppIds] = useState<string[]>([]);
  const [selectedTelegramIds, setSelectedTelegramIds] = useState<string[]>([]);
  const [selectedVoiceOTPId, setSelectedVoiceOTPId] = useState('');
  const [selectedRCSConnector, setSelectedRCSConnector] = useState('');
  const [selectedFlashSMSConnector, setSelectedFlashSMSConnector] = useState('');
  const [voiceOTPConfigs, setVoiceOTPConfigs] = useState<any[]>([]);
  const [apiConnectors, setApiConnectors] = useState<any[]>([]);

  // Fetch on mount
  useEffect(() => {
    api.get('/voice-otp/configs').then((r: any) => {
      if (r?.success && Array.isArray(r.data)) setVoiceOTPConfigs(r.data);
    }).catch(() => {});
    api.get('/api-connectors').then((r: any) => {
      if (r?.success && Array.isArray(r.data)) setApiConnectors(r.data);
    }).catch(() => {});
  }, []);

  // Pre-populate from existing client
  useEffect(() => {
    if (!existingClient) return;
    const c = existingClient as any;
    if (c.api_connector_id) {
      const ct = c.connection_type || 'smpp';
      if (ct === 'http') setSelectedHttpConnector(String(c.api_connector_id));
      if (ct === 'rcs') setSelectedRCSConnector(String(c.api_connector_id));
      if (ct === 'flash_sms') setSelectedFlashSMSConnector(String(c.api_connector_id));
    }
    if (c.voice_otp_config_id) setSelectedVoiceOTPId(String(c.voice_otp_config_id));
    if (Array.isArray(c.whatsapp_device_ids)) setSelectedWhatsAppIds(c.whatsapp_device_ids.map(String));
    if (Array.isArray(c.telegram_device_ids)) setSelectedTelegramIds(c.telegram_device_ids.map(String));
  }, [existingClient]);

  // ─── computed linked ────────────────────────────────────────
  const s = existingClient as any;
  const linkedApiConnector = apiConnectors.find((c: any) => String(c.id) === String(s?.api_connector_id));
  const linkedVoiceConfig = voiceOTPConfigs.find((v: any) => String(v.id) === String(s?.voice_otp_config_id));
  const linkedWhatsAppDevices = socialApiSuppliers.filter((d: any) =>
    Array.isArray(s?.whatsapp_device_ids) && s.whatsapp_device_ids.map(String).includes(String(d.id))
  );
  const linkedTelegramDevices = socialApiSuppliers.filter((d: any) =>
    Array.isArray(s?.telegram_device_ids) && s.telegram_device_ids.map(String).includes(String(d.id))
  );

  // ─── connector lists ────────────────────────────────────────
  const httpConnectors = useMemo(() => apiConnectors.filter((c: any) => c.connector_type === 'http' || !c.connector_type), [apiConnectors]);
  const rcsConnectors = useMemo(() => apiConnectors.filter((c: any) => c.connector_type === 'rcs'), [apiConnectors]);
  const flashSMSConnectors = useMemo(() => apiConnectors.filter((c: any) => c.connector_type === 'flash_sms'), [apiConnectors]);
  const connectedWhatsAppDevices = useMemo(() =>
    socialApiSuppliers.filter(s => s.platform === 'whatsapp_cloud' && s.is_active),
    [socialApiSuppliers]
  );
  const connectedTelegramDevices = useMemo(() =>
    socialApiSuppliers.filter(s => s.platform === 'telegram_bot' && s.is_active),
    [socialApiSuppliers]
  );

  // ─── route visualization (unchanged) ────────────────────────
  const selectedPlan = routePlans.find(p => String(p.id) === String(formData.routing_plan_id));
  const planRoutes = selectedPlan ? selectedPlan.route_ids
    .map(rid => routes.find(r => String(r.id) === String(rid)))
    .filter(Boolean) : [];
  const routeTrunkMap = planRoutes.map(route => ({
    route,
    trunks: route ? route.trunk_ids
      .map(tid => trunks.find(t => String(t.id) === String(tid)))
      .filter(Boolean) : [],
  }));
  const trunkSupplierMap = routeTrunkMap.map(rt => ({
    ...rt,
    trunkSuppliers: rt.trunks.map(trunk => ({
      trunk,
      supplier: trunk ? suppliers.find(s => String(s.id) === String(trunk.supplier_id)) : undefined,
    })),
  }));
  const totalSuppliers = new Set(
    trunkSupplierMap.flatMap(rt => rt.trunkSuppliers.map(ts => ts.supplier?.id).filter(Boolean))
  ).size;

  // ─── helpers ────────────────────────────────────────────────
  const generatePassword = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%';
    let password = '';
    for (let i = 0; i < 12; i++) password += chars.charAt(Math.floor(Math.random() * chars.length));
    setFormData(prev => ({ ...prev, smpp_password: password }));
  };
  const generateClientCode = () => {
    setFormData(prev => ({ ...prev, client_code: 'CLT' + String(Math.floor(Math.random() * 9000) + 1000) }));
  };

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!formData.client_code) newErrors.client_code = 'Client code is required';
    if (!formData.company_name) newErrors.company_name = 'Company name is required';
    if (!formData.contact_person) newErrors.contact_person = 'Contact person is required';
    if (!formData.email) newErrors.email = 'Email is required';
    else if (!/\S+@\S+\.\S+/.test(formData.email)) newErrors.email = 'Invalid email format';
    if (formData.connection_type === 'smpp') {
      if (!formData.smpp_username) newErrors.smpp_username = 'SMPP username is required';
      if (!formData.smpp_password) newErrors.smpp_password = 'SMPP password is required';
    }
    if (formData.connection_type === 'http' && !selectedHttpConnector) newErrors.connector = 'Select an API connector';
    if (formData.connection_type === 'rcs' && !selectedRCSConnector) newErrors.connector = 'Select an RCS connector';
    if (formData.connection_type === 'flash_sms' && !selectedFlashSMSConnector) newErrors.connector = 'Select a Flash SMS connector';
    if (formData.connection_type === 'ott_whatsapp' && selectedWhatsAppIds.length === 0) newErrors.connector = 'Select at least one WhatsApp device';
    if (formData.connection_type === 'ott_telegram' && selectedTelegramIds.length === 0) newErrors.connector = 'Select at least one Telegram bot';
    if (formData.connection_type === 'voice_otp' && !selectedVoiceOTPId) newErrors.connector = 'Select a Voice OTP config';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    try {
      const payload: any = { ...formData, connection_type: formData.connection_type };
      if (formData.connection_type === 'http' && selectedHttpConnector) payload.api_connector_id = selectedHttpConnector;
      if (formData.connection_type === 'rcs' && selectedRCSConnector) payload.api_connector_id = selectedRCSConnector;
      if (formData.connection_type === 'flash_sms' && selectedFlashSMSConnector) payload.api_connector_id = selectedFlashSMSConnector;
      if (formData.connection_type === 'voice_otp' && selectedVoiceOTPId) payload.voice_otp_config_id = selectedVoiceOTPId;
      if (formData.connection_type === 'ott_whatsapp') payload.whatsapp_device_ids = selectedWhatsAppIds;
      if (formData.connection_type === 'ott_telegram') payload.telegram_device_ids = selectedTelegramIds;

      if (existingClient) {
        await updateClient(existingClient.id, payload as Partial<Client>);
      } else {
        await addClient(payload as Omit<Client, 'id' | 'created_at' | 'updated_at'>);
      }
      navigate('/clients');
    } catch (err) {
      console.error('Failed to save client:', err);
    } finally {
      setLoading(false);
    }
  };

  const updateField = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: '' }));
  };

  const connectionTypes = [
    { value: 'smpp', label: 'SMPP', description: 'Standard SMPP protocol', icon: <Smartphone size={16}/> },
    { value: 'http', label: 'HTTP API', description: 'REST API via connector', icon: <Globe size={16}/> },
    { value: 'rcs', label: 'RCS', description: 'Rich Communication Services', icon: <MessageCircle size={16}/> },
    { value: 'flash_sms', label: 'Flash SMS', description: 'Class 0 flash messages', icon: <Zap size={16}/> },
    { value: 'ott_whatsapp', label: 'WhatsApp', description: 'Via paired WhatsApp device', icon: <MessageCircle size={16}/> },
    { value: 'ott_telegram', label: 'Telegram', description: 'Via paired Telegram bot', icon: <Send size={16}/> },
    { value: 'voice_otp', label: 'Voice OTP', description: 'Voice call OTP delivery', icon: <Globe size={16}/> },
  ];

  const connLabel: Record<string,string> = {smpp:'SMPP',http:'HTTP API',rcs:'RCS',flash_sms:'Flash SMS',ott_whatsapp:'WhatsApp',ott_telegram:'Telegram',voice_otp:'Voice OTP'};

  // ─── Searchable dropdown (inline, same as AddSupplier) ──────
  const SearchableDropdown: React.FC<{
    label: string; value: string; onChange: (v: string) => void;
    options: { value: string; label: string; sub?: string }[];
    placeholder?: string; error?: string; hint?: string;
  }> = ({ label, value, onChange, options, placeholder, error, hint }) => {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const ref = React.useRef<HTMLDivElement>(null);
    const selected = options.find(o => o.value === value);
    const filtered = search ? options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()) || (o.sub||'').toLowerCase().includes(search.toLowerCase())) : options;
    useEffect(() => {
      const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
      document.addEventListener('mousedown', handler);
      return () => document.removeEventListener('mousedown', handler);
    }, []);
    return (
      <div ref={ref} className="relative">
        {label && <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>}
        <button type="button" onClick={() => { setOpen(!open); setSearch(''); }}
          className={`w-full px-3 py-2 text-left border rounded-lg text-sm flex items-center justify-between ${error ? 'border-red-300 bg-red-50' : 'border-gray-300 bg-white hover:border-blue-400'}`}>
          <span className={selected ? 'text-gray-800' : 'text-gray-400'}>{selected ? selected.label : placeholder || 'Select...'}{selected?.sub && <span className="text-gray-400 ml-2 text-xs">{selected.sub}</span>}</span>
          <span className="text-gray-400 ml-2">▼</span>
        </button>
        {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
        {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
        {open && (
          <div className="absolute z-30 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-xl max-h-72 overflow-hidden">
            <div className="p-2 border-b">
              <input type="text" className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm focus:outline-none focus:border-blue-400" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} autoFocus />
            </div>
            <div className="overflow-y-auto max-h-48">
              {filtered.length === 0 ? <p className="px-3 py-4 text-sm text-gray-400 text-center">No matches</p> :
                filtered.map(o => (
                  <button key={o.value} type="button" onClick={() => { onChange(o.value); setOpen(false); }}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 flex items-center justify-between ${o.value === value ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700'}`}>
                    <span>{o.label}</span>
                    {o.sub && <span className="text-xs text-gray-400">{o.sub}</span>}
                    {o.value === value && <span className="text-blue-600">✓</span>}
                  </button>
                ))
              }
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={() => navigate(-1)} className="p-2 hover:bg-gray-100 rounded-lg">
          <ArrowLeft size={20} className="text-gray-600" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-800">{existingClient ? 'Edit Client' : 'Add New Client'}</h1>
          <p className="text-gray-500 mt-1">{existingClient ? `Update ${existingClient.company_name}` : 'Create a new client account with routing & connection settings'}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Company Information */}
        <Card title="Company Information">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="flex gap-2">
              <div className="flex-1"><Input label="Client Code" value={formData.client_code} onChange={(e) => updateField('client_code', e.target.value)} placeholder="CLT001" error={errors.client_code} required /></div>
              <button type="button" onClick={generateClientCode} className="mt-7 p-2.5 bg-gray-100 rounded-lg hover:bg-gray-200"><RefreshCw size={18} className="text-gray-600" /></button>
            </div>
            <Input label="Company Name" value={formData.company_name} onChange={(e) => updateField('company_name', e.target.value)} placeholder="TechCorp Global" error={errors.company_name} required />
            <Input label="Contact Person" value={formData.contact_person} onChange={(e) => updateField('contact_person', e.target.value)} placeholder="John Smith" error={errors.contact_person} required />
            <Input label="Email" type="email" value={formData.email} onChange={(e) => updateField('email', e.target.value)} placeholder="john@techcorp.com" error={errors.email} required />
            <Input label="Phone" value={formData.phone} onChange={(e) => updateField('phone', e.target.value)} placeholder="+1234567890" />
            <Input label="Country" value={formData.country} onChange={(e) => updateField('country', e.target.value)} placeholder="United States" />
            <div className="md:col-span-2"><Textarea label="Address" value={formData.address} onChange={(e) => updateField('address', e.target.value)} placeholder="123 Tech Street" rows={2} /></div>
          </div>
        </Card>

        {/* Connection Type Selection */}
        <Card title="Connection Type">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {connectionTypes.map(type => (
              <label key={type.value} className={`flex flex-col p-4 rounded-xl border-2 cursor-pointer transition-all ${formData.connection_type === type.value ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}>
                <input type="radio" name="connection_type" value={type.value} checked={formData.connection_type === type.value} onChange={(e) => updateField('connection_type', e.target.value)} className="sr-only" />
                <div className="flex items-center gap-2 mb-1">{type.icon}<span className="font-medium text-gray-800">{type.label}</span></div>
                <span className="text-xs text-gray-500">{type.description}</span>
              </label>
            ))}
          </div>
        </Card>

        {/* Dynamic Connection Settings */}
        {formData.connection_type === 'smpp' && (
          <Card title="SMPP Connection Settings">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Input label="SMPP Username" value={formData.smpp_username} onChange={(e) => updateField('smpp_username', e.target.value)} placeholder="techcorp_smpp" error={errors.smpp_username} required />
              <div className="flex gap-2">
                <div className="flex-1"><Input label="SMPP Password" type="text" value={formData.smpp_password} onChange={(e) => updateField('smpp_password', e.target.value)} placeholder="Generated password" error={errors.smpp_password} required /></div>
                <button type="button" onClick={generatePassword} className="mt-7 p-2.5 bg-gray-100 rounded-lg hover:bg-gray-200"><RefreshCw size={18} className="text-gray-600" /></button>
              </div>
              <Input label="Allowed IP (single)" value={formData.smpp_ip} onChange={(e) => updateField('smpp_ip', e.target.value)} placeholder="192.168.1.100" hint="Single IP (use Multi-IP field for more than one)" />
              <Textarea label="Allowed IPs (multi)" value={formData.client_ips} onChange={(e) => updateField('client_ips', e.target.value)} placeholder="192.168.1.100&#10;10.0.0.50&#10;203.0.113.42" rows={3} />
              <p className="text-xs text-gray-400 mt-1">Multiple IPs — one per line, or comma-separated. Connect to our SMPP port.</p>
              <Select label="System Type" value={formData.system_type} onChange={(e) => updateField('system_type', e.target.value)} options={[{ value: 'SMPP', label: 'SMPP' }, { value: 'HTTP', label: 'HTTP API' }, { value: 'BOTH', label: 'Both' }]} />
              <Input label="Max TPS" type="number" value={formData.max_tps} onChange={(e) => updateField('max_tps', parseInt(e.target.value))} hint="Maximum transactions per second" />
              <div className="md:col-span-2">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <p className="text-sm text-blue-700">
                    <strong>Note:</strong> External clients connect to <strong>our</strong> SMPP port (default 2775). 
                    No client-side port is needed — the Java 21 gateway handles both ESME (client) and SMSC (supplier) roles.
                  </p>
                </div>
              </div>
            </div>
          </Card>
        )}

        {(formData.connection_type === 'http' || formData.connection_type === 'rcs' || formData.connection_type === 'flash_sms') && (
          <Card title={`${connLabel[formData.connection_type]} — API Connector`}>
            <div className="space-y-4">
              {isEditing && linkedApiConnector && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                  <p className="text-xs font-semibold text-green-700 uppercase tracking-wider mb-2"><Link size={12} className="mr-1 inline"/>Currently Linked</p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="text-sm font-medium text-gray-800">{linkedApiConnector.name || linkedApiConnector.provider}</span>
                    <Badge variant="info" size="sm">{linkedApiConnector.http_method || 'POST'}</Badge>
                    <span className="text-xs font-mono text-green-600 truncate max-w-xs">{linkedApiConnector.send_url || 'N/A'}</span>
                  </div>
                </div>
              )}
              <SearchableDropdown
                label={`Choose ${connLabel[formData.connection_type]} Connector`}
                value={formData.connection_type === 'http' ? selectedHttpConnector : formData.connection_type === 'rcs' ? selectedRCSConnector : selectedFlashSMSConnector}
                onChange={formData.connection_type === 'http' ? setSelectedHttpConnector : formData.connection_type === 'rcs' ? setSelectedRCSConnector : setSelectedFlashSMSConnector}
                placeholder="Search by provider or name..."
                options={(formData.connection_type === 'http' ? httpConnectors : formData.connection_type === 'rcs' ? rcsConnectors : flashSMSConnectors).map((c: any) => ({ value: String(c.id), label: c.provider || c.name, sub: (c.send_url || '').substring(0, 50) }))}
                error={errors.connector}
                hint={`${(formData.connection_type === 'http' ? httpConnectors : formData.connection_type === 'rcs' ? rcsConnectors : flashSMSConnectors).length} connectors available`}
              />
              {(formData.connection_type === 'http' ? httpConnectors.length === 0 : formData.connection_type === 'rcs' ? rcsConnectors.length === 0 : flashSMSConnectors.length === 0) && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-center">
                  <p className="text-sm text-yellow-700">No {connLabel[formData.connection_type]} connectors configured yet.</p>
                  <p className="text-xs text-yellow-600 mt-1 mb-3">Configure API connectors first, then return here to link them to this client.</p>
                  <Button variant="secondary" size="sm" onClick={() => navigate('/suppliers/api-connectors')}>
                    Go to API Connectors
                  </Button>
                </div>
              )}
            </div>
          </Card>
        )}

        {formData.connection_type === 'ott_whatsapp' && (
          <Card title="WhatsApp — Paired Devices">
            <div className="space-y-4">
              {isEditing && linkedWhatsAppDevices.length > 0 && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                  <p className="text-xs font-semibold text-green-700 uppercase tracking-wider mb-2"><Link size={12} className="mr-1 inline"/>Currently Linked ({linkedWhatsAppDevices.length})</p>
                  <div className="flex flex-wrap gap-2">{linkedWhatsAppDevices.map((d: any) => (<Badge key={d.id} variant="success" size="sm">{d.name}</Badge>))}</div>
                </div>
              )}
              <p className="text-sm text-gray-500">Select one or more paired WhatsApp devices. Manage in <strong>Social API Suppliers</strong> or <strong>Business API Connect</strong>.</p>
              <div className="space-y-2 max-h-64 overflow-y-auto border border-gray-200 rounded-lg p-3">
                {connectedWhatsAppDevices.length === 0 ? <p className="text-sm text-gray-400 py-4 text-center">No WhatsApp devices found</p> :
                  connectedWhatsAppDevices.map(d => {
                    const checked = selectedWhatsAppIds.includes(d.id);
                    return (
                      <label key={d.id} className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer ${checked ? 'bg-blue-50 border border-blue-200' : 'hover:bg-gray-50 border border-transparent'}`}>
                        <input type="checkbox" checked={checked} onChange={() => { if (checked) setSelectedWhatsAppIds(prev => prev.filter(id => id !== d.id)); else setSelectedWhatsAppIds(prev => [...prev, d.id]); }} className="w-4 h-4 rounded border-gray-300 text-blue-600" />
                        <div className="flex-1"><p className="text-sm font-medium">{d.name}</p><p className="text-xs text-gray-500">Phone: {d.phone_number_id || 'N/A'}</p></div>
                        {checked && <span className="text-blue-600">✓</span>}
                      </label>
                    );
                  })
                }
              </div>
              {errors.connector && <p className="text-xs text-red-500">{errors.connector}</p>}
              {connectedWhatsAppDevices.length === 0 && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-center">
                  <p className="text-sm text-yellow-700">No paired WhatsApp devices found.</p>
                  <p className="text-xs text-yellow-600 mt-1 mb-3">Pair a WhatsApp device first, then return here to link it to this client.</p>
                  <div className="flex items-center justify-center gap-3">
                    <Button variant="secondary" size="sm" onClick={() => navigate('/suppliers/social-api')}>
                      Go to Social API
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => navigate('/business-api-connect')}>
                      Go to Business API
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </Card>
        )}

        {formData.connection_type === 'ott_telegram' && (
          <Card title="Telegram — Paired Bots">
            <div className="space-y-4">
              {isEditing && linkedTelegramDevices.length > 0 && (
                <div className="bg-sky-50 border border-sky-200 rounded-lg p-3">
                  <p className="text-xs font-semibold text-sky-700 uppercase tracking-wider mb-2"><Link size={12} className="mr-1 inline"/>Currently Linked ({linkedTelegramDevices.length})</p>
                  <div className="flex flex-wrap gap-2">{linkedTelegramDevices.map((d: any) => (<Badge key={d.id} variant="info" size="sm">@{d.bot_username || d.name}</Badge>))}</div>
                </div>
              )}
              <p className="text-sm text-gray-500">Select one or more paired Telegram bots. Manage in <strong>Social API Suppliers</strong> or <strong>Business API Connect</strong>.</p>
              <div className="space-y-2 max-h-64 overflow-y-auto border border-gray-200 rounded-lg p-3">
                {connectedTelegramDevices.length === 0 ? <p className="text-sm text-gray-400 py-4 text-center">No Telegram bots found</p> :
                  connectedTelegramDevices.map(d => {
                    const checked = selectedTelegramIds.includes(d.id);
                    return (
                      <label key={d.id} className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer ${checked ? 'bg-blue-50 border border-blue-200' : 'hover:bg-gray-50 border border-transparent'}`}>
                        <input type="checkbox" checked={checked} onChange={() => { if (checked) setSelectedTelegramIds(prev => prev.filter(id => id !== d.id)); else setSelectedTelegramIds(prev => [...prev, d.id]); }} className="w-4 h-4 rounded border-gray-300 text-blue-600" />
                        <div className="flex-1"><p className="text-sm font-medium">{d.name}</p><p className="text-xs text-gray-500">Bot: @{d.bot_username || 'N/A'}</p></div>
                        {checked && <span className="text-blue-600">✓</span>}
                      </label>
                    );
                  })
                }
              </div>
              {errors.connector && <p className="text-xs text-red-500">{errors.connector}</p>}
              {connectedTelegramDevices.length === 0 && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-center">
                  <p className="text-sm text-yellow-700">No paired Telegram bots found.</p>
                  <p className="text-xs text-yellow-600 mt-1 mb-3">Pair a Telegram bot first, then return here to link it to this client.</p>
                  <div className="flex items-center justify-center gap-3">
                    <Button variant="secondary" size="sm" onClick={() => navigate('/suppliers/social-api')}>
                      Go to Social API
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => navigate('/business-api-connect')}>
                      Go to Business API
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </Card>
        )}

        {formData.connection_type === 'voice_otp' && (
          <Card title="Voice OTP — Configuration">
            <div className="space-y-4">
              {isEditing && linkedVoiceConfig && (
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                  <p className="text-xs font-semibold text-purple-700 uppercase tracking-wider mb-2"><Link size={12} className="mr-1 inline"/>Currently Linked</p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="text-sm font-medium">{linkedVoiceConfig.language || linkedVoiceConfig.language_code}</span>
                    <Badge variant="info" size="sm">{linkedVoiceConfig.caller_id || 'N/A'}</Badge>
                    <span className="text-xs text-purple-600 font-mono">{linkedVoiceConfig.country_prefix || 'All'}</span>
                  </div>
                </div>
              )}
              <SearchableDropdown
                label="Choose Voice OTP Configuration"
                value={selectedVoiceOTPId}
                onChange={setSelectedVoiceOTPId}
                placeholder="Search by language or prefix..."
                options={voiceOTPConfigs.map((v: any) => ({ value: String(v.id), label: v.language || 'Unnamed', sub: `Prefixes: ${v.country_prefix || 'N/A'}` }))}
                error={errors.connector}
                hint={`${voiceOTPConfigs.length} voice OTP groups configured`}
              />
              {voiceOTPConfigs.length === 0 && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-center">
                  <p className="text-sm text-yellow-700">No Voice OTP configurations found.</p>
                  <p className="text-xs text-yellow-600 mt-1 mb-3">Configure a Voice OTP group first, then return here to link it to this client.</p>
                  <Button variant="secondary" size="sm" onClick={() => navigate('/suppliers/voice-otp')}>
                    Go to Voice OTP
                  </Button>
                </div>
              )}
            </div>
          </Card>
        )}

        {/* Billing Settings */}
        <Card title="Billing Settings">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Select label="Billing Mode" value={formData.billing_mode} onChange={(e) => updateField('billing_mode', e.target.value)} options={[{ value: 'submit', label: 'On Submit' }, { value: 'dlr', label: 'On DLR (Delivery)' }]} />
            <Select label="Currency" value={formData.currency} onChange={(e) => updateField('currency', e.target.value)} options={[{ value: 'EUR', label: 'Euro (EUR)' }, { value: 'USD', label: 'US Dollar (USD)' }, { value: 'GBP', label: 'British Pound (GBP)' }]} />
            <Input label="Initial Balance" type="number" value={formData.balance} onChange={(e) => updateField('balance', parseFloat(e.target.value))} />
            <Input label="Credit Limit" type="number" value={formData.credit_limit} onChange={(e) => updateField('credit_limit', parseFloat(e.target.value))} />
          </div>
        </Card>

        {/* Routing Configuration */}
        <Card title="Routing Configuration">
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-1">
                <Select label="Routing Plan" value={formData.routing_plan_id} onChange={(e) => updateField('routing_plan_id', e.target.value)}
                  options={[{ value: '', label: 'Select Route Plan' }, ...routePlans.map(p => ({ value: String(p.id), label: p.plan_name }))]} />
                <p className="text-xs text-gray-500">Route plan controls how messages flow through routes → trunks → suppliers</p>
              </div>
              <Select label="Status" value={formData.status} onChange={(e) => updateField('status', e.target.value)} options={[{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }, { value: 'suspended', label: 'Suspended' }]} />
            </div>
            <div className="space-y-4">
              <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={formData.api_enabled} onChange={(e) => updateField('api_enabled', e.target.checked)} className="w-4 h-4 rounded border-gray-300 text-blue-600" /><span className="text-sm">Enable HTTP API</span></label>
              <div className="border-t pt-4">
                <label className="flex items-center gap-2 cursor-pointer mb-3"><input type="checkbox" checked={formData.force_dlr} onChange={(e) => updateField('force_dlr', e.target.checked)} className="w-4 h-4 rounded border-gray-300 text-blue-600" /><span className="text-sm font-medium">Force DLR</span></label>
                {formData.force_dlr && (
                  <div className="ml-6 grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-gray-50 rounded-lg border">
                    <Select label="DLR Timeout Mode" value={formData.force_dlr_timeout_mode} onChange={(e) => updateField('force_dlr_timeout_mode', e.target.value)} options={[{ value: 'fixed', label: 'Fixed (seconds)' }, { value: 'random_0_5', label: 'Random 0-5 sec' }, { value: 'random_0_10', label: 'Random 0-10 sec' }]} />
                    {formData.force_dlr_timeout_mode === 'fixed' && <Input label="DLR Timeout (seconds)" type="number" value={formData.dlr_timeout} onChange={(e) => updateField('dlr_timeout', parseInt(e.target.value))} min={1} max={86400} />}
                  </div>
                )}
              </div>
            </div>
            <Input label="Webhook URL" value={formData.webhook_url} onChange={(e) => updateField('webhook_url', e.target.value)} placeholder="https://example.com/webhook" />

            {/* Route Flow Visualization */}
            {selectedPlan && (
              <div className="mt-6 border-t pt-6">
                <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4 flex items-center gap-2"><GitBranch size={16} className="text-blue-600"/>Route Flow: Client → Plan → Routes → Trunks → Suppliers</h3>
                <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                  {trunkSupplierMap.length === 0 ? <p className="text-gray-500 text-sm text-center py-4">No routes configured.</p> :
                    <div className="space-y-4">
                      {trunkSupplierMap.map(({ route, trunkSuppliers }, ri) => (
                        <div key={route?.id || ri} className="bg-white rounded-lg p-4 border border-gray-200">
                          <div className="flex items-center gap-2 mb-3">
                            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-white text-xs font-bold">R{ri+1}</div>
                            <div><p className="font-medium text-gray-800 text-sm">{route?.route_name || 'Unknown'}</p><p className="text-xs text-gray-500">Method: {route?.route_method || 'priority'}</p></div>
                            <Badge variant={route?.is_active ? 'success' : 'danger'} size="sm">{route?.is_active ? 'Active' : 'Inactive'}</Badge>
                          </div>
                          <div className="ml-4 space-y-2">
                            {trunkSuppliers.map(({ trunk, supplier }, ti) => (
                              <div key={trunk?.id || ti} className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg">
                                <ArrowRight size={14} className="text-gray-400"/>
                                <div className="w-6 h-6 rounded bg-purple-100 flex items-center justify-center text-purple-700 text-xs font-bold">{ti+1}</div>
                                <div className="flex-1 min-w-0"><p className="text-sm font-medium text-gray-700 truncate">{trunk?.trunk_name || 'Unknown'}</p></div>
                                <ArrowRight size={14} className="text-gray-400"/>
                                <div className="flex items-center gap-2">
                                  <div className="w-6 h-6 rounded-full bg-gray-400 flex items-center justify-center text-white text-xs">S</div>
                                  <div className="min-w-0"><p className="text-sm font-medium truncate">{supplier?.company_name || 'Unknown'}</p></div>
                                  {supplier && <Badge variant={supplier.bind_status === 'bound' ? 'success' : 'warning'} size="sm" dot>{supplier.bind_status}</Badge>}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  }
                  <div className="mt-4 pt-3 border-t border-gray-200 flex items-center justify-between text-sm">
                    <span className="text-gray-500"><strong>{planRoutes.length}</strong> routes · <strong>{routeTrunkMap.reduce((s,rt)=>s+rt.trunks.length,0)}</strong> trunks · <strong>{totalSuppliers}</strong> suppliers</span>
                    <Badge variant="info">{selectedPlan.plan_name}</Badge>
                  </div>
                </div>
              </div>
            )}
          </div>
        </Card>

        {/* Actions */}
        <div className="flex justify-end gap-4">
          <Button variant="secondary" type="button" onClick={() => navigate(-1)}>Cancel</Button>
          <Button type="submit" icon={<Save size={18} />} loading={loading}>{existingClient ? 'Update Client' : 'Create Client'}</Button>
        </div>
      </form>
    </div>
  );
};
