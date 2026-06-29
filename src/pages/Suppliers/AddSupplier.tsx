import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Save, RefreshCw, TestTube, Search, Check, MessageCircle, Send, Smartphone, Globe, Zap, Link, Plus } from 'lucide-react';
import { useData } from '../../store/DataContext';
import { Card } from '../../components/UI/Card';
import { Button } from '../../components/UI/Button';
import { Input, Select } from '../../components/UI/Input';
import { Badge } from '../../components/UI/Badge';
import { ConnectionType, Currency } from '../../types';
import { api } from '../../services/api';

// ─── Searchable dropdown (inline, no extra dependencies) ──────────
const SearchableDropdown: React.FC<{
  label: string;
  value: string;
  onChange: (val: string) => void;
  options: { value: string; label: string; sub?: string }[];
  placeholder?: string;
  error?: string;
  hint?: string;
}> = ({ label, value, onChange, options, placeholder, error, hint }) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  const selected = options.find(o => o.value === value);
  const filtered = search
    ? options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()) || (o.sub || '').toLowerCase().includes(search.toLowerCase()))
    : options;

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      {label && <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>}
      <button
        type="button"
        onClick={() => { setOpen(!open); setSearch(''); }}
        className={`w-full px-3 py-2 text-left border rounded-lg text-sm flex items-center justify-between transition-colors ${error ? 'border-red-300 bg-red-50' : 'border-gray-300 bg-white hover:border-blue-400'}`}
      >
        <span className={selected ? 'text-gray-800' : 'text-gray-400'}>
          {selected ? selected.label : placeholder || 'Select...'}
          {selected?.sub && <span className="text-gray-400 ml-2 text-xs">{selected.sub}</span>}
        </span>
        <span className="text-gray-400 ml-2">▼</span>
      </button>
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
      {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
      {open && (
        <div className="absolute z-30 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-xl max-h-72 overflow-hidden">
          <div className="p-2 border-b">
            <Search size={14} className="absolute ml-2 mt-2 text-gray-400" />
            <input
              type="text"
              className="w-full pl-8 pr-2 py-1.5 border border-gray-200 rounded text-sm focus:outline-none focus:border-blue-400"
              placeholder="Search..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              autoFocus
              onClick={e => e.stopPropagation()}
            />
          </div>
          <div className="overflow-y-auto max-h-48">
            {filtered.length === 0 ? (
              <p className="px-3 py-4 text-sm text-gray-400 text-center">No matches</p>
            ) : (
              filtered.map(o => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => { onChange(o.value); setOpen(false); }}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 flex items-center justify-between ${o.value === value ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700'}`}
                >
                  <span>{o.label}</span>
                  {o.sub && <span className="text-xs text-gray-400">{o.sub}</span>}
                  {o.value === value && <Check size={14} className="text-blue-600" />}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Connector card grid (visual selector for HTTP/RCS/Flash SMS) ─
const ConnectorCardGrid: React.FC<{
  label: string;
  value: string;
  onChange: (val: string) => void;
  connectors: any[];
  connectorType: string;
  hint?: string;
  onAddNew?: () => void;
}> = ({ label, value, onChange, connectors, connectorType, hint, onAddNew }) => {
  const [search, setSearch] = useState('');

  const filtered = search
    ? connectors.filter((c: any) =>
        (c.provider || '').toLowerCase().includes(search.toLowerCase()) ||
        (c.name || '').toLowerCase().includes(search.toLowerCase()) ||
        (c.send_url || '').toLowerCase().includes(search.toLowerCase())
      )
    : connectors;

  const selectedConnector = connectors.find((c: any) => String(c.id) === value);

  return (
    <div>
      {label && <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>}

      {/* Search bar */}
      {connectors.length > 0 && (
        <div className="relative mb-3">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 transition-all"
            placeholder={`Search ${connectorType.toUpperCase()} connectors...`}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      )}

      {/* Card grid */}
      {connectors.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[520px] overflow-y-auto p-1">
          {filtered.map((c: any) => {
            const isSelected = String(c.id) === value;
            const methodBadge = c.http_method || 'POST';
            const authBadge = c.auth_type || 'API_KEY';

            return (
              <button
                key={c.id}
                type="button"
                onClick={() => onChange(isSelected ? '' : String(c.id))}
                className={`text-left p-4 rounded-xl border-2 transition-all duration-200 cursor-pointer group ${
                  isSelected
                    ? 'border-blue-500 bg-blue-50 shadow-md ring-2 ring-blue-300/50 scale-[1.02]'
                    : 'border-gray-200 bg-white hover:border-blue-300 hover:shadow-md hover:scale-[1.01]'
                }`}
              >
                {/* Header: provider + check */}
                <div className="flex items-start justify-between mb-2.5">
                  <div className="flex-1 min-w-0">
                    <p className={`font-semibold text-sm truncate ${isSelected ? 'text-blue-800' : 'text-gray-800'}`}>
                      {c.provider || c.name}
                    </p>
                    {c.name && c.name !== c.provider && (
                      <p className="text-xs text-gray-400 truncate mt-0.5">{c.name}</p>
                    )}
                  </div>
                  {isSelected && (
                    <div className="flex-shrink-0 w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center ml-2">
                      <Check size={14} className="text-white" />
                    </div>
                  )}
                </div>

                {/* Badges */}
                <div className="flex flex-wrap gap-1.5 mb-2.5">
                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold tracking-wide uppercase ${
                    methodBadge === 'POST' ? 'bg-green-100 text-green-700' : 'bg-sky-100 text-sky-700'
                  }`}>{methodBadge}</span>
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold tracking-wide uppercase bg-purple-100 text-purple-700">
                    {authBadge.replace(/_/g, ' ')}
                  </span>
                  {c.is_active && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold tracking-wide uppercase bg-emerald-100 text-emerald-700">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Active
                    </span>
                  )}
                </div>

                {/* URL display */}
                <p className="text-[11px] text-gray-400 font-mono truncate leading-relaxed" title={c.send_url || ''}>
                  {c.send_url
                    ? c.send_url.replace(/^https?:\/\//, '').substring(0, 42) + (c.send_url.length > 42 ? '…' : '')
                    : 'No URL configured'}
                </p>
              </button>
            );
          })}

          {/* "Add New" card */}
          {onAddNew && (
            <button
              type="button"
              onClick={onAddNew}
              className="p-4 rounded-xl border-2 border-dashed border-gray-300 hover:border-blue-400 hover:bg-blue-50/40 transition-all duration-200 flex flex-col items-center justify-center gap-2 text-gray-400 hover:text-blue-600 min-h-[130px] cursor-pointer group"
            >
              <div className="w-10 h-10 rounded-full bg-gray-100 group-hover:bg-blue-100 flex items-center justify-center transition-colors">
                <Plus size={20} className="group-hover:text-blue-600 transition-colors" />
              </div>
              <span className="text-xs font-medium">Add New Connector</span>
            </button>
          )}
        </div>
      ) : (
        /* Empty state */
        <div className="text-center py-10 border-2 border-dashed border-gray-200 rounded-xl bg-gray-50/50">
          <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-gray-100 flex items-center justify-center">
            <Link size={20} className="text-gray-400" />
          </div>
          <p className="text-sm font-medium text-gray-500">No {connectorType.toUpperCase()} connectors configured</p>
          <p className="text-xs text-gray-400 mt-1">Create one first or add one below.</p>
          {onAddNew && (
            <Button variant="secondary" size="sm" className="mt-4 mx-auto" onClick={onAddNew}>
              <Plus size={14} className="mr-1.5" /> Add First Connector
            </Button>
          )}
        </div>
      )}

      {/* No search results */}
      {connectors.length > 0 && filtered.length === 0 && (
        <div className="text-center py-6 border border-gray-100 rounded-xl bg-gray-50/50">
          <Search size={18} className="mx-auto text-gray-300 mb-2" />
          <p className="text-sm text-gray-400">No connectors match "<span className="font-medium text-gray-500">{search}</span>"</p>
        </div>
      )}

      {/* Selected indicator */}
      {selectedConnector && (
        <div className="mt-3 bg-green-50 border border-green-200 rounded-lg p-3">
          <div className="flex items-center gap-2">
            <Check size={14} className="text-green-600 flex-shrink-0" />
            <span className="text-sm font-medium text-green-800 truncate">
              Selected: {selectedConnector.provider || selectedConnector.name}
            </span>
          </div>
          <p className="text-xs text-green-600 mt-0.5 ml-6">URL and API key will be auto-filled from this connector.</p>
        </div>
      )}

      {hint && <p className="text-xs text-gray-400 mt-2">{hint}</p>}
    </div>
  );
};

// ─── Multi-select checkboxes ──────────────────────────────────────
const MultiSelect: React.FC<{
  label: string;
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  options: { value: string; label: string; sub?: string }[];
  hint?: string;
}> = ({ label, selectedIds, onChange, options, hint }) => (
  <div>
    {label && <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>}
    <div className="max-h-64 overflow-y-auto space-y-1 border border-gray-200 rounded-lg p-3">
      {options.length === 0 ? (
        <p className="text-sm text-gray-400 py-4 text-center">No connected devices found</p>
      ) : (
        options.map(o => {
          const checked = selectedIds.includes(o.value);
          return (
            <label key={o.value} className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors ${checked ? 'bg-blue-50 border border-blue-200' : 'hover:bg-gray-50 border border-transparent'}`}>
              <input
                type="checkbox"
                checked={checked}
                onChange={() => {
                  if (checked) onChange(selectedIds.filter(id => id !== o.value));
                  else onChange([...selectedIds, o.value]);
                }}
                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{o.label}</p>
                {o.sub && <p className="text-xs text-gray-500 truncate">{o.sub}</p>}
              </div>
              {checked && <Check size={16} className="text-blue-600 flex-shrink-0" />}
            </label>
          );
        })
      )}
    </div>
    {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
  </div>
);

// =====================================================================
export const AddSupplier: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const { addSupplier, getSupplierById, updateSupplier, socialApiSuppliers } = useData();

  const existingSupplier = id ? getSupplierById(id) : null;
  const isEditing = !!existingSupplier;

  const [formData, setFormData] = useState({
    supplier_code: existingSupplier?.supplier_code || '',
    company_name: existingSupplier?.company_name || '',
    contact_person: existingSupplier?.contact_person || '',
    email: existingSupplier?.email || '',
    phone: existingSupplier?.phone || '',

    is_inbound: existingSupplier?.is_inbound || false,
    connection_type: (existingSupplier?.connection_type || 'smpp') as ConnectionType,

    // SMPP Settings
    smpp_host: existingSupplier?.smpp_host || '',
    smpp_port: existingSupplier?.smpp_port || (existingSupplier?.connection_type === 'email' ? 587 : 2775),
    smpp_username: existingSupplier?.smpp_username || '',
    smpp_password: existingSupplier?.smpp_password || '',
    system_id: existingSupplier?.system_id || '',
    smpp_version: (existingSupplier?.smpp_version || 'auto') as 'auto' | '3.3' | '3.4' | '5.0',
    smpp_system_type: existingSupplier?.smpp_system_type || '',
    smpp_bind_type: (existingSupplier?.smpp_bind_type || 'trx') as 'trx' | 'tx' | 'rx',
    smpp_addr_ton: existingSupplier?.smpp_addr_ton ?? 0,
    smpp_addr_npi: existingSupplier?.smpp_addr_npi ?? 0,
    smpp_addr_range: existingSupplier?.smpp_addr_range || 'system_id',

    // HTTP API Settings
    api_url: existingSupplier?.api_url || '',
    api_key: existingSupplier?.api_key || '',
    api_method: (existingSupplier?.api_method || 'POST') as 'GET' | 'POST',

    // Billing
    balance: existingSupplier?.balance || 0,
    credit_limit: existingSupplier?.credit_limit || 0,
    currency: (existingSupplier?.currency || 'EUR') as Currency,

    status: existingSupplier?.status || 'active',
    bind_status: existingSupplier?.bind_status || 'unbound',
    consecutive_failures: existingSupplier?.consecutive_failures || 0,

    // DLR
    force_dlr: existingSupplier?.force_dlr || false,
    force_dlr_timeout_mode: (existingSupplier?.force_dlr_timeout_mode || 'fixed') as 'fixed' | 'random_0_5' | 'random_0_10',
    dlr_timeout: existingSupplier?.dlr_timeout || 150,
  });

  // ─── device picker state ─────────────────────────────────────────
  const [selectedHttpConnector, setSelectedHttpConnector] = useState('');
  const [selectedWhatsAppIds, setSelectedWhatsAppIds] = useState<string[]>([]);
  const [selectedTelegramIds, setSelectedTelegramIds] = useState<string[]>([]);
  const [selectedVoiceOTPId, setSelectedVoiceOTPId] = useState('');
  const [selectedRCSConnector, setSelectedRCSConnector] = useState('');
  const [selectedFlashSMSConnector, setSelectedFlashSMSConnector] = useState('');
  const [voiceOTPConfigs, setVoiceOTPConfigs] = useState<any[]>([]);
  const [apiConnectors, setApiConnectors] = useState<any[]>([]);

  // ─── inline new-connector form state ────────────────────────
  const [showNewConnectorForm, setShowNewConnectorForm] = useState(false);
  const [creatingConnector, setCreatingConnector] = useState(false);
  const [connectorFormError, setConnectorFormError] = useState('');
  const [newConnector, setNewConnector] = useState({ name: '', provider: '', http_method: 'POST', send_url: '', api_key: '' });

  const fetchConnectors = async () => {
    try {
      const r: any = await api.get('/api-connectors');
      if (r?.success && Array.isArray(r.data)) setApiConnectors(r.data);
    } catch {}
  };

  // Fetch voice OTP configs and API connectors on mount
  useEffect(() => {
    api.get('/voice-otp/configs').then((r: any) => {
      if (r?.success && Array.isArray(r.data)) setVoiceOTPConfigs(r.data);
    }).catch(() => {});
    fetchConnectors();
  }, []);

  const handleCreateConnector = async (connectorType: string) => {
    setConnectorFormError('');
    if (!newConnector.send_url || !newConnector.provider) {
      setConnectorFormError('Provider and Send URL are required.');
      return;
    }
    setCreatingConnector(true);
    try {
      const r: any = await api.post('/api-connectors', {
        name: newConnector.name || newConnector.provider,
        provider: newConnector.provider,
        connector_type: connectorType,
        http_method: newConnector.http_method,
        send_url: newConnector.send_url,
        api_key: newConnector.api_key,
        is_active: true,
      });
      await fetchConnectors();
      const newId = r?.data?.id || r?.id;
      if (newId) {
        if (connectorType === 'http') setSelectedHttpConnector(String(newId));
        else if (connectorType === 'rcs') setSelectedRCSConnector(String(newId));
        else if (connectorType === 'flash_sms') setSelectedFlashSMSConnector(String(newId));
      }
      setShowNewConnectorForm(false);
      setNewConnector({ name: '', provider: '', http_method: 'POST', send_url: '', api_key: '' });
    } catch (e: any) {
      const msg = e?.response?.data?.error || e?.message || 'Failed to create connector. Check the API URL and try again.';
      setConnectorFormError(msg);
    } finally {
      setCreatingConnector(false);
    }
  };

  // ─── Inline connector creation form (shared by HTTP/RCS/Flash) ──
  const renderNewConnectorForm = (connectorType: string) => (
    <div className="border-2 border-dashed border-blue-300 rounded-xl p-4 bg-blue-50/30">
      <p className="text-sm font-semibold text-blue-800 mb-3 flex items-center gap-1.5"><Plus size={14}/>Add New {connectorType === 'http' ? 'HTTP' : connectorType === 'rcs' ? 'RCS' : 'Flash SMS'} Connector</p>
      {connectorFormError && (
        <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">{connectorFormError}</div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Input label="Provider" value={newConnector.provider} onChange={(e) => { setConnectorFormError(''); setNewConnector(prev => ({ ...prev, provider: e.target.value })); }} placeholder="e.g. Twilio, Sinch, Infobip" required />
        <Input label="Name (optional)" value={newConnector.name} onChange={(e) => setNewConnector(prev => ({ ...prev, name: e.target.value }))} placeholder="Display name" />
        <Select label="HTTP Method" value={newConnector.http_method} onChange={(e) => setNewConnector(prev => ({ ...prev, http_method: e.target.value }))}
          options={[{ value: 'POST', label: 'POST' }, { value: 'GET', label: 'GET' }]} />
        <div className="md:col-span-2">
          <Input label="Send URL" value={newConnector.send_url} onChange={(e) => { setConnectorFormError(''); setNewConnector(prev => ({ ...prev, send_url: e.target.value })); }}
            placeholder="https://api.provider.com/v1/sms/send" required />
        </div>
        <div className="md:col-span-2">
          <Input label="API Key" value={newConnector.api_key} onChange={(e) => setNewConnector(prev => ({ ...prev, api_key: e.target.value }))} placeholder="Your API key or token" />
        </div>
      </div>
      <div className="flex justify-end gap-2 mt-4">
        <Button variant="secondary" size="sm" onClick={() => { setShowNewConnectorForm(false); setConnectorFormError(''); }}>Cancel</Button>
        <Button size="sm" onClick={() => handleCreateConnector(connectorType)} loading={creatingConnector} icon={<Plus size={14}/>}>
          Create & Select
        </Button>
      </div>
    </div>
  );

  // Pre-populate selected connectors/devices from existing supplier when editing
  useEffect(() => {
    if (!existingSupplier) return;
    const s = existingSupplier as any;
    if (s.api_connector_id) {
      const ct = s.connection_type;
      if (ct === 'http') setSelectedHttpConnector(String(s.api_connector_id));
      if (ct === 'rcs') setSelectedRCSConnector(String(s.api_connector_id));
      if (ct === 'flash_sms') setSelectedFlashSMSConnector(String(s.api_connector_id));
    }
    if (s.voice_otp_config_id) setSelectedVoiceOTPId(String(s.voice_otp_config_id));
    if (Array.isArray(s.whatsapp_device_ids)) setSelectedWhatsAppIds(s.whatsapp_device_ids.map(String));
    if (Array.isArray(s.telegram_device_ids)) setSelectedTelegramIds(s.telegram_device_ids.map(String));
  }, [existingSupplier]);

  // ─── compute linked devices / configs (for "Currently Linked" display) ──
  const s = existingSupplier as any;
  const linkedVoiceConfig = voiceOTPConfigs.find((v: any) => String(v.id) === String(s?.voice_otp_config_id));
  const linkedApiConnector = apiConnectors.find((c: any) => String(c.id) === String(s?.api_connector_id));
  const linkedWhatsAppDevices = socialApiSuppliers.filter((d: any) =>
    Array.isArray(s?.whatsapp_device_ids) && s.whatsapp_device_ids.map(String).includes(String(d.id))
  );
  const linkedTelegramDevices = socialApiSuppliers.filter((d: any) =>
    Array.isArray(s?.telegram_device_ids) && s.telegram_device_ids.map(String).includes(String(d.id))
  );

  // ─── Build connector lists from API-fetched apiConnectors ──────
  const httpConnectors = useMemo(() => apiConnectors.filter((c: any) => c.connector_type === 'http' || !c.connector_type), [apiConnectors]);
  const rcsConnectors = useMemo(() => apiConnectors.filter((c: any) => c.connector_type === 'rcs'), [apiConnectors]);
  const flashSMSConnectors = useMemo(() => apiConnectors.filter((c: any) => c.connector_type === 'flash_sms'), [apiConnectors]);

  // ─── filtered data ────────────────────────────────────────────────
  const connectedWhatsAppDevices = useMemo(() =>
    socialApiSuppliers.filter(s => s.platform === 'whatsapp_cloud' && s.connection_status === 'connected' && s.is_active),
    [socialApiSuppliers]
  );
  const connectedTelegramDevices = useMemo(() =>
    socialApiSuppliers.filter(s => s.platform === 'telegram_bot' && s.connection_status === 'connected' && s.is_active),
    [socialApiSuppliers]
  );

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const connectionTypes = [
    { value: 'smpp', label: 'SMPP', description: 'Standard SMPP protocol connection' },
    { value: 'http', label: 'HTTP API', description: 'REST API based messaging' },
    { value: 'email', label: 'Email', description: 'SMTP-based email delivery' },
    { value: 'ott_whatsapp', label: 'WhatsApp OTT', description: 'WhatsApp Business/Personal' },
    { value: 'ott_telegram', label: 'Telegram OTT', description: 'Telegram Bot messaging' },
    { value: 'voice_otp', label: 'Voice OTP', description: 'Voice call OTP delivery' },
    { value: 'local_bypass', label: 'Local Bypass', description: 'Local SIM/Gateway routing' },
    { value: 'rcs', label: 'RCS', description: 'Rich Communication Services' },
    { value: 'flash_sms', label: 'Flash SMS', description: 'Flash/Class 0 messages' },
  ];

  const generateCode = () => {
    const code = 'SUP' + String(Math.floor(Math.random() * 9000) + 1000);
    setFormData(prev => ({ ...prev, supplier_code: code }));
  };

  const generatePassword = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%';
    let password = '';
    for (let i = 0; i < 12; i++) password += chars.charAt(Math.floor(Math.random() * chars.length));
    setFormData(prev => ({ ...prev, smpp_password: password }));
  };

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!formData.supplier_code) newErrors.supplier_code = 'Supplier code is required';
    if (!formData.company_name) newErrors.company_name = 'Company name is required';
    if (!formData.email) newErrors.email = 'Email is required';
    if (formData.connection_type === 'smpp') {
      if (!formData.is_inbound && !formData.smpp_host) newErrors.smpp_host = 'SMPP host is required';
      if (!formData.smpp_username) newErrors.smpp_username = 'SMPP username is required';
    }
    if (formData.connection_type === 'http') {
      if (!formData.api_url && !selectedHttpConnector) newErrors.api_url = 'API URL or connector is required';
    }
    if (formData.connection_type === 'ott_whatsapp' && selectedWhatsAppIds.length === 0) {
      newErrors.whatsapp = 'Select at least one WhatsApp device';
    }
    if (formData.connection_type === 'ott_telegram' && selectedTelegramIds.length === 0) {
      newErrors.telegram = 'Select at least one Telegram device';
    }
    if (formData.connection_type === 'voice_otp' && !selectedVoiceOTPId) {
      newErrors.voice_otp = 'Select a Voice OTP configuration';
    }
    if (formData.connection_type === 'email') {
      if (!formData.smpp_host) newErrors.smpp_host = 'SMTP host is required';
      if (!formData.smpp_username) newErrors.smpp_username = 'SMTP username is required';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleTest = async () => {
    setTestResult(null);
    await new Promise(resolve => setTimeout(resolve, 2000));
    setTestResult({
      success: Math.random() > 0.3,
      message: Math.random() > 0.3 ? 'Connection successful!' : 'Connection failed: Host unreachable',
    });
  };

  // Auto-fill supplier fields from selected device/connector
  const getCurrentConnectorConfig = (): Partial<typeof formData> => {
    const ct = formData.connection_type;
    if (ct === 'http' && selectedHttpConnector) {
      const c = apiConnectors.find((x: any) => String(x.id) === selectedHttpConnector);
      if (c) return {
        api_url: c.send_url || '',
        api_key: c.api_key || c.api_secret || '',
        company_name: c.provider || c.name || formData.company_name,
      };
    }
    if (ct === 'rcs' && selectedRCSConnector) {
      const c = apiConnectors.find((x: any) => String(x.id) === selectedRCSConnector);
      if (c) return {
        api_url: c.send_url || '',
        api_key: c.api_key || c.api_secret || '',
        company_name: c.provider || c.name || formData.company_name,
      };
    }
    if (ct === 'flash_sms' && selectedFlashSMSConnector) {
      const c = apiConnectors.find((x: any) => String(x.id) === selectedFlashSMSConnector);
      if (c) return {
        api_url: c.send_url || '',
        api_key: c.api_key || c.api_secret || '',
        company_name: c.provider || c.name || formData.company_name,
      };
    }
    if (ct === 'ott_whatsapp' && selectedWhatsAppIds.length > 0) {
      const first = connectedWhatsAppDevices.find(d => d.id === selectedWhatsAppIds[0]);
      if (first) return {
        company_name: first.name || formData.company_name,
        smpp_host: first.phone_number_id || '',
        api_key: first.access_token || '',
      };
    }
    if (ct === 'ott_telegram' && selectedTelegramIds.length > 0) {
      const first = connectedTelegramDevices.find(d => d.id === selectedTelegramIds[0]);
      if (first) return {
        company_name: first.name || formData.company_name,
        smpp_username: first.bot_username || '',
        api_key: first.bot_token || '',
      };
    }
    if (ct === 'voice_otp' && selectedVoiceOTPId) {
      const v = voiceOTPConfigs.find(x => String(x.id) === selectedVoiceOTPId);
      if (v) return {
        company_name: v.language || formData.company_name,
        system_id: v.caller_id || '',
      };
    }
    return {};
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);

    // Merge device/connector auto-fill (user-entered fields win, auto-fill fills gaps)
    const auto = getCurrentConnectorConfig();
    const finalData = { ...auto, ...formData };

    // Attach selected device IDs for multi-select types
    const extras: any = {};
    if (formData.connection_type === 'ott_whatsapp') extras.whatsapp_device_ids = selectedWhatsAppIds;
    if (formData.connection_type === 'ott_telegram') extras.telegram_device_ids = selectedTelegramIds;
    if (formData.connection_type === 'http' && selectedHttpConnector) extras.api_connector_id = selectedHttpConnector;
    if (formData.connection_type === 'rcs' && selectedRCSConnector) extras.api_connector_id = selectedRCSConnector;
    if (formData.connection_type === 'flash_sms' && selectedFlashSMSConnector) extras.api_connector_id = selectedFlashSMSConnector;
    if (formData.connection_type === 'voice_otp' && selectedVoiceOTPId) extras.voice_otp_config_id = selectedVoiceOTPId;

    if (isEditing && existingSupplier) {
      await updateSupplier(existingSupplier.id, { ...finalData, ...extras } as any);
    } else {
      await addSupplier({ ...finalData, ...extras } as any);
    }
    setLoading(false);
    navigate('/suppliers');
  };

  const updateField = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: '' }));
  };

  const renderConnectionSettings = () => {
    const ct = formData.connection_type;

    switch (ct) {
      // ─── SMPP ────────────────────────────────────────────────
      case 'smpp':
        return (
          <Card title="SMPP Connection Settings">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Input label="SMPP Host" value={formData.smpp_host} onChange={(e) => updateField('smpp_host', e.target.value)}
                placeholder={formData.is_inbound ? 'Auto (inbound mode)' : 'smpp.provider.com'} error={errors.smpp_host} disabled={formData.is_inbound} required={!formData.is_inbound} />
              <Input label="SMPP Port" type="number" value={formData.smpp_port} onChange={(e) => updateField('smpp_port', parseInt(e.target.value))} disabled={formData.is_inbound} />
              <Input label="System ID / Username" value={formData.smpp_username} onChange={(e) => updateField('smpp_username', e.target.value)} error={errors.smpp_username} required />
              <div className="flex gap-2"><div className="flex-1"><Input label="Password" value={formData.smpp_password} onChange={(e) => updateField('smpp_password', e.target.value)} /></div>
                <button type="button" onClick={generatePassword} className="mt-7 p-2.5 bg-gray-100 rounded-lg hover:bg-gray-200"><RefreshCw size={18} className="text-gray-600" /></button></div>
              <Input label="System Type" value={formData.system_id} onChange={(e) => updateField('system_id', e.target.value)} placeholder="Optional" />
              <Select label="SMPP Version" value={formData.smpp_version} onChange={(e) => updateField('smpp_version', e.target.value)}
                options={[{ value: 'auto', label: 'Auto-detect' }, { value: '5.0', label: 'SMPP v5.0' }, { value: '3.4', label: 'SMPP v3.4' }, { value: '3.3', label: 'SMPP v3.3' }]} />
              <Select label="System Type" value={formData.smpp_system_type} onChange={(e) => updateField('smpp_system_type', e.target.value)}
                options={[{ value: '', label: 'Empty (EIMS/modern)' }, { value: 'CMT', label: 'CMT (legacy)' }, { value: 'SMPP', label: 'SMPP' }, { value: 'VMA', label: 'VMA' }]} hint="SMPP bind system_type — per-SMSC requirement" />
              <Select label="Bind Type" value={formData.smpp_bind_type} onChange={(e) => updateField('smpp_bind_type', e.target.value)}
                options={[{ value: 'trx', label: 'TRX — Transceiver (default)' }, { value: 'tx', label: 'TX — Transmitter only' }, { value: 'rx', label: 'RX — Receiver only' }]} hint="Some SMSCs require separate TX/RX binds" />
              <Select label="Address TON" value={formData.smpp_addr_ton} onChange={(e) => updateField('smpp_addr_ton', parseInt(e.target.value))}
                options={[{ value: 0, label: '0 — Unknown (default)' }, { value: 1, label: '1 — International' }, { value: 2, label: '2 — Network Specific' }, { value: 5, label: '5 — Alphanumeric' }]} />
              <Select label="Address NPI" value={formData.smpp_addr_npi} onChange={(e) => updateField('smpp_addr_npi', parseInt(e.target.value))}
                options={[{ value: 0, label: '0 — Unknown (default)' }, { value: 1, label: '1 — ISDN' }]} />
              <Select label="Address Range" value={formData.smpp_addr_range} onChange={(e) => updateField('smpp_addr_range', e.target.value)}
                options={[{ value: 'system_id', label: 'system_id (username)' }, { value: '', label: 'Empty string' }, { value: 'null', label: 'Null (no restriction)' }]} hint="Address range in bind PDU" />
            </div>
            <div className="mt-6 p-4 border rounded-lg bg-gray-50 flex items-center justify-between">
              <div><h4 className="font-medium text-gray-800">Inbound Supplier Mode</h4><p className="text-sm text-gray-500">Supplier connects TO us (no public IP needed). For GSM gateways behind NAT.</p></div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" checked={formData.is_inbound} onChange={(e) => updateField('is_inbound', e.target.checked)} className="sr-only peer" />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>
          </Card>
        );

      // ─── HTTP API ────────────────────────────────────────────
      case 'http':
        return (
          <Card title="HTTP API Connector">
            <div className="space-y-4">
              {isEditing && linkedApiConnector && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                  <p className="text-xs font-semibold text-green-700 uppercase tracking-wider mb-2"><Link size={12} className="mr-1 inline"/>Currently Linked</p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="text-sm font-medium text-gray-800">{linkedApiConnector.name || linkedApiConnector.provider}</span>
                    <Badge variant="info" size="sm">{linkedApiConnector.http_method || 'POST'}</Badge>
                    <span className="text-xs font-mono text-green-600 truncate max-w-xs">{linkedApiConnector.send_url || 'N/A'}</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-2">Select a different connector below to change.</p>
                </div>
              )}
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2">
                <Smartphone size={16} className="text-amber-600 mt-0.5" />
                <p className="text-sm text-amber-700">
                  Select a pre-configured API connector or enter custom HTTP settings below. Connectors are managed in the <strong>API Connectors</strong> page.
                </p>
              </div>
              <ConnectorCardGrid
                label="Choose API Connector"
                value={selectedHttpConnector}
                onChange={setSelectedHttpConnector}
                connectors={httpConnectors}
                connectorType="http"
                hint={`${httpConnectors.length} HTTP connector${httpConnectors.length !== 1 ? 's' : ''} available`}
                onAddNew={() => setShowNewConnectorForm(true)}
              />
              {showNewConnectorForm && renderNewConnectorForm('http')}
              {!selectedHttpConnector && (
                <div className="border-t pt-4 mt-4">
                  <p className="text-sm font-medium text-gray-600 mb-3">Or enter custom HTTP settings:</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="md:col-span-2">
                      <Input label="API URL" value={formData.api_url} onChange={(e) => updateField('api_url', e.target.value)}
                        placeholder="https://api.provider.com/sms/send" error={errors.api_url} required />
                    </div>
                    <Select label="HTTP Method" value={formData.api_method} onChange={(e) => updateField('api_method', e.target.value)}
                      options={[{ value: 'POST', label: 'POST' }, { value: 'GET', label: 'GET' }]} />
                    <Input label="API Key" value={formData.api_key} onChange={(e) => updateField('api_key', e.target.value)} placeholder="Your API key" />
                  </div>
                </div>
              )}
              <div className="mt-4 p-4 bg-blue-50 rounded-lg">
                <p className="text-sm text-blue-700"><strong>URL Variables:</strong> {`{{to}}, {{from}}, {{text}}, {{message_id}}, {{apiKey}}`}</p>
              </div>
            </div>
          </Card>
        );

      // ─── WhatsApp OTT ────────────────────────────────────────
      case 'ott_whatsapp':
        return (
          <Card title="WhatsApp OTT — Connected Devices">
            <div className="space-y-4">
              {isEditing && linkedWhatsAppDevices.length > 0 && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                  <p className="text-xs font-semibold text-green-700 uppercase tracking-wider mb-2"><Link size={12} className="mr-1 inline"/>Currently Linked ({linkedWhatsAppDevices.length})</p>
                  <div className="flex flex-wrap gap-2">
                    {linkedWhatsAppDevices.map((d: any) => (
                      <Badge key={d.id} variant="success" size="sm">{d.name}</Badge>
                    ))}
                  </div>
                  <p className="text-xs text-gray-400 mt-2">Select different devices below to change.</p>
                </div>
              )}
              <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-start gap-2">
                <MessageCircle size={16} className="text-green-600 mt-0.5" />
                <p className="text-sm text-green-700">
                  Select one or more connected WhatsApp devices. Manage devices in <strong>Social API Suppliers</strong>.
                </p>
              </div>
              <MultiSelect
                label={`Connected WhatsApp Devices (${connectedWhatsAppDevices.length})`}
                selectedIds={selectedWhatsAppIds}
                onChange={setSelectedWhatsAppIds}
                options={connectedWhatsAppDevices.map(d => ({
                  value: d.id,
                  label: d.name,
                  sub: `Phone: ${d.phone_number_id || 'N/A'}${d.proxy_enabled ? ' · Proxy enabled' : ''}`,
                }))}
                hint="You can select multiple devices — SMS will be load-balanced across them."
              />
              {errors.whatsapp && <p className="text-xs text-red-500">{errors.whatsapp}</p>}
              {connectedWhatsAppDevices.length === 0 && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-center">
                  <p className="text-sm text-yellow-700">No connected WhatsApp devices found.</p>
                  <Button variant="secondary" size="sm" className="mt-2" onClick={() => navigate('/suppliers/social-api')}>
                    Go to Social API Suppliers
                  </Button>
                </div>
              )}
            </div>
          </Card>
        );

      // ─── Telegram OTT ────────────────────────────────────────
      case 'ott_telegram':
        return (
          <Card title="Telegram OTT — Connected Devices">
            <div className="space-y-4">
              {isEditing && linkedTelegramDevices.length > 0 && (
                <div className="bg-sky-50 border border-sky-200 rounded-lg p-3">
                  <p className="text-xs font-semibold text-sky-700 uppercase tracking-wider mb-2"><Link size={12} className="mr-1 inline"/>Currently Linked ({linkedTelegramDevices.length})</p>
                  <div className="flex flex-wrap gap-2">
                    {linkedTelegramDevices.map((d: any) => (
                      <Badge key={d.id} variant="info" size="sm">@{d.bot_username || d.name}</Badge>
                    ))}
                  </div>
                  <p className="text-xs text-gray-400 mt-2">Select different bots below to change.</p>
                </div>
              )}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-start gap-2">
                <Send size={16} className="text-blue-600 mt-0.5" />
                <p className="text-sm text-blue-700">
                  Select one or more connected Telegram bots. Manage bots in <strong>Social API Suppliers</strong>.
                </p>
              </div>
              <MultiSelect
                label={`Connected Telegram Bots (${connectedTelegramDevices.length})`}
                selectedIds={selectedTelegramIds}
                onChange={setSelectedTelegramIds}
                options={connectedTelegramDevices.map(d => ({
                  value: d.id,
                  label: d.name,
                  sub: `Bot: ${d.bot_username || 'N/A'}${d.proxy_enabled ? ' · Proxy enabled' : ''}`,
                }))}
                hint="You can select multiple bots — messages will be load-balanced across them."
              />
              {errors.telegram && <p className="text-xs text-red-500">{errors.telegram}</p>}
              {connectedTelegramDevices.length === 0 && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-center">
                  <p className="text-sm text-yellow-700">No connected Telegram bots found.</p>
                  <Button variant="secondary" size="sm" className="mt-2" onClick={() => navigate('/suppliers/social-api')}>
                    Go to Social API Suppliers
                  </Button>
                </div>
              )}
            </div>
          </Card>
        );

      // ─── Voice OTP ───────────────────────────────────────────
      case 'voice_otp':
        return (
          <Card title="Voice OTP — Country Group Selection">
            <div className="space-y-4">
              {isEditing && linkedVoiceConfig && (
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                  <p className="text-xs font-semibold text-purple-700 uppercase tracking-wider mb-2"><Link size={12} className="mr-1 inline"/>Currently Linked</p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="text-sm font-medium text-gray-800">{linkedVoiceConfig.language || linkedVoiceConfig.language_code}</span>
                    <Badge variant="info" size="sm">{linkedVoiceConfig.caller_id || 'N/A'}</Badge>
                    <span className="text-xs text-purple-600 font-mono">{linkedVoiceConfig.country_prefix || 'All'}</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-2">Select a different config below to change.</p>
                </div>
              )}
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 flex items-start gap-2">
                <Globe size={16} className="text-purple-600 mt-0.5" />
                <p className="text-sm text-purple-700">
                  Select a preconfigured Voice OTP country group. Manage groups in <strong>Voice OTP</strong>.
                </p>
              </div>
              <SearchableDropdown
                label="Choose Voice OTP Configuration"
                value={selectedVoiceOTPId}
                onChange={setSelectedVoiceOTPId}
                placeholder="Search by language or prefix..."
                options={voiceOTPConfigs.map((v: any) => ({
                  value: String(v.id),
                  label: v.language || 'Unnamed',
                  sub: `Prefixes: ${v.country_prefix || 'N/A'}`,
                }))}
                error={errors.voice_otp}
                hint={`${voiceOTPConfigs.length} voice OTP groups configured`}
              />
              {selectedVoiceOTPId && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="flex items-center gap-2"><Check size={16} className="text-green-600" />
                    <span className="text-sm font-medium text-green-700">
                      Using: {voiceOTPConfigs.find((v: any) => String(v.id) === selectedVoiceOTPId)?.language || 'Selected group'}
                    </span>
                  </div>
                </div>
              )}
              {voiceOTPConfigs.length === 0 && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-center">
                  <p className="text-sm text-yellow-700">No Voice OTP configurations found.</p>
                  <Button variant="secondary" size="sm" className="mt-2" onClick={() => navigate('/suppliers/voice-otp')}>
                    Go to Voice OTP
                  </Button>
                </div>
              )}
            </div>
          </Card>
        );

      // ─── RCS ─────────────────────────────────────────────────
      case 'rcs':
        return (
          <Card title="RCS — API Connector Selection">
            <div className="space-y-4">
              {isEditing && linkedApiConnector && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                  <p className="text-xs font-semibold text-green-700 uppercase tracking-wider mb-2"><Link size={12} className="mr-1 inline"/>Currently Linked</p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="text-sm font-medium text-gray-800">{linkedApiConnector.name || linkedApiConnector.provider}</span>
                    <Badge variant="info" size="sm">{linkedApiConnector.http_method || 'POST'}</Badge>
                    <span className="text-xs font-mono text-green-600 truncate max-w-xs">{linkedApiConnector.send_url || 'N/A'}</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-2">Select a different connector below to change.</p>
                </div>
              )}
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 flex items-start gap-2">
                <MessageCircle size={16} className="text-purple-600 mt-0.5" />
                <p className="text-sm text-purple-700">
                  Select a pre-configured RCS API connector. Manage connectors in <strong>API Connectors</strong>.
                </p>
              </div>
              <ConnectorCardGrid
                label="Choose RCS Connector"
                value={selectedRCSConnector}
                onChange={setSelectedRCSConnector}
                connectors={rcsConnectors}
                connectorType="rcs"
                hint={`${rcsConnectors.length} RCS connector${rcsConnectors.length !== 1 ? 's' : ''} available`}
                onAddNew={() => setShowNewConnectorForm(true)}
              />
              {showNewConnectorForm && renderNewConnectorForm('rcs')}
              {!selectedRCSConnector && (
                <div className="border-t pt-4 mt-4">
                  <p className="text-sm font-medium text-gray-600 mb-3">Or enter custom RCS settings:</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="md:col-span-2"><Input label="API URL" value={formData.api_url} onChange={(e) => updateField('api_url', e.target.value)} placeholder="https://rcs.provider.com/send" /></div>
                    <Input label="API Key" value={formData.api_key} onChange={(e) => updateField('api_key', e.target.value)} placeholder="Your API key" />
                  </div>
                </div>
              )}
            </div>
          </Card>
        );

      // ─── Flash SMS ───────────────────────────────────────────
      case 'flash_sms':
        return (
          <Card title="Flash SMS — API Connector Selection">
            <div className="space-y-4">
              {isEditing && linkedApiConnector && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                  <p className="text-xs font-semibold text-green-700 uppercase tracking-wider mb-2"><Link size={12} className="mr-1 inline"/>Currently Linked</p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="text-sm font-medium text-gray-800">{linkedApiConnector.name || linkedApiConnector.provider}</span>
                    <Badge variant="info" size="sm">{linkedApiConnector.http_method || 'POST'}</Badge>
                    <span className="text-xs font-mono text-green-600 truncate max-w-xs">{linkedApiConnector.send_url || 'N/A'}</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-2">Select a different connector below to change.</p>
                </div>
              )}
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 flex items-start gap-2">
                <Zap size={16} className="text-yellow-600 mt-0.5" />
                <p className="text-sm text-yellow-700">
                  Select a pre-configured Flash SMS API connector. Manage connectors in <strong>API Connectors</strong>.
                </p>
              </div>
              <ConnectorCardGrid
                label="Choose Flash SMS Connector"
                value={selectedFlashSMSConnector}
                onChange={setSelectedFlashSMSConnector}
                connectors={flashSMSConnectors}
                connectorType="flash_sms"
                hint={`${flashSMSConnectors.length} Flash SMS connector${flashSMSConnectors.length !== 1 ? 's' : ''} available`}
                onAddNew={() => setShowNewConnectorForm(true)}
              />
              {showNewConnectorForm && renderNewConnectorForm('flash_sms')}
              {!selectedFlashSMSConnector && (
                <div className="border-t pt-4 mt-4">
                  <p className="text-sm font-medium text-gray-600 mb-3">Or enter custom Flash SMS settings:</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="md:col-span-2"><Input label="API URL" value={formData.api_url} onChange={(e) => updateField('api_url', e.target.value)} placeholder="https://flash.provider.com/send" /></div>
                    <Input label="API Key" value={formData.api_key} onChange={(e) => updateField('api_key', e.target.value)} placeholder="Your API key" />
                  </div>
                </div>
              )}
            </div>
          </Card>
        );

      // ─── Email ───────────────────────────────────────────────
      case 'email':
        return (
          <Card title="SMTP Email Settings">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Input label="SMTP Host" value={formData.smpp_host} onChange={(e) => updateField('smpp_host', e.target.value)}
                placeholder="smtp.provider.com" error={errors.smpp_host} required />
              <Input label="SMTP Port" type="number" value={formData.smpp_port} onChange={(e) => updateField('smpp_port', parseInt(e.target.value))} placeholder="587" />
              <Input label="SMTP Username" value={formData.smpp_username} onChange={(e) => updateField('smpp_username', e.target.value)} error={errors.smpp_username} required />
              <Input label="SMTP Password" type="password" value={formData.smpp_password} onChange={(e) => updateField('smpp_password', e.target.value)} />
              <Input label="From Email Address" value={formData.system_id} onChange={(e) => updateField('system_id', e.target.value)}
                placeholder="sms@yourcompany.com" hint="Sender email address for OTP delivery" />
            </div>
            <div className="mt-4 p-4 bg-blue-50 rounded-lg">
              <p className="text-sm text-blue-700"><strong>Email Delivery:</strong> OTP and SMS messages will be delivered via email using SMTP. Configure the recipient email per client or per message.</p>
            </div>
          </Card>
        );

      // ─── Local Bypass ────────────────────────────────────────
      case 'local_bypass':
        return (
          <Card title="Local Bypass Settings">
            <div className="p-8 text-center text-gray-500">
              <Smartphone size={32} className="mx-auto mb-3 opacity-30" />
              <p className="font-medium">Local Bypass / GSM Gateway</p>
              <p className="text-sm mt-1">Configure SMS routing through local SIM gateways.</p>
              <p className="text-xs text-gray-400 mt-2">Connect an Android device via the SMS Gateway app and register it as an inbound supplier.</p>
            </div>
          </Card>
        );

      default:
        return (
          <Card title="Connection Settings">
            <div className="p-8 text-center text-gray-500">
              <p>Configure connection details for {formData.connection_type.toUpperCase()}</p>
            </div>
          </Card>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={() => navigate(-1)} className="p-2 hover:bg-gray-100 rounded-lg">
          <ArrowLeft size={20} className="text-gray-600" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-800">{isEditing ? 'Edit Supplier' : 'Add New Supplier'}</h1>
          <p className="text-gray-500 mt-1">{isEditing ? 'Update supplier configuration' : 'Configure a new vendor connection'}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Company Information */}
        <Card title="Company Information">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="flex gap-2">
              <div className="flex-1"><Input label="Supplier Code" value={formData.supplier_code} onChange={(e) => updateField('supplier_code', e.target.value)} placeholder="SUP001" error={errors.supplier_code} required /></div>
              <button type="button" onClick={generateCode} className="mt-7 p-2.5 bg-gray-100 rounded-lg hover:bg-gray-200"><RefreshCw size={18} className="text-gray-600" /></button>
            </div>
            <Input label="Company Name" value={formData.company_name} onChange={(e) => updateField('company_name', e.target.value)} placeholder="SMS Provider Ltd" error={errors.company_name} required />
            <Input label="Contact Person" value={formData.contact_person} onChange={(e) => updateField('contact_person', e.target.value)} placeholder="John Smith" />
            <Input label="Email" type="email" value={formData.email} onChange={(e) => updateField('email', e.target.value)} placeholder="contact@provider.com" error={errors.email} required />
            <Input label="Phone" value={formData.phone} onChange={(e) => updateField('phone', e.target.value)} placeholder="+1234567890" />
          </div>
        </Card>

        {/* Connection Type Selection */}
        <Card title="Connection Type">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {connectionTypes.map(type => (
              <label key={type.value} className={`flex flex-col p-4 rounded-xl border-2 cursor-pointer transition-all ${formData.connection_type === type.value ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}>
                <input type="radio" name="connection_type" value={type.value} checked={formData.connection_type === type.value} onChange={(e) => updateField('connection_type', e.target.value)} className="sr-only" />
                <span className="font-medium text-gray-800">{type.label}</span>
                <span className="text-xs text-gray-500 mt-1">{type.description}</span>
              </label>
            ))}
          </div>
        </Card>

        {/* Connection Settings (dynamic based on type) */}
        {renderConnectionSettings()}

        {/* Billing Settings */}
        <Card title="Billing Settings">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Select label="Currency" value={formData.currency} onChange={(e) => updateField('currency', e.target.value)}
              options={[{ value: 'EUR', label: 'Euro (EUR)' }, { value: 'USD', label: 'US Dollar (USD)' }, { value: 'GBP', label: 'British Pound (GBP)' }]} />
            <Input label="Initial Balance" type="number" value={formData.balance} onChange={(e) => updateField('balance', parseFloat(e.target.value))} />
            <Input label="Credit Limit" type="number" value={formData.credit_limit} onChange={(e) => updateField('credit_limit', parseFloat(e.target.value))} />
          </div>
        </Card>

        {/* DLR Settings */}
        <Card title="Force DLR Settings">
          <div className="space-y-4">
            <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={formData.force_dlr} onChange={(e) => updateField('force_dlr', e.target.checked)} className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" /><span className="text-sm font-medium text-gray-700">Force DLR</span></label>
            {formData.force_dlr && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-gray-50 rounded-lg border">
                <Select label="DLR Timeout Mode" value={formData.force_dlr_timeout_mode} onChange={(e) => updateField('force_dlr_timeout_mode', e.target.value)} options={[{ value: 'fixed', label: 'Fixed (seconds)' }, { value: 'random_0_5', label: 'Random 0-5 seconds' }, { value: 'random_0_10', label: 'Random 0-10 seconds' }]} />
                {formData.force_dlr_timeout_mode === 'fixed' && <Input label="DLR Timeout (seconds)" type="number" value={formData.dlr_timeout} onChange={(e) => updateField('dlr_timeout', parseInt(e.target.value))} min={1} max={86400} hint="Wait this many seconds before forcing delivery status" />}
                {formData.force_dlr_timeout_mode !== 'fixed' && <Input label="DLR Timeout" value={formData.force_dlr_timeout_mode === 'random_0_5' ? '0–5 seconds (random)' : '0–10 seconds (random)'} disabled hint="Randomized per message for testing" />}
              </div>
            )}
          </div>
        </Card>

        {/* Test Connection */}
        {(formData.connection_type === 'smpp' || formData.connection_type === 'http') && (
          <Card title="Test Connection">
            <div className="flex items-center gap-4">
              <Button type="button" variant="secondary" icon={<TestTube size={18} />} onClick={handleTest}>Test Connection</Button>
              {testResult && <Badge variant={testResult.success ? 'success' : 'danger'}>{testResult.message}</Badge>}
            </div>
          </Card>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-4">
          <Button variant="secondary" type="button" onClick={() => navigate(-1)}>Cancel</Button>
          <Button type="submit" icon={<Save size={18} />} loading={loading}>{isEditing ? 'Update Supplier' : 'Create Supplier'}</Button>
        </div>
      </form>
    </div>
  );
};
