import React, { useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Search, Download, Upload, MoreVertical, Edit, Trash2, Eye, Wifi, WifiOff, AlertTriangle, ArrowRight } from 'lucide-react';
import { exportCSV, exportExcel } from '../../services/exportService';
import { useData } from '../../store/DataContext';
import { Card } from '../../components/UI/Card';
import { Button } from '../../components/UI/Button';
import { Badge } from '../../components/UI/Badge';
import { Table, Pagination } from '../../components/UI/Table';
import { Modal } from '../../components/UI/Modal';
import { useToast } from '../../components/UI/Toast';
import { Supplier } from '../../types';

const SUPPLIER_CSV_SAMPLE = `supplier_code,company_name,contact_person,email,phone,connection_type,smpp_host,smpp_port,smpp_username,smpp_password,status
SUP001,SMS Provider Ltd,John Smith,john@smsprovider.com,+1234567890,smpp,smpp.smsprovider.com,2775,user1,pass123,active
SUP002,HTTP Gateway Co,Jane Doe,jane@httpgw.com,+0987654321,http,api.httpgw.com,443,user2,pass456,active
SUP003,Email Relay Inc,Bob Wilson,bob@emailrelay.com,+1122334455,email,smtp.emailrelay.com,587,smtp_user,smtp_pass,active`;

