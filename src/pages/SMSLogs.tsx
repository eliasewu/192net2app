import React, { useState, useEffect } from 'react';
import { Search, Download, Filter, RefreshCw, Eye, Clock, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { useData } from '../store/DataContext';
import { Card } from '../components/UI/Card';
import { Button } from '../components/UI/Button';
import { Badge } from '../components/UI/Badge';
import { Table, Pagination } from '../components/UI/Table';
import { Modal } from '../components/UI/Modal';
import { SMSLog } from '../types';
import { getDLRResponseTime, getDLRDuration, formatDuration, getRowStyle } from '../utils/smsHelpers';
import { exportCSV, exportExcel } from '../services/exportService';

// ═══ SMPP PDU Viewer helpers ═══
const TON_LABELS: Record<string, string> = {
  '0x00': 'Unknown', '0x01': 'International', '0x02': 'National',
  '0x03': 'Network Specific', '0x04': 'Subscriber Number', '0x05': 'Alphanumeric', '0x06': 'Abbreviated',
};
const NPI_LABELS: Record<string, string> = {
  '0x00': 'Unknown', '0x01': 'ISDN/E.164', '0x03': 'Data', '0x04': 'Telex',
  '0x06': 'Land Mobile', '0x08': 'National', '0x09': 'Private', '0x0E': 'Internet/IP',
};
const detectTON = (addr: string): string => {
  if (!addr) return '0x00';
  if (/^[a-zA-Z]/.test(addr)) return '0x05';
  if (/^\+?\d{3,15}$/.test(addr.replace(/\+/g, ''))) return '0x01';
  return '0x00';
};
const detectNPI = (addr: string): string => {
  if (!addr) return '0x00';
  if (/^[a-zA-Z]/.test(addr)) return '0x00';
  return '0x01';
};
const PduRow: React.FC<{ label: string; hex: string; desc: string; muted?: boolean }> = ({ label, hex, desc, muted }) => (
  <tr className={muted ? 'opacity-50' : ''}>
    <td className="py-1.5 pr-4 text-xs font-mono text-gray-500 whitespace-nowrap align-top">{label}</td>
    <td className="py-1.5 pr-4 text-xs font-mono text-gray-800 whitespace-nowrap align-top">{hex}</td>
    <td className="py-1.5 text-xs text-gray-500 align-top">{desc}</td>
  </tr>
);

export const SMSLogs: React.FC = () => {
  const { smsLogs, clients, reloadSMSLogs } = useData();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dlrStatusFilter, setDlrStatusFilter] = useState<string>('all');
  const [clientFilter, setClientFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [detailModal, setDetailModal] = useState<SMSLog | null>(null);
  const [detailTab, setDetailTab] = useState<'overview' | 'pdu'>('overview');
  const [refreshing, setRefreshing] = useState(false);

  const itemsPerPage = 20;

  // Auto-refresh every 10 seconds
  useEffect(() => {
    const interval = setInterval(() => { reloadSMSLogs(); }, 10000);
    return () => clearInterval(interval);
  }, [reloadSMSLogs]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await reloadSMSLogs();
    setRefreshing(false);
  };

  // Get DLR Result Badge
  const getDLRResultBadge = (log: SMSLog) => {
    const dlrStatus = log.dlr_status || log.dlr_result;
    if (!dlrStatus) {
      if (log.status === 'delivered') return <Badge variant="success" dot>DELIVRD</Badge>;
      if (log.status === 'failed') return <Badge variant="danger" dot>UNDELIV</Badge>;
      return <span className="text-xs text-gray-400">-</span>;
    }
    const isSuccess = dlrStatus === 'DELIVRD' || dlrStatus.toLowerCase() === 'delivered';
    return <Badge variant={isSuccess ? 'success' : 'danger'} dot>{dlrStatus}</Badge>;
  };

  // Get DLR icon for status column
  const getDLRIcon = (log: SMSLog) => {
    if (log.status === 'delivered' || log.dlr_status === 'DELIVRD') {
      return <CheckCircle size={16} className="text-green-500 inline mr-1" />;
    }
    if (log.status === 'failed' || log.dlr_status === 'UNDELIV') {
      return <XCircle size={16} className="text-red-500 inline mr-1" />;
    }
    if (log.status === 'pending') {
      return <Clock size={16} className="text-yellow-500 inline mr-1" />;
    }
    return <AlertTriangle size={16} className="text-gray-400 inline mr-1" />;
  };

  const filteredLogs = smsLogs.filter(log => {
    const matchesSearch = 
      (log.message_id || '').toLowerCase().includes(search.toLowerCase()) ||
      (log.destination || '').includes(search) ||
      (log.sender_id || '').toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || log.status === statusFilter;
    const matchesDlrStatus = dlrStatusFilter === 'all' ||
      (log.dlr_status || '') === dlrStatusFilter ||
      // Infer DLR status from sms_logs.status for rows that predate explicit dlr_status
      (dlrStatusFilter === 'DELIVRD' && log.status === 'delivered' && !log.dlr_status) ||
      (dlrStatusFilter === 'UNDELIV' && log.status === 'failed' && !log.dlr_status) ||
      (dlrStatusFilter === 'EXPIRED' && log.status === 'expired' && !log.dlr_status) ||
      (dlrStatusFilter === 'REJECTD' && log.status === 'rejected' && !log.dlr_status);
    const matchesClient = clientFilter === 'all' || String(log.client_id) === clientFilter;
    return matchesSearch && matchesStatus && matchesDlrStatus && matchesClient;
  });

  const totalPages = Math.ceil(filteredLogs.length / itemsPerPage);
  const paginatedLogs = filteredLogs.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'default'> = {
      delivered: 'success',
      sent: 'info',
      pending: 'warning',
      failed: 'danger',
      expired: 'default',
      rejected: 'danger',
      submitted: 'info',
    };
    return <Badge variant={statusMap[status] || 'default'}>{status}</Badge>;
  };

  const columns = [
    {
      key: 'message_id',
      header: 'Message ID',
      render: (log: SMSLog) => (
        <span className="font-mono text-xs bg-white/80 px-2 py-1 rounded">{log.message_id ? log.message_id.slice(0, 12) : '-'}...</span>
      ),
    },
    {
      key: 'client',
      header: 'Client',
      render: (log: SMSLog) => (
        <Badge variant="info">{log.client_code || '-'}</Badge>
      ),
    },
    {
      key: 'sender_id',
      header: 'Sender',
      render: (log: SMSLog) => (
        <span className="font-medium text-gray-800">{log.sender_id || '-'}</span>
      ),
    },
    {
      key: 'destination',
      header: 'Destination',
      render: (log: SMSLog) => (
        <div>
          <p className="font-mono text-sm text-gray-800">{log.destination || '-'}</p>
          {log.country && <p className="text-xs text-gray-500">{log.country}{log.operator ? ` • ${log.operator}` : ''}</p>}
        </div>
      ),
    },
    {
      key: 'message',
      header: 'Message',
      render: (log: SMSLog) => {
        const text = log.message || '';
        return text ? (
          <p className="text-sm text-gray-600 max-w-[200px] truncate" title={text}>{text}</p>
        ) : (
          <span className="text-xs text-gray-400 italic">no content</span>
        );
      },
    },
    {
      key: 'route',
      header: 'Route',
      render: (log: SMSLog) => (
        <div className="text-xs">
          {log.route_name && <p className="text-gray-700">{log.route_name}</p>}
          {log.supplier_code && <p className="text-gray-500">{log.supplier_code}</p>}
          {!log.route_name && !log.supplier_code && <span className="text-gray-400">-</span>}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (log: SMSLog) => (
        <div className="flex items-center gap-1">
          {getDLRIcon(log)}
          {getStatusBadge(log.status)}
        </div>
      ),
    },
    {
      key: 'dlr_result',
      header: 'DLR Result',
      render: (log: SMSLog) => getDLRResultBadge(log),
    },
    {
      key: 'dlr_response_time',
      header: 'DLR Resp.',
      render: (log: SMSLog) => {
        const time = getDLRResponseTime(log);
        return (
          <span className={`text-xs font-mono ${time !== null && time < 5000 ? 'text-green-600' : time !== null ? 'text-orange-600' : 'text-gray-400'}`}>
            {formatDuration(time)}
          </span>
        );
      },
    },
    {
      key: 'dlr_duration',
      header: 'Duration',
      render: (log: SMSLog) => {
        const dur = getDLRDuration(log);
        return (
          <span className={`text-xs font-mono ${dur !== null && dur < 5000 ? 'text-green-600' : dur !== null ? 'text-orange-600' : 'text-gray-400'}`}>
            {formatDuration(dur)}
          </span>
        );
      },
    },
    {
      key: 'rates',
      header: 'Rates',
      align: 'right' as const,
      render: (log: SMSLog) => (
        <div className="text-right text-xs">
          <p className="text-gray-700">€{(log.client_rate || 0).toFixed(4)}</p>
          <p className="text-green-600">+€{(log.profit || 0).toFixed(4)}</p>
        </div>
      ),
    },
    {
      key: 'time',
      header: 'Time',
      render: (log: SMSLog) => (
        <span className="text-xs text-gray-500">{log.submit_time ? new Date(log.submit_time).toLocaleString() : '-'}</span>
      ),
    },
    {
      key: 'actions',
      header: '',
      width: '50px',
      render: (log: SMSLog) => (
        <button
          onClick={(e) => {
            e.stopPropagation();
            setDetailModal(log);
          }}
          className="p-1.5 rounded hover:bg-white/80"
        >
          <Eye size={16} className="text-gray-500" />
        </button>
      ),
    },
  ];    const stats = {
    total: smsLogs.length,
    delivered: smsLogs.filter(l => l.status === 'delivered').length,
    failed: smsLogs.filter(l => l.status === 'failed').length,
    pending: smsLogs.filter(l => (l.status as string) === 'pending' || (l.status as string) === 'submitted' || l.status === 'sent').length,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">SMS Logs</h1>
          <p className="text-gray-500 mt-1">View all SMS traffic and delivery reports — auto-refreshes every 10s</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" icon={<RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />} onClick={handleRefresh} loading={refreshing}>Refresh</Button>
          <Button variant="secondary" icon={<Download size={16} />} onClick={() => exportCSV('sms_logs_export.csv', ['Message ID','Client','Sender','Destination','Country','Operator','Route','Supplier','Status','DLR Status','Client Rate','Supplier Rate','Profit','Submit Time'], filteredLogs.map(l => [l.message_id, l.client_code, l.sender_id, l.destination, l.country||'', l.operator||'', l.route_name||'', l.supplier_code||'', l.status, l.dlr_status||'', String(l.client_rate||0), String(l.supplier_rate||0), String(l.profit||0), l.submit_time]))}>Export CSV</Button>
          <Button variant="secondary" icon={<Download size={16} />} onClick={() => exportExcel('sms_logs_export.xlsx', 'SMS Logs', ['Message ID','Client','Sender','Destination','Country','Operator','Route','Supplier','Status','DLR Status','Client Rate','Supplier Rate','Profit','Submit Time'], filteredLogs.map(l => [l.message_id, l.client_code, l.sender_id, l.destination, l.country||'', l.operator||'', l.route_name||'', l.supplier_code||'', l.status, l.dlr_status||'', String(l.client_rate||0), String(l.supplier_rate||0), String(l.profit||0), l.submit_time]))}>Export Excel</Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-4 border border-gray-200">
          <p className="text-sm text-gray-500">Total Messages</p>
          <p className="text-2xl font-bold text-gray-800 mt-1">{stats.total.toLocaleString()}</p>
        </div>
        <div className="bg-green-50 rounded-xl p-4 border border-green-200">
          <div className="flex items-center gap-2">
            <CheckCircle size={16} className="text-green-500" />
            <p className="text-sm text-green-700">Delivered</p>
          </div>
          <p className="text-2xl font-bold text-green-700 mt-1">{stats.delivered.toLocaleString()}</p>
          <p className="text-xs text-green-600">{stats.total > 0 ? ((stats.delivered / stats.total) * 100).toFixed(1) : '0'}%</p>
        </div>
        <div className="bg-red-50 rounded-xl p-4 border border-red-200">
          <div className="flex items-center gap-2">
            <XCircle size={16} className="text-red-500" />
            <p className="text-sm text-red-700">Failed</p>
          </div>
          <p className="text-2xl font-bold text-red-700 mt-1">{stats.failed.toLocaleString()}</p>
          <p className="text-xs text-red-600">{stats.total > 0 ? ((stats.failed / stats.total) * 100).toFixed(1) : '0'}%</p>
        </div>
        <div className="bg-yellow-50 rounded-xl p-4 border border-yellow-200">
          <div className="flex items-center gap-2">
            <Clock size={16} className="text-yellow-500" />
            <p className="text-sm text-yellow-700">Pending</p>
          </div>
          <p className="text-2xl font-bold text-yellow-700 mt-1">{stats.pending.toLocaleString()}</p>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search by message ID, destination, sender..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex gap-2">
            <select
              value={clientFilter}
              onChange={(e) => setClientFilter(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Clients</option>
              {clients.map(c => (
                <option key={c.id} value={String(c.id)}>{c.client_code}</option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Status</option>
              <option value="delivered">Delivered</option>
              <option value="sent">Sent</option>
              <option value="pending">Pending</option>
              <option value="failed">Failed</option>
              <option value="rejected">Rejected</option>
            </select>
            <select
              value={dlrStatusFilter}
              onChange={(e) => setDlrStatusFilter(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All DLR</option>
              <option value="DELIVRD">DELIVRD</option>
              <option value="UNDELIV">UNDELIV</option>
              <option value="EXPIRED">EXPIRED</option>
              <option value="REJECTD">REJECTD</option>
            </select>
            <Button variant="secondary" icon={<Filter size={16} />}>More Filters</Button>
          </div>
        </div>
      </Card>

      {/* Table */}
      <Card noPadding>
        <Table
          columns={columns}
          data={paginatedLogs}
          keyExtractor={(log) => log.id}
          onRowClick={(log) => setDetailModal(log)}
          getRowStyle={(log) => getRowStyle(log)}
        />
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
          totalItems={filteredLogs.length}
          itemsPerPage={itemsPerPage}
        />
      </Card>

      {/* Detail Modal */}
      <Modal
        isOpen={!!detailModal}
        onClose={() => { setDetailModal(null); setDetailTab('overview'); }}
        title={`SMS Detail — ${detailModal?.message_id?.slice(0, 16) || ''}…`}
        size="xl"
      >
        {/* Tab bar */}
        {detailModal && (
          <div className="flex border-b border-gray-200 -mx-6 px-6 mb-4">
            <button
              onClick={() => setDetailTab('overview')}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                detailTab === 'overview'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Overview
            </button>
            <button
              onClick={() => setDetailTab('pdu')}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                detailTab === 'pdu'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              SMPP PDU
            </button>
          </div>
        )}
        {detailModal && (() => {
          const msg = detailModal;
          const dlrSuccess = msg.dlr_status === 'DELIVRD' || msg.status === 'delivered';
          const dlrFailed = msg.dlr_status === 'UNDELIV' || msg.status === 'failed';
          const sendResultMap: Record<string, string> = { submitted: 'success', sent: 'success', delivered: 'success', failed: 'failed', rejected: 'failed' };
          const sendResult = sendResultMap[msg.status] || msg.status;
          const msgBytes = (msg.message || '').length;
          const submitDate = msg.submit_time ? new Date(msg.submit_time) : null;
          const deliverDate = msg.delivery_time ? new Date(msg.delivery_time) : null;
          const dlrDate = msg.dlr_timestamp ? new Date(msg.dlr_timestamp) : null;
          const duration = submitDate && deliverDate ? Math.abs(deliverDate.getTime() - submitDate.getTime()) / 1000 : null;
          const dlrDuration = submitDate && dlrDate ? Math.abs(dlrDate.getTime() - submitDate.getTime()) / 1000 : null;

          // ═══ PDU viewer ═══
          if (detailTab === 'pdu') {
            const srcTON = detectTON(msg.sender_id || '');
            const srcNPI = detectNPI(msg.sender_id || '');
            const dstTON = detectTON(msg.destination || '');
            const dstNPI = detectNPI(msg.destination || '');
            const esmClass = msg.esm_class != null ? `0x${msg.esm_class.toString(16).padStart(2,'0').toUpperCase()}` : '0x00';
            const dataCoding = msg.data_coding != null ? `0x${msg.data_coding.toString(16).padStart(2,'0').toUpperCase()}` : '0x00';
            const regDelivery = msg.registered_delivery != null ? `0x${msg.registered_delivery.toString(16).padStart(2,'0').toUpperCase()}` : '0x01';
            const msgHex = (msg.message || '').split('').map(c => c.charCodeAt(0).toString(16).padStart(2,'0').toUpperCase()).join(' ');

            // Build DLR receipt string
            const dlrStat = msg.dlr_status || (msg.status === 'delivered' ? 'DELIVRD' : '');
            const dlrErr = msg.error_code || '000';
            const dlrReceipt = dlrStat ? `id:${msg.smpp_message_id || msg.message_id} sub:001 dlvrd:001 submit date:${msg.submit_time || ''} done date:${msg.delivery_time || ''} stat:${dlrStat} err:${dlrErr}` + (msg.error_message ? ` text:${msg.error_message}` : '') : '';
            const dlrReceiptHex = dlrReceipt.split('').map(c => c.charCodeAt(0).toString(16).padStart(2,'0').toUpperCase()).join(' ');


            return (
              <div className="space-y-5">
                {/* Submit SM PDU */}
                <div className="bg-white border-2 border-blue-200 rounded-xl overflow-hidden">
                  <div className="bg-blue-600 px-4 py-2.5 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-white uppercase tracking-wider">Submit SM PDU</span>
                      <span className="text-xs text-blue-200 font-mono">command_id: 0x00000004</span>
                    </div>
                    <span className="text-xs text-blue-200">client → gateway</span>
                  </div>
                  <div className="p-3 max-h-80 overflow-y-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-gray-100">
                          <th className="text-left py-1 text-xs font-semibold text-gray-400 uppercase">Field</th>
                          <th className="text-left py-1 text-xs font-semibold text-gray-400 uppercase">Hex</th>
                          <th className="text-left py-1 text-xs font-semibold text-gray-400 uppercase">Value</th>
                        </tr>
                      </thead>
                      <tbody>
                        <PduRow label="command_id" hex="0x00000004" desc="submit_sm" />
                        <PduRow label="command_status" hex="0x00000000" desc="OK (request)" />
                        <PduRow label="sequence_number" hex="—" desc="assigned by ESME" muted />
                        <PduRow label="service_type" hex="" desc='"" (default)' />
                        <PduRow label="source_addr_ton" hex={srcTON} desc={TON_LABELS[srcTON] || srcTON} />
                        <PduRow label="source_addr_npi" hex={srcNPI} desc={NPI_LABELS[srcNPI] || srcNPI} />
                        <PduRow label="source_addr" hex="" desc={msg.sender_id || '—'} />
                        <PduRow label="dest_addr_ton" hex={dstTON} desc={TON_LABELS[dstTON] || dstTON} />
                        <PduRow label="dest_addr_npi" hex={dstNPI} desc={NPI_LABELS[dstNPI] || dstNPI} />
                        <PduRow label="destination_addr" hex="" desc={msg.destination || '—'} />
                        <PduRow label="esm_class" hex={esmClass} desc={msg.esm_class != null ? `Store & Forward${(msg.esm_class & 0x04) ? ', Delivery Receipt' : ''}${(msg.esm_class & 0x08) ? ', User Ack' : ''}${(msg.esm_class & 0x10) ? ', UDH Indicator' : ''}` : 'Store & Forward (0)'} />
                        <PduRow label="protocol_id" hex="0x00" desc="SMPP" />
                        <PduRow label="priority_flag" hex="0x00" desc="Normal (0)" />
                        <PduRow label="schedule_delivery_time" hex="" desc='"" (immediate)' />
                        <PduRow label="validity_period" hex="" desc='"" (SMSC default)' />
                        <PduRow label="registered_delivery" hex={regDelivery} desc={msg.registered_delivery === 1 ? 'DLR on final (1)' : msg.registered_delivery === 0 ? 'No DLR (0)' : msg.registered_delivery === 2 ? 'DLR on failure (2)' : msg.registered_delivery === 3 ? 'DLR on success/failure (3)' : `Custom (${msg.registered_delivery})`} />
                        <PduRow label="replace_if_present" hex="0x00" desc="No (0)" />
                        <PduRow label="data_coding" hex={dataCoding} desc={msg.data_coding === 0 ? 'SMSC Default (0)' : msg.data_coding === 3 ? 'ISO-8859-1 (3)' : msg.data_coding === 8 ? 'UCS-2 (8)' : msg.data_coding != null ? `Custom (${msg.data_coding})` : 'SMSC Default (0)'} />
                        <PduRow label="sm_default_msg_id" hex="0x00" desc="Not used (0)" />
                        <PduRow label="sm_length" hex={`0x${msgBytes.toString(16).padStart(2,'0').toUpperCase()}`} desc={`${msgBytes} octets`} />
                        <PduRow label="short_message" hex={msgHex || '(empty)'} desc={msg.message ? `"${msg.message.length > 40 ? msg.message.slice(0, 40) + '…' : msg.message}"` : '(empty)'} />
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Deliver SM (DLR) PDU */}
                <div className="bg-white border-2 border-green-200 rounded-xl overflow-hidden">
                  <div className="bg-green-600 px-4 py-2.5 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-white uppercase tracking-wider">Deliver SM PDU (DLR)</span>
                      <span className="text-xs text-green-200 font-mono">command_id: 0x00000005</span>
                    </div>
                    <span className="text-xs text-green-200">supplier → gateway → client</span>
                  </div>
                  <div className="p-3 max-h-80 overflow-y-auto">
                    {dlrReceipt ? (
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-gray-100">
                            <th className="text-left py-1 text-xs font-semibold text-gray-400 uppercase">Field</th>
                            <th className="text-left py-1 text-xs font-semibold text-gray-400 uppercase">Hex</th>
                            <th className="text-left py-1 text-xs font-semibold text-gray-400 uppercase">Value</th>
                          </tr>
                        </thead>
                        <tbody>
                          <PduRow label="command_id" hex="0x00000005" desc="deliver_sm" />
                          <PduRow label="command_status" hex="0x00000000" desc="OK" />
                          <PduRow label="sequence_number" hex="—" desc="assigned by SMSC" muted />
                          <PduRow label="service_type" hex="" desc='"" (default)' />
                          <PduRow label="source_addr_ton" hex={dstTON} desc={TON_LABELS[dstTON] || dstTON} />
                          <PduRow label="source_addr_npi" hex={dstNPI} desc={NPI_LABELS[dstNPI] || dstNPI} />
                          <PduRow label="source_addr" hex="" desc={msg.destination || '—'} />
                          <PduRow label="dest_addr_ton" hex={srcTON} desc={TON_LABELS[srcTON] || srcTON} />
                          <PduRow label="dest_addr_npi" hex={srcNPI} desc={NPI_LABELS[srcNPI] || srcNPI} />
                          <PduRow label="destination_addr" hex="" desc={msg.sender_id || '—'} />
                          <PduRow label="esm_class" hex="0x04" desc="Delivery Receipt (4)" />
                          <PduRow label="protocol_id" hex="0x00" desc="SMPP" />
                          <PduRow label="priority_flag" hex="0x00" desc="Normal (0)" />
                          <PduRow label="schedule_delivery_time" hex="" desc='""' />
                          <PduRow label="validity_period" hex="" desc='""' />
                          <PduRow label="registered_delivery" hex="0x00" desc="No further DLR (0)" />
                          <PduRow label="replace_if_present" hex="0x00" desc="No (0)" />
                          <PduRow label="data_coding" hex="0x00" desc="SMSC Default (0)" />
                          <PduRow label="sm_default_msg_id" hex="0x00" desc="Not used (0)" />
                          <PduRow label="sm_length" hex={`0x${dlrReceipt.length.toString(16).padStart(2,'0').toUpperCase()}`} desc={`${dlrReceipt.length} octets`} />
                          <PduRow label="short_message" hex={dlrReceiptHex || '(empty)'} desc={dlrReceipt ? `"${dlrReceipt.length > 60 ? dlrReceipt.slice(0, 60) + '…' : dlrReceipt}"` : '(empty)'} />
                        </tbody>
                      </table>
                    ) : (
                      <div className="p-8 text-center">
                        <p className="text-gray-400 text-sm">No DLR received yet</p>
                        <p className="text-xs text-gray-400 mt-1">The deliver_sm PDU will appear here once the supplier sends a delivery receipt.</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Legend */}
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                  <p className="text-xs text-gray-500 mb-2">PDU Field Reference</p>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-1 text-xs text-gray-500">
                    <span>TON 0x00 = Unknown</span>
                    <span>TON 0x01 = International</span>
                    <span>TON 0x05 = Alphanumeric</span>
                    <span>NPI 0x01 = ISDN/E.164</span>
                    <span>DC 0x00 = SMSC Default</span>
                    <span>DC 0x08 = UCS-2</span>
                    <span>ESM 0x00 = Store &amp; Forward</span>
                    <span>ESM 0x04 = Delivery Receipt</span>
                    <span>reg_del 0x01 = DLR on final</span>
                  </div>
                </div>
              </div>
            );
          }

          // ═══ Overview tab (default) ═══
          return (
            <div className="space-y-5">

              {/* ═══ Delivery Status ═══ */}
              <div className="grid grid-cols-3 gap-3">
                <div className={`rounded-xl p-4 border-2 text-center ${dlrSuccess ? 'border-green-300 bg-green-50' : dlrFailed ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-gray-50'}`}>
                  <p className="text-xs text-gray-500 uppercase tracking-wider">Send Result</p>
                  <p className={`text-lg font-bold mt-1 ${msg.status === 'submitted' ? 'text-blue-600' : dlrFailed || dlrSuccess ? 'text-green-600' : 'text-gray-600'}`}>
                    {sendResult}
                  </p>
                </div>
                <div className={`rounded-xl p-4 border-2 text-center ${dlrSuccess ? 'border-green-300 bg-green-50' : dlrFailed ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-gray-50'}`}>
                  <p className="text-xs text-gray-500 uppercase tracking-wider">Deliver Result</p>
                  <p className={`text-lg font-bold mt-1 ${dlrSuccess ? 'text-green-600' : dlrFailed ? 'text-red-600' : 'text-gray-400'}`}>
                    {msg.dlr_status || (msg.status === 'delivered' ? 'DELIVRD' : msg.status === 'submitted' ? '…' : '—')}
                  </p>
                </div>
                <div className="rounded-xl p-4 border-2 border-gray-200 bg-gray-50 text-center">
                  <p className="text-xs text-gray-500 uppercase tracking-wider">Charged</p>
                  <p className="text-lg font-bold mt-1 text-gray-700">{msg.message_parts || 1}</p>
                  <p className="text-xs text-gray-400">part{msg.message_parts !== 1 ? 's' : ''}</p>
                </div>
              </div>

              {/* ═══ Message Details ═══ */}
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">SMS Content</p>
                <div className="bg-white rounded-lg border border-gray-200 p-3">
                  <p className="text-sm text-gray-800 whitespace-pre-wrap break-all">{msg.message || <span className="text-gray-400 italic">no content</span>}</p>
                </div>
                <div className="grid grid-cols-2 gap-2 mt-3 text-xs text-gray-500">
                  <span>SMS bytes: <strong className="text-gray-700">{msgBytes}</strong></span>
                  <span>Data coding: <strong className="text-gray-700">{msg.data_coding ?? 0}</strong></span>
                </div>
              </div>

              {/* ═══ Destinations & Routing ═══ */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white border border-gray-200 rounded-lg p-3">
                  <p className="text-xs text-gray-400 uppercase tracking-wider">Destination</p>
                  <p className="font-mono text-sm font-semibold text-gray-800 mt-1">{msg.destination || '—'}</p>
                  {msg.mcc && <p className="text-xs text-gray-400 mt-0.5">MCC: {msg.mcc} / MNC: {msg.mnc || '—'}</p>}
                </div>
                <div className="bg-white border border-gray-200 rounded-lg p-3">
                  <p className="text-xs text-gray-400 uppercase tracking-wider">Sender</p>
                  <p className="font-mono text-sm font-semibold text-gray-800 mt-1">{msg.sender_id || '—'}</p>
                </div>
                <div className="bg-white border border-gray-200 rounded-lg p-3">
                  <p className="text-xs text-gray-400 uppercase tracking-wider">Client</p>
                  <p className="text-sm font-semibold text-gray-800 mt-1">{msg.client_code || '—'}</p>
                </div>
                <div className="bg-white border border-gray-200 rounded-lg p-3">
                  <p className="text-xs text-gray-400 uppercase tracking-wider">Supplier</p>
                  <p className="text-sm font-semibold text-gray-800 mt-1">{msg.supplier_code || '—'}</p>
                </div>
              </div>

              {/* ═══ Routing ═══ */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-white border border-gray-200 rounded-lg p-3">
                  <p className="text-xs text-gray-400 uppercase tracking-wider">Route</p>
                  <p className="text-sm font-medium text-gray-700 mt-1">{msg.route_name || 'Auto'}</p>
                </div>
                <div className="bg-white border border-gray-200 rounded-lg p-3">
                  <p className="text-xs text-gray-400 uppercase tracking-wider">Trunk</p>
                  <p className="text-sm font-medium text-gray-700 mt-1">{msg.trunk_name || 'Direct'}</p>
                </div>
                <div className="bg-white border border-gray-200 rounded-lg p-3">
                  <p className="text-xs text-gray-400 uppercase tracking-wider">Channel</p>
                  <p className="text-sm font-medium text-gray-700 mt-1">{msg.channel || 'sms'}</p>
                </div>
                <div className="bg-white border border-gray-200 rounded-lg p-3">
                  <p className="text-xs text-gray-400 uppercase tracking-wider">Source</p>
                  <p className="text-sm font-medium text-gray-700 mt-1">{msg.source || '—'}</p>
                </div>
              </div>

              {/* ═══ Timing ═══ */}
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">Timing</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-xs text-gray-400">Created</p>
                    <p className="text-sm font-mono text-gray-700">{msg.created_at ? new Date(msg.created_at).toLocaleString() : '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">Send / Submit</p>
                    <p className="text-sm font-mono text-gray-700">{submitDate ? submitDate.toLocaleString() : '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">Done / Deliver</p>
                    <p className="text-sm font-mono text-gray-700">{deliverDate ? deliverDate.toLocaleString() : '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">DLR Timestamp</p>
                    <p className="text-sm font-mono text-gray-700">{dlrDate ? dlrDate.toLocaleString() : '—'}</p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4 mt-3 pt-3 border-t border-gray-200">
                  <div className="text-center">
                    <p className="text-xs text-gray-400">Duration</p>
                    <p className="text-lg font-bold text-gray-700 font-mono">{duration !== null ? `${duration.toFixed(0)}s` : '—'}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-gray-400">DLR Duration</p>
                    <p className={`text-lg font-bold font-mono ${dlrDuration !== null && dlrDuration < 5 ? 'text-green-600' : dlrDuration !== null ? 'text-orange-600' : 'text-gray-400'}`}>
                      {dlrDuration !== null ? `${dlrDuration.toFixed(0)}s` : '—'}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-gray-400">Deliver Dur.</p>
                    <p className="text-lg font-bold text-gray-700 font-mono">
                      {deliverDate && dlrDate ? `${Math.abs((dlrDate.getTime() - deliverDate.getTime()) / 1000).toFixed(0)}s` : '—'}
                    </p>
                  </div>
                </div>
              </div>

              {/* ═══ Financial ═══ */}
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">Financial</p>
                <div className="grid grid-cols-4 gap-4">
                  <div className="bg-blue-50 rounded-lg p-3 text-center">
                    <p className="text-xs text-blue-500">Client Rate</p>
                    <p className="text-xl font-bold text-blue-700 font-mono">{msg.currency || 'EUR'} {Number(msg.client_rate || 0).toFixed(4)}</p>
                  </div>
                  <div className="bg-gray-100 rounded-lg p-3 text-center">
                    <p className="text-xs text-gray-500">Supplier Rate</p>
                    <p className="text-xl font-bold text-gray-600 font-mono">{msg.currency || 'EUR'} {Number(msg.supplier_rate || 0).toFixed(4)}</p>
                  </div>
                  <div className="bg-green-50 rounded-lg p-3 text-center">
                    <p className="text-xs text-green-500">Profit</p>
                    <p className="text-xl font-bold text-green-700 font-mono">{msg.currency || 'EUR'} {Number(msg.profit || 0).toFixed(4)}</p>
                  </div>
                  <div className="bg-white border rounded-lg p-3 text-center">
                    <p className="text-xs text-gray-400">Parts</p>
                    <p className="text-xl font-bold text-gray-700">{msg.message_parts || 1}</p>
                  </div>
                </div>
              </div>

              {/* ═══ SMPP / Technical ═══ */}
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">SMPP / Technical</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div>
                    <p className="text-xs text-gray-400">In Msg ID</p>
                    <p className="text-sm font-mono text-gray-700 break-all">{msg.smpp_message_id || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">Internal Msg ID</p>
                    <p className="text-sm font-mono text-gray-700 break-all">{msg.message_id || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">Registered Delivery</p>
                    <p className="text-sm font-mono text-gray-700">{msg.registered_delivery ?? '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">ESM Class</p>
                    <p className="text-sm font-mono text-gray-700">{msg.esm_class ?? '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">Data Coding</p>
                    <p className="text-sm font-mono text-gray-700">{msg.data_coding ?? 0}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">Error Code</p>
                    <p className={`text-sm font-mono ${msg.error_code ? 'text-red-600' : 'text-gray-400'}`}>{msg.error_code || '—'}</p>
                  </div>
                  <div className="md:col-span-2">
                    <p className="text-xs text-gray-400">Error Message</p>
                    <p className={`text-sm ${msg.error_message ? 'text-red-600' : 'text-gray-400'}`}>{msg.error_message || '—'}</p>
                  </div>
                </div>
              </div>

            </div>
          );
        })()}
      </Modal>
    </div>
  );
};
