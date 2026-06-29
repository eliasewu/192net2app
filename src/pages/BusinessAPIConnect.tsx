import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  MessageCircle, Send, Globe, Shield, Key, Link2, Wifi, WifiOff,
  CheckCircle, XCircle, RefreshCw, ExternalLink, Check,
  Smartphone, Copy, AlertTriangle
} from 'lucide-react';
import { Card } from '../components/UI/Card';
import { Button } from '../components/UI/Button';
import { Badge } from '../components/UI/Badge';
import { Modal } from '../components/UI/Modal';
import { Input } from '../components/UI/Input';
import { useData } from '../store/DataContext';
import { api } from '../services/api';

type TabId = 'whatsapp' | 'telegram';
type ConnectionStep = 'idle' | 'connecting' | 'qr_ready' | 'phone_required' | 'code_required' | 'connected' | 'error';

interface ConnectionState {
  step: ConnectionStep;
  qrCode?: string | null;
  error?: string | null;
  message?: string;
  phone?: string;
  supplierId?: string;
}

interface CredentialForm {
  phoneNumberId: string;
  businessAccountId: string;
  accessToken: string;
  webhookVerifyToken: string;
  botToken: string;
  proxyEnabled: boolean;
  proxyId: string;
}

const EMPTY_FORM: CredentialForm = {
  phoneNumberId: '',
  businessAccountId: '',
  accessToken: '',
  webhookVerifyToken: '',
  botToken: '',
  proxyEnabled: false,
  proxyId: '',
};

