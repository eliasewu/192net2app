import React, { useState, useEffect, useMemo } from 'react';
import { Wifi, WifiOff, RefreshCw, AlertTriangle, Clock, ArrowRight, XCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../store/DataContext';
import { Card } from '../components/UI/Card';
import { Button } from '../components/UI/Button';
import { Badge } from '../components/UI/Badge';
import { useToast } from '../components/UI/Toast';
import { api } from '../services/api';

export const BindStatus: React.FC = () => {
  const navigate = useNavigate();
  const { suppliers, reloadSuppliers, clients } = useData();
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [clientBindStatuses, setClientBindStatuses] = useState<any[]>([]);
  const [supplierBindDetails, setSupplierBindDetails] = useState<any[]>([]);

  // Fetch real bind status from smpp_sessions via /api/bind/client-status
  const fetchClientBindStatus = async () => {
    try {
      const r = await api.get('/bind/client-status');
      if (r?.success && Array.isArray(r.data)) {
        setClientBindStatuses(r.data);
      }
    } catch { /* keep existing state on failure */ }
  };

  // Fetch real supplier bind details from /api/bind/status (includes session fields)
  const fetchSupplierBindDetails = async () => {
    try {
      const r = await api.get('/bind/status');
      if (r?.success && Array.isArray(r.data)) {
        setSupplierBindDetails(r.data);
      }
    } catch { /* keep existing state on failure */ }
  };

  useEffect(() => {
    fetchClientBindStatus();
    fetchSupplierBindDetails();
  }, [lastRefresh]);

  // Get client bind status from real smpp_sessions data
  const getClientBindStatus = (clientId: string): { status: 'bound' | 'unbound' | 'error'; session?: any } => {
    const cs = clientBindStatuses.find((s: any) => String(s.id) === String(clientId));
    if (cs && cs.bind_status === 'bound') return { status: 'bound', session: cs };
    return { status: 'unbound', session: cs };
  };

  // Get supplier session details from real smpp_sessions data
  const getSupplierSession = (supplierId: string): any => {
    return supplierBindDetails.find((s: any) => String(s.id) === String(supplierId)) || null;
  };

  // Only active (non-deleted) clients — API now filters is_deleted=false
  const allBindClients = useMemo(() => clients, [clients]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => setLastRefresh(new Date()), 30000);
    return () => clearInterval(interval);
  }, [autoRefresh]);

  const smppSuppliers = useMemo(() => {
    return suppliers.filter(s => ['smpp', 'http', 'voice_otp', 'local_bypass'].includes(s.connection_type));
  }, [suppliers]);

  const ottSuppliers = useMemo(() => {
    return suppliers.filter(s => ['ott_whatsapp', 'ott_telegram'].includes(s.connection_type));
  }, [suppliers]);

  const supplierStats = {
    total: smppSuppliers.length + ottSuppliers.length,
    bound: [...smppSuppliers, ...ottSuppliers].filter(s => s.bind_status === 'bound').length,
    unbound: [...smppSuppliers, ...ottSuppliers].filter(s => s.bind_status === 'unbound').length,
    error: [...smppSuppliers, ...ottSuppliers].filter(s => s.bind_status === 'error').length,
    blocked: [...smppSuppliers, ...ottSuppliers].filter(s => s.consecutive_failures >= 20).length,
  };

  const clientStats = {
    total: allBindClients.length,
    bound: allBindClients.filter(c => getClientBindStatus(c.id).status === 'bound').length,
    unbound: allBindClients.filter(c => getClientBindStatus(c.id).status === 'unbound').length,
    active: clients.filter(c => c.status === 'active').length,
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'bound': return <Wifi size={18} className="text-green-500" />;
      case 'unbound': return <WifiOff size={18} className="text-red-400" />;
      case 'binding': return <Clock size={18} className="text-yellow-500 animate-pulse" />;
      case 'error': return <AlertTriangle size={18} className="text-red-500" />;
      default: return <WifiOff size={18} className="text-red-400" />;
    }
  };

  const getStatusBadge = (status: string, failures?: number) => {
    if (failures !== undefined && failures >= 20) {
      return <Badge variant="danger" dot>BLOCKED</Badge>;
    }
    const variants: Record<string, 'success' | 'warning' | 'danger' | 'default'> = {
      bound: 'success', unbound: 'danger', binding: 'warning', error: 'danger',
    };
    return <Badge variant={variants[status] || 'danger'} dot size="sm">{status.toUpperCase()}</Badge>;
  };

  // Render helper for supplier cards (plain function, not a nested component)
  const renderSupplierCard = (supplier: any, type: 'smpp' | 'ott') => {
    const session = getSupplierSession(supplier.id);
    const hasValidConfig = type === 'ott' || (supplier.smpp_host && supplier.smpp_port && supplier.smpp_username);
    return (
      <div key={supplier.id}
        className={`p-4 rounded-xl border-2 transition-all ${
          supplier.bind_status === 'bound' ? 'border-green-200 bg-green-50' :
          supplier.bind_status === 'error' || supplier.consecutive_failures >= 20 ? 'border-red-200 bg-red-50' :
          'border-red-200 bg-red-50'
        }`}>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            {type === 'smpp' ? getStatusIcon(supplier.bind_status) : (
              <div className={`p-2 rounded-lg ${supplier.connection_type === 'ott_whatsapp' ? 'bg-green-500' : 'bg-blue-500'}`}>
                <span className="text-white text-lg">{supplier.connection_type === 'ott_whatsapp' ? '📱' : '✈️'}</span>
              </div>
            )}
            <div>
              <div className="flex items-center gap-1.5">
                <p className="font-semibold text-gray-800 text-sm">{supplier.supplier_code}</p>
              </div>
              <p className="text-xs text-gray-600">{supplier.company_name}</p>
            </div>
          </div>
          {getStatusBadge(supplier.bind_status, supplier.consecutive_failures)}
        </div>
        <div className="mt-3 space-y-1.5 text-xs">
          {type === 'smpp' ? (
            <>
              <div className="flex justify-between"><span className="text-gray-500">Type:</span><span className="font-medium text-gray-700">{supplier.connection_type.toUpperCase()}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Host:</span><span className="font-mono text-gray-700">{supplier.smpp_host || 'N/A'}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Port:</span><span className="font-mono text-gray-700">{supplier.smpp_port || 'N/A'}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Connected IP:</span><span className="font-mono text-gray-700">{session?.ip_address || '—'}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">SMPP Version:</span><span className="font-medium text-gray-700">{session?.negotiated_version || '—'}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Bind Mode:</span><span className="font-medium text-gray-700">{session?.bind_mode || '—'}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Connected At:</span><span className="font-medium text-gray-700">{session?.connected_at ? new Date(session.connected_at).toLocaleString() : '—'}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Failures:</span>
                <span className={`font-medium ${supplier.consecutive_failures > 10 ? 'text-red-600' : supplier.consecutive_failures > 0 ? 'text-yellow-600' : 'text-green-600'}`}>{supplier.consecutive_failures}</span>
              </div>
              {(supplier.bind_status === 'unbound' || supplier.bind_status === 'error') && session?.last_error && (
              <div className="flex justify-between">
                <span className="text-gray-500">Last Error:</span>
                <span className="font-medium text-red-600 text-xs text-right max-w-[180px] truncate" title={session.last_error + (session.last_error_at ? ' — ' + new Date(session.last_error_at).toLocaleString() : '')}>
                  {session.last_error}{session.last_error_at ? ' — ' + new Date(session.last_error_at).toLocaleString() : ''}
                </span>
              </div>
              )}
            </>
          ) : (
            <>
              <div className="flex justify-between"><span className="text-gray-500">Platform:</span><span className="font-medium text-gray-700">{supplier.connection_type === 'ott_whatsapp' ? 'WhatsApp' : 'Telegram'}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Status:</span><span className={`font-medium ${supplier.bind_status === 'bound' ? 'text-green-600' : 'text-red-600'}`}>{supplier.bind_status === 'bound' ? 'Connected' : 'Disconnected'}</span></div>
            </>
          )}
        </div>
        {type === 'smpp' && (
        <div className="mt-3 flex gap-2">
          {supplier.bind_status === 'bound' ? (
            <Button size="sm" variant="danger" className="flex-1" onClick={() => handleDisconnect(supplier.id)} loading={supplierActionLoading === supplier.id}>Disconnect</Button>
          ) : (
            <>
              <Button size="sm" variant="success" className="flex-1" disabled={!hasValidConfig} onClick={() => handleReconnect(supplier.id)} loading={supplierActionLoading === supplier.id}>
                {hasValidConfig ? 'Reconnect' : 'No Config'}
              </Button>
              <Button size="sm" variant="secondary" onClick={() => navigate(`/suppliers/${supplier.id}/edit`)} title="Edit config">
                <ArrowRight size={14} />
              </Button>
            </>
          )}
        </div>
        )}
        {type === 'ott' && (
        <div className="mt-3 flex gap-2">
          <Button size="sm" variant="secondary" className="flex-1" onClick={() => navigate(`/suppliers/${supplier.id}/edit`)} title="Edit OTT config">
            <ArrowRight size={14} />
          </Button>
        </div>
        )}
      </div>
    );
  };

  const handleReconnect = async (supplierId: string) => {
    setSupplierActionLoading(supplierId);
    try {
      const r = await api.post(`/bind/${supplierId}/connect`, {});
      if (r?.success) {
        await reloadSuppliers();
        addToast('success', r?.message || 'Supplier reconnected');
        setLastRefresh(new Date());
      } else {
        addToast('error', r?.message || r?.error || 'Reconnect failed');
      }
    } catch {
      addToast('error', 'Failed to reconnect — network error');
    } finally {
      setSupplierActionLoading(null);
    }
  };

  const handleDisconnect = async (supplierId: string) => {
    setSupplierActionLoading(supplierId);
    try {
      const r = await api.post(`/bind/${supplierId}/disconnect`, {});
      if (r?.success) {
        await reloadSuppliers();
        addToast('success', r?.message || 'Supplier disconnected');
        setLastRefresh(new Date());
      } else {
        addToast('error', r?.error || 'Disconnect failed');
      }
    } catch {
      addToast('error', 'Failed to disconnect — network error');
    } finally {
      setSupplierActionLoading(null);
    }
  };

  const { addToast } = useToast();

  const [disconnectingClient, setDisconnectingClient] = useState<string | null>(null);
  const [supplierActionLoading, setSupplierActionLoading] = useState<string | null>(null);

  const handleClientDisconnect = async (clientId: string) => {
    setDisconnectingClient(clientId);
    try {
      const r = await api.post(`/bind/client/${clientId}/disconnect`, {});
      if (r?.success) {
        addToast('success', r?.message || 'Client disconnected');
        fetchClientBindStatus();
        setLastRefresh(new Date());
      } else {
        addToast('error', r?.error || 'Failed to disconnect client');
      }
    } catch {
      addToast('error', 'Failed to disconnect client — network error');
    } finally {
      setDisconnectingClient(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Bind Status</h1>
          <p className="text-gray-500 mt-1">Monitor Client and Supplier SMPP/OTT connection status</p>
        </div>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)} className="w-4 h-4 rounded border-gray-300 text-blue-600" />
            <span className="text-sm text-gray-600">Auto-refresh</span>
          </label>
          <span className="text-sm text-gray-500">Updated: {lastRefresh.toLocaleTimeString()}</span>
          <Button variant="secondary" icon={<RefreshCw size={16} />} onClick={() => setLastRefresh(new Date())}>Refresh</Button>
        </div>
      </div>

      {/* Combined Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <div className="bg-white rounded-xl p-3 border text-center">
          <p className="text-xs text-gray-500">Total Clients</p>
          <p className="text-xl font-bold text-gray-800">{clientStats.total}</p>
          <p className="text-[10px] text-gray-400">{clientStats.active} active</p>
        </div>
        <div className="bg-white rounded-xl p-3 border text-center">
          <p className="text-xs text-gray-500">Clients Bound</p>
          <p className="text-xl font-bold text-green-600">{clientStats.bound}</p>
          <p className="text-[10px] text-gray-400">{clientStats.unbound} unbound</p>
        </div>
        <div className="bg-white rounded-xl p-3 border text-center">
          <p className="text-xs text-gray-500">Total Suppliers</p>
          <p className="text-xl font-bold text-gray-800">{supplierStats.total}</p>
        </div>
        <div className="bg-white rounded-xl p-3 border text-center">
          <p className="text-xs text-gray-500">Suppliers Bound</p>
          <p className="text-xl font-bold text-green-600">{supplierStats.bound}</p>
          <p className="text-[10px] text-gray-400">{supplierStats.unbound} unbound</p>
        </div>
        <div className="bg-white rounded-xl p-3 border text-center">
          <p className="text-xs text-gray-500">Errors</p>
          <p className="text-xl font-bold text-red-600">{supplierStats.error}</p>
        </div>
        <div className="bg-white rounded-xl p-3 border text-center">
          <p className="text-xs text-gray-500">Blocked</p>
          <p className="text-xl font-bold text-orange-600">{supplierStats.blocked}</p>
        </div>
        <div className="bg-white rounded-xl p-3 border text-center">
          <p className="text-xs text-gray-500">SMPP</p>
          <p className="text-xl font-bold text-blue-600">{smppSuppliers.length}</p>
        </div>
        <div className="bg-white rounded-xl p-3 border text-center">
          <p className="text-xs text-gray-500">OTT</p>
          <p className="text-xl font-bold text-purple-600">{ottSuppliers.length}</p>
        </div>
      </div>

      {/* Unbound / Broken warning banner */}
      {(() => {
        const unbound = suppliers.filter(s => s.bind_status !== 'bound' && s.status === 'active');
        const blocked = suppliers.filter(s => s.consecutive_failures >= 20);
        if (unbound.length === 0 && blocked.length === 0) return null;
        return (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex flex-col md:flex-row items-start md:items-center gap-4">
            <div className="flex items-center gap-2 flex-shrink-0">
              <AlertTriangle size={20} className="text-amber-600" />
              <span className="font-semibold text-amber-800 text-sm">Connection Issues</span>
            </div>
            <div className="flex-1 text-sm text-amber-700">
              {unbound.length > 0 && <span>{unbound.length} supplier{unbound.length !== 1 ? 's' : ''} unbound. </span>}
              {blocked.length > 0 && <span>{blocked.length} supplier{blocked.length !== 1 ? 's' : ''} blocked.</span>}
            </div>
            <div className="flex gap-2 flex-shrink-0">
              <Button variant="secondary" size="sm" onClick={() => navigate('/suppliers')} icon={<ArrowRight size={14} />}>View Suppliers</Button>
            </div>
          </div>
        );
      })()}

      {/* Client Bind Status — shows only active clients, real SMPP session state */}
      <Card title="Client Bind Status" subtitle={`${allBindClients.length} clients — Green = SMPP bound, Red/Gray = not bound`}>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {allBindClients.map(client => {
            const clientStatus = getClientBindStatus(client.id);
            return (
              <div key={client.id}
                className={`p-4 rounded-xl border-2 transition-all ${
                  clientStatus.status === 'bound' ? 'border-green-200 bg-green-50' :
                  'border-red-200 bg-red-50'
                }`}>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    {getStatusIcon(clientStatus.status)}
                    <div>
                      <div className="flex items-center gap-1.5">
                        <p className="font-semibold text-gray-800 text-sm">{client.client_code}</p>
                      </div>
                      <p className="text-xs text-gray-600">{client.company_name}</p>
                    </div>
                  </div>
                  {getStatusBadge(clientStatus.status)}
                </div>
                <div className="mt-3 space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-gray-500">SMPP Username:</span>
                    <span className="font-mono text-gray-700">{client.smpp_username || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">IP(s) Allowed:</span>
                    <span className="font-mono text-gray-700">
                      {(() => {
                        const ips = [];
                        if (client.smpp_ip && client.smpp_ip !== '0.0.0.0') ips.push(client.smpp_ip);
                        const multiIps = (client as any).client_ips;
                        if (multiIps) multiIps.split(/[,\n;]+/).filter(Boolean).forEach((ip: string) => ips.push(ip.trim()));
                        return ips.length > 0 ? ips.slice(0,3).join(', ') + (ips.length > 3 ? ` +${ips.length-3} more` : '') : 'Any';
                      })()}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Connected IP:</span>
                    <span className="font-mono text-gray-700">
                      {clientStatus.session?.ip_address || '—'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">SMPP Version:</span>
                    <span className="font-medium text-gray-700">
                      {clientStatus.session?.negotiated_version || '—'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Route Plan:</span>
                    <span className={`font-medium ${client.routing_plan_id ? 'text-green-600' : 'text-red-600'}`}>
                      {client.routing_plan_id ? 'Assigned' : 'None'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Max TPS:</span>
                    <span className="font-medium text-gray-700">{client.max_tps}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Status:</span>
                    <Badge variant={client.status === 'active' ? 'success' : 'danger'} size="sm">{client.status}</Badge>
                  </div>
                </div>
                <div className="mt-3 flex gap-2">
                  {clientStatus.status === 'bound' ? (
                    <Button
                      size="sm"
                      variant="danger"
                      className="flex-1"
                      onClick={() => handleClientDisconnect(client.id)}
                      loading={disconnectingClient === client.id}
                      icon={<XCircle size={14} />}
                    >
                      Disconnect
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="secondary"
                      className="flex-1"
                      onClick={() => navigate(`/clients/${client.id}/edit`)}
                      icon={<ArrowRight size={14} />}
                    >
                      Edit Client
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Supplier Bind Status - SMPP */}
      <Card title="Supplier — SMPP / HTTP Connections" subtitle={`${smppSuppliers.length} connections`}>
        {smppSuppliers.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <span className="text-4xl">🔌</span>
            <p className="mt-2">No SMPP/HTTP suppliers configured</p>
            <p className="text-xs mt-1 mb-4">Add a supplier to monitor its connection status here</p>
            <Button variant="secondary" size="sm" onClick={() => navigate('/suppliers/add')}>
              <ArrowRight size={14} className="mr-1" /> Add Supplier
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {smppSuppliers.map(supplier => renderSupplierCard(supplier, 'smpp'))}
          </div>
        )}
      </Card>

      {/* Supplier Bind Status - OTT */}
      <Card title="Supplier — OTT Connections (WhatsApp / Telegram)" subtitle={`${ottSuppliers.length} connections`}>
        {ottSuppliers.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <span className="text-4xl">📱</span>
            <p className="mt-2">No WhatsApp/Telegram suppliers configured</p>
            <p className="text-xs mt-1 mb-4">Pair OTT devices then add an OTT supplier to monitor here</p>
            <div className="flex items-center justify-center gap-2">
              <Button variant="secondary" size="sm" onClick={() => navigate('/suppliers/social-api')}>
                <ArrowRight size={14} className="mr-1" /> Social API
              </Button>
              <Button variant="secondary" size="sm" onClick={() => navigate('/business-api-connect')}>
                <ArrowRight size={14} className="mr-1" /> Business API
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {ottSuppliers.map(supplier => renderSupplierCard(supplier, 'ott'))}
          </div>
        )}
      </Card>

      {/* Routing Flow Diagram */}
      <Card title="SMS Routing Flow">
        <div className="bg-gray-50 rounded-xl p-6">
          <div className="flex flex-wrap items-center justify-center gap-3 text-center">
            {[
              { emoji:'📱', label:'Client\nSMPP Bind', desc:'username/password\nIP whitelist' },
              { emoji:'✅', label:'Validation', desc:'Rate + Balance\n+ Credit Check' },
              { emoji:'🗺️', label:'Route Map', desc:'MCCMNC Pattern\nMatch' },
              { emoji:'🔀', label:'Route\nSelection', desc:'Priority / LCR\n/ Percentage' },
              { emoji:'🔗', label:'Trunk\nSelection', desc:'Supplier Bind\nStatus Check' },
              { emoji:'🏢', label:'Supplier\nGateway', desc:'SMPP/HTTP\n/OTT' },
              { emoji:'📩', label:'DLR\nCallback', desc:'Delivery\nReceipt' },
            ].map((step, i) => (
              <div key={i} className="flex flex-col items-center">
                <div className="bg-white p-3 rounded-lg shadow-sm border border-gray-200 min-w-[100px]">
                  <div className="text-xl mb-1">{step.emoji}</div>
                  <p className="text-xs font-medium text-gray-800 whitespace-pre-line">{step.label}</p>
                  <p className="text-[10px] text-gray-500 whitespace-pre-line">{step.desc}</p>
                </div>
                {i < 6 && <div className="text-lg text-gray-400 mt-1">↓</div>}
              </div>
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
};
