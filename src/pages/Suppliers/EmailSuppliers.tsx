import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Download, MoreVertical, Edit, Trash2, Eye, Mail, Server } from 'lucide-react';
import { exportCSV, exportExcel } from '../../services/exportService';
import { useData } from '../../store/DataContext';
import { Card } from '../../components/UI/Card';
import { Button } from '../../components/UI/Button';
import { Badge } from '../../components/UI/Badge';
import { Table, Pagination } from '../../components/UI/Table';
import { Modal } from '../../components/UI/Modal';
import { useToast } from '../../components/UI/Toast';
import { Supplier } from '../../types';

export const EmailSuppliers: React.FC = () => {
  const navigate = useNavigate();
  const { suppliers, deleteSupplier } = useData();
  const { addToast } = useToast();
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [deleteModal, setDeleteModal] = useState<Supplier | null>(null);
  const [actionMenu, setActionMenu] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const itemsPerPage = 10;

  // Filter only email-type suppliers
  const emailSuppliers = suppliers.filter(s => s.connection_type === 'email');

  const filteredSuppliers = emailSuppliers.filter(supplier => {
    const matchesSearch =
      supplier.company_name.toLowerCase().includes(search.toLowerCase()) ||
      supplier.supplier_code.toLowerCase().includes(search.toLowerCase()) ||
      supplier.email.toLowerCase().includes(search.toLowerCase());
    return matchesSearch;
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

  const columns = [
    {
      key: 'supplier_code',
      header: 'Email Supplier',
      render: (supplier: Supplier) => (
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center text-white font-bold text-sm">
            <Mail size={18} />
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
      key: 'smtp',
      header: 'SMTP Server',
      render: (supplier: Supplier) => (
        <div>
          <p className="text-sm font-mono text-gray-700">{supplier.smpp_host || '—'}</p>
          <p className="text-xs text-gray-500">Port: {supplier.smpp_port || 587}</p>
        </div>
      ),
    },
    {
      key: 'username',
      header: 'Auth',
      render: (supplier: Supplier) => (
        <div>
          <p className="text-sm font-mono text-gray-700">{supplier.smpp_username || '—'}</p>
          {supplier.system_id && <p className="text-xs text-gray-500">ID: {supplier.system_id}</p>}
        </div>
      ),
    },
    {
      key: 'bind_status',
      header: 'Connection',
      render: (supplier: Supplier) => (
        <Badge
          variant={supplier.bind_status === 'bound' ? 'success' : supplier.bind_status === 'error' ? 'danger' : 'warning'}
          dot
        >
          {supplier.bind_status}
        </Badge>
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
          <h1 className="text-2xl font-bold text-gray-800">Email Suppliers</h1>
          <p className="text-gray-500 mt-1">Manage email/SMTP gateway connections</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" icon={<Server size={16} />} onClick={() => navigate('/suppliers/email/smtp')}>
            SMTP Config
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-4 border border-gray-200">
          <p className="text-sm text-gray-500">Email Suppliers</p>
          <p className="text-2xl font-bold text-gray-800 mt-1">{emailSuppliers.length}</p>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-200">
          <p className="text-sm text-gray-500">Active</p>
          <p className="text-2xl font-bold text-green-600 mt-1">
            {emailSuppliers.filter(s => s.status === 'active').length}
          </p>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-200">
          <p className="text-sm text-gray-500">Connected</p>
          <p className="text-2xl font-bold text-blue-600 mt-1">
            {emailSuppliers.filter(s => s.bind_status === 'bound').length}
          </p>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-200">
          <p className="text-sm text-gray-500">Avg Port</p>
          <p className="text-2xl font-bold text-purple-600 mt-1">
            {emailSuppliers.length > 0
              ? Math.round(emailSuppliers.reduce((sum, s) => sum + (s.smpp_port || 587), 0) / emailSuppliers.length)
              : 587}
          </p>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search email suppliers..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" icon={<Download size={16} />} onClick={() => exportCSV('email_suppliers_export.csv', ['Supplier Code', 'Company', 'Contact', 'Email', 'SMTP Host', 'Port', 'Username', 'Bind Status', 'Balance', 'Status'], filteredSuppliers.map(s => [s.supplier_code, s.company_name, s.contact_person, s.email, s.smpp_host, String(s.smpp_port || 587), s.smpp_username, s.bind_status, String(s.balance), s.status]))}>Export CSV</Button>
            <Button variant="secondary" icon={<Download size={16} />} onClick={() => exportExcel('email_suppliers_export.xlsx', 'Email Suppliers', ['Supplier Code', 'Company', 'Contact', 'Email', 'SMTP Host', 'Port', 'Username', 'Bind Status', 'Balance', 'Status'], filteredSuppliers.map(s => [s.supplier_code, s.company_name, s.contact_person, s.email, s.smpp_host, String(s.smpp_port || 587), s.smpp_username, s.bind_status, String(s.balance), s.status]))}>Export Excel</Button>
          </div>
        </div>
      </Card>

      {/* Table */}
      {emailSuppliers.length === 0 ? (
        <Card>
          <div className="text-center py-12">
            <Mail size={48} className="mx-auto text-gray-300 mb-4" />
            <h3 className="text-lg font-medium text-gray-600 mb-2">No Email Suppliers Yet</h3>
            <p className="text-gray-500 mb-4">Add suppliers with connection type "Email" to see them here.</p>
            <Button onClick={() => navigate('/suppliers/add')}>Add Email Supplier</Button>
          </div>
        </Card>
      ) : (
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
      )}

      {/* Delete Modal */}
      <Modal
        isOpen={!!deleteModal}
        onClose={() => setDeleteModal(null)}
        title="Delete Email Supplier"
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