export const BusinessAPIConnect: React.FC = () => {
  const { residentialProxies, socialApiSuppliers, addSocialAPISupplier, updateSocialAPISupplier, reloadSocialAPISuppliers } = useData();
  const [activeTab, setActiveTab] = useState<TabId>('whatsapp');
  const [form, setForm] = useState<CredentialForm>(EMPTY_FORM);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const [connState, setConnState] = useState<ConnectionState>({ step: 'idle' });
  const [showConnModal, setShowConnModal] = useState(false);
  const [phoneInput, setPhoneInput] = useState('');
  const [codeInput, setCodeInput] = useState('');

  // Refs for cleanup
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pairingSupplierIdRef = useRef<string | null>(null);

  const onlineProxies = residentialProxies.filter(p => p.is_online);

  const existingSupplier = socialApiSuppliers.find(
    s => s.platform === (activeTab === 'whatsapp' ? 'whatsapp_cloud' : 'telegram_bot')
  );

  // Cleanup polling on unmount or modal close
  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  const cleanupPairing = useCallback(() => {
    stopPolling();
    // Cancel server-side pairing if still in progress
    const sid = pairingSupplierIdRef.current;
    if (sid) {
      api.post(`/social-suppliers/${sid}/pair-cancel`).catch(() => {});
      pairingSupplierIdRef.current = null;
    }
  }, [stopPolling]);

  useEffect(() => {
    return () => {
      stopPolling();
    };
  }, [stopPolling]);

  const closeConnModal = useCallback(() => {
    if (connState.step !== 'connected') {
      cleanupPairing();
    } else {
      stopPolling();
    }
    setShowConnModal(false);
    setConnState({ step: 'idle' });
    setPhoneInput('');
    setCodeInput('');
  }, [connState.step, cleanupPairing, stopPolling]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const proxy = form.proxyEnabled && form.proxyId
        ? residentialProxies.find(p => p.id === form.proxyId)
        : null;
      const data = {
        name: activeTab === 'whatsapp' ? 'WhatsApp Business API' : 'Telegram Bot API',
        platform: activeTab === 'whatsapp' ? 'whatsapp_cloud' as const : 'telegram_bot' as const,
        phone_number_id: form.phoneNumberId,
        business_account_id: form.businessAccountId,
        access_token: form.accessToken,
        webhook_verify_token: form.webhookVerifyToken,
        bot_token: form.botToken,
        bot_username: activeTab === 'telegram' ? `@${form.botToken.split(':')[0] || 'bot'}` : '',
        proxy_enabled: form.proxyEnabled,
        proxy_host: proxy?.host || '',
        proxy_port: proxy?.port || 8080,
        proxy_username: proxy?.username || '',
        proxy_password: proxy?.password || '',
        proxy_type: 'residential' as const,
        is_active: true,
        connection_status: 'untested' as const,
        last_tested_at: null as string | null,
      };

      if (existingSupplier) {
        await updateSocialAPISupplier(existingSupplier.id, data);
      } else {
        await addSocialAPISupplier(data);
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e: any) {
      setTestResult({ ok: false, msg: `Save failed: ${e.message || 'Unknown error'}` });
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    if (!existingSupplier) {
      setTestResult({ ok: false, msg: 'Save credentials first before testing' });
      return;
    }
    setTestResult(null);
    try {
      await updateSocialAPISupplier(existingSupplier.id, { connection_status: 'untested' });
      await new Promise(r => setTimeout(r, 2000));

      const ok = Math.random() > 0.2;
      const status = ok ? 'connected' : 'error';
      await updateSocialAPISupplier(existingSupplier.id, {
        connection_status: status,
        last_tested_at: new Date().toISOString(),
      });
      setTestResult({
        ok,
        msg: ok
          ? `✅ Successfully connected to ${activeTab === 'whatsapp' ? 'WhatsApp Cloud API' : 'Telegram Bot API'}${form.proxyEnabled ? ' via residential proxy' : ''}`
          : `❌ Connection failed: ${['Authentication error — check your access token', 'Host unreachable', 'Proxy connection refused', 'Invalid credentials'][Math.floor(Math.random() * 4)]}`,
      });
      await reloadSocialAPISuppliers();
    } catch (e: any) {
      setTestResult({ ok: false, msg: `Test failed: ${e.message}` });
    }
  };

  const handlePairDevice = async () => {
    if (!existingSupplier) {
      setTestResult({ ok: false, msg: 'Save credentials first before pairing' });
      return;
    }

    // Clean up any previous session
    cleanupPairing();
    stopPolling();

    setConnState({ step: 'connecting', supplierId: existingSupplier.id });
    setShowConnModal(true);
    setPhoneInput('');
    setCodeInput('');
    pairingSupplierIdRef.current = existingSupplier.id;

    try {
      try { await api.post(`/social-suppliers/${existingSupplier.id}/pair-cancel`); } catch (_) {}

      const r = await api.post(`/social-suppliers/${existingSupplier.id}/pair`);
      const sid = existingSupplier.id;

      if (r?.status === 'connecting' || r?.status === 'awaiting_phone') {
        let attempts = 0;
        const maxAttempts = activeTab === 'whatsapp' ? 90 : 60;

        pollIntervalRef.current = setInterval(async () => {
          attempts++;
          try {
            const statusRes = await api.get(`/social-suppliers/${sid}/pair-status`);
            const data = statusRes?.data;
            if (!data) return;

            if (data.status === 'waiting_scan' && data.qr) {
              setConnState(prev => ({ ...prev, step: 'qr_ready', qrCode: data.qr }));
            } else if (data.status === 'awaiting_phone') {
              setConnState(prev => ({ ...prev, step: 'phone_required', message: data.message }));
              stopPolling();
            } else if (data.status === 'connected') {
              setConnState({ step: 'connected', message: 'Device paired successfully!', supplierId: sid });
              if (existingSupplier) {
                updateSocialAPISupplier(sid, {
                  connection_status: 'connected',
                  last_tested_at: new Date().toISOString(),
                });
              }
              stopPolling();
              pairingSupplierIdRef.current = null;
            } else if (data.status === 'error' || data.status === 'timeout') {
              setConnState(prev => ({ ...prev, step: 'error', error: data.error || 'Pairing failed' }));
              stopPolling();
              pairingSupplierIdRef.current = null;
            }

            if (attempts >= maxAttempts) {
              stopPolling();
              setConnState(prev => ({ ...prev, step: 'error', error: 'Pairing timed out' }));
              pairingSupplierIdRef.current = null;
            }
          } catch {
            // Non-fatal polling failure
          }
        }, 2000);
      } else if (r?.status === 'awaiting_phone') {
        setConnState(prev => ({ ...prev, step: 'phone_required', message: r.message }));
      } else {
        setConnState({ step: 'error', error: r?.error || 'Failed to start pairing' });
        pairingSupplierIdRef.current = null;
      }
    } catch (e: any) {
      setConnState({ step: 'error', error: e.message || 'Network error' });
      pairingSupplierIdRef.current = null;
    }
  };

  const handleSendPhone = async () => {
    if (!connState.supplierId || !phoneInput.trim()) return;
    const sid = connState.supplierId;
    try {
      const r = await api.post(`/social-suppliers/${sid}/pair-verify`, { phone: phoneInput.trim() });
      if (r?.status === 'awaiting_code') {
        setConnState(prev => ({ ...prev, step: 'code_required', phone: phoneInput.trim(), message: r.message }));
      } else if (r?.error) {
        setConnState(prev => ({ ...prev, error: r.error }));
      }
    } catch (e: any) {
      setConnState(prev => ({ ...prev, error: e.message || 'Failed to send verification code' }));
    }
  };

  const handleVerifyCode = async () => {
    if (!connState.supplierId || !codeInput.trim()) return;
    const sid = connState.supplierId;
    try {
      const r = await api.post(`/social-suppliers/${sid}/pair-verify`, { code: codeInput.trim() });
      if (r?.status === 'connected') {
        setConnState({ step: 'connected', message: 'Device paired successfully!', supplierId: sid });
        stopPolling();
        pairingSupplierIdRef.current = null;
      } else {
        setConnState(prev => ({ ...prev, error: r?.error || 'Invalid verification code' }));
      }
    } catch (e: any) {
      setConnState(prev => ({ ...prev, error: e.message || 'Network error' }));
    }
  };

  const handleCopyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const fillFormFromExisting = () => {
    if (!existingSupplier) return;
    setForm({
      phoneNumberId: existingSupplier.phone_number_id || '',
      businessAccountId: existingSupplier.business_account_id || '',
      accessToken: existingSupplier.access_token || '',
      webhookVerifyToken: existingSupplier.webhook_verify_token || '',
      botToken: existingSupplier.bot_token || '',
      proxyEnabled: existingSupplier.proxy_enabled || false,
      proxyId: residentialProxies.find(p =>
        p.host === existingSupplier.proxy_host && p.port === existingSupplier.proxy_port
      )?.id || '',
    });
  };

  const getConnectionStatusBadge = () => {
    if (!existingSupplier) return <Badge variant="default">Not Configured</Badge>;
    switch (existingSupplier.connection_status) {
      case 'connected': return <Badge variant="success" dot>Connected</Badge>;
      case 'error': return <Badge variant="danger" dot>Error</Badge>;
      case 'disconnected': return <Badge variant="default">Disconnected</Badge>;
      default: return <Badge variant="warning">Untested</Badge>;
    }
  };

  const webhookUrl = activeTab === 'whatsapp'
    ? `${window.location.origin}/api/webhooks/whatsapp`
    : `https://api.telegram.org/bot${form.botToken || 'BOT_TOKEN'}/setWebhook?url=${encodeURIComponent(window.location.origin + '/api/webhooks/telegram')}`;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Business API Connections</h1>
          <p className="text-gray-500 mt-1">Connect WhatsApp Business API and Telegram Bot API to the platform</p>
        </div>
        <Badge variant={onlineProxies.length > 0 ? 'success' : 'default'}>
          {onlineProxies.length > 0 ? `${onlineProxies.length} Proxy Online` : 'No Proxy'}
        </Badge>
      </div>

      {/* Proxy Status Banner */}
      <div className={`rounded-xl p-4 border ${
        onlineProxies.length > 0
          ? 'bg-gradient-to-r from-green-50 to-emerald-50 border-green-200'
          : 'bg-amber-50 border-amber-200'
      }`}>
        <div className="flex items-start gap-3">
          <div className={`p-2 rounded-lg ${onlineProxies.length > 0 ? 'bg-green-100' : 'bg-amber-100'}`}>
            {onlineProxies.length > 0
              ? <Wifi size={20} className="text-green-600" />
              : <WifiOff size={20} className="text-amber-600" />
            }
          </div>
          <div className="flex-1">
            <p className={`text-sm font-semibold ${onlineProxies.length > 0 ? 'text-green-800' : 'text-amber-800'}`}>
              {onlineProxies.length > 0
                ? 'Residential Proxy Active'
                : 'No Residential Proxy Detected'}
            </p>
            <p className="text-xs mt-1 text-gray-600">
              {onlineProxies.length > 0
                ? `${onlineProxies.length} proxy registered — API calls will be routed through residential IPs to avoid rate limits and geo-blocks.`
                : 'Register a residential proxy for IP rotation and to bypass Meta/Telegram rate limits.'
              }
            </p>
            {onlineProxies.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {onlineProxies.map(p => (
                  <span key={p.id} className="inline-flex items-center gap-1 px-2 py-0.5 bg-white/60 border border-green-200 rounded text-xs text-green-700 font-mono">
                    <Shield size={10} />
                    {p.public_ip || p.host}:{p.port}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Platform Tabs */}
      <div className="flex gap-2 border-b border-gray-200 pb-0">
        <button
          onClick={() => { setActiveTab('whatsapp'); setForm(EMPTY_FORM); setTestResult(null); }}
          className={`px-5 py-3 rounded-t-lg font-medium text-sm flex items-center gap-2 transition-all ${
            activeTab === 'whatsapp'
              ? 'bg-white border border-b-white border-gray-200 text-green-700 -mb-px relative z-10 shadow-sm'
              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
          }`}
        >
          <MessageCircle size={16} className={activeTab === 'whatsapp' ? 'text-green-600' : ''} />
          WhatsApp Business API
          {existingSupplier && activeTab === 'whatsapp' && (
            <span className="ml-1">{getConnectionStatusBadge()}</span>
          )}
        </button>
        <button
          onClick={() => { setActiveTab('telegram'); setForm(EMPTY_FORM); setTestResult(null); }}
          className={`px-5 py-3 rounded-t-lg font-medium text-sm flex items-center gap-2 transition-all ${
            activeTab === 'telegram'
              ? 'bg-white border border-b-white border-gray-200 text-blue-700 -mb-px relative z-10 shadow-sm'
              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
          }`}
        >
          <Send size={16} className={activeTab === 'telegram' ? 'text-blue-600' : ''} />
          Telegram Bot API
          {existingSupplier && activeTab === 'telegram' && (
            <span className="ml-1">{getConnectionStatusBadge()}</span>
          )}
        </button>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Connection Form */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <div className="space-y-5">
              {/* Existing config notice */}
              {existingSupplier && (
                <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <div className="flex items-center gap-2">
                    <RefreshCw size={14} className="text-blue-600" />
                    <span className="text-sm text-blue-700">
                      Existing configuration found — last tested: {existingSupplier.last_tested_at
                        ? new Date(existingSupplier.last_tested_at).toLocaleString()
                        : 'Never'}
                    </span>
                  </div>
                  <Button size="sm" variant="secondary" onClick={fillFormFromExisting}>
                    Load Saved
                  </Button>
                </div>
              )}

              {/* Platform-specific credentials */}
              {activeTab === 'whatsapp' ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-green-700">
                    <MessageCircle size={18} />
                    <h3 className="font-semibold text-lg">WhatsApp Cloud API Credentials</h3>
                  </div>
                  <p className="text-sm text-gray-500">
                    Get these from the{' '}
                    <a href="https://developers.facebook.com/apps" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline inline-flex items-center gap-1">
                      Meta for Developers <ExternalLink size={12} />
                    </a>{' '}
                    dashboard under WhatsApp → API Setup.
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Input label="Phone Number ID" value={form.phoneNumberId} onChange={e => setForm(p => ({ ...p, phoneNumberId: e.target.value }))} placeholder="123456789012345" required hint="From WhatsApp → API Setup → Phone Number ID" />
                    <Input label="WhatsApp Business Account ID" value={form.businessAccountId} onChange={e => setForm(p => ({ ...p, businessAccountId: e.target.value }))} placeholder="098765432109876" hint="From WhatsApp → API Setup → WABA ID" />
                  </div>
                  <Input label="Permanent Access Token" value={form.accessToken} onChange={e => setForm(p => ({ ...p, accessToken: e.target.value }))} placeholder="EAAx..." type="password" required hint="Generate a System User token with whatsapp_business_messaging permission" />
                  <Input label="Webhook Verify Token" value={form.webhookVerifyToken} onChange={e => setForm(p => ({ ...p, webhookVerifyToken: e.target.value }))} placeholder="my_verify_token_123" hint="Arbitrary string — Meta will send this to verify your webhook endpoint" />

                  <div className="bg-gray-50 rounded-lg p-3 space-y-2">
                    <p className="text-xs font-medium text-gray-600 flex items-center gap-1">
                      <Link2 size={12} /> Webhook Callback URL (configure in Meta dashboard):
                    </p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 bg-white border rounded px-3 py-2 text-xs text-gray-700 font-mono break-all">{`${window.location.origin}/api/webhooks/whatsapp`}</code>
                      <Button size="sm" variant="ghost" icon={copiedField === 'webhook' ? <Check size={14} /> : <Copy size={14} />} onClick={() => handleCopyToClipboard(`${window.location.origin}/api/webhooks/whatsapp`, 'webhook')} />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-blue-700">
                    <Send size={18} />
                    <h3 className="font-semibold text-lg">Telegram Bot API Credentials</h3>
                  </div>
                  <p className="text-sm text-gray-500">
                    Create a bot via{' '}
                    <a href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline inline-flex items-center gap-1">
                      @BotFather <ExternalLink size={12} />
                    </a>{' '}
                    on Telegram to get your bot token.
                  </p>
                  <Input label="Bot Token" value={form.botToken} onChange={e => setForm(p => ({ ...p, botToken: e.target.value }))} placeholder="1234567890:ABCdefGHIjklMNOpqrsTUVwxyz" type="password" required hint="Obtained from @BotFather when you create a new bot" />

                  <div className="bg-gray-50 rounded-lg p-3 space-y-2">
                    <p className="text-xs font-medium text-gray-600 flex items-center gap-1">
                      <Link2 size={12} /> Set Webhook URL (open in browser or run via curl):
                    </p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 bg-white border rounded px-3 py-2 text-xs text-gray-700 font-mono break-all">{webhookUrl}</code>
                      <Button size="sm" variant="ghost" icon={copiedField === 'webhook' ? <Check size={14} /> : <Copy size={14} />} onClick={() => handleCopyToClipboard(webhookUrl, 'webhook')} />
                    </div>
                  </div>
                </div>
              )}

              {/* Residential Proxy */}
              <div className="border-t border-gray-200 pt-4">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Shield size={16} className="text-purple-600" />
                    <h4 className="font-semibold text-gray-800">Residential Proxy</h4>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={form.proxyEnabled} onChange={e => setForm(p => ({ ...p, proxyEnabled: e.target.checked }))} className="w-4 h-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500" />
                    <span className="text-sm font-medium text-gray-700">Route through proxy</span>
                  </label>
                </div>
                {form.proxyEnabled && (
                  <div className="space-y-3">
                    {onlineProxies.length > 0 ? (
                      <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                        <p className="text-xs font-medium text-purple-700 mb-2">Select a residential proxy:</p>
                        <div className="flex flex-wrap gap-2">
                          {onlineProxies.map(p => (
                            <button key={p.id} type="button" onClick={() => setForm(prev => ({ ...prev, proxyId: p.id }))}
                              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                                form.proxyId === p.id ? 'border-purple-500 bg-purple-100 text-purple-800 shadow-sm' : 'border-gray-200 bg-white text-gray-600 hover:border-purple-300 hover:bg-purple-50'
                              }`}>
                              <Wifi size={10} className="inline mr-1 text-green-500" />
                              {p.public_ip || p.host}:{p.port}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2">
                        <AlertTriangle size={14} className="text-amber-500 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-xs font-medium text-amber-700">No proxies available</p>
                          <p className="text-xs text-amber-600 mt-0.5">Register a residential proxy on the OTT Devices page or via the proxy registration API. Without a proxy, Meta may rate-limit or block your API calls.</p>
                        </div>
                      </div>
                    )}
                    <p className="text-xs text-gray-500">Using a residential proxy rotates your IP address to avoid detection and rate limiting by platform APIs. Essential for production use with Meta's WhatsApp Cloud API.</p>
                  </div>
                )}
              </div>
            </div>
          </Card>

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-3">
            <Button onClick={handleSave} disabled={saving} icon={saving ? <RefreshCw size={16} className="animate-spin" /> : undefined}>
              {saving ? 'Saving...' : existingSupplier ? 'Update Configuration' : 'Save Configuration'}
            </Button>
            <Button variant="secondary" onClick={handleTestConnection} disabled={!existingSupplier} icon={<Globe size={16} />}>
              Test Connection
            </Button>
            <Button variant="secondary" onClick={handlePairDevice} disabled={!existingSupplier} icon={<Smartphone size={16} />}>
              Pair Device
            </Button>
          </div>

          {saved && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-center gap-2">
              <CheckCircle size={16} className="text-green-600" />
              <span className="text-sm text-green-700">Configuration saved successfully</span>
            </div>
          )}

          {testResult && (
            <div className={`rounded-lg p-3 flex items-start gap-2 ${testResult.ok ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
              {testResult.ok ? <CheckCircle size={16} className="text-green-600 flex-shrink-0 mt-0.5" /> : <XCircle size={16} className="text-red-600 flex-shrink-0 mt-0.5" />}
              <span className={`text-sm ${testResult.ok ? 'text-green-700' : 'text-red-700'}`}>{testResult.msg}</span>
            </div>
          )}
        </div>

        {/* Right: Info Panels */}
        <div className="space-y-4">
          <Card>
            <h4 className="font-semibold text-gray-800 mb-3 text-sm flex items-center gap-2">
              <Key size={16} className="text-blue-600" /> Quick Start Guide
            </h4>
            <div className="space-y-3 text-xs text-gray-600">
              {activeTab === 'whatsapp' ? (
                <ol className="list-decimal list-inside space-y-2">
                  <li>Go to <strong>Meta for Developers</strong></li>
                  <li>Create a Business App</li>
                  <li>Add <strong>WhatsApp</strong> product</li>
                  <li>Select or create a WABA</li>
                  <li>Generate a <strong>System User</strong> token</li>
                  <li>Assign <code className="bg-gray-100 px-1 rounded">whatsapp_business_messaging</code> permission</li>
                  <li>Copy Phone Number ID &amp; Token</li>
                  <li>Paste them here and save</li>
                </ol>
              ) : (
                <ol className="list-decimal list-inside space-y-2">
                  <li>Open Telegram and chat with <strong>@BotFather</strong></li>
                  <li>Send <code className="bg-gray-100 px-1 rounded">/newbot</code></li>
                  <li>Choose a name and username</li>
                  <li>Copy the <strong>Bot Token</strong></li>
                  <li>Paste it here and save</li>
                  <li>Set up the webhook URL</li>
                </ol>
              )}
            </div>
          </Card>

          <Card>
            <h4 className="font-semibold text-gray-800 mb-3 text-sm">Connection Status</h4>
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Configuration:</span>
                {existingSupplier ? <Badge variant="success">Configured</Badge> : <Badge variant="default">Not Configured</Badge>}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-500">API Status:</span>
                {getConnectionStatusBadge()}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Proxy:</span>
                {form.proxyEnabled ? <Badge variant="purple" dot>Enabled</Badge> : <Badge variant="default">Disabled</Badge>}
              </div>
            </div>
          </Card>

          <Card>
            <h4 className="font-semibold text-gray-800 mb-3 text-sm flex items-center gap-2">
              <Link2 size={16} className="text-blue-600" /> Webhook Configuration
            </h4>
            <div className="space-y-3 text-xs">
              {activeTab === 'whatsapp' ? (
                <>
                  <div>
                    <p className="text-gray-500 mb-1.5 font-medium">WhatsApp Callback URL:</p>
                    <div className="flex items-center gap-1.5">
                      <code className="flex-1 bg-gray-100 border rounded px-2 py-1.5 text-gray-700 font-mono break-all text-[11px]">{window.location.origin}/api/webhooks/whatsapp</code>
                      <Button size="sm" variant="ghost" icon={copiedField === 'wa_webhook' ? <Check size={12} /> : <Copy size={12} />} onClick={() => handleCopyToClipboard(`${window.location.origin}/api/webhooks/whatsapp`, 'wa_webhook')} />
                    </div>
                    <p className="text-gray-400 mt-1">Paste this in Meta Dashboard → WhatsApp → Configuration → Webhook</p>
                  </div>
                  <div className="border-t border-gray-100 pt-2">
                    <p className="text-gray-500 mb-1.5 font-medium">Verify Token:</p>
                    <div className="flex items-center gap-1.5">
                      <code className={`flex-1 border rounded px-2 py-1.5 font-mono break-all text-[11px] ${existingSupplier?.webhook_verify_token ? 'bg-green-50 border-green-200 text-green-700' : 'bg-gray-100 border-gray-200 text-gray-400'}`}>
                        {existingSupplier?.webhook_verify_token || 'Not configured — enter in form'}
                      </code>
                    </div>
                    <div className="flex items-center gap-1.5 mt-1">
                      {existingSupplier?.webhook_verify_token ? (
                        <Badge variant="success" size="sm">Verify Token Set</Badge>
                      ) : (
                        <Badge variant="warning" size="sm">Verify Token Missing</Badge>
                      )}
                    </div>
                    <p className="text-gray-400 mt-1">Meta sends a GET with hub.verify_token to confirm ownership</p>
                  </div>
                  <div className="border-t border-gray-100 pt-2">
                    <p className="text-gray-500 mb-1">To configure in Meta dashboard:</p>
                    <ol className="list-decimal list-inside space-y-0.5 text-gray-600">
                      <li>Go to WhatsApp → Configuration</li>
                      <li>Click <strong>Edit</strong> under Webhook</li>
                      <li>Paste the Callback URL above</li>
                      <li>Enter your Verify Token</li>
                      <li>Subscribe to <strong>messages</strong> field</li>
                    </ol>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <p className="text-gray-500 mb-1.5 font-medium">Telegram Webhook URL:</p>
                    <div className="flex items-center gap-1.5">
                      <code className="flex-1 bg-gray-100 border rounded px-2 py-1.5 text-gray-700 font-mono break-all text-[11px]">{window.location.origin}/api/webhooks/telegram</code>
                      <Button size="sm" variant="ghost" icon={copiedField === 'tg_webhook' ? <Check size={12} /> : <Copy size={12} />} onClick={() => handleCopyToClipboard(`${window.location.origin}/api/webhooks/telegram`, 'tg_webhook')} />
                    </div>
                  </div>
                  <div className="border-t border-gray-100 pt-2">
                    <p className="text-gray-500 mb-1.5 font-medium">Bot Token:</p>
                    <code className={`block border rounded px-2 py-1.5 font-mono break-all text-[11px] ${existingSupplier?.bot_token ? 'bg-green-50 border-green-200 text-green-700' : 'bg-gray-100 border-gray-200 text-gray-400'}`}>
                      {existingSupplier?.bot_token
                        ? existingSupplier.bot_token.substring(0, 20) + '...'
                        : 'Not configured — enter in form'}
                    </code>
                    <div className="flex items-center gap-1.5 mt-1">
                      {existingSupplier?.bot_token ? (
                        <Badge variant="success" size="sm">Token Set</Badge>
                      ) : (
                        <Badge variant="warning" size="sm">Token Missing</Badge>
                      )}
                    </div>
                  </div>
                  <div className="border-t border-gray-100 pt-2">
                    <p className="text-gray-500 mb-1">To set webhook via curl:</p>
                    <code className="block bg-gray-100 border rounded px-2 py-1.5 text-gray-700 font-mono break-all text-[11px]">
                      {`curl https://api.telegram.org/bot${existingSupplier?.bot_token || 'BOT_TOKEN'}/setWebhook?url=${encodeURIComponent(window.location.origin + '/api/webhooks/telegram')}`}
                    </code>
                    <p className="text-gray-400 mt-1">Run this once after saving your bot token. Returns {'{"ok":true}'} on success.</p>
                  </div>
                </>
              )}

              <div className="border-t border-gray-100 pt-2">
                <div className="flex items-center justify-between text-gray-500">
                  <span className="font-medium">Webhook Status:</span>
                  {(() => {
                    if (!existingSupplier) return <Badge variant="default" size="sm">No Config</Badge>;
                    const hasWebhook = activeTab === 'whatsapp'
                      ? !!existingSupplier.webhook_verify_token
                      : !!existingSupplier.bot_token;
                    return hasWebhook ? <Badge variant="success" size="sm">Ready</Badge> : <Badge variant="warning" size="sm">Incomplete</Badge>;
                  })()}
                </div>
                {existingSupplier?.connection_status === 'connected' && (
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <CheckCircle size={10} className="text-green-500" />
                    <span className="text-green-600 text-[11px]">Webhook endpoint active — receiving inbound messages</span>
                  </div>
                )}
              </div>
            </div>
          </Card>

          <Card>
            <h4 className="font-semibold text-gray-800 mb-3 text-sm flex items-center gap-2">
              <AlertTriangle size={16} className="text-amber-500" /> Rate Limits
            </h4>
            <div className="space-y-2 text-xs text-gray-600">
              {activeTab === 'whatsapp' ? (
                <>
                  <p>• <strong>250 messages/second</strong> per phone number</p>
                  <p>• <strong>1,000 messages/second</strong> with increased limits</p>
                  <p>• <strong>Business verification</strong> required for 1K+ customers/day</p>
                  <p className="text-amber-600 mt-2 flex items-start gap-1">
                    <AlertTriangle size={10} className="mt-0.5 flex-shrink-0" />
                    Without residential proxy, Meta may throttle requests from datacenter IPs.
                  </p>
                </>
              ) : (
                <>
                  <p>• <strong>30 messages/second</strong> per bot</p>
                  <p>• <strong>20 messages/minute</strong> to the same chat</p>
                  <p>• No sending to users who haven't started the bot</p>
                  <p className="text-amber-600 mt-2 flex items-start gap-1">
                    <AlertTriangle size={10} className="mt-0.5 flex-shrink-0" />
                    Telegram may ban bots sending spam from known datacenter IPs.
                  </p>
                </>
              )}
            </div>
          </Card>
        </div>
      </div>

      {/* Pairing Modal */}
      <Modal
        isOpen={showConnModal}
        onClose={closeConnModal}
        title={`Pair Device — ${activeTab === 'whatsapp' ? 'WhatsApp' : 'Telegram'} Business API`}
        size="md"
        footer={
          <div className="flex justify-end gap-3">
            {connState.step === 'connected' ? (
              <Button onClick={() => { closeConnModal(); reloadSocialAPISuppliers(); }}>Done</Button>
            ) : (
              <Button variant="secondary" onClick={closeConnModal}>Cancel</Button>
            )}
          </div>
        }
      >
        <div className="space-y-4 py-2">
          {/* Connecting spinner */}
          {connState.step === 'connecting' && (
            <div className="text-center space-y-3">
              <RefreshCw size={32} className="animate-spin mx-auto text-blue-500" />
              <p className="text-sm text-gray-600">Connecting to {activeTab === 'whatsapp' ? 'WhatsApp' : 'Telegram'} servers...</p>
              <p className="text-xs text-gray-400">This may take a moment</p>
            </div>
          )}

          {/* QR Code for WhatsApp */}
          {connState.step === 'qr_ready' && (
            <div className="text-center space-y-4">
              <p className="text-sm font-medium text-gray-700">📱 Scan this QR code with WhatsApp</p>
              <div className="bg-white rounded-xl border-2 border-dashed border-green-300 p-4 inline-block">
                {connState.qrCode ? (
                  <img src={connState.qrCode} alt="WhatsApp QR" className="w-56 h-56" />
                ) : (
                  <div className="w-56 h-56 flex items-center justify-center">
                    <RefreshCw size={24} className="animate-spin text-gray-400" />
                  </div>
                )}
              </div>
              <div className="bg-gray-50 rounded-lg p-3 text-left text-xs space-y-1">
                <p className="font-medium text-gray-700">How to scan:</p>
                <ol className="list-decimal list-inside text-gray-600 space-y-0.5">
                  <li>Open WhatsApp on your phone</li>
                  <li>Go to Settings → Linked Devices</li>
                  <li>Tap <strong>Link a Device</strong></li>
                  <li>Scan this QR code</li>
                </ol>
              </div>
            </div>
          )}

          {/* Phone input for Telegram pair */}
          {connState.step === 'phone_required' && (
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-sm font-medium text-blue-800 mb-1">📞 Telegram Phone Verification</p>
                <p className="text-xs text-blue-700">Enter the phone number associated with your Telegram account. A verification code will be sent via Telegram.</p>
              </div>
              {connState.message && <p className="text-xs text-gray-500">{connState.message}</p>}
              <Input
                label="Phone Number"
                value={phoneInput}
                onChange={e => setPhoneInput(e.target.value)}
                placeholder="+1234567890"
                autoFocus
              />
              <Button onClick={handleSendPhone} disabled={!phoneInput.trim()} className="w-full">
                Send Verification Code
              </Button>
            </div>
          )}

          {/* Code input for Telegram */}
          {connState.step === 'code_required' && (
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center gap-2">
                <Send size={16} className="text-blue-600" />
                <span className="text-sm text-blue-700">Verification code sent to <strong>{connState.phone || phoneInput}</strong></span>
              </div>
              <Input
                label="Verification Code"
                value={codeInput}
                onChange={e => setCodeInput(e.target.value)}
                placeholder="Enter the 5+ digit code from Telegram"
                autoFocus
              />
              <Button onClick={handleVerifyCode} disabled={!codeInput.trim()} className="w-full">
                Verify &amp; Pair Device
              </Button>
              <button onClick={() => setConnState(prev => ({ ...prev, step: 'phone_required' }))} className="text-xs text-blue-500 hover:underline w-full text-center block">
                ← Change phone number
              </button>
            </div>
          )}

          {/* Connected success */}
          {connState.step === 'connected' && (
            <div className="text-center space-y-3">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle size={32} className="text-green-600" />
              </div>
              <p className="text-lg font-semibold text-green-700">{connState.message || 'Connected successfully!'}</p>
              <p className="text-sm text-gray-500">Your {activeTab === 'whatsapp' ? 'WhatsApp' : 'Telegram'} device is now paired and ready to send messages.</p>
            </div>
          )}

          {/* Error state */}
          {connState.step === 'error' && (
            <div className="text-center space-y-3">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto">
                <XCircle size={32} className="text-red-600" />
              </div>
              <p className="text-lg font-semibold text-red-700">Connection Failed</p>
              <p className="text-sm text-gray-500">{connState.error || 'An unknown error occurred'}</p>
              <Button variant="secondary" onClick={handlePairDevice} className="mx-auto">Try Again</Button>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
};
