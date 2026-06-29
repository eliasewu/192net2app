import React, { useState } from 'react';
import { Plus, Search, Smartphone, Trash2, RefreshCw, QrCode, Power, Wifi, WifiOff, Shield, Copy, Check, Download } from 'lucide-react';
import QRCode from 'qrcode';
import { useData } from '../../store/DataContext';
import { Card } from '../../components/UI/Card';
import { Button } from '../../components/UI/Button';
import { Badge } from '../../components/UI/Badge';
import { exportCSV, exportExcel } from '../../services/exportService';
import { Modal } from '../../components/UI/Modal';
import { Input, Select } from '../../components/UI/Input';
import { OTTDevice } from '../../types';

export const OTTDevices: React.FC = () => {
  const { ottDevices, suppliers, residentialProxies, addOTTDevice, updateOTTDevice, deleteOTTDevice } = useData();
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [deleteModal, setDeleteModal] = useState<OTTDevice | null>(null);
  const [qrModal, setQrModal] = useState<OTTDevice | null>(null);
  const [generatingQR, setGeneratingQR] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [formData, setFormData] = useState({
    device_name: '',
    device_type: 'whatsapp' as 'whatsapp' | 'telegram',
    phone_number: '',
    supplier_id: '',
  });

  const filteredDevices = ottDevices.filter(device =>
    device.device_name.toLowerCase().includes(search.toLowerCase()) ||
    device.phone_number.includes(search)
  );

  const ottSuppliers = suppliers.filter(s =>
    ['ott_whatsapp', 'ott_telegram'].includes(s.connection_type)
  );

  const onlineProxies = residentialProxies.filter(p => p.is_online);

  const generateQR = async (device: OTTDevice): Promise<string> => {
    // Include device info in QR payload (no DB ID dependency — IDs are assigned server-side).
    // The scanning app matches by phone_number + device_type + a pairing nonce.
    const pairingNonce = Math.random().toString(36).substring(2, 10);
    const payload = JSON.stringify({
      name: device.device_name,
      type: device.device_type,
      phone: device.phone_number,
      nonce: pairingNonce,
      ts: Date.now(),
    });
    return QRCode.toDataURL(payload, {
      width: 400,
      margin: 2,
      color: { dark: '#1a1a2e', light: '#ffffff' },
      errorCorrectionLevel: 'M',
    });
  };

  const handleCreate = async () => {
    setGeneratingQR(true);
    try {
      // Create a temporary device object for QR generation (server assigns real ID later)
      const tempDevice: OTTDevice = {
        id: '',
        device_name: formData.device_name,
        device_type: formData.device_type,
        phone_number: formData.phone_number,
        supplier_id: formData.supplier_id,
        session_status: 'qr_pending',
        qr_code: null,
        last_active: null,
        created_at: new Date().toISOString(),
      };
      const qrDataUrl = await generateQR(tempDevice);
      await addOTTDevice({
        ...formData,
        session_status: 'qr_pending',
        qr_code: qrDataUrl,
        last_active: null,
      });
    } catch {
      await addOTTDevice({
        ...formData,
        session_status: 'qr_pending',
        qr_code: null,
        last_active: null,
      });
    }
    setGeneratingQR(false);
    setShowModal(false);
    setFormData({
      device_name: '',
      device_type: 'whatsapp',
      phone_number: '',
      supplier_id: '',
    });
  };

  const handleRegenerateQR = async (device: OTTDevice) => {
    try {
      const qrDataUrl = await generateQR(device);
      updateOTTDevice(device.id, { qr_code: qrDataUrl });
    } catch {
      // Keep existing QR on failure
    }
  };

  const handleDelete = async () => {
    if (deleteModal) {
      setDeleting(true);
      try {
        await deleteOTTDevice(deleteModal.id);
        setDeleteModal(null);
      } finally {
        setDeleting(false);
      }
    }
  };

  const handleConnect = (device: OTTDevice) => {
    updateOTTDevice(device.id, {
      session_status: 'connected',
      qr_code: null,
      last_active: new Date().toISOString()
    });
  };

  const handleDisconnect = (device: OTTDevice) => {
    updateOTTDevice(device.id, {
      session_status: 'disconnected',
      last_active: null
    });
  };

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, { variant: 'success' | 'warning' | 'danger' | 'default'; label: string }> = {
      connected: { variant: 'success', label: 'Connected' },
      disconnected: { variant: 'default', label: 'Disconnected' },
      qr_pending: { variant: 'warning', label: 'QR Pending' },
      error: { variant: 'danger', label: 'Error' },
    };
    const config = statusMap[status] || { variant: 'default' as const, label: status };
    return <Badge variant={config.variant} dot>{config.label}</Badge>;
  };

  const handleDownloadQR = (device: OTTDevice) => {
    if (!device.qr_code) return;
    const link = document.createElement('a');
    link.download = `${device.device_name.replace(/[^a-z0-9]/gi, '_')}_qr.png`;
    link.href = device.qr_code;
    link.click();
  };

  const handleCopyQR = async (device: OTTDevice) => {
    if (!device.qr_code) return;
    // Copy the QR data URL as text (works cross-browser)
    try {
      await navigator.clipboard.writeText(device.qr_code);
      setCopiedId(device.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // Clipboard API might not be available
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">OTT Device Pairing</h1>
          <p className="text-gray-500 mt-1">Manage WhatsApp and Telegram device connections</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" icon={<Download size={16}/>} onClick={()=>exportCSV('ott_devices_export.csv',['Device Name','Type','Phone','Supplier','Status','Last Active'],filteredDevices.map(d=>[d.device_name,d.device_type,d.phone_number,(ottSuppliers.find(s=>s.id===d.supplier_id)?.company_name||''),d.session_status,d.last_active?new Date(d.last_active).toLocaleString():'Never']))}>Export CSV</Button>
          <Button variant="secondary" icon={<Download size={16}/>} onClick={()=>exportExcel('ott_devices_export.xlsx','OTT Devices',['Device Name','Type','Phone','Supplier','Status','Last Active'],filteredDevices.map(d=>[d.device_name,d.device_type,d.phone_number,(ottSuppliers.find(s=>s.id===d.supplier_id)?.company_name||''),d.session_status,d.last_active?new Date(d.last_active).toLocaleString():'Never']))}>Export Excel</Button>
        <Button icon={<Plus size={18} />} onClick={() => setShowModal(true)} disabled={generatingQR}>
          {generatingQR ? 'Generating QR...' : 'Add Device'}
        </Button>
        </div>
      </div>

      {/* Residential Proxy Status Bar */}
      <div className={`rounded-xl p-4 border flex items-start gap-3 ${
        onlineProxies.length > 0
          ? 'bg-gradient-to-r from-green-50 to-emerald-50 border-green-200'
          : 'bg-amber-50 border-amber-200'
      }`}>
        <div className={`p-2 rounded-lg ${
          onlineProxies.length > 0 ? 'bg-green-100' : 'bg-amber-100'
        }`}>
          {onlineProxies.length > 0
            ? <Wifi size={20} className="text-green-600" />
            : <WifiOff size={20} className="text-amber-600" />
          }
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-semibold ${
            onlineProxies.length > 0 ? 'text-green-800' : 'text-amber-800'
          }`}>
            {onlineProxies.length > 0
              ? `${onlineProxies.length} Residential Prox${onlineProxies.length === 1 ? 'y' : 'ies'} Online`
              : 'No Residential Proxies Online'}
          </p>
          {onlineProxies.length > 0 ? (
            <div className="mt-1.5 flex flex-wrap gap-2">
              {onlineProxies.map(p => (
                <span key={p.id} className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white/80 border border-green-200 rounded-full text-xs text-green-700 font-mono">
                  <Shield size={10} className="text-green-500" />
                  {p.public_ip || p.host}:{p.port}
                </span>
              ))}
            </div>
          ) : (
            <p className="mt-1 text-xs text-amber-600">
              Register a residential proxy by running the proxy agent on your home PC. Proxies help avoid rate limits when pairing devices.
            </p>
          )}
        </div>
        <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
          onlineProxies.length > 0
            ? 'bg-green-200 text-green-800'
            : 'bg-amber-200 text-amber-800'
        }`}>
          {onlineProxies.length || 0}
        </span>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-4 border border-gray-200 hover:shadow-md transition-shadow">
          <p className="text-sm text-gray-500">Total Devices</p>
          <p className="text-2xl font-bold text-gray-800 mt-1">{ottDevices.length}</p>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-200 hover:shadow-md transition-shadow">
          <p className="text-sm text-gray-500">Connected</p>
          <p className="text-2xl font-bold text-green-600 mt-1">
            {ottDevices.filter(d => d.session_status === 'connected').length}
          </p>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-200 hover:shadow-md transition-shadow">
          <p className="text-sm text-gray-500">WhatsApp</p>
          <p className="text-2xl font-bold text-green-600 mt-1">
            {ottDevices.filter(d => d.device_type === 'whatsapp').length}
          </p>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-200 hover:shadow-md transition-shadow">
          <p className="text-sm text-gray-500">Telegram</p>
          <p className="text-2xl font-bold text-blue-600 mt-1">
            {ottDevices.filter(d => d.device_type === 'telegram').length}
          </p>
        </div>
      </div>

      {/* Search */}
      <Card>
        <div className="relative">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search devices..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </Card>

      {/* Devices Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredDevices.map(device => {
          const linkedSupplier = device.supplier_id
            ? ottSuppliers.find(s => s.id === device.supplier_id)
            : undefined;
          const deviceProxy = linkedSupplier && onlineProxies.length > 0
            ? onlineProxies[0]
            : null;

          return (
            <Card key={device.id} className="hover:shadow-lg transition-all duration-200 group">
              <div className="space-y-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`p-3 rounded-xl transition-colors ${
                      device.device_type === 'whatsapp' ? 'bg-green-100 group-hover:bg-green-200' : 'bg-blue-100 group-hover:bg-blue-200'
                    }`}>
                      <Smartphone size={24} className={device.device_type === 'whatsapp' ? 'text-green-600' : 'text-blue-600'} />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-800">{device.device_name}</p>
                      <p className="text-sm text-gray-500">{device.phone_number}</p>
                    </div>
                  </div>
                  {getStatusBadge(device.session_status)}
                </div>

                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Type:</span>
                    <span className="font-medium text-gray-700 capitalize">{device.device_type}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Last Active:</span>
                    <span className="font-medium text-gray-700">
                      {device.last_active ? new Date(device.last_active).toLocaleString() : 'Never'}
                    </span>
                  </div>
                </div>

                {deviceProxy && (
                  <div className="text-xs bg-purple-50 border border-purple-200 rounded-lg p-2 flex items-center gap-2">
                    <Shield size={12} className="text-purple-500 flex-shrink-0" />
                    <span className="text-purple-700 truncate">Via {deviceProxy.public_ip || deviceProxy.host}:{deviceProxy.port}</span>
                  </div>
                )}

                <div className="flex gap-2">
                  {device.session_status === 'qr_pending' && (
                    <Button size="sm" variant="secondary" icon={<QrCode size={16} />} className="flex-1" onClick={() => setQrModal(device)}>
                      Show QR
                    </Button>
                  )}
                  {device.session_status === 'connected' ? (
                    <Button size="sm" variant="danger" icon={<Power size={16} />} className="flex-1" onClick={() => handleDisconnect(device)}>
                      Disconnect
                    </Button>
                  ) : device.session_status !== 'qr_pending' && (
                    <Button size="sm" variant="success" icon={<RefreshCw size={16} />} className="flex-1" onClick={() => handleConnect(device)}>
                      Connect
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" icon={<Trash2 size={16} />} onClick={() => setDeleteModal(device)} />
                </div>
              </div>
            </Card>
          );
        })}

        {filteredDevices.length === 0 && (
          <div className="col-span-full text-center py-16 bg-white rounded-xl border border-gray-200 border-dashed">
            <Smartphone size={48} className="mx-auto text-gray-300 mb-4" />
            <p className="text-gray-600 font-medium">No devices found</p>
            <p className="text-sm text-gray-400 mt-1">Add a new device to get started with OTT messaging</p>
          </div>
        )}
      </div>

      {/* Add Device Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title="Add OTT Device"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={generatingQR}>
              {generatingQR ? 'Generating QR...' : 'Add Device'}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Input
            label="Device Name"
            value={formData.device_name}
            onChange={(e) => setFormData(prev => ({ ...prev, device_name: e.target.value }))}
            placeholder="WhatsApp Device 1"
            required
          />
          <Select
            label="Device Type"
            value={formData.device_type}
            onChange={(e) => setFormData(prev => ({ ...prev, device_type: e.target.value as 'whatsapp' | 'telegram' }))}
            options={[
              { value: 'whatsapp', label: 'WhatsApp' },
              { value: 'telegram', label: 'Telegram' },
            ]}
          />
          <Input
            label="Phone Number"
            value={formData.phone_number}
            onChange={(e) => setFormData(prev => ({ ...prev, phone_number: e.target.value }))}
            placeholder="+1234567890"
            required
          />
          <Select
            label="Supplier"
            value={formData.supplier_id}
            onChange={(e) => setFormData(prev => ({ ...prev, supplier_id: e.target.value }))}
            options={[
              { value: '', label: 'Select Supplier' },
              ...ottSuppliers.map(s => ({ value: s.id, label: `${s.supplier_code} - ${s.company_name}` }))
            ]}
            required
          />
          {onlineProxies.length > 0 && (
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
              <p className="text-xs font-medium text-purple-700 mb-1.5 flex items-center gap-1.5">
                <Shield size={12} />
                Residential Proxy Active
              </p>
              <p className="text-xs text-purple-600">
                {onlineProxies.length} proxy online — pairing will be routed through residential IPs to avoid rate limits.
              </p>
            </div>
          )}
        </div>
      </Modal>

      {/* QR Code Modal */}
      <Modal
        isOpen={!!qrModal}
        onClose={() => setQrModal(null)}
        title={`Scan QR Code — ${qrModal?.device_name || ''}`}
        size="md"
        footer={
          qrModal?.session_status === 'qr_pending' ? (
            <div className="flex justify-between items-center w-full">
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" icon={copiedId === qrModal.id ? <Check size={14} /> : <Copy size={14} />} onClick={() => handleCopyQR(qrModal)}>
                  {copiedId === qrModal.id ? 'Copied!' : 'Copy'}
                </Button>
                <Button size="sm" variant="secondary" icon={<Download size={14} />} onClick={() => handleDownloadQR(qrModal)}>
                  Download
                </Button>
                <Button size="sm" variant="secondary" icon={<RefreshCw size={14} />} onClick={() => handleRegenerateQR(qrModal)}>
                  Regenerate
                </Button>
              </div>
              <Button onClick={() => { handleConnect(qrModal); setQrModal(null); }}>
                Mark as Connected
              </Button>
            </div>
          ) : undefined
        }
      >
        {qrModal && (
          <div className="text-center space-y-5">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-left">
              <p className="text-sm font-medium text-blue-800 mb-1">📱 How to connect:</p>
              <ol className="list-decimal list-inside text-xs text-blue-700 space-y-0.5">
                {qrModal.device_type === 'whatsapp' ? (
                  <>
                    <li>Open <strong>WhatsApp</strong> on your phone</li>
                    <li>Go to <strong>Settings → Linked Devices</strong></li>
                    <li>Tap <strong>Link a Device</strong></li>
                    <li>Scan the QR code below</li>
                  </>
                ) : (
                  <>
                    <li>Open <strong>Telegram</strong> on your phone</li>
                    <li>Go to <strong>Settings → Devices</strong></li>
                    <li>Tap <strong>Link Desktop Device</strong></li>
                    <li>Scan the QR code below</li>
                  </>
                )}
              </ol>
            </div>

            <div className="bg-white p-6 rounded-xl border-2 border-dashed border-blue-300 inline-block shadow-inner">
              {qrModal.qr_code ? (
                <img src={qrModal.qr_code} alt={`QR Code for ${qrModal.device_name}`} className="w-56 h-56" />
              ) : (
                <div className="w-56 h-56 bg-gray-100 rounded-lg flex items-center justify-center">
                  <QrCode size={100} className="text-gray-400" />
                </div>
              )}
            </div>

            <div className="bg-gray-50 rounded-lg p-3 space-y-1.5">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Device:</span>
                <span className="font-medium text-gray-700">{qrModal.device_name}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Phone:</span>
                <span className="font-medium text-gray-700">{qrModal.phone_number}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Type:</span>
                <span className="font-medium text-gray-700 capitalize">{qrModal.device_type}</span>
              </div>
            </div>

            {onlineProxies.length > 0 && (
              <div className="text-xs bg-green-50 border border-green-200 rounded-lg p-2 flex items-center gap-2">
                <Shield size={12} className="text-green-500" />
                <span className="text-green-700">Traffic routed through residential proxy ({onlineProxies.length} online)</span>
              </div>
            )}

            <p className="text-sm text-gray-500">
              Open {qrModal.device_type === 'whatsapp' ? 'WhatsApp' : 'Telegram'} on your phone
              and scan this QR code to connect the device.
            </p>
          </div>
        )}
      </Modal>

      {/* Delete Modal */}
      <Modal
        isOpen={!!deleteModal}
        onClose={() => setDeleteModal(null)}
        title="Delete Device"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setDeleteModal(null)}>Cancel</Button>
            <Button variant="danger" onClick={handleDelete} disabled={deleting} loading={deleting}>Delete Device</Button>
          </div>
        }
      >
        <p className="text-gray-600">
          Are you sure you want to delete <strong>{deleteModal?.device_name}</strong>?
          This will disconnect the device and remove all associated data.
        </p>
      </Modal>
    </div>
  );
};
