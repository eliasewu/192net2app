import React, { useState, useEffect, useCallback } from 'react';
import { Search, Inbox, RefreshCw, Eye, Phone, Clock, MessageSquare, Download, MessageCircle, Send, SlidersHorizontal, Timer, TimerOff } from 'lucide-react';
import { exportCSV, exportExcel } from '../services/exportService';
import { Card } from '../components/UI/Card';
import { Button } from '../components/UI/Button';
import { Badge } from '../components/UI/Badge';
import { Table, Pagination } from '../components/UI/Table';
import { Modal } from '../components/UI/Modal';
import { api } from '../services/api';
import { useToast } from '../components/UI/Toast';

interface MOSMS {
  id: number;
  channel: string;
  external_id: string;
  sender: string;
  sender_name: string;
  recipient: string;
  message: string;
  message_type: string;
  metadata: any;
  reply_sent: boolean;
  reply_text: string | null;
  replied_at: string | null;
  processed: boolean;
  received_at: string;
}

const channelLabels: Record<string, { label: string; variant: 'success' | 'info' | 'purple' | 'warning' | 'default'; icon: React.ReactNode }> = {
  whatsapp: { label: 'WhatsApp', variant: 'success', icon: <MessageCircle size={12} /> },
  telegram: { label: 'Telegram', variant: 'info', icon: <Send size={12} /> },
  sms: { label: 'SMS', variant: 'default', icon: <Phone size={12} /> },
};

