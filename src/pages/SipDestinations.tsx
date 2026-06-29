import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Plus, Edit3, Trash2, Loader, AlertTriangle, CheckCircle, XCircle, GitBranch, Zap, Search } from 'lucide-react';
import { Card } from '../components/UI/Card';
import { Button } from '../components/UI/Button';
import { Badge } from '../components/UI/Badge';
import { Input } from '../components/UI/Input';
import { Modal } from '../components/UI/Modal';
import { api } from '../services/api';
import { useToast } from '../components/UI/Toast';

type SipServer = {
  id: number;
  name: string;
  ami_host: string;
  ami_port: number;
  sip_host: string;
  sip_port: number;
  is_active: boolean;
};

type Destination = {
  id: number;
  sip_server_id: number;
  sip_server_name?: string;
  sip_server_ami_host?: string;
  sip_server_ami_port?: number;
  sip_server_is_active?: boolean;
  kind: 'allow' | 'deny';
  priority: number;
  is_active: boolean;
  pattern: string;
  notes: string | null;
  created_at?: string;
  updated_at?: string;
};

const blankDraft: Omit<Destination, 'id' | 'created_at' | 'updated_at' | 'sip_server_name' | 'sip_server_ami_host' | 'sip_server_ami_port' | 'sip_server_is_active'> = {
  sip_server_id: 0 as unknown as number,
  kind: 'allow',
  priority: 10,
  is_active: true,
  pattern: '',
  notes: null,
};

