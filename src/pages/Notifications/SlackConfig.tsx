import React, { useState, useEffect, useCallback } from 'react';
import { Hash, Send, RefreshCw, CheckCircle, XCircle, AlertTriangle, ToggleLeft, ToggleRight, ExternalLink, Zap } from 'lucide-react';
import { Card } from '../../components/UI/Card';
import { Button } from '../../components/UI/Button';
import { Badge } from '../../components/UI/Badge';
import { Input } from '../../components/UI/Input';
import { api } from '../../services/api';
import { useToast } from '../../components/UI/Toast';

interface SlackConfig {
  enabled: boolean;
  webhookUrl: string;
  events: Record<string, boolean>;
}

const EVENT_LABELS: Record<string, { label: string; description: string }> = {
  dlr_failure: { label: 'DLR Failure Alerts', description: 'Notify when SMS delivery reports show consecutive failures' },
  low_balance: { label: 'Low Balance Alerts', description: 'Notify when client balance drops below threshold' },
  rate_change: { label: 'Rate Change Notices', description: 'Notify when client or supplier rates are updated' },
  new_client: { label: 'New Client Created', description: 'Notify when a new client account is registered' },
  supplier_disconnect: { label: 'Supplier Disconnect', description: 'Notify when a supplier SMPP connection goes down' },
  invoice_generated: { label: 'Invoice Generated', description: 'Notify when a new invoice is created' },
  payment_received: { label: 'Payment Received', description: 'Notify when a client or supplier payment is recorded' },
};

