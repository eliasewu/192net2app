import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Save, RefreshCw, CheckCircle, XCircle, Mail, AlertTriangle, ArrowLeft } from 'lucide-react';
import { useData } from '../../store/DataContext';
import { Card } from '../../components/UI/Card';
import { Button } from '../../components/UI/Button';
import { Input, Select } from '../../components/UI/Input';
import { SMTPConfig } from '../../types';
import { api } from '../../services/api';

export const SmtpConfig: React.FC = () => {
  const { smtpConfig, updateSMTPConfig } = useData();
  const [smtp, setSMTP] = useState<SMTPConfig>(smtpConfig || {
    host: '',
    port: 587,
    encryption: 'tls',
    username: '',
    password: '',
    from_email: '',
    from_name: '',
  });
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; details?: any } | null>(null);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateSMTPConfig(smtp);
      setTestResult({ success: true, message: 'SMTP configuration saved successfully.' });
    } catch (e: any) {
      setTestResult({ success: false, message: 'Failed to save: ' + (e.message || 'Unknown error') });
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      // Save current config first so the test runs against the latest settings
      await updateSMTPConfig(smtp);
      const result = await api.post('/smtp/test', {});
      setTestResult({
        success: result.success,
        message: result.message || (result.success ? 'SMTP connection successful' : 'SMTP test failed'),
        details: result.details,
      });
    } catch (e: any) {
      setTestResult({ success: false, message: 'Test failed: ' + (e.message || 'Connection error') });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to="/suppliers/email" className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors" title="Back to Email Suppliers">
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-800">SMTP Configuration</h1>
            <p className="text-gray-500 mt-1">Configure outgoing email server settings</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" icon={<RefreshCw size={16} />} onClick={handleTest} loading={testing}>
            Test Connection
          </Button>
          <Button icon={<Save size={16} />} onClick={handleSave} loading={saving}>
            Save Configuration
          </Button>
        </div>
      </div>

      {/* Test Result */}
      {testResult && (
        <div className={`p-4 rounded-lg border ${
          testResult.success
            ? 'bg-green-50 border-green-200'
            : 'bg-red-50 border-red-200'
        }`}>
          <div className="flex items-start gap-3">
            {testResult.success ? (
              <CheckCircle size={20} className="text-green-500 mt-0.5" />
            ) : (
              <XCircle size={20} className="text-red-500 mt-0.5" />
            )}
            <div>
              <p className={`font-medium text-sm ${testResult.success ? 'text-green-800' : 'text-red-800'}`}>
                {testResult.message}
              </p>
              {testResult.details && (
                <div className="mt-2 text-xs text-gray-600 space-y-1">
                  <p>Host: {testResult.details.host}</p>
                  <p>Port: {testResult.details.port}</p>
                  <p>Encryption: {testResult.details.encryption}</p>
                  <p>Username: {testResult.details.username}</p>
                  <p>From: {testResult.details.from_email}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* SMTP Server Settings */}
        <Card title="SMTP Server">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="SMTP Host"
                value={smtp.host || ''}
                onChange={e => setSMTP(p => ({ ...p, host: e.target.value }))}
                placeholder="smtp.gmail.com"
              />
              <Input
                label="Port"
                type="number"
                value={smtp.port || 587}
                onChange={e => setSMTP(p => ({ ...p, port: parseInt(e.target.value) || 587 }))}
              />
            </div>

            <Select
              label="Encryption"
              value={smtp.encryption || 'tls'}
              onChange={e => setSMTP(p => ({ ...p, encryption: e.target.value as 'tls' | 'ssl' | 'none' }))}
              options={[
                { value: 'tls', label: 'TLS (STARTTLS) - Port 587' },
                { value: 'ssl', label: 'SSL (Implicit) - Port 465' },
                { value: 'none', label: 'None - Port 25' },
              ]}
            />

            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Username"
                value={smtp.username || ''}
                onChange={e => setSMTP(p => ({ ...p, username: e.target.value }))}
                placeholder="user@gmail.com"
              />
              <Input
                label="Password"
                type="password"
                value={smtp.password || ''}
                onChange={e => setSMTP(p => ({ ...p, password: e.target.value }))}
                placeholder="App password or SMTP password"
              />
            </div>
          </div>
        </Card>

        {/* Sender Settings */}
        <Card title="Sender Identity">
          <div className="space-y-4">
            <Input
              label="From Email Address"
              value={smtp.from_email || ''}
              onChange={e => setSMTP(p => ({ ...p, from_email: e.target.value }))}
              placeholder="noreply@net2app.com"
            />
            <Input
              label="From Display Name"
              value={smtp.from_name || ''}
              onChange={e => setSMTP(p => ({ ...p, from_name: e.target.value }))}
              placeholder="NET2APP Hub"
            />

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-4">
              <div className="flex items-start gap-3">
                <AlertTriangle size={18} className="text-blue-500 mt-0.5" />
                <div className="text-sm text-blue-700">
                  <p className="font-medium mb-1">Email Provider Tips</p>
                  <ul className="list-disc ml-4 space-y-1 text-xs">
                    <li><strong>Gmail:</strong> Use port 587 (TLS) with an App Password (not your regular password).</li>
                    <li><strong>Outlook/Office365:</strong> smtp.office365.com, port 587, TLS.</li>
                    <li><strong>AWS SES:</strong> Use port 587 (TLS) or 465 (SSL) with your SMTP credentials.</li>
                    <li><strong>SendGrid:</strong> smtp.sendgrid.net, port 587, username "apikey", password is your API key.</li>
                    <li><strong>Mailgun:</strong> smtp.mailgun.org, port 587, TLS.</li>
                    <li><strong>Custom SMTP:</strong> Use your provider's host, port, and credentials.</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Common Presets */}
      <Card title="Quick Presets — SMTP Relay Providers">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { name: 'Gmail', host: 'smtp.gmail.com', port: 587, enc: 'tls' as const },
            { name: 'Outlook / 365', host: 'smtp.office365.com', port: 587, enc: 'tls' as const },
            { name: 'SendGrid', host: 'smtp.sendgrid.net', port: 587, enc: 'tls' as const },
            { name: 'Mailgun', host: 'smtp.mailgun.org', port: 587, enc: 'tls' as const },
            { name: 'Mailchimp (Mandrill)', host: 'smtp.mandrillapp.com', port: 587, enc: 'tls' as const },
            { name: 'Brevo (Sendinblue)', host: 'smtp-relay.brevo.com', port: 587, enc: 'tls' as const },
            { name: 'Moosend', host: 'smtp.moosend.com', port: 587, enc: 'tls' as const },
          ].map(preset => (
            <button
              key={preset.name}
              onClick={() => setSMTP(p => ({
                ...p,
                host: preset.host,
                port: preset.port,
                encryption: preset.enc,
              }))}
              className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:border-blue-500 hover:bg-blue-50 transition-colors text-left"
            >
              <Mail size={20} className="text-blue-500" />
              <div>
                <p className="text-sm font-medium text-gray-700">{preset.name}</p>
                <p className="text-xs text-gray-500">{preset.host}:{preset.port}</p>
              </div>
            </button>
          ))}
        </div>
      </Card>

      {/* Compatible Transactional Relays */}
      <Card title="Compatible Transactional Relays">
        <p className="text-sm text-gray-500 mb-4">These marketing platforms offer transactional email via dedicated SMTP relay services.</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { name: 'MailerLite', host: 'smtp.mailersend.com', port: 587, enc: 'tls' as const, note: 'via MailerSend' },
            { name: 'ActiveCampaign', host: 'smtp.postmarkapp.com', port: 587, enc: 'tls' as const, note: 'via Postmark' },
          ].map(preset => (
            <button
              key={preset.name}
              onClick={() => setSMTP(p => ({
                ...p,
                host: preset.host,
                port: preset.port,
                encryption: preset.enc,
              }))}
              className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:border-blue-500 hover:bg-blue-50 transition-colors text-left"
            >
              <Mail size={20} className="text-orange-400" />
              <div>
                <p className="text-sm font-medium text-gray-700">{preset.name}</p>
                <p className="text-xs text-gray-500">{preset.host}:{preset.port} — {preset.note}</p>
              </div>
            </button>
          ))}
        </div>
      </Card>

      {/* API-Only Platforms */}
      <Card title="API-Only Platforms (no SMTP relay)">
        <p className="text-sm text-gray-500 mb-4">These services don't offer SMTP relay. Configure them via their REST APIs or dedicated add-ons.</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { name: 'Constant Contact', note: 'Marketing API only' },
            { name: 'GetResponse', note: 'E-commerce plugin' },
            { name: 'AWeber', note: 'Newsletter API only' },
            { name: 'ConvertKit (Kit)', note: 'Creator API only' },
            { name: 'HubSpot', note: 'CRM API only' },
          ].map(p => (
            <div key={p.name} className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 bg-gray-50 text-left">
              <Mail size={20} className="text-gray-300" />
              <div>
                <p className="text-sm font-medium text-gray-500">{p.name}</p>
                <p className="text-xs text-gray-400">{p.note}</p>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
};
