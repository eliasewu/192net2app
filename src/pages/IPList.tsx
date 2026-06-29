import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Edit, Shield, ShieldOff, AlertTriangle, Globe, WifiOff, Search, GitBranch } from 'lucide-react';
import { useData } from '../store/DataContext';
import { Card } from '../components/UI/Card';
import { Button } from '../components/UI/Button';
import { Badge } from '../components/UI/Badge';
import { Input } from '../components/UI/Input';
import { Modal } from '../components/UI/Modal';
import { api } from '../services/api';

interface IPEntry {
  id: number;
  ip_address: string;
  list_type: 'unaudited' | 'blacklist' | 'whitelist' | 'web_login_blacklist';
  notes: string | null;
  trunk_id: number | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

const TABS = [
  { key: 'unaudited', label: 'Unaudited IP', icon: AlertTriangle, color: 'text-yellow-600', bg: 'bg-yellow-50', badge: 'warning' as const },
  { key: 'blacklist', label: 'IP Black List', icon: ShieldOff, color: 'text-red-600', bg: 'bg-red-50', badge: 'danger' as const },
  { key: 'whitelist', label: 'IP White List', icon: Shield, color: 'text-green-600', bg: 'bg-green-50', badge: 'success' as const },
  { key: 'web_login_blacklist', label: 'Web Login IP Black List', icon: WifiOff, color: 'text-purple-600', bg: 'bg-purple-50', badge: 'purple' as const },
];

export const IPList: React.FC = () => {
  const [activeTab, setActiveTab] = useState<string>('unaudited');
  const [entries, setEntries] = useState<IPEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editEntry, setEditEntry] = useState<IPEntry | null>(null);
  const [deleteEntry, setDeleteEntry] = useState<IPEntry | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [form, setForm] = useState({ ip_address: '', list_type: activeTab, notes: '', trunk_id: '' });

  const { trunks } = useData();

