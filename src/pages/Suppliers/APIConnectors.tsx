import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Search, Edit, Trash2, TestTube, Zap, MessageCircle, Smartphone, Loader2, Download } from 'lucide-react';
import { Card } from '../../components/UI/Card';
import { Button } from '../../components/UI/Button';
import { Badge } from '../../components/UI/Badge';
import { Modal } from '../../components/UI/Modal';
import { Input, Select, Textarea } from '../../components/UI/Input';
import { Table } from '../../components/UI/Table';
import { api } from '../../services/api';

interface ApiConnector {
  id: string;
  name: string;
  provider: string;
  region: string;
  auth_type: string;
  http_method: string;
  api_key: string;
  api_secret?: string;
  send_url: string;
  dlr_url: string;
  submit_pattern: string;
  dlr_pattern: string;
  dlr_value: string;
  params: string;
  is_active: boolean;
  connector_type?: 'http' | 'rcs' | 'flash_sms';
  connection_status?: string;
}

// Small hardcoded provider list for the search dropdown
const KNOWN_PROVIDERS = [
  'Twilio', 'Vonage', 'Infobip', 'Sinch', 'MessageBird', 'Plivo', 'Bandwidth',
  'Telnyx', 'ClickSend', 'BulkSMS', 'Textlocal', 'Clickatell', 'Routee',
  'MSG91', 'Gupshup', 'SSL Wireless', 'BulkSMSBD', 'Unifonic', 'CEQUENS',
  'Link Mobility', 'Google Jibe', 'Samsung', 'Vodafone', 'Orange', 'Telefonica',
  'T-Mobile', 'CM.com', 'Mitto',
];

const REGIONS = ['Global', 'Europe', 'India', 'Bangladesh', 'Middle East', 'Africa', 'Asia', 'Americas'];

