import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Search, Filter, Download, MoreVertical, Edit, Trash2, Eye, Radio, Phone, Globe, Shield } from 'lucide-react';
import { exportCSV, exportExcel } from '../../services/exportService';
import { useData } from '../../store/DataContext';
import { Card } from '../../components/UI/Card';
import { Button } from '../../components/UI/Button';
import { Badge } from '../../components/UI/Badge';
import { Table, Pagination } from '../../components/UI/Table';
import { Modal } from '../../components/UI/Modal';
import { useToast } from '../../components/UI/Toast';
import { Client } from '../../types';

export const ClientsList: React.FC = () => {
  const navigate = useNavigate();
  const { clients, deleteClient, routePlans } = useData();
  const { addToast } = useToast();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [deleteModal, setDeleteModal] = useState<Client | null>(null);
  const [actionMenu, setActionMenu] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const itemsPerPage = 10;

  const filteredClients = clients.filter(client => {
    const matchesSearch =              client.company_name.toLowerCase().includes(search.toLowerCase()) ||
              client.client_code.toLowerCase().includes(search.toLowerCase()) ||
              client.email.toLowerCase().includes(search.toLowerCase()) ||
              (client.phone || '').toLowerCase().includes(search.toLowerCase()) ||
              (client.country || '').toLowerCase().includes(search.toLowerCase()) ||
              (client.smpp_ip || '').toLowerCase().includes(search.toLowerCase()) ||
              ((client as any).client_ips || '').toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || client.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const totalPages = Math.ceil(filteredClients.length / itemsPerPage);
  const paginatedClients = filteredClients.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const getPlanName = (id: string | null) => {
    if (!id) return 'None';
    const plan = routePlans.find(p => p.id === id);
    return plan?.plan_name || 'Unknown';
  };

  const handleDelete = async () => {
    if (deleteModal) {
      setDeleting(true);
      try {
        await deleteClient(deleteModal.id);
        addToast('success', 'Client deleted successfully');
        setDeleteModal(null);
      } catch (e: any) {
        addToast('error', 'Failed to delete client: ' + (e?.message || 'Unknown error'));
      } finally {
        setDeleting(false);
      }
    }
  };

  const columns = [
    {
      key: 'client_code',
      header: 'Client Code',
      render: (client: Client) => (
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-sm">
            {client.company_name.charAt(0)}
          </div>
          <div>
            <p className="font-medium text-gray-800">{client.client_code}</p>
            <p className="text-xs text-gray-500">{client.company_name}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'contact',
      header: 'Contact',
      render: (client: Client) => (
        <div>
          <p className="text-sm text-gray-800">{client.contact_person}</p>
          <p className="text-xs text-gray-500">{client.email}</p>
          <div className="flex items-center gap-1 mt-0.5">
            <Phone size={10} className="text-gray-400" />
            <span className="text-xs text-gray-400">{client.phone || '—'}</span>
          </div>
        </div>
      ),
    },
    {
      key: 'location',
      header: 'Country',
      render: (client: Client) => (
        <div className="flex items-center gap-1.5">
          <Globe size={14} className="text-gray-400 flex-shrink-0" />
          <span className="text-sm text-gray-700">{client.country || '—'}</span>
        </div>
      ),
    },
    {
      key: 'allowed_ips',
      header: 'Allowed IPs',
      render: (client: Client) => {
        const ips: string[] = [];
        if (client.smpp_ip && client.smpp_ip !== '0.0.0.0') ips.push(client.smpp_ip);
        const multiIps = (client as any).client_ips;
        if (multiIps) multiIps.split(/[,\n;]+/).filter(Boolean).forEach((ip: string) => ips.push(ip.trim()));
        return (
          <div className="flex items-center gap-1.5">
            <Shield size={14} className={ips.length > 0 ? 'text-green-500' : 'text-gray-400'} />
            <span className={`text-sm font-mono ${ips.length > 0 ? 'text-gray-700' : 'text-gray-400'}`}>
              {ips.length > 0 ? `${ips.length} IP${ips.length !== 1 ? 's' : ''}` : 'Any'}
            </span>
          </div>
        );
      },
    },
    {
      key: 'smpp_username',
      header: 'SMPP Username',
      render: (client: Client) => (
        <div className="flex items-center gap-2">
          <Radio size={14} className="text-gray-400" />
          <span className="text-sm font-mono bg-gray-100 px-2 py-0.5 rounded">{client.smpp_username}</span>
        </div>
      ),
    },
    {
      key: 'balance',
      header: 'Balance',
      align: 'right' as const,
      render: (client: Client) => (
        <div className="text-right">
          <p className="font-semibold text-gray-800">€{client.balance.toLocaleString()}</p>
          <p className="text-xs text-gray-500">Limit: €{client.credit_limit.toLocaleString()}</p>
        </div>
      ),
    },
    {
      key: 'routing_plan',
      header: 'Route Plan',
      render: (client: Client) => (
        <Badge variant="info" size="sm">{getPlanName(client.routing_plan_id)}</Badge>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (client: Client) => (
        <Badge
          variant={client.status === 'active' ? 'success' : client.status === 'suspended' ? 'danger' : 'warning'}
          dot
        >
          {client.status}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right' as const,
      render: (client: Client) => (
        <div className="relative">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setActionMenu(actionMenu === client.id ? null : client.id);
            }}
            className="p-1.5 rounded hover:bg-gray-100"
          >
            <MoreVertical size={16} className="text-gray-500" />
          </button>
          {actionMenu === client.id && (
            <div className="absolute right-0 top-full mt-1 w-40 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-10">
              <button
                onClick={() => navigate(`/clients/${client.id}`)}
                className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                <Eye size={14} />
                View Details
              </button>
              <button
                onClick={() => navigate(`/clients/${client.id}/edit`)}
                className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                <Edit size={14} />
                Edit
              </button>
              <hr className="my-1" />
              <button
                onClick={() => {
                  setDeleteModal(client);
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
          <h1 className="text-2xl font-bold text-gray-800">Clients</h1>
          <p className="text-gray-500 mt-1">Manage your client accounts and SMPP connections</p>
        </div>
        <Link to="/clients/add">
          <Button icon={<Plus size={18} />}>Add Client</Button>
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-4 border border-gray-200">
          <p className="text-sm text-gray-500">Total Clients</p>
          <p className="text-2xl font-bold text-gray-800 mt-1">{clients.length}</p>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-200">
          <p className="text-sm text-gray-500">Active</p>
          <p className="text-2xl font-bold text-green-600 mt-1">
            {clients.filter(c => c.status === 'active').length}
          </p>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-200">
          <p className="text-sm text-gray-500">Suspended</p>
          <p className="text-2xl font-bold text-red-600 mt-1">
            {clients.filter(c => c.status === 'suspended').length}
          </p>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-200">
          <p className="text-sm text-gray-500">Total Balance</p>
          <p className="text-2xl font-bold text-blue-600 mt-1">
            €{clients.reduce((sum, c) => sum + c.balance, 0).toLocaleString()}
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
              placeholder="Search clients..."
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
            <Button variant="secondary" icon={<Filter size={16} />}>Filters</Button>
            <Button variant="secondary" icon={<Download size={16} />} onClick={() => exportCSV('clients_export.csv', ['Client Code','Company','Contact','Email','Phone','Country','Allowed IP','SMPP Username','Balance','Credit Limit','Status','Route Plan'], filteredClients.map(c => [c.client_code, c.company_name, c.contact_person, c.email, c.phone || '', c.country || '', c.smpp_ip || 'Any', c.smpp_username, String(c.balance), String(c.credit_limit), c.status, getPlanName(c.routing_plan_id)]))}>Export CSV</Button>
            <Button variant="secondary" icon={<Download size={16} />} onClick={() => exportExcel('clients_export.xlsx', 'Clients', ['Client Code','Company','Contact','Email','Phone','Country','Allowed IP','SMPP Username','Balance','Credit Limit','Status','Route Plan'], filteredClients.map(c => [c.client_code, c.company_name, c.contact_person, c.email, c.phone || '', c.country || '', c.smpp_ip || 'Any', c.smpp_username, String(c.balance), String(c.credit_limit), c.status, getPlanName(c.routing_plan_id)]))}>Export Excel</Button>
          </div>
        </div>
      </Card>

      {/* Table */}
      <Card noPadding>
        <Table
          columns={columns}
          data={paginatedClients}
          keyExtractor={(client) => client.id}
          onRowClick={(client) => navigate(`/clients/${client.id}`)}
        />
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
          totalItems={filteredClients.length}
          itemsPerPage={itemsPerPage}
        />
      </Card>

      {/* Delete Modal */}
      <Modal
        isOpen={!!deleteModal}
        onClose={() => setDeleteModal(null)}
        title="Delete Client"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setDeleteModal(null)}>Cancel</Button>
            <Button variant="danger" onClick={handleDelete} disabled={deleting} loading={deleting}>Delete Client</Button>
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