  const getTrunkName = (trunkId: number | null): string => {
    if (!trunkId) return '—';
    const trunk = trunks.find(t => String(t.id) === String(trunkId));
    return trunk ? trunk.trunk_name : `Trunk #${trunkId}`;
  };

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`/ip-lists?type=${activeTab}`);
      setEntries(Array.isArray(res.data) ? res.data : []);
    } catch (e) {
      console.error('Failed to fetch IP list:', e);
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  useEffect(() => { fetchEntries(); }, [fetchEntries]);

  const handleSave = async () => {
    try {
      if (editEntry) {
        await api.put(`/ip-lists/${editEntry.id}`, {
          ip_address: form.ip_address,
          list_type: form.list_type,
          notes: form.notes || null,
          trunk_id: form.trunk_id ? parseInt(form.trunk_id) : null,
        });
      } else {
        await api.post('/ip-lists', {
          ip_address: form.ip_address,
          list_type: form.list_type,
          notes: form.notes || null,
          trunk_id: form.trunk_id ? parseInt(form.trunk_id) : null,
        });
      }
      setShowModal(false);
      setEditEntry(null);
      fetchEntries();
    } catch (e) {
      console.error('Failed to save IP entry:', e);
    }
  };

  const handleDelete = async () => {
    if (!deleteEntry) return;
    setDeleting(true);
    try {
      await api.delete(`/ip-lists/${deleteEntry.id}`);
      setDeleteEntry(null);
      fetchEntries();
    } catch (e) {
      console.error('Failed to delete IP entry:', e);
    } finally {
      setDeleting(false);
    }
  };

  const openAdd = () => {
    setEditEntry(null);
    setForm({ ip_address: '', list_type: activeTab, notes: '', trunk_id: '' });
    setShowModal(true);
  };

  const openEdit = (entry: IPEntry) => {
    setEditEntry(entry);
    setForm({
      ip_address: entry.ip_address,
      list_type: entry.list_type,
      notes: entry.notes || '',
      trunk_id: entry.trunk_id ? String(entry.trunk_id) : '',
    });
    setShowModal(true);
  };

  const filtered = entries.filter(e =>
    e.ip_address.toLowerCase().includes(search.toLowerCase()) ||
    (e.notes || '').toLowerCase().includes(search.toLowerCase())
  );

  const tab = TABS.find(t => t.key === activeTab)!;
  const TabIcon = tab.icon;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">IP List Management</h1>
          <p className="text-gray-500 mt-1">Manage whitelisted, blacklisted, and unaudited IP addresses</p>
        </div>
        <Button icon={<Plus size={18} />} onClick={openAdd}>Add IP</Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {TABS.map(t => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`rounded-xl p-4 border-2 transition-all text-left ${
                activeTab === t.key
                  ? `${t.bg} border-current ring-2 ring-offset-1`
                  : 'bg-white border-gray-200 hover:border-gray-300'
              }`}
            >
              <Icon size={20} className={t.color} />
              <p className="text-2xl font-bold mt-2 text-gray-800">-</p>
              <p className="text-xs text-gray-500 mt-1">{t.label}</p>
            </button>
          );
        })}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-200">
        {TABS.map(t => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === t.key
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <Icon size={14} />
              {t.label}
              <Badge variant={t.badge} size="sm">{filtered.length}</Badge>
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder="Search IP addresses..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Table */}
      <Card noPadding>
        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <TabIcon size={40} className="mx-auto mb-3 text-gray-300" />
            <p>No IP entries in this list</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">IP Address</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Trunk</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Notes</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Created By</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map(entry => (
                <tr key={entry.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Globe size={14} className="text-gray-400" />
                      <span className="font-mono text-xs">{entry.ip_address}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={tab.badge} size="sm">{entry.list_type.replace(/_/g, ' ')}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    {entry.trunk_id ? (
                      <div className="flex items-center gap-1.5">
                        <GitBranch size={12} className="text-gray-400" />
                        <span className="text-sm text-gray-700">{getTrunkName(entry.trunk_id)}</span>
                      </div>
                    ) : (
                      <span className="text-gray-400 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600 max-w-xs truncate">{entry.notes || '—'}</td>
                  <td className="px-4 py-3 text-gray-500">{entry.created_by || 'system'}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{new Date(entry.created_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex gap-1 justify-end">
                      <button onClick={() => openEdit(entry)} className="p-1.5 rounded hover:bg-gray-100">
                        <Edit size={14} className="text-gray-500" />
                      </button>
                      <button onClick={() => setDeleteEntry(entry)} className="p-1.5 rounded hover:bg-red-50">
                        <Trash2 size={14} className="text-red-500" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {/* Add/Edit Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => { setShowModal(false); setEditEntry(null); }}
        title={editEntry ? 'Edit IP Entry' : 'Add IP Entry'}
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => { setShowModal(false); setEditEntry(null); }}>Cancel</Button>
            <Button onClick={handleSave}>{editEntry ? 'Update' : 'Add'}</Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Input
            label="IP Address"
            value={form.ip_address}
            onChange={(e) => setForm(prev => ({ ...prev, ip_address: e.target.value }))}
            placeholder="192.168.1.100"
            required
          />
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">List Type</label>
            <select
              value={form.list_type}
              onChange={(e) => setForm(prev => ({ ...prev, list_type: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {TABS.map(t => (
                <option key={t.key} value={t.key}>{t.label}</option>
              ))}
            </select>
          </div>
          <Input
            label="Notes"
            value={form.notes}
            onChange={(e) => setForm(prev => ({ ...prev, notes: e.target.value }))}
            placeholder="Reason for adding this IP..."
          />
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Associated Trunk (optional)</label>
            <select
              value={form.trunk_id}
              onChange={(e) => setForm(prev => ({ ...prev, trunk_id: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">None</option>
              {trunks.map(t => (
                <option key={t.id} value={String(t.id)}>{t.trunk_name} ({t.trunk_type})</option>
              ))}
            </select>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={!!deleteEntry}
        onClose={() => setDeleteEntry(null)}
        title="Delete IP Entry"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setDeleteEntry(null)}>Cancel</Button>
            <Button variant="danger" onClick={handleDelete} disabled={deleting} loading={deleting}>Delete</Button>
          </div>
        }
      >
        <p className="text-gray-600">
          Are you sure you want to delete IP <strong>{deleteEntry?.ip_address}</strong> from the {deleteEntry?.list_type?.replace(/_/g, ' ')}?
          This action cannot be undone.
        </p>
      </Modal>
    </div>
  );
};