// Old hardcoded connectors available for bulk import (one-click seed)
const BULK_IMPORT_CONNECTORS: Array<{ name: string; provider: string; region: string; auth_type: string; http_method: string; send_url: string; dlr_url: string; submit_pattern: string; dlr_pattern: string; dlr_value: string; params: string; connector_type: 'http' | 'rcs' | 'flash_sms' }> = [
  // HTTP API
  { name: 'Vonage SMS', provider: 'Vonage', region: 'Global', auth_type: 'API_KEY', http_method: 'POST', send_url: 'https://rest.nexmo.com/sms/json', dlr_url: '', submit_pattern: '"status":"0"', dlr_pattern: '"status":"delivered"', dlr_value: 'delivered', params: 'to,from,text,api_key,api_secret', connector_type: 'http' },
  { name: 'Twilio SMS', provider: 'Twilio', region: 'Global', auth_type: 'BASIC', http_method: 'POST', send_url: 'https://api.twilio.com/2010-04-01/Accounts/{{account_sid}}/Messages.json', dlr_url: '', submit_pattern: '"status":"queued"', dlr_pattern: '"status":"delivered"', dlr_value: 'delivered', params: 'To,From,Body', connector_type: 'http' },
  { name: 'Infobip SMS', provider: 'Infobip', region: 'Global', auth_type: 'BEARER', http_method: 'POST', send_url: 'https://api.infobip.com/sms/2/text/advanced', dlr_url: '', submit_pattern: '"status":"PENDING"', dlr_pattern: '"status":"DELIVERED"', dlr_value: 'DELIVERED', params: 'to,from,text', connector_type: 'http' },
  { name: 'Sinch SMS', provider: 'Sinch', region: 'Global', auth_type: 'BEARER', http_method: 'POST', send_url: 'https://sms.api.sinch.com/xms/v1/{{service_plan_id}}/batches', dlr_url: '', submit_pattern: '"accepted"', dlr_pattern: '"status":"Delivered"', dlr_value: 'Delivered', params: 'to,from,body', connector_type: 'http' },
  { name: 'MessageBird', provider: 'MessageBird', region: 'Global', auth_type: 'API_KEY', http_method: 'POST', send_url: 'https://rest.messagebird.com/messages', dlr_url: '', submit_pattern: '"status":"sent"', dlr_pattern: '"status":"delivered"', dlr_value: 'delivered', params: 'recipients,originator,body', connector_type: 'http' },
  { name: 'Plivo', provider: 'Plivo', region: 'Global', auth_type: 'BASIC', http_method: 'POST', send_url: 'https://api.plivo.com/v1/Account/{{auth_id}}/Message/', dlr_url: '', submit_pattern: '"message":"message(s) queued"', dlr_pattern: '"state":"delivered"', dlr_value: 'delivered', params: 'dst,src,text', connector_type: 'http' },
  { name: 'Bandwidth', provider: 'Bandwidth', region: 'Global', auth_type: 'BASIC', http_method: 'POST', send_url: 'https://messaging.bandwidth.com/api/v2/users/{{user_id}}/messages', dlr_url: '', submit_pattern: '"status":"accepted"', dlr_pattern: '"status":"DELIVERED"', dlr_value: 'DELIVERED', params: 'to,from,text', connector_type: 'http' },
  { name: 'Telnyx', provider: 'Telnyx', region: 'Global', auth_type: 'BEARER', http_method: 'POST', send_url: 'https://api.telnyx.com/v2/messages', dlr_url: '', submit_pattern: '"state":"queued"', dlr_pattern: '"state":"delivered"', dlr_value: 'delivered', params: 'to,from,text', connector_type: 'http' },
  { name: 'ClickSend', provider: 'ClickSend', region: 'Global', auth_type: 'BASIC', http_method: 'POST', send_url: 'https://rest.clicksend.com/v3/sms/send', dlr_url: '', submit_pattern: '"status":"SUCCESS"', dlr_pattern: '"status":"Delivered"', dlr_value: 'Delivered', params: 'to,from,body', connector_type: 'http' },
  { name: 'BulkSMS', provider: 'BulkSMS', region: 'Global', auth_type: 'BASIC', http_method: 'POST', send_url: 'https://api.bulksms.com/v1/messages', dlr_url: '', submit_pattern: '"status":"SENT"', dlr_pattern: '"status":"DELIVERED"', dlr_value: 'DELIVERED', params: 'to,from,body', connector_type: 'http' },
  { name: 'Textlocal', provider: 'Textlocal', region: 'Global', auth_type: 'API_KEY', http_method: 'POST', send_url: 'https://api.textlocal.in/send/', dlr_url: '', submit_pattern: '"status":"success"', dlr_pattern: '"status":"DELIVERED"', dlr_value: 'DELIVERED', params: 'numbers,sender,message,apikey', connector_type: 'http' },
  { name: 'Clickatell', provider: 'Clickatell', region: 'Global', auth_type: 'API_KEY', http_method: 'GET', send_url: 'https://platform.clickatell.com/messages/http/send', dlr_url: '', submit_pattern: '"accepted":true', dlr_pattern: '"charge":1', dlr_value: 'delivered', params: 'to,from,content', connector_type: 'http' },
  { name: 'Routee', provider: 'Routee', region: 'Global', auth_type: 'BEARER', http_method: 'POST', send_url: 'https://connect.routee.net/sms', dlr_url: '', submit_pattern: '"status":"Queued"', dlr_pattern: '"status":"Delivered"', dlr_value: 'Delivered', params: 'to,from,body', connector_type: 'http' },
  { name: 'MSG91 India', provider: 'MSG91', region: 'India', auth_type: 'API_KEY', http_method: 'POST', send_url: 'https://api.msg91.com/api/v5/flow/', dlr_url: '', submit_pattern: '"type":"success"', dlr_pattern: '"status":"delivered"', dlr_value: 'delivered', params: 'mobiles,message,authkey', connector_type: 'http' },
  { name: 'Gupshup India', provider: 'Gupshup', region: 'India', auth_type: 'API_KEY', http_method: 'POST', send_url: 'https://enterprise.smsgupshup.com/GatewayAPI/rest', dlr_url: '', submit_pattern: '"status":"success"', dlr_pattern: '"status":"delivered"', dlr_value: 'delivered', params: 'send_to,msg,method', connector_type: 'http' },
  { name: 'SSL Wireless BD', provider: 'SSL Wireless', region: 'Bangladesh', auth_type: 'API_KEY', http_method: 'POST', send_url: 'https://sms.sslwireless.com/pushapi/dynamic/server.php', dlr_url: '', submit_pattern: '"status":"SUCCESS"', dlr_pattern: '"status":"DELIVERED"', dlr_value: 'DELIVERED', params: 'msisdn,sms,csms_id', connector_type: 'http' },
  { name: 'BulkSMSBD', provider: 'BulkSMSBD', region: 'Bangladesh', auth_type: 'API_KEY', http_method: 'POST', send_url: 'https://bulksmsbd.net/api/smsapi', dlr_url: '', submit_pattern: '"status":"success"', dlr_pattern: '"status":"DELIVERED"', dlr_value: 'DELIVERED', params: 'number,message,api_key', connector_type: 'http' },
  { name: 'Unifonic ME', provider: 'Unifonic', region: 'Middle East', auth_type: 'BEARER', http_method: 'POST', send_url: 'https://el.cloud.unifonic.com/rest/SMS/messages', dlr_url: '', submit_pattern: '"status":"queued"', dlr_pattern: '"status":"delivered"', dlr_value: 'delivered', params: 'Recipient,Body,SenderID', connector_type: 'http' },
  { name: 'CEQUENS ME', provider: 'CEQUENS', region: 'Middle East', auth_type: 'BEARER', http_method: 'POST', send_url: 'https://apis.cequens.com/sms/v1/messages', dlr_url: '', submit_pattern: '"status":"queued"', dlr_pattern: '"status":"delivered"', dlr_value: 'delivered', params: 'to,body,senderName', connector_type: 'http' },
  { name: 'Link Mobility', provider: 'Link Mobility', region: 'Europe', auth_type: 'BEARER', http_method: 'POST', send_url: 'https://api.linkmobility.eu/sms/send', dlr_url: '', submit_pattern: '"status":"QUEUED"', dlr_pattern: '"status":"DELIVERED"', dlr_value: 'DELIVERED', params: 'to,from,body', connector_type: 'http' },
  // RCS
  { name: 'Google Jibe RCS', provider: 'Google Jibe', region: 'Global', auth_type: 'OAUTH2', http_method: 'POST', send_url: 'https://rcsbusinessmessaging.googleapis.com/v1/messages', dlr_url: '', submit_pattern: '"accepted"', dlr_pattern: '"status":"DELIVERED"', dlr_value: 'DELIVERED', params: 'to,message,fallback', connector_type: 'rcs' },
  { name: 'Samsung RCS Cloud', provider: 'Samsung', region: 'Global', auth_type: 'BEARER', http_method: 'POST', send_url: 'https://rcs-api.samsung.com/v1/send', dlr_url: '', submit_pattern: '"status":"submitted"', dlr_pattern: '"state":"delivered"', dlr_value: 'delivered', params: 'msisdn,text,sender', connector_type: 'rcs' },
  { name: 'Vodafone RCS', provider: 'Vodafone', region: 'Europe', auth_type: 'BEARER', http_method: 'POST', send_url: 'https://api.vodafone.com/rcs/v2/messages', dlr_url: '', submit_pattern: '"code":"OK"', dlr_pattern: '"deliveryStatus":"DeliveredToTerminal"', dlr_value: 'DeliveredToTerminal', params: 'destinationAddress,message,originator', connector_type: 'rcs' },
  { name: 'Orange RCS', provider: 'Orange', region: 'Europe', auth_type: 'BEARER', http_method: 'POST', send_url: 'https://api.orange.com/rcs/v1/send', dlr_url: '', submit_pattern: '"status":"sent"', dlr_pattern: '"status":"delivered"', dlr_value: 'delivered', params: 'to,body,from', connector_type: 'rcs' },
  { name: 'Telefonica RCS', provider: 'Telefonica', region: 'Europe', auth_type: 'BEARER', http_method: 'POST', send_url: 'https://rcs.telefonica.com/api/v1/mt', dlr_url: '', submit_pattern: '"status":"accepted"', dlr_pattern: '"status":"delivered"', dlr_value: 'delivered', params: 'destination,text,senderId', connector_type: 'rcs' },
  { name: 'T-Mobile RCS', provider: 'T-Mobile', region: 'Global', auth_type: 'BEARER', http_method: 'POST', send_url: 'https://rcs.t-mobile.com/api/v2/messages', dlr_url: '', submit_pattern: '"status":"queued"', dlr_pattern: '"status":"delivered"', dlr_value: 'delivered', params: 'to,message,from', connector_type: 'rcs' },
  { name: 'Sinch RCS', provider: 'Sinch', region: 'Global', auth_type: 'BEARER', http_method: 'POST', send_url: 'https://rcs.api.sinch.com/v1/messages', dlr_url: '', submit_pattern: '"accepted"', dlr_pattern: '"status":"Delivered"', dlr_value: 'Delivered', params: 'to,message,from', connector_type: 'rcs' },
  { name: 'Infobip RCS', provider: 'Infobip', region: 'Global', auth_type: 'BEARER', http_method: 'POST', send_url: 'https://api.infobip.com/rcs/1/message', dlr_url: '', submit_pattern: '"status":"PENDING"', dlr_pattern: '"status":"DELIVERED"', dlr_value: 'DELIVERED', params: 'to,text,from', connector_type: 'rcs' },
  { name: 'CM.com RCS', provider: 'CM.com', region: 'Europe', auth_type: 'BEARER', http_method: 'POST', send_url: 'https://gw.cmtelecom.com/v1.0/rcs/message', dlr_url: '', submit_pattern: '"status":"Accepted"', dlr_pattern: '"status":"Delivered"', dlr_value: 'Delivered', params: 'to,from,body', connector_type: 'rcs' },
  { name: 'Mitto RCS', provider: 'Mitto', region: 'Global', auth_type: 'API_KEY', http_method: 'POST', send_url: 'https://rest.mitto.ch/rcs', dlr_url: '', submit_pattern: '"status":"queued"', dlr_pattern: '"status":"delivered"', dlr_value: 'delivered', params: 'to,from,text', connector_type: 'rcs' },
  // Flash SMS
  { name: 'Twilio Flash', provider: 'Twilio', region: 'Global', auth_type: 'BASIC', http_method: 'POST', send_url: 'https://api.twilio.com/2010-04-01/Accounts/{{sid}}/Messages.json', dlr_url: '', submit_pattern: '"status":"queued"', dlr_pattern: '"status":"delivered"', dlr_value: 'delivered', params: 'To,From,Body,FlashSms=true', connector_type: 'flash_sms' },
  { name: 'Infobip Flash SMS', provider: 'Infobip', region: 'Global', auth_type: 'BEARER', http_method: 'POST', send_url: 'https://api.infobip.com/sms/2/flash/advanced', dlr_url: '', submit_pattern: '"status":"PENDING"', dlr_pattern: '"status":"DELIVERED"', dlr_value: 'DELIVERED', params: 'to,from,text,flash=true', connector_type: 'flash_sms' },
  { name: 'Vonage Flash', provider: 'Vonage', region: 'Global', auth_type: 'API_KEY', http_method: 'POST', send_url: 'https://rest.nexmo.com/sms/json', dlr_url: '', submit_pattern: '"status":"0"', dlr_pattern: '"status":"delivered"', dlr_value: 'delivered', params: 'to,from,text,message-class=0', connector_type: 'flash_sms' },
  { name: 'Sinch Flash SMS', provider: 'Sinch', region: 'Global', auth_type: 'BEARER', http_method: 'POST', send_url: 'https://sms.api.sinch.com/xms/v1/{{plan_id}}/batches', dlr_url: '', submit_pattern: '"accepted"', dlr_pattern: '"status":"Delivered"', dlr_value: 'Delivered', params: 'to,from,body,flash=true', connector_type: 'flash_sms' },
  { name: 'Plivo Flash', provider: 'Plivo', region: 'Global', auth_type: 'BASIC', http_method: 'POST', send_url: 'https://api.plivo.com/v1/Account/{{auth_id}}/Message/', dlr_url: '', submit_pattern: '"message":"message(s) queued"', dlr_pattern: '"state":"delivered"', dlr_value: 'delivered', params: 'dst,src,text,type=flash', connector_type: 'flash_sms' },
  { name: 'Routee Flash', provider: 'Routee', region: 'Global', auth_type: 'BEARER', http_method: 'POST', send_url: 'https://connect.routee.net/sms', dlr_url: '', submit_pattern: '"status":"Queued"', dlr_pattern: '"status":"Delivered"', dlr_value: 'Delivered', params: 'to,from,body,flash=true', connector_type: 'flash_sms' },
  { name: 'BulkSMS Flash', provider: 'BulkSMS', region: 'Global', auth_type: 'BASIC', http_method: 'POST', send_url: 'https://api.bulksms.com/v1/messages', dlr_url: '', submit_pattern: '"status":"SENT"', dlr_pattern: '"status":"DELIVERED"', dlr_value: 'DELIVERED', params: 'to,from,body,messageClass=0', connector_type: 'flash_sms' },
  { name: 'Clickatell Flash', provider: 'Clickatell', region: 'Global', auth_type: 'API_KEY', http_method: 'GET', send_url: 'https://platform.clickatell.com/messages/http/send', dlr_url: '', submit_pattern: '"accepted":true', dlr_pattern: '"charge":1', dlr_value: 'delivered', params: 'to,from,content,flash=1', connector_type: 'flash_sms' },
];