export const SuppliersList: React.FC = () => {
  const navigate = useNavigate();
  const { suppliers, deleteSupplier, addSupplier } = useData();
  const { addToast } = useToast();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [deleteModal, setDeleteModal] = useState<Supplier | null>(null);
  const [actionMenu, setActionMenu] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importText, setImportText] = useState('');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ added: number; failed: number; errors: string[] } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const itemsPerPage = 10;

  const filteredSuppliers = suppliers.filter(supplier => {
    const matchesSearch = 
      supplier.company_name.toLowerCase().includes(search.toLowerCase()) ||
      supplier.supplier_code.toLowerCase().includes(search.toLowerCase()) ||
      supplier.email.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || supplier.status === statusFilter;
    const matchesType = typeFilter === 'all' || supplier.connection_type === typeFilter;
    return matchesSearch && matchesStatus && matchesType;
  });

  const totalPages = Math.ceil(filteredSuppliers.length / itemsPerPage);
  const paginatedSuppliers = filteredSuppliers.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const handleDelete = async () => {
    if (deleteModal) {
      setDeleting(true);
      try {
        await deleteSupplier(deleteModal.id);
        addToast('success', 'Supplier deleted successfully');
        setDeleteModal(null);
      } catch (e: any) {
        addToast('error', 'Failed to delete supplier: ' + (e?.message || 'Unknown error'));
      } finally {
        setDeleting(false);
      }
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setImportText(ev.target?.result as string);
      setImportResult(null);
    };
    reader.readAsText(file);
  };

  const parseSupplierCSV = (text: string): Partial<Supplier>[] => {
    const lines = text.trim().split('\n');
    const entries: Partial<Supplier>[] = [];
    let headerSkipped = false;
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (!headerSkipped && (trimmed.toLowerCase().startsWith('supplier_code') || trimmed.toLowerCase().startsWith('supplier code'))) {
        headerSkipped = true;
        continue;
      }
      headerSkipped = true;
      const parts = trimmed.split(',').map(s => s.trim().replace(/^"|"$/g, ''));
      if (parts.length >= 4 && parts[0] && parts[1]) {
        entries.push({
          supplier_code: parts[0],
          company_name: parts[1],
          contact_person: parts[2] || '',
          email: parts[3] || '',
          phone: parts[4] || '',
          connection_type: (parts[5] || 'smpp') as any,
          smpp_host: parts[6] || '',
          smpp_port: parseInt(parts[7]) || 2775,
          smpp_username: parts[8] || '',
          smpp_password: parts[9] || '',
          status: (parts[10] || 'active') as any,
        });
      }
    }
    return entries;
  };

  const handleImport = async () => {
    const entries = parseSupplierCSV(importText);
    if (entries.length === 0) {
      setImportResult({ added: 0, failed: 0, errors: ['No valid supplier rows found. Check CSV format.'] });
      return;
    }
    setImporting(true);
    let added = 0;
    let failed = 0;
    const errors: string[] = [];
    for (const entry of entries) {
      try {
        if (!entry.supplier_code || !entry.company_name) {
          failed++;
          errors.push(`Skipped: missing supplier_code or company_name for row "${entry.supplier_code || 'unknown'}"`);
          continue;
        }
        const exists = suppliers.find(s => s.supplier_code === entry.supplier_code);
        if (exists) {
          failed++;
          errors.push(`Skipped: supplier_code "${entry.supplier_code}" already exists`);
          continue;
        }
        await addSupplier({
          supplier_code: entry.supplier_code!,
          company_name: entry.company_name!,
          contact_person: entry.contact_person || '',
          email: entry.email || '',
          phone: entry.phone || '',
          connection_type: entry.connection_type || 'smpp',
          smpp_host: entry.smpp_host || '',
          smpp_port: entry.smpp_port || 2775,
          smpp_username: entry.smpp_username || '',
          smpp_password: entry.smpp_password || '',
          status: entry.status || 'active',
          bind_status: 'unbound',
          consecutive_failures: 0,
          balance: 0,
          credit_limit: 0,
          currency: 'EUR',
        } as any);
        added++;
      } catch (e: any) {
        failed++;
        errors.push(`Failed "${entry.supplier_code}": ${e?.message || 'unknown error'}`);
      }
    }
    setImportResult({ added, failed, errors });
    setImporting(false);
    if (added > 0) {
      addToast('success', `Imported ${added} supplier${added !== 1 ? 's' : ''} successfully`);
      setImportText('');
    } else if (failed > 0) {
      addToast('error', `Import failed — no suppliers were created (${failed} failed)`);
    }
  };

  const handleDownloadTemplate = () => {
    const header = 'supplier_code,company_name,contact_person,email,phone,connection_type,smpp_host,smpp_port,smpp_username,smpp_password,status';
    const blob = new Blob([header + '\n'], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'supplier_import_template.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const getConnectionTypeBadge = (type: string) => {
    const typeMap: Record<string, { label: string; variant: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'purple' }> = {
      smpp: { label: 'SMPP', variant: 'info' },
      http: { label: 'HTTP API', variant: 'purple' },
      ott_whatsapp: { label: 'WhatsApp', variant: 'success' },
      ott_telegram: { label: 'Telegram', variant: 'info' },
      voice_otp: { label: 'Voice OTP', variant: 'warning' },
      local_bypass: { label: 'Local Bypass', variant: 'default' },
      rcs: { label: 'RCS', variant: 'purple' },
      email: { label: 'Email', variant: 'info' },
    };
    const config = typeMap[type] || { label: type.toUpperCase(), variant: 'default' as const };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const columns = [
    {
      key: 'supplier_code',
      header: 'Supplier',
      render: (supplier: Supplier) => (
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center text-white font-bold text-sm">
            {supplier.company_name.charAt(0)}
          </div>
          <div>
            <p className="font-medium text-gray-800">{supplier.supplier_code}</p>
            <p className="text-xs text-gray-500">{supplier.company_name}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'contact',
      header: 'Contact',
      render: (supplier: Supplier) => (
        <div>
          <p className="text-sm text-gray-800">{supplier.contact_person}</p>
          <p className="text-xs text-gray-500">{supplier.email}</p>
        </div>
      ),
    },
    {
      key: 'connection_type',
      header: 'Type',
      render: (supplier: Supplier) => (
        <div className="flex flex-col gap-1 items-center">
          {getConnectionTypeBadge(supplier.connection_type)}
          {supplier.is_inbound && <Badge variant="warning" size="sm">INBOUND</Badge>}
        </div>
      ),
    },
    {
      key: 'smpp_version',
      header: 'SMPP Ver',
      align: 'center' as const,
      render: (supplier: Supplier) => {
        if (supplier.connection_type !== 'smpp') return <span className="text-xs text-gray-300">—</span>;
        const v = supplier.smpp_version;
        if (!v || v === 'auto') {
          return <Badge variant="success" size="sm">Auto</Badge>;
        }
        return <Badge variant="info" size="sm">v{v}</Badge>;
      },
    },
    {
      key: 'bind_status',
      header: 'Bind Status',
      render: (supplier: Supplier) => (
        <div className="flex items-center gap-2">
          {supplier.bind_status === 'bound' ? (
            <Wifi size={16} className="text-green-500" />
          ) : (
            <WifiOff size={16} className="text-red-500" />
          )}
          <Badge
            variant={supplier.bind_status === 'bound' ? 'success' : supplier.bind_status === 'error' ? 'danger' : 'warning'}
          >
            {supplier.bind_status}
          </Badge>
        </div>
      ),
    },
    {
      key: 'failures',
      header: 'Failures',
      align: 'center' as const,
      render: (supplier: Supplier) => (
        <span className={`font-medium ${supplier.consecutive_failures > 10 ? 'text-red-600' : supplier.consecutive_failures > 0 ? 'text-yellow-600' : 'text-green-600'}`}>
          {supplier.consecutive_failures}
          {supplier.consecutive_failures >= 20 && (
            <span className="ml-1 text-xs text-red-500">(BLOCKED)</span>
          )}
        </span>
      ),
    },
    {
      key: 'balance',
      header: 'Balance',
      align: 'right' as const,
      render: (supplier: Supplier) => (
        <div className="text-right">
          <p className="font-semibold text-gray-800">€{supplier.balance.toLocaleString()}</p>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (supplier: Supplier) => (
        <Badge
          variant={supplier.status === 'active' ? 'success' : supplier.status === 'suspended' ? 'danger' : 'warning'}
          dot
        >
          {supplier.status}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right' as const,
      render: (supplier: Supplier) => (
        <div className="relative">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setActionMenu(actionMenu === supplier.id ? null : supplier.id);
            }}
            className="p-1.5 rounded hover:bg-gray-100"
          >
            <MoreVertical size={16} className="text-gray-500" />
          </button>
          {actionMenu === supplier.id && (
            <div className="absolute right-0 top-full mt-1 w-40 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-10">
              <button
                onClick={() => navigate(`/suppliers/${supplier.id}`)}
                className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                <Eye size={14} />
                View Details
              </button>
              <button
                onClick={() => navigate(`/suppliers/${supplier.id}/edit`)}
                className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                <Edit size={14} />
                Edit
              </button>
              <hr className="my-1" />
              <button
                onClick={() => {
                  setDeleteModal(supplier);
                  setActionMenu(null);
                }}
                className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
              >
                <Trash2 size={14} />
                Delete
              </button>
            </div>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Suppliers</h1>
          <p className="text-gray-500 mt-1">Manage vendor connections and gateways</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" icon={<Upload size={16} />} onClick={() => { setShowImportModal(true); setImportResult(null); setImportText(''); }}>Import CSV</Button>
          <Link to="/suppliers/add">
            <Button icon={<Plus size={18} />}>Add Supplier</Button>
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="bg-white rounded-xl p-4 border border-gray-200">
          <p className="text-sm text-gray-500">Total Suppliers</p>
          <p className="text-2xl font-bold text-gray-800 mt-1">{suppliers.length}</p>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-200">
          <p className="text-sm text-gray-500">Active</p>
          <p className="text-2xl font-bold text-green-600 mt-1">
            {suppliers.filter(s => s.status === 'active').length}
          </p>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-200">
          <p className="text-sm text-gray-500">Bound</p>
          <p className="text-2xl font-bold text-blue-600 mt-1">
            {suppliers.filter(s => s.bind_status === 'bound').length}
          </p>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-200">
          <p className="text-sm text-gray-500">SMPP</p>
          <p className="text-2xl font-bold text-purple-600 mt-1">
            {suppliers.filter(s => s.connection_type === 'smpp').length}
          </p>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-200">
          <p className="text-sm text-gray-500">OTT</p>
          <p className="text-2xl font-bold text-indigo-600 mt-1">
            {suppliers.filter(s => ['ott_whatsapp', 'ott_telegram'].includes(s.connection_type)).length}
          </p>
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
              <Button variant="secondary" size="sm" onClick={() => navigate('/bind-status')} icon={<ArrowRight size={14} />}>View Bind Status</Button>
            </div>
          </div>
        );
      })()}

      {/* Empty state — no suppliers at all */}
      {suppliers.length === 0 && (
        <div className="bg-gradient-to-br from-gray-50 to-blue-50 rounded-xl border-2 border-dashed border-blue-200 p-12 text-center">
          <WifiOff size={48} className="mx-auto mb-4 text-blue-400" />
          <h3 className="text-xl font-bold text-gray-800 mb-2">No Suppliers Configured</h3>
          <p className="text-gray-500 mb-6 max-w-md mx-auto">Get started by adding your first supplier. Choose from SMPP, HTTP API, RCS, Flash SMS, WhatsApp, Telegram, Voice OTP, or Email.</p>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <Button onClick={() => navigate('/suppliers/add')} icon={<Plus size={18} />}>Add Supplier</Button>
            <Button variant="secondary" onClick={() => navigate('/suppliers/api-connectors')}>API Connectors</Button>
            <Button variant="secondary" onClick={() => navigate('/suppliers/social-api')}>Social API</Button>
            <Button variant="secondary" onClick={() => navigate('/suppliers/voice-otp')}>Voice OTP</Button>
          </div>
        </div>
      )}

      {/* Filters */}
      <Card>
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search suppliers..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="suspended">Suspended</option>
            </select>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Types</option>
              <option value="smpp">SMPP</option>
              <option value="http">HTTP API</option>
              <option value="email">Email</option>
              <option value="ott_whatsapp">WhatsApp</option>
              <option value="ott_telegram">Telegram</option>
              <option value="voice_otp">Voice OTP</option>
            </select>
            <Button variant="secondary" icon={<Download size={16} />} onClick={() => exportCSV('suppliers_export.csv', ['Supplier Code','Company','Contact','Email','Type','SMPP Version','Bind Status','Failures','Balance','Status'], filteredSuppliers.map(s => [s.supplier_code, s.company_name, s.contact_person, s.email, s.connection_type, s.smpp_version||'auto', s.bind_status, String(s.consecutive_failures), String(s.balance), s.status]))}>Export CSV</Button>
            <Button variant="secondary" icon={<Download size={16} />} onClick={() => exportExcel('suppliers_export.xlsx', 'Suppliers', ['Supplier Code','Company','Contact','Email','Type','SMPP Version','Bind Status','Failures','Balance','Status'], filteredSuppliers.map(s => [s.supplier_code, s.company_name, s.contact_person, s.email, s.connection_type, s.smpp_version||'auto', s.bind_status, String(s.consecutive_failures), String(s.balance), s.status]))}>Export Excel</Button>
          </div>
        </div>
      </Card>

      {/* Table */}
      <Card noPadding>
        <Table
          columns={columns}
          data={paginatedSuppliers}
          keyExtractor={(supplier) => supplier.id}
          onRowClick={(supplier) => navigate(`/suppliers/${supplier.id}`)}
        />
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
          totalItems={filteredSuppliers.length}
          itemsPerPage={itemsPerPage}
        />
      </Card>

      {/* Import CSV Modal */}
      <Modal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        title="Import Suppliers from CSV"
        size="lg"
        footer={
          <div className="flex justify-between w-full">
            <Button variant="secondary" icon={<Download size={14} />} onClick={handleDownloadTemplate}>Download Template</Button>
            <Button variant="secondary" icon={<Download size={14} />} onClick={() => { setImportText(SUPPLIER_CSV_SAMPLE); setImportResult(null); }}>Load Sample</Button>
            <div className="flex gap-3">
              <Button variant="secondary" onClick={() => setShowImportModal(false)}>Cancel</Button>
              <Button onClick={handleImport} disabled={!importText.trim() || importing} loading={importing}>Import Suppliers</Button>
            </div>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="bg-blue-50 p-3 rounded-lg text-xs">
            <p className="font-medium text-blue-700 mb-1">CSV Format (comma-separated):</p>
            <code className="text-blue-600">supplier_code,company_name,contact_person,email,phone,connection_type,smpp_host,smpp_port,smpp_username,smpp_password,status</code>
            <p className="text-blue-600 mt-1">First row is header (skipped). Duplicate supplier_codes are skipped. Minimum: supplier_code + company_name.</p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => fileInputRef.current?.click()}>Browse File</Button>
            <input ref={fileInputRef} type="file" accept=".csv,.txt" onChange={handleFileUpload} className="hidden" />
            <span className="text-xs text-gray-500 self-center">or paste CSV below</span>
          </div>
          <textarea
            value={importText}
            onChange={e => { setImportText(e.target.value); setImportResult(null); }}
            className="w-full h-48 px-3 py-2 border border-gray-300 rounded-lg font-mono text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Paste CSV data here or use Browse File..."
          />
          {importResult && (
            <div className={`p-3 rounded-lg text-sm ${importResult.errors.length > 0 && importResult.added === 0 ? 'bg-red-50 border border-red-200' : importResult.errors.length > 0 ? 'bg-yellow-50 border border-yellow-200' : 'bg-green-50 border border-green-200'}`}>
              <p className="font-medium">
                {importResult.added > 0 && <span className="text-green-700">{importResult.added} added</span>}
                {importResult.added > 0 && importResult.failed > 0 && <span className="text-gray-500">, </span>}
                {importResult.failed > 0 && <span className="text-red-600">{importResult.failed} skipped/failed</span>}
              </p>
              {importResult.errors.map((err, i) => (
                <p key={i} className="text-xs text-red-600 mt-1">{err}</p>
              ))}
            </div>
          )}
        </div>
      </Modal>

      {/* Delete Modal */}
      <Modal
        isOpen={!!deleteModal}
        onClose={() => setDeleteModal(null)}
        title="Delete Supplier"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setDeleteModal(null)}>Cancel</Button>
            <Button variant="danger" onClick={handleDelete} disabled={deleting} loading={deleting}>Delete Supplier</Button>
          </div>
        }
      >
        <p className="text-gray-600">
          Are you sure you want to delete <strong>{deleteModal?.company_name}</strong>? 
          This action cannot be undone.
        </p>
      </Modal>
    </div>
  );
};