export const SMSInbox: React.FC = () => {
  const { addToast } = useToast();
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [viewModal, setViewModal] = useState<MOSMS | null>(null);
  const [moSMS, setMoSMS] = useState<MOSMS[]>([]);
  const [loading, setLoading] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [replySending, setReplySending] = useState(false);
  const [channelFilter, setChannelFilter] = useState<string>('');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const fetchInbox = useCallback(async (silent?: boolean) => {
    if (!silent) setLoading(true);
    try {
      const res = await api.get(`/mo_sms?limit=500${channelFilter ? `&channel=${channelFilter}` : ''}`);
      if (res?.success && Array.isArray(res.data)) {
        setMoSMS(res.data);
        if (silent) setLastRefreshed(new Date());
      }
    } catch (e) {
      if (!silent) console.error('[SMSInbox] fetch failed:', e);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [channelFilter]);

  useEffect(() => { fetchInbox(); }, [fetchInbox]);

  // 30-second auto-refresh polling
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchInbox(true);
    }, 30000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchInbox]);

  const handleReply = async (sms: MOSMS) => {
    if (!replyText.trim()) return;
    setReplySending(true);
    try {
      const res = await api.post('/mo_sms/reply', { id: sms.id, text: replyText.trim() });
      if (res?.success) {
        setMoSMS(prev => prev.map(m =>
          m.id === sms.id ? { ...m, reply_sent: true, processed: true, reply_text: replyText.trim(), replied_at: new Date().toISOString() } : m
        ));
        setReplyText('');
        setViewModal(null);
      } else {
        addToast('error', `Reply failed: ${res?.error || 'Unknown error'}`);
      }
    } catch (e: any) {
      addToast('error', `Reply failed: ${e.message || 'Network error'}`);
    } finally {
      setReplySending(false);
    }
  };

  const itemsPerPage = 15;
  const filtered = moSMS.filter(m =>
    (!search || m.sender.includes(search) || (m.sender_name || '').toLowerCase().includes(search.toLowerCase()) || m.message?.toLowerCase().includes(search.toLowerCase()) || m.recipient?.toLowerCase().includes(search.toLowerCase()))
  );
  const totalPages = Math.ceil(filtered.length / itemsPerPage);
  const paginated = filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const stats = {
    total: moSMS.length,
    replied: moSMS.filter(m => m.reply_sent).length,
    unread: moSMS.filter(m => !m.processed).length,
    whatsapp: moSMS.filter(m => m.channel === 'whatsapp').length,
    telegram: moSMS.filter(m => m.channel === 'telegram').length,
  };

  const columns = [
    {
      key: 'channel',
      header: 'Ch',
      render: (m: MOSMS) => {
        const ch = channelLabels[m.channel] || channelLabels.sms;
        return <Badge variant={ch.variant} size="sm">{ch.icon}<span className="ml-1">{ch.label}</span></Badge>;
      }
    },
    {
      key: 'sender',
      header: 'From',
      render: (m: MOSMS) => (
        <div className="flex items-center gap-2">
          <Phone size={14} className="text-gray-400" />
          <div>
            <span className="font-mono text-sm">{m.sender_name || m.sender || '-'}</span>
            {m.sender_name && m.sender_name !== m.sender && (
              <span className="text-xs text-gray-400 ml-1">({m.sender})</span>
            )}
          </div>
        </div>
      )
    },
    {
      key: 'recipient',
      header: 'To',
      render: (m: MOSMS) => <Badge variant="info">{m.recipient || '-'}</Badge>
    },
    {
      key: 'message',
      header: 'Message',
      render: (m: MOSMS) => (
        <div className="max-w-[280px]">
          <span className="text-sm text-gray-700 line-clamp-1 block">                {m.message_type !== 'text' && <span className="text-xs text-gray-400">[{m.message_type}]</span>}
            {m.message || '-'}
          </span>
        </div>
      )
    },
    {
      key: 'time',
      header: 'Received',
      render: (m: MOSMS) => <span className="text-xs text-gray-500">{m.received_at ? new Date(m.received_at).toLocaleString() : '-'}</span>
    },
    {
      key: 'status',
      header: 'Status',
      render: (m: MOSMS) => (
        <div className="flex gap-1">
          {!m.processed && <Badge variant="warning" size="sm">New</Badge>}
          {m.reply_sent && <Badge variant="success" size="sm">Replied</Badge>}
        </div>
      )
    },
    {
      key: 'actions',
      header: '',
      render: (m: MOSMS) => (
        <button onClick={() => setViewModal(m)} className="p-1.5 rounded hover:bg-gray-100 transition-colors">
          <Eye size={14} className="text-gray-500" />
        </button>
      )
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">SMS Inbox (MO)</h1>
          <p className="text-gray-500 mt-1">Inbound messages from WhatsApp, Telegram, and SMS channels</p>
        </div>
        <div className="flex gap-2">
          <div className="flex items-center gap-1">
            {autoRefresh && (
              <span className="text-xs text-gray-400 mr-1">
                {lastRefreshed ? `Auto-refresh · ${lastRefreshed.toLocaleTimeString()}` : 'Auto-refresh active'}
              </span>
            )}
            <button
              onClick={() => setAutoRefresh(v => !v)}
              title={autoRefresh ? 'Disable auto-refresh' : 'Enable auto-refresh (30s)'}
              className={`p-1.5 rounded-lg border text-xs transition-colors ${
                autoRefresh
                  ? 'bg-green-50 border-green-200 text-green-600 hover:bg-green-100'
                  : 'bg-gray-50 border-gray-200 text-gray-400 hover:bg-gray-100'
              }`}
            >
              {autoRefresh ? <Timer size={14} /> : <TimerOff size={14} />}
            </button>
          </div>
          <Button variant="secondary" icon={<RefreshCw size={16} />} onClick={() => fetchInbox()} disabled={loading}>
            {loading ? 'Loading...' : 'Refresh'}
          </Button>
          <Button variant="secondary" icon={<Download size={16} />} onClick={() => exportCSV('sms_inbox_export.csv', ['Channel','Sender','Sender Name','Recipient','Message','Message Type','Reply Sent','Received At'], filtered.map(m => [m.channel, m.sender, m.sender_name, m.recipient, m.message, m.message_type, String(m.reply_sent), m.received_at]))}>Export CSV</Button>
          <Button variant="secondary" icon={<Download size={16} />} onClick={() => exportExcel('sms_inbox_export.xlsx', 'SMS Inbox (MO)', ['Channel','Sender','Sender Name','Recipient','Message','Message Type','Reply Sent','Received At'], filtered.map(m => [m.channel, m.sender, m.sender_name, m.recipient, m.message, m.message_type, String(m.reply_sent), m.received_at]))}>Export Excel</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-white rounded-xl p-4 border">
          <Inbox size={20} className="text-blue-500 mb-1" />
          <p className="text-2xl font-bold">{stats.total}</p>
          <p className="text-sm text-gray-500">Total Inbound</p>
        </div>
        <div className="bg-white rounded-xl p-4 border">
          <MessageCircle size={20} className="text-green-500 mb-1" />
          <p className="text-2xl font-bold">{stats.whatsapp}</p>
          <p className="text-sm text-gray-500">WhatsApp</p>
        </div>
        <div className="bg-white rounded-xl p-4 border">
          <Send size={20} className="text-blue-400 mb-1" />
          <p className="text-2xl font-bold">{stats.telegram}</p>
          <p className="text-sm text-gray-500">Telegram</p>
        </div>
        <div className="bg-white rounded-xl p-4 border">
          <Clock size={20} className="text-yellow-500 mb-1" />
          <p className="text-2xl font-bold">{stats.unread}</p>
          <p className="text-sm text-gray-500">Unprocessed</p>
        </div>
        <div className="bg-white rounded-xl p-4 border">
          <MessageSquare size={20} className="text-purple-500 mb-1" />
          <p className="text-2xl font-bold">{stats.replied}</p>
          <p className="text-sm text-gray-500">Replied</p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <Card className="flex-1">
          <div className="relative">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search by sender, name, or message..."
              value={search}
              onChange={e => { setSearch(e.target.value); setCurrentPage(1); }}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </Card>
        <div className="flex items-center gap-2 bg-white rounded-xl px-3 py-2 border">
          <SlidersHorizontal size={16} className="text-gray-400" />
          <select
            value={channelFilter}
            onChange={e => { setChannelFilter(e.target.value); setCurrentPage(1); }}
            className="text-sm border-0 bg-transparent focus:outline-none text-gray-600"
          >
            <option value="">All Channels</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="telegram">Telegram</option>
            <option value="sms">SMS</option>
          </select>
        </div>
      </div>

      <Card noPadding>
        {loading && moSMS.length === 0 ? (
          <div className="p-10 text-center text-gray-400">
            <RefreshCw size={24} className="mx-auto mb-2 animate-spin" />
            <p>Loading inbound messages...</p>
          </div>
        ) : (
          <>
            <Table columns={columns} data={paginated} keyExtractor={m => String(m.id)} />
            <Pagination
              currentPage={currentPage}
              totalPages={Math.max(totalPages, 1)}
              onPageChange={setCurrentPage}
              totalItems={filtered.length}
              itemsPerPage={itemsPerPage}
            />
          </>
        )}
      </Card>

      <Modal
        isOpen={!!viewModal}
        onClose={() => { setViewModal(null); setReplyText(''); }}
        title="Inbound Message Details"
        footer={
          viewModal && !viewModal.reply_sent ? (
            <div className="flex gap-3 w-full">
              <input
                type="text"
                value={replyText}
                onChange={e => setReplyText(e.target.value)}
                placeholder={`Type reply via ${viewModal.channel}...`}
                className="flex-1 px-3 py-2 border rounded-lg text-sm"
                onKeyDown={e => { if (e.key === 'Enter' && replyText.trim()) handleReply(viewModal); }}
              />
              <Button onClick={() => handleReply(viewModal!)} icon={<MessageSquare size={14} />} disabled={replySending || !replyText.trim()}>
                {replySending ? 'Sending...' : 'Send Reply'}
              </Button>
            </div>
          ) : undefined
        }
      >
        {viewModal && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-1">
              {(() => {
                const ch = channelLabels[viewModal.channel] || channelLabels.sms;
                return <Badge variant={ch.variant}>{ch.icon}<span className="ml-1">{ch.label}</span></Badge>;
              })()}
              {viewModal.message_type !== 'text' && <Badge variant="warning">{viewModal.message_type}</Badge>}
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-gray-500">From</p>
                <p className="font-mono font-medium">{viewModal.sender_name || viewModal.sender || '-'}</p>
                {viewModal.sender && viewModal.sender_name && viewModal.sender_name !== viewModal.sender && (
                  <p className="text-xs text-gray-400">{viewModal.sender}</p>
                )}
              </div>
              <div>
                <p className="text-gray-500">To (Recipient)</p>
                <p className="font-medium">{viewModal.recipient || '-'}</p>
              </div>
              <div>
                <p className="text-gray-500">Channel</p>
                <p className="capitalize">{viewModal.channel}</p>
              </div>
              <div>
                <p className="text-gray-500">Received</p>
                <p>{viewModal.received_at ? new Date(viewModal.received_at).toLocaleString() : '-'}</p>
              </div>
              {viewModal.external_id && (
                <div className="col-span-2">
                  <p className="text-gray-500">External ID</p>
                  <p className="font-mono text-xs text-gray-600">{viewModal.external_id}</p>
                </div>
              )}
            </div>
            <div className="bg-gray-50 p-4 rounded-lg">
              <p className="text-xs text-gray-500 mb-1">Message</p>
              <p className="text-gray-800 whitespace-pre-wrap">{viewModal.message || '-'}</p>
            </div>
            {viewModal.reply_sent && viewModal.reply_text && (
              <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                <p className="text-xs text-blue-600 mb-1">Reply Sent {viewModal.replied_at ? `at ${new Date(viewModal.replied_at).toLocaleString()}` : ''}</p>
                <p className="text-gray-800">{viewModal.reply_text}</p>
              </div>
            )}
            <div className="flex gap-2">
              <Badge variant={viewModal.processed ? 'success' : 'warning'}>
                {viewModal.processed ? 'Processed' : 'Pending'}
              </Badge>
              <Badge variant={viewModal.reply_sent ? 'success' : 'default'}>
                {viewModal.reply_sent ? 'Reply Sent' : 'No Reply'}
              </Badge>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