export const APIConnectors: React.FC = () => {
  const [connectors, setConnectors] = useState<ApiConnector[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [regionFilter, setRegionFilter] = useState('all');
  const [activeTab, setActiveTab] = useState<'http' | 'rcs' | 'flash_sms' | 'all'>('all');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<ApiConnector | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; msg: string }>>({});
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ done: 0, total: 0 });

  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: '', provider: '', region: 'Global', auth_type: 'API_KEY', http_method: 'POST',
    api_key: '', send_url: '', dlr_url: '', submit_pattern: '', dlr_pattern: '', dlr_value: 'delivered',
    params: '', is_active: true, connector_type: 'http' as ApiConnector['connector_type'],
  });

  // ─── fetch connectors from API ────────────────────────────
  const fetchConnectors = useCallback(async () => {
    try {
      const r = await api.get('/api-connectors');
      if (r?.success && Array.isArray(r.data)) {
        setConnectors(r.data.map((c: any) => ({
          ...c,
          id: String(c.id),
          connector_type: c.connector_type || 'http',
          connection_status: c.connection_status || 'untested',
        })));
      }
    } catch (e) { console.error('fetchConnectors:', e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchConnectors(); }, [fetchConnectors]);

  // ─── bulk import ───────────────────────────────────────────
  const handleBulkImport = async () => {
    setImporting(true);
    setImportProgress({ done: 0, total: BULK_IMPORT_CONNECTORS.length });
    let imported = 0;
    let skipped = 0;
    for (const conn of BULK_IMPORT_CONNECTORS) {
      try {
        await api.post('/api-connectors', {
          name: conn.name,
          provider: conn.provider,
          connector_type: conn.connector_type,
          region: conn.region,
          auth_type: conn.auth_type,
          http_method: conn.http_method,
          send_url: conn.send_url,
          dlr_url: conn.dlr_url || null,
          submit_pattern: conn.submit_pattern || null,
          dlr_pattern: conn.dlr_pattern || null,
          dlr_value: conn.dlr_value || null,
          params: conn.params || null,
          is_active: true,
        });
        imported++;
      } catch (e: any) {
        // Skip duplicates (409 or unique violation)
        if (e?.response?.status === 409 || e?.message?.includes('duplicate') || e?.message?.includes('unique')) {
          skipped++;
        }
      }
      setImportProgress({ done: imported + skipped, total: BULK_IMPORT_CONNECTORS.length });
    }
    setImporting(false);
    if (imported > 0 || skipped > 0) {
      setError(null);
    } else {
      setError('No new connectors imported (all may already exist).');
    }
    // Show import summary in test results style
    const summaryId = 'bulk-import-summary';
    setTestResults(prev => ({
      ...prev,
      [summaryId]: {
        ok: imported > 0,
        msg: `Imported ${imported} new connector${imported !== 1 ? 's' : ''}${skipped > 0 ? `, skipped ${skipped} (already exist)` : ''}.`,
      },
    }));
    await fetchConnectors();
  };

  // ─── derived data ──────────────────────────────────────────
  const tabConnectors = activeTab === 'all' ? connectors : connectors.filter(c => c.connector_type === activeTab);

  const filtered = tabConnectors.filter(c =>
    (c.name.toLowerCase().includes(search.toLowerCase()) || c.provider.toLowerCase().includes(search.toLowerCase())) &&
    (regionFilter === 'all' || c.region === regionFilter)
  );

  const counts = {
    http: connectors.filter(c => c.connector_type === 'http' || !c.connector_type).length,
    rcs: connectors.filter(c => c.connector_type === 'rcs').length,
    flash_sms: connectors.filter(c => c.connector_type === 'flash_sms').length,
    total: connectors.length,
    active: connectors.filter(c => c.is_active).length,
    connected: connectors.filter(c => c.connection_status === 'connected').length,
  };

  // ─── modal ─────────────────────────────────────────────────
  const openModal = (conn?: ApiConnector) => {
    if (conn) {
      setEditing(conn);
      setForm({
        name: conn.name, provider: conn.provider, region: conn.region, auth_type: conn.auth_type,
        http_method: conn.http_method, api_key: conn.api_key || '', send_url: conn.send_url,
        dlr_url: conn.dlr_url || '', submit_pattern: conn.submit_pattern || '',
        dlr_pattern: conn.dlr_pattern || '', dlr_value: conn.dlr_value || 'delivered',
        params: conn.params || '', is_active: conn.is_active,
        connector_type: conn.connector_type || 'http',
      });
    } else {
      setEditing(null);
      setForm({
        name: '', provider: '', region: 'Global', auth_type: 'API_KEY', http_method: 'POST',
        api_key: '', send_url: '', dlr_url: '', submit_pattern: '', dlr_pattern: '',
        dlr_value: 'delivered', params: '', is_active: true,
        connector_type: activeTab === 'all' ? 'http' : activeTab,
      });
    }
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.send_url) return;
    setSaving(true);
    try {
      const payload: any = {
        name: form.name || form.provider || 'Unnamed',
        provider: form.provider || form.name || 'Unknown',
        connector_type: form.connector_type,
        region: form.region,
        auth_type: form.auth_type,
        http_method: form.http_method,
        api_key: form.api_key,
        send_url: form.send_url,
        dlr_url: form.dlr_url || null,
        submit_pattern: form.submit_pattern || null,
        dlr_pattern: form.dlr_pattern || null,
        dlr_value: form.dlr_value || null,
        params: form.params || null,
        is_active: form.is_active,
      };

      if (editing) {
        await api.put(`/api-connectors/${editing.id}`, payload);
      } else {
        await api.post('/api-connectors', payload);
      }
      setShowModal(false);
      await fetchConnectors();
    } catch (e: any) { setError('Save failed: ' + (e.message || 'Unknown error')); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await api.delete(`/api-connectors/${id}`);
      await fetchConnectors();
    } catch (e: any) { setError('Delete failed: ' + (e.message || 'Unknown error')); }
    finally { setDeletingId(null); }
  };

  const handleTest = async (conn: ApiConnector) => {
    const id = conn.id;
    setConnectors(prev => prev.map(c => c.id === id ? { ...c, connection_status: 'testing' } : c));
    try {
      const r = await api.post(`/api-connectors/${id}/test`, {});
      const ok = r?.success === true || r?.connected === true;
      const msg = r?.message || r?.msg || (ok ? 'Connection successful' : 'Test failed');
      setConnectors(prev => prev.map(c => c.id === id ? { ...c, connection_status: ok ? 'connected' : 'failed' } : c));
      setTestResults(prev => ({ ...prev, [id]: { ok, msg } }));
    } catch (e: any) {
      setConnectors(prev => prev.map(c => c.id === id ? { ...c, connection_status: 'failed' } : c));
      setTestResults(prev => ({ ...prev, [id]: { ok: false, msg: e.message || 'Test failed' } }));
    } finally {
      await fetchConnectors();
    }
  };

  // ─── columns ───────────────────────────────────────────────
  const columns: any[] = [
    {
      key: 'name', header: 'Connector',
      render: (c: ApiConnector) => <div><p className="font-medium text-gray-800">{c.name}</p><p className="text-xs text-gray-500">{c.provider}</p></div>,
    },
    {
      key: 'type', header: 'Type',
      render: (c: ApiConnector) => {
        if (c.connector_type === 'rcs') return <Badge variant="purple" dot>RCS</Badge>;
        if (c.connector_type === 'flash_sms') return <Badge variant="warning" dot>Flash SMS</Badge>;
        return <Badge variant="info">HTTP API</Badge>;
      },
    },
    { key: 'region', header: 'Region', render: (c: ApiConnector) => <Badge variant={c.region === 'Global' ? 'info' : c.region === 'Bangladesh' ? 'success' : c.region === 'India' ? 'warning' : 'default'}>{c.region || 'Global'}</Badge> },
    { key: 'auth', header: 'Auth', render: (c: ApiConnector) => <Badge variant="default">{c.auth_type}</Badge> },
    {
      key: 'status', header: 'Status',
      render: (c: ApiConnector) => {
        if (c.connection_status === 'testing') return <Badge variant="warning">Testing...</Badge>;
        if (c.connection_status === 'connected') return <Badge variant="success" dot>Connected</Badge>;
        if (c.connection_status === 'failed') return <Badge variant="danger" dot>Failed</Badge>;
        return <Badge variant={c.is_active ? 'default' : 'danger'}>{c.is_active ? 'Active' : 'Inactive'}</Badge>;
      },
    },
    {
      key: 'actions', header: 'Actions',
      render: (c: ApiConnector) => (
        <div className="flex gap-1">
          <button onClick={() => handleTest(c)} className="p-1.5 rounded hover:bg-gray-100" title="Test"><TestTube size={14} className="text-blue-500" /></button>
          <button onClick={() => openModal(c)} className="p-1.5 rounded hover:bg-gray-100"><Edit size={14} className="text-gray-500" /></button>
          <button onClick={() => handleDelete(c.id)} className="p-1.5 rounded hover:bg-gray-100" disabled={deletingId === c.id}><Trash2 size={14} className={`text-red-500 ${deletingId === c.id ? 'opacity-50' : ''}`} /></button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">API Connectors</h1>
          <p className="text-gray-500 mt-1">{counts.total} API connectors — HTTP, RCS & Flash SMS</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" icon={<Download size={18} />} onClick={handleBulkImport} loading={importing}>
            Bulk Import {BULK_IMPORT_CONNECTORS.length} Providers
          </Button>
          <Button icon={<Plus size={18} />} onClick={() => openModal()}>Add Connector</Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-white rounded-xl p-4 border border-gray-200">
          <p className="text-sm text-gray-500">Total</p>
          <p className="text-2xl font-bold mt-1">{counts.total}</p>
        </div>
        <div className="bg-blue-50 rounded-xl p-4 border border-blue-200">
          <p className="text-sm text-blue-600">HTTP API</p>
          <p className="text-2xl font-bold text-blue-700 mt-1">{counts.http}</p>
        </div>
        <div className="bg-purple-50 rounded-xl p-4 border border-purple-200">
          <p className="text-sm text-purple-600">RCS</p>
          <p className="text-2xl font-bold text-purple-700 mt-1">{counts.rcs}</p>
        </div>
        <div className="bg-yellow-50 rounded-xl p-4 border border-yellow-200">
          <p className="text-sm text-yellow-600">Flash SMS</p>
          <p className="text-2xl font-bold text-yellow-700 mt-1">{counts.flash_sms}</p>
        </div>
        <div className="bg-green-50 rounded-xl p-4 border border-green-200">
          <p className="text-sm text-green-600">Connected</p>
          <p className="text-2xl font-bold text-green-700 mt-1">{counts.connected}</p>
        </div>
      </div>

      {/* Import progress bar */}
      {importing && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-blue-700">Importing {BULK_IMPORT_CONNECTORS.length} connectors...</p>
            <span className="text-sm text-blue-600">{importProgress.done}/{importProgress.total}</span>
          </div>
          <div className="w-full bg-blue-200 rounded-full h-2">
            <div className="bg-blue-600 h-2 rounded-full transition-all duration-300" style={{ width: importProgress.total > 0 ? `${(importProgress.done / importProgress.total) * 100}%` : '0%' }} />
          </div>
        </div>
      )}
      <div className="flex gap-2 border-b border-gray-200">
        {[
          { key: 'all', label: `All (${counts.total})`, icon: null },
          { key: 'http', label: `HTTP API (${counts.http})`, icon: <Smartphone size={14} /> },
          { key: 'rcs', label: `RCS (${counts.rcs})`, icon: <MessageCircle size={14} /> },
          { key: 'flash_sms', label: `Flash SMS (${counts.flash_sms})`, icon: <Zap size={14} /> },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => { setActiveTab(tab.key as typeof activeTab); setSearch(''); }}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.key
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Search + Region filter */}
      <Card>
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search by connector or provider name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <select value={regionFilter} onChange={e => setRegionFilter(e.target.value)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm">
            <option value="all">All Regions</option>
            {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
      </Card>

      {/* Table */}
      <Card noPadding>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={24} className="animate-spin text-gray-400" />
            <span className="ml-2 text-gray-500">Loading connectors...</span>
          </div>
        ) : (
          <Table columns={columns} data={filtered} keyExtractor={c => c.id} />
        )}
      </Card>

      {/* Test Results */}
      {Object.entries(testResults).map(([id, r]) => (
        <div key={id} className={`p-3 rounded-lg text-sm ${r.ok ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-red-50 border border-red-200 text-red-700'}`}>
          {connectors.find(c => c.id === id)?.name}: {r.msg}
        </div>
      ))}

      {/* Error banner */}
      {error && (
        <div className="p-3 rounded-lg text-sm bg-red-50 border border-red-200 text-red-700 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 ml-2">✕</button>
        </div>
      )}

      {/* Add/Edit Modal */}
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editing ? 'Edit API Connector' : 'Add API Connector'} size="lg" footer={<div className="flex justify-end gap-3"><Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button><Button onClick={handleSave} loading={saving}>{editing ? 'Update' : 'Create'}</Button></div>}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input label="Name *" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Twilio SMS" required />
            <Select label="Provider" value={form.provider} onChange={e => setForm(p => ({ ...p, provider: e.target.value }))} options={[{ value: '', label: 'Select...' }, ...KNOWN_PROVIDERS.map(p => ({ value: p, label: p }))]} />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <Select label="Region" value={form.region} onChange={e => setForm(p => ({ ...p, region: e.target.value }))} options={REGIONS.map(r => ({ value: r, label: r }))} />
            <Select label="Category *" value={form.connector_type || 'http'} onChange={e => setForm(p => ({ ...p, connector_type: e.target.value as ApiConnector['connector_type'] }))} options={[{ value: 'http', label: 'HTTP API' }, { value: 'rcs', label: 'RCS' }, { value: 'flash_sms', label: 'Flash SMS' }]} />
            <Select label="Auth Type" value={form.auth_type} onChange={e => setForm(p => ({ ...p, auth_type: e.target.value }))} options={[{ value: 'API_KEY', label: 'API Key' }, { value: 'BASIC', label: 'Basic Auth' }, { value: 'BEARER', label: 'Bearer Token' }, { value: 'OAUTH2', label: 'OAuth 2.0' }, { value: 'NONE', label: 'None' }]} />
          </div>
          <Select label="HTTP Method" value={form.http_method} onChange={e => setForm(p => ({ ...p, http_method: e.target.value }))} options={[{ value: 'POST', label: 'POST' }, { value: 'GET', label: 'GET' }, { value: 'PUT', label: 'PUT' }]} />
          <Input label="API Key / Token" value={form.api_key} onChange={e => setForm(p => ({ ...p, api_key: e.target.value }))} placeholder="Your API key or token" />
          <Textarea label="Send URL Template *" value={form.send_url} onChange={e => setForm(p => ({ ...p, send_url: e.target.value }))} rows={2} placeholder="Use {{to}}, {{from}}, {{text}} for variables — e.g. https://api.twilio.com/.../Messages.json" required />
          <Input label="DLR URL Template" value={form.dlr_url} onChange={e => setForm(p => ({ ...p, dlr_url: e.target.value }))} placeholder="Optional DLR callback URL" />
          <Input label="Parameters (comma-separated)" value={form.params} onChange={e => setForm(p => ({ ...p, params: e.target.value }))} placeholder="to,from,text,api_key" />
          <div className="grid grid-cols-3 gap-4">
            <Input label="Submit Success Pattern" value={form.submit_pattern} onChange={e => setForm(p => ({ ...p, submit_pattern: e.target.value }))} placeholder='"status":"success"' />
            <Input label="DLR Success Pattern" value={form.dlr_pattern} onChange={e => setForm(p => ({ ...p, dlr_pattern: e.target.value }))} />
            <Input label="DLR Success Value" value={form.dlr_value} onChange={e => setForm(p => ({ ...p, dlr_value: e.target.value }))} />
          </div>
          <label className="flex items-center gap-2"><input type="checkbox" checked={form.is_active} onChange={e => setForm(p => ({ ...p, is_active: e.target.checked }))} className="w-4 h-4 rounded border-gray-300 text-blue-600" /><span className="text-sm">Active</span></label>
        </div>
      </Modal>
    </div>
  );
};