export const SipDestinations: React.FC = () => {
  const { addToast } = useToast();
  const [servers, setServers] = useState<SipServer[]>([]);
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [loading, setLoading] = useState<'init' | 'refresh' | string | null>('init');

  // Modal state
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<Destination | null>(null);
  const [draft, setDraft] = useState<any>(blankDraft);

  // Tester state
  const [testPattern, setTestPattern] = useState('');
  const [testSamples, setTestSamples] = useState('+15551234567\n+447911123456\n+919876543210');
  const [testResult, setTestResult] = useState<any>(null);
  const [testing, setTesting] = useState(false);

  // Preview state
  const [previewDest, setPreviewDest] = useState('+15551234567');
  const [previewResult, setPreviewResult] = useState<any>(null);

  const loadAll = useCallback(async () => {
    setLoading('refresh');
    try {
      const [srv, dst] = await Promise.all([
        api.get('/asterisk/servers'),
        api.get('/asterisk/destinations'),
      ]);
      if (srv?.success) setServers((srv.data || []).filter((s: SipServer) => s.is_active !== false));
      if (dst?.success) setDestinations(dst.data || []);
    } catch (e) {
      console.warn('[SipDestinations] load failed', e);
    } finally { setLoading(null); }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const openAdd = () => {
    setEditing(null);
    setDraft({ ...blankDraft, sip_server_id: servers[0]?.id || 0 });
    setShowAdd(true);
  };
  const openEdit = (d: Destination) => {
    setEditing(d);
    setDraft({ ...d });
    setShowAdd(true);
  };
  const closeModal = () => { setShowAdd(false); setEditing(null); setDraft({ ...blankDraft }); };

  const saveDestination = async () => {
    setLoading('save');
    try {
      const payload = {
        ...draft,
        sip_server_id: parseInt(draft.sip_server_id) || 0,
        priority: parseInt(draft.priority) || 10,
        kind: String(draft.kind || 'allow').toLowerCase(),
        is_active: !!draft.is_active,
      };
      if (!payload.sip_server_id) {
        addToast('error', 'Pick a SIP server from the dropdown');
        return;
      }
      if (!payload.pattern) {
        addToast('error', 'Pattern is required');
        return;
      }
      if (editing) {
        await api.put(`/asterisk/destinations/${editing.id}`, payload);
      } else {
        await api.post(`/asterisk/servers/${payload.sip_server_id}/destinations`, payload);
      }
      await loadAll();
      closeModal();
    } catch (e: any) {
      addToast('error', 'Save failed: ' + (e?.message || 'unknown'));
    } finally { setLoading(null); }
  };

  const archiveDestination = async (d: Destination) => {
    if (!confirm(`Archive destination rule #${d.id} (${d.kind}: /${d.pattern}/) ? Existing rows preserved.`)) return;
    try {
      await api.delete(`/asterisk/destinations/${d.id}`);
      await loadAll();
    } catch (e: any) {
      addToast('error', 'Archive failed: ' + e.message);
    }
  };

  const testPattern_ = async () => {
    if (!testPattern) { addToast('error', 'Enter a regex pattern to test'); return; }
    setTesting(true);
    try {
      const sample = testSamples.split(/\n|,/).map((s) => s.trim()).filter(Boolean);
      const r = await api.post('/asterisk/destinations/test', { pattern: testPattern, sample });
      setTestResult(r);
    } catch (e: any) {
      setTestResult({ success: false, error: e.message });
    } finally { setTesting(false); }
  };

  const previewRouting = async () => {
    if (!previewDest) return;
    try {
      const r = await api.get(`/asterisk/destinations/preview?destination=${encodeURIComponent(previewDest)}`);
      setPreviewResult(r);
    } catch (e: any) {
      setPreviewResult({ success: false, error: e.message });
    }
  };

  const serverName = (id: number) => servers.find((s) => s.id === id)?.name || `server #${id}`;

  if (loading === 'init') {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-800">SIP Server Destinations</h1>
        <Card><div className="text-center py-12"><Loader className="animate-spin inline-block mr-2" />Loading…</div></Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">SIP Server Destinations</h1>
          <p className="text-gray-500 mt-1">
            Match destination numbers to a specific Asterisk host. Voice-OTP only — SMS traffic still uses <code>route_maps</code>. Empty list = all traffic falls through to priority-based <code>pickServer</code>.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" icon={<RefreshCw size={14} />} onClick={loadAll} loading={loading === 'refresh'}>Refresh</Button>
          <Button icon={<Plus size={14} />} onClick={openAdd} disabled={servers.length === 0}>Add rule</Button>
        </div>
      </div>

      {servers.length === 0 && (
        <Card>
          <div className="flex items-center gap-3 text-sm text-yellow-700 bg-yellow-50 rounded p-3">
            <AlertTriangle size={16} /> No active SIP servers. Add a row in <strong>System → Asterisk / SIP</strong> first.
          </div>
        </Card>
      )}

      {/* Routing preview */}
      <Card title="Routing preview" subtitle="What would the poller pick for this destination right now?">
        <div className="flex items-center gap-2">
          <Input label="Destination (E.164)" value={previewDest} onChange={(e) => setPreviewDest(e.target.value)} placeholder="+15551234567" />
          <Button onClick={previewRouting} icon={<Search size={14} />}>Preview</Button>
        </div>
        {previewResult && (
          <div className="mt-3 text-sm bg-blue-50 border border-blue-200 rounded p-3">
            {previewResult.server ? (
              <span>
                normalized=<code>{previewResult.normalized}</code> → <strong>{previewResult.server.name}</strong> ({previewResult.server.ami_host}:{previewResult.server.ami_port}, priority {previewResult.server.priority})
              </span>
            ) : (
              <span className="text-rose-700">No rule matched → would fall through to <code>pickServer('priority')</code>.</span>
            )}
          </div>
        )}
      </Card>

      {/* Pattern tester */}
      <Card title="Regex tester" subtitle="Validate a free-form regex against sample E.164 numbers before saving. Heuristic flags patterns that may have catastrophic backtracking.">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Input label="Pattern" value={testPattern} onChange={(e) => setTestPattern(e.target.value)} placeholder="e.g. ^\\+1[2-9]\\d{9}$ or ^\\+(44|91)" />
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Sample E.164 (one per line)</label>
            <textarea
              value={testSamples}
              onChange={(e) => setTestSamples(e.target.value)}
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded text-sm font-mono"
              placeholder={'+15551234567\n+447911123456\n+919876543210'}
            />
          </div>
        </div>
        <div className="flex gap-2 mt-2">
          <Button onClick={testPattern_} icon={<Zap size={14} />} loading={testing}>Compile + test</Button>
        </div>
        {testResult && (
          <div className="mt-3">
            {testResult.regex && testResult.regex.compiles ? (
              <div className={`text-xs px-3 py-2 rounded ${testResult.regex.risk_heuristic ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>
                <strong>Compiles OK.</strong>
                {testResult.regex.risk_heuristic && <span> ⚠ heuristic suggests catastrophic backtracking risk — simplify the pattern.</span>}
              </div>
            ) : (
              <div className="text-xs bg-rose-50 text-rose-700 px-3 py-2 rounded">
                <strong>Compile FAILED.</strong> {testResult.regex?.error || testResult.error}
              </div>
            )}
            {testResult.matches && testResult.matches.length > 0 && (
              <table className="w-full text-xs mt-2">
                <thead><tr className="text-gray-500 uppercase"><th className="text-left py-1">Sample</th><th className="text-left py-1">Normalized</th><th className="text-left py-1">Match</th></tr></thead>
                <tbody>
                  {testResult.matches.map((m: any, i: number) => (
                    <tr key={i} className="border-t">
                      <td className="py-1 font-mono">{m.sample}</td>
                      <td className="py-1 font-mono">{m.normalized}</td>
                      <td className="py-1">{m.matched ? <Badge variant="success" dot>match</Badge> : <Badge variant="default">no</Badge>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </Card>

      {/* Rules table */}
      <Card title="Active rules" subtitle="Lower priority number wins on conflicting allow matches. Deny skips that server and falls to priority.">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-xs uppercase">
              <tr>
                <th className="px-3 py-2 text-left">Priority</th>
                <th className="px-3 py-2 text-left">Kind</th>
                <th className="px-3 py-2 text-left">Pattern</th>
                <th className="px-3 py-2 text-left">Server</th>
                <th className="px-3 py-2 text-left">Active</th>
                <th className="px-3 py-2 text-left">Notes</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {destinations.map((d) => (
                <tr key={d.id} className="border-t hover:bg-gray-50">
                  <td className="px-3 py-2">{d.priority}</td>
                  <td className="px-3 py-2">
                    {d.kind === 'allow' ? <Badge variant="success" dot>allow</Badge> : <Badge variant="danger" dot>deny</Badge>}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">/{d.pattern}/</td>
                  <td className="px-3 py-2">
                    <span className="font-medium">{d.sip_server_name || serverName(d.sip_server_id)}</span>
                    {d.sip_server_ami_host && <span className="text-gray-400 ml-1 text-xs">{d.sip_server_ami_host}:{d.sip_server_ami_port}</span>}
                  </td>
                  <td className="px-3 py-2">
                    {d.is_active ? <CheckCircle size={14} className="text-emerald-500 inline" /> : <XCircle size={14} className="text-gray-400 inline" />}
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-500 max-w-xs truncate" title={d.notes || ''}>{d.notes}</td>
                  <td className="px-3 py-2 text-right">
                    <button onClick={() => openEdit(d)} className="text-gray-600 hover:underline mr-3"><Edit3 size={12} className="inline" /> Edit</button>
                    {d.is_active && (
                      <button onClick={() => archiveDestination(d)} className="text-rose-600 hover:underline"><Trash2 size={12} className="inline" /> Archive</button>
                    )}
                  </td>
                </tr>
              ))}
              {destinations.length === 0 && (
                <tr><td colSpan={7} className="px-3 py-8 text-center text-gray-400">
                  <GitBranch size={16} className="inline mr-2" />
                  No destination rules — calls fall back to <code>pickServer('priority')</code> on whichever healthy Asterisk host comes first.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Add / Edit modal */}
      {showAdd && (
        <Modal isOpen={showAdd} onClose={closeModal} title={editing ? `Edit destination rule #${editing.id}` : 'Add destination rule'}>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">SIP Server</label>
              <select
                value={draft.sip_server_id || ''}
                onChange={(e) => setDraft({ ...draft, sip_server_id: e.target.value ? parseInt(e.target.value, 10) : 0 })}
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
              >
                <option value="">— select —</option>
                {servers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.ami_host}:{s.ami_port})
                  </option>
                ))}
              </select>
            </div>
            <Input label="Priority (lower = higher)" type="number" value={draft.priority ?? 10} onChange={(e) => setDraft({ ...draft, priority: parseInt(e.target.value) || 10 })} />
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Kind</label>
              <div className="flex gap-2">
                {(['allow', 'deny'] as const).map((k) => (
                  <label key={k} className="flex items-center gap-1 text-sm">
                    <input type="radio" name="kind" value={k} checked={String(draft.kind).toLowerCase() === k} onChange={() => setDraft({ ...draft, kind: k })} />
                    {k}
                  </label>
                ))}
              </div>
            </div>
            <Input label="Pattern (free-form regex)" value={draft.pattern || ''} onChange={(e) => setDraft({ ...draft, pattern: e.target.value })} placeholder="^\+1[2-9]\d{9}$" />
            <Input label="Notes (admin context)" value={draft.notes || ''} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} placeholder="US mobile numbers" />
            <label className="flex items-center gap-2 text-sm mt-2">
              <input type="checkbox" checked={!!draft.is_active} onChange={(e) => setDraft({ ...draft, is_active: e.target.checked })} />
              Active (eligible for matching)
            </label>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="secondary" onClick={closeModal}>Cancel</Button>
            <Button onClick={saveDestination} loading={loading === 'save'}>{editing ? 'Save' : 'Create'}</Button>
          </div>
        </Modal>
      )}
    </div>
  );
};