export const SlackConfig: React.FC = () => {
  const { addToast } = useToast();
  const [config, setConfig] = useState<SlackConfig>({ enabled: false, webhookUrl: '', events: {} });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [testMessage, setTestMessage] = useState('');
  const [sending, setSending] = useState(false);

  const loadConfig = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get('/slack/config');
      if (r?.success && r.data) setConfig(r.data);
    } catch (e: any) {
      console.error('[SlackConfig] load failed:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadConfig(); }, [loadConfig]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put('/slack/config', {
        webhook_url: config.webhookUrl,
        enabled: config.enabled,
        events: config.events,
      });
      addToast('success', 'Slack configuration saved!');
    } catch (e: any) {
      addToast('error', 'Failed to save: ' + (e?.message || 'Unknown error'));
    } finally {
      setSaving(false);
    }
  };

  const handleTestWebhook = async () => {
    if (!config.webhookUrl) {
      addToast('error', 'Please enter a webhook URL first');
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const r = await api.post('/slack/test', { webhook_url: config.webhookUrl });
      setTestResult(r || { success: false, message: 'No response' });
      if (r?.success) addToast('success', 'Test message sent successfully!');
      else addToast('error', 'Test failed: ' + (r?.message || 'Unknown error'));
    } catch (e: any) {
      setTestResult({ success: false, message: e?.message || 'Network error' });
      addToast('error', 'Test failed: ' + (e?.message || 'Network error'));
    } finally {
      setTesting(false);
    }
  };

  const handleSendTestMessage = async () => {
    if (!testMessage.trim()) {
      addToast('error', 'Enter a message to send');
      return;
    }
    setSending(true);
    try {
      const r = await api.post('/slack/send', { text: testMessage });
      if (r?.success) {
        addToast('success', 'Message sent to Slack!');
        setTestMessage('');
      } else {
        addToast('error', 'Failed to send: ' + (r?.message || 'Unknown error'));
      }
    } catch (e: any) {
      addToast('error', 'Failed to send: ' + (e?.message || 'Network error'));
    } finally {
      setSending(false);
    }
  };

  const toggleEvent = (key: string) => {
    setConfig(prev => ({
      ...prev,
      events: { ...prev.events, [key]: !prev.events[key] },
    }));
  };

  const toggleAllEvents = (enabled: boolean) => {
    const events: Record<string, boolean> = {};
    for (const key of Object.keys(EVENT_LABELS)) events[key] = enabled;
    setConfig(prev => ({ ...prev, events }));
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-800">Slack Integration</h1>
        <Card><div className="text-center py-12 text-gray-400"><RefreshCw size={24} className="mx-auto mb-2 animate-spin" />Loading...</div></Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <Hash size={24} className="text-purple-600" />
            Slack Integration
          </h1>
          <p className="text-gray-500 mt-1">Auto-post notifications to Slack channels via Incoming Webhooks</p>
        </div>
        <div className="flex gap-2">
          <Badge variant={config.enabled ? 'success' : 'default'} dot>{config.enabled ? 'Enabled' : 'Disabled'}</Badge>
        </div>
      </div>

      {/* Setup Guide */}
      <Card title="Setup Guide" subtitle="How to configure Slack webhook">
        <div className="space-y-3 text-sm text-gray-600">
          <div className="flex items-start gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold">1</span>
            <p>Go to <strong>api.slack.com/apps</strong> and create a new app (or use an existing one)</p>
          </div>
          <div className="flex items-start gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold">2</span>
            <p>Navigate to <strong>Incoming Webhooks</strong> → Toggle it ON</p>
          </div>
          <div className="flex items-start gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold">3</span>
            <p>Click <strong>"Add New Webhook to Workspace"</strong> → Select the target channel</p>
          </div>
          <div className="flex items-start gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold">4</span>
            <p>Copy the <strong>Webhook URL</strong> (starts with <code>https://hooks.slack.com/services/...</code>) and paste it below</p>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mt-3">
            <div className="flex items-start gap-2">
              <AlertTriangle size={16} className="text-blue-600 mt-0.5 flex-shrink-0" />
              <p className="text-blue-700 text-xs">
                <strong>Note:</strong> Free Slack workspaces support Incoming Webhooks. Messages will appear as posted by your app's bot user. You can also use <strong>Slack Workflow Builder</strong> for more advanced routing.
              </p>
            </div>
          </div>
        </div>
      </Card>

      {/* Webhook Configuration */}
      <Card title="Webhook Configuration" subtitle="Configure the Slack webhook connection">
        <div className="space-y-4">
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div>
              <p className="font-medium text-sm text-gray-800">Enable Slack Notifications</p>
              <p className="text-xs text-gray-500">Post automatic notifications to Slack when events occur</p>
            </div>
            <button
              onClick={() => setConfig(prev => ({ ...prev, enabled: !prev.enabled }))}
              className="p-1 rounded-lg transition-colors"
            >
              {config.enabled
                ? <ToggleRight size={32} className="text-green-500" />
                : <ToggleLeft size={32} className="text-gray-400" />
              }
            </button>
          </div>

          <Input
            label="Webhook URL"
            value={config.webhookUrl}
            onChange={(e) => setConfig(prev => ({ ...prev, webhookUrl: e.target.value }))}
            placeholder="https://hooks.slack.com/services/T.../B.../..."
            icon={<ExternalLink size={16} />}
          />

          <div className="flex gap-2">
            <Button onClick={handleTestWebhook} loading={testing} variant="secondary" icon={<Zap size={16} />}>
              Test Webhook
            </Button>
            <Button onClick={handleSave} loading={saving} icon={<CheckCircle size={16} />}>
              Save Configuration
            </Button>
          </div>

          {testResult && (
            <div className={`p-3 rounded-lg border text-sm ${testResult.success ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
              {testResult.success ? <CheckCircle size={16} className="inline mr-2" /> : <XCircle size={16} className="inline mr-2" />}
              {testResult.message}
            </div>
          )}
        </div>
      </Card>

      {/* Event Toggles */}
      <Card title="Notification Events" subtitle="Choose which events trigger Slack notifications">
        <div className="space-y-2">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-gray-500">{Object.values(config.events).filter(Boolean).length} of {Object.keys(EVENT_LABELS).length} events enabled</p>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => toggleAllEvents(true)}>Enable All</Button>
              <Button size="sm" variant="secondary" onClick={() => toggleAllEvents(false)}>Disable All</Button>
            </div>
          </div>
          {Object.entries(EVENT_LABELS).map(([key, { label, description }]) => (
            <div
              key={key}
              className="flex items-center justify-between p-3 rounded-lg border hover:bg-gray-50 transition-colors cursor-pointer"
              onClick={() => toggleEvent(key)}
            >
              <div className="flex-1">
                <p className="font-medium text-sm text-gray-800">{label}</p>
                <p className="text-xs text-gray-500">{description}</p>
              </div>
              <button className="p-1 rounded-lg ml-3">
                {config.events[key]
                  ? <ToggleRight size={28} className="text-green-500" />
                  : <ToggleLeft size={28} className="text-gray-300" />
                }
              </button>
            </div>
          ))}
        </div>
      </Card>

      {/* Send Test Message */}
      <Card title="Send Test Message" subtitle="Post a custom message to Slack for testing">
        <div className="space-y-3">
          <Input
            label="Message"
            value={testMessage}
            onChange={(e) => setTestMessage(e.target.value)}
            placeholder="Type a test message to post to Slack..."
          />
          <Button onClick={handleSendTestMessage} loading={sending} icon={<Send size={16} />}>
            Send to Slack
          </Button>
        </div>
      </Card>
    </div>
  );
};
