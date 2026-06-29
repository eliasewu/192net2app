import React, { useState, useEffect } from 'react';
import { Phone, Check, X, Search, RefreshCw, Sparkles } from 'lucide-react';
import { Card } from '../components/UI/Card';
import { Button } from '../components/UI/Button';
import { Badge } from '../components/UI/Badge';
import { Input } from '../components/UI/Input';
import { api } from '../services/api';
import { useToast } from '../components/UI/Toast';

interface ChannelCheck {
  valid: boolean;
  channel: string;
  e164?: string;
  field?: string;
  provider?: string;
  raw?: any;
  reason?: string;
}

const CHANNEL_META: Record<string, { label: string; color: string; icon: string }> = {
  sms:        { label: 'SMS / SMPP',     color: 'blue',    icon: '📱' },
  whatsapp:   { label: 'WhatsApp',       color: 'green',   icon: '💬' },
  telegram:   { label: 'Telegram',       color: 'blue',    icon: '✈️' },
  rcs:        { label: 'RCS',            color: 'purple',  icon: '📨' },
  flash_sms:  { label: 'Flash SMS',      color: 'yellow',  icon: '⚡' },
  voice_otp:  { label: 'Voice OTP',      color: 'orange',  icon: '🔊' },
};

export const NumberValidation: React.FC = () => {
  const [phone, setPhone] = useState('+12025550100');
  const [results, setResults] = useState<Record<string, ChannelCheck> | null>(null);
  const [loading, setLoading] = useState(false);
  const [providers, setProviders] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const { addToast } = useToast();

  useEffect(() => {
    api.get('/number/providers').then(r => setProviders(r?.data || [])).catch(() => {});
    api.get('/number/validation-cache?destination=' + encodeURIComponent(phone)).then(r => setHistory(r?.data || [])).catch(() => {});
  }, []);

  const runValidate = async () => {
    setLoading(true);
    try {
      const r = await api.post('/number/validate-all', { destination: phone });
      if (r?.data) setResults(r.data);
      // Refresh cache history afterward
      const ch = await api.get('/number/validation-cache?destination=' + encodeURIComponent(phone));
      setHistory(ch?.data || []);
    } catch (e: any) {
      addToast('error', 'Validation failed: ' + e.message);
    } finally { setLoading(false); }
  };

  const toggleProvider = async (channel: string, enabled: boolean) => {
    try {
      await api.put('/number/providers/' + channel, { enabled });
      const r = await api.get('/number/providers'); setProviders(r?.data || []);
    } catch (_) {}
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Number Validation</h1>
        <p className="text-gray-500 mt-1">Pre-send check: which channels can reach this number? Reject + push synthetic DLR when none match.</p>
      </div>

      <Card title="Check a phone number"
            subtitle="Enter E.164 or digits. Use the buttons below to test individual channels or all at once.">
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <Input
              label="Destination phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+12025550100"
              icon={<Phone size={16} />}
            />
          </div>
          <Button icon={<Search size={16} />} onClick={runValidate} loading={loading}>Validate All</Button>
          <Button variant="secondary" icon={<RefreshCw size={16} />} onClick={runValidate}>Refresh</Button>
        </div>
      </Card>

      {results && (
        <Card title="Channel reachability"
              subtitle={phone + ' — green: reachable, red: not via this channel'}>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {Object.keys(CHANNEL_META).map((c) => {
              const r = results[c];
              const ok = !!(r && r.valid);
              const meta = CHANNEL_META[c];
              return (
                <div key={c} className={`p-4 rounded-xl border-2 ${ok ? 'border-green-300 bg-green-50' : 'border-gray-200 bg-gray-50'}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">{meta.icon}</span>
                      <span className="font-semibold text-gray-800">{meta.label}</span>
                    </div>
                    {ok ? <Check size={20} className="text-green-600" /> : <X size={20} className="text-gray-400" />}
                  </div>
                  <p className="text-xs text-gray-600 mt-2">
                    {ok ? `Reachable via ${r.provider || 'mock'} provider` :
                       r?.reason ? `Reason: ${r.reason}` : 'Not reachable on this channel'}
                  </p>
                  {r?.raw && (
                    <details className="mt-2">
                      <summary className="text-xs text-blue-600 cursor-pointer">Raw response</summary>
                      <pre className="text-xs bg-gray-100 p-2 rounded mt-1 overflow-x-auto max-h-40">
                        {JSON.stringify(r.raw, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              );
            })}
          </div>
          <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm text-blue-800">
              <Sparkles size={14} className="inline mr-1" />
              The platform picks the FIRST valid channel from the client's <code>allowed_channels</code> ordering.
              If NONE match, the send is rejected and a synthetic <code>DLR=rejected_no_channel</code> is pushed to the client.
            </p>
          </div>
        </Card>
      )}

      {/* Provider configuration */}
      <Card title="Validation providers"
            subtitle="Pluggable adapters. MockProvider is the default. Real providers (Telegram bot, WhatsApp Cloud API, RCS Hub) need credentials.">
        <div className="grid gap-3">
          {providers.length === 0 ? (
            <p className="text-gray-500 text-sm">Providers not seeded yet. Run migrations first.</p>
          ) : providers.map((p) => (
            <div key={p.channel} className="flex items-center justify-between p-3 border rounded-lg">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xl">{CHANNEL_META[p.channel]?.icon || '📡'}</span>
                  <span className="font-medium text-gray-800">{CHANNEL_META[p.channel]?.label || p.channel}</span>
                  <Badge variant={p.provider_kind === 'mock' ? 'default' : 'info'}>{p.provider_kind}</Badge>
                </div>
                {p.provider_kind !== 'mock' && (
                  <p className="text-xs text-gray-500 mt-1">
                    {p.api_key ? '✓ credentials configured' : '⚠ credentials missing — lookups will fall back to mock'}
                  </p>
                )}
              </div>
              <label className="inline-flex items-center cursor-pointer">
                <input type="checkbox" checked={p.enabled} onChange={(e) => toggleProvider(p.channel, e.target.checked)} className="w-4 h-4 rounded" />
                <span className="ml-2 text-sm text-gray-700">{p.enabled ? 'Enabled' : 'Disabled'}</span>
              </label>
            </div>
          ))}
        </div>
      </Card>

      {/* Recent cache */}
      {history.length > 0 && (
        <Card title="Recent cache entries" subtitle="Validation results cached 24h" noPadding>
          <table className="w-full">
            <thead>
              <tr className="border-b">
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Phone (E.164)</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">WhatsApp</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Telegram</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">RCS</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Flash</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Voice</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Expires</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id} className="border-b hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-sm">{h.phone_e164}</td>
                  <td className="px-4 py-3 text-center"><Cell yes={h.has_whatsapp} /></td>
                  <td className="px-4 py-3 text-center"><Cell yes={h.has_telegram} /></td>
                  <td className="px-4 py-3 text-center"><Cell yes={h.has_rcs} /></td>
                  <td className="px-4 py-3 text-center"><Cell yes={h.flash_sms_capable} /></td>
                  <td className="px-4 py-3 text-center"><Cell yes={h.voice_capable} /></td>
                  <td className="px-4 py-3 text-right text-xs text-gray-500">{new Date(h.expires_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
};

const Cell: React.FC<{ yes: boolean | null }> = ({ yes }) => {
  if (yes === true) return <span className="inline-block w-6 h-6 rounded-full bg-green-500 text-white text-xs flex items-center justify-center">✓</span>;
  if (yes === false) return <span className="inline-block w-6 h-6 rounded-full bg-red-500 text-white text-xs flex items-center justify-center">✕</span>;
  return <span className="inline-block w-6 h-6 rounded-full bg-gray-300 text-gray-600 text-xs flex items-center justify-center">?</span>;
};
