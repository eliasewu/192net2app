// ============================================================
// AddClient.test.tsx — vitest unit tests for AddClient form logic
// ============================================================
// Tests the pure validation, code generation, and form mapping
// logic extracted from AddClient.tsx. No DOM rendering required.
//
// Run with: npx vitest run src/pages/Clients/AddClient.test.tsx
// ============================================================

import { describe, it, expect } from 'vitest';

// ------------------------------------------------------------
// Type matching the form data shape in AddClient.tsx
// ------------------------------------------------------------
interface ClientFormData {
  client_code: string;
  company_name: string;
  contact_person: string;
  email: string;
  phone: string;
  address: string;
  country: string;
  smpp_username: string;
  smpp_password: string;
  smpp_ip: string;
  smpp_port: number;
  system_type: string;
  max_tps: number;
  billing_mode: string;
  currency: string;
  balance: number;
  credit_limit: number;
  api_enabled: boolean;
  webhook_url: string;
  force_dlr: boolean;
  force_dlr_timeout_mode: string;
  dlr_timeout: number;
  routing_plan_id: string;
  status: string;
}

// ------------------------------------------------------------
// Default form values (mirrors AddClient.tsx defaultForm)
// ------------------------------------------------------------
function defaultForm(): ClientFormData {
  return {
    client_code: '',
    company_name: '',
    contact_person: '',
    email: '',
    phone: '',
    address: '',
    country: '',
    smpp_username: '',
    smpp_password: '',
    smpp_ip: '',
    smpp_port: 2775,
    system_type: 'SMPP',
    max_tps: 100,
    billing_mode: 'dlr',
    currency: 'EUR',
    balance: 0,
    credit_limit: 0,
    api_enabled: false,
    webhook_url: '',
    force_dlr: true,
    force_dlr_timeout_mode: 'fixed',
    dlr_timeout: 150,
    routing_plan_id: '',
    status: 'active',
  };
}

// ------------------------------------------------------------
// Extracted pure validation function (mirrors AddClient.tsx validate)
// ------------------------------------------------------------
interface ValidationResult {
  errors: Record<string, string>;
  valid: boolean;
}

function validateForm(form: ClientFormData): ValidationResult {
  const newErrors: Record<string, string> = {};
  if (!form.client_code) newErrors.client_code = 'Client code is required';
  if (!form.company_name) newErrors.company_name = 'Company name is required';
  if (!form.contact_person) newErrors.contact_person = 'Contact person is required';
  if (!form.email) {
    newErrors.email = 'Email is required';
  } else if (!/\S+@\S+\.\S+/.test(form.email)) {
    newErrors.email = 'Invalid email format';
  }
  if (!form.smpp_username) newErrors.smpp_username = 'SMPP username is required';
  if (!form.smpp_password) newErrors.smpp_password = 'SMPP password is required';
  return { errors: newErrors, valid: Object.keys(newErrors).length === 0 };
}

// ------------------------------------------------------------
// Extracted pure code generators (mirrors AddClient.tsx)
// ------------------------------------------------------------
const PASSWORD_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%';

function generatePassword(): string {
  let password = '';
  for (let i = 0; i < 12; i++) {
    password += PASSWORD_CHARS.charAt(Math.floor(Math.random() * PASSWORD_CHARS.length));
  }
  return password;
}

function generateClientCode(): string {
  return 'CLT' + String(Math.floor(Math.random() * 9000) + 1000);
}

// ------------------------------------------------------------
// Extracted field update (updateField logic)
// ------------------------------------------------------------
function updateField(
  prev: ClientFormData,
  field: string,
  value: unknown,
  prevErrors: Record<string, string>,
): { form: ClientFormData; errors: Record<string, string> } {
  const form = { ...prev, [field]: value };
  const errors = { ...prevErrors };
  if (errors[field]) {
    delete errors[field];
  }
  return { form, errors };
}

// ------------------------------------------------------------
// Map existing client to form data (mirrors initForm logic)
// ------------------------------------------------------------
function mapExistingToForm(existing: Partial<ClientFormData>): ClientFormData {
  const def = defaultForm();
  if (!existing) return def;
  // Map all fields, using defaults when a field is absent
  return {
    client_code: existing.client_code ?? def.client_code,
    company_name: existing.company_name ?? def.company_name,
    contact_person: existing.contact_person ?? def.contact_person,
    email: existing.email ?? def.email,
    phone: existing.phone ?? def.phone,
    address: existing.address ?? def.address,
    country: existing.country ?? def.country,
    smpp_username: existing.smpp_username ?? def.smpp_username,
    smpp_password: existing.smpp_password ?? def.smpp_password,
    smpp_ip: existing.smpp_ip ?? def.smpp_ip,
    smpp_port: existing.smpp_port ?? def.smpp_port,
    system_type: existing.system_type ?? def.system_type,
    max_tps: existing.max_tps ?? def.max_tps,
    billing_mode: existing.billing_mode ?? def.billing_mode,
    currency: existing.currency ?? def.currency,
    balance: existing.balance ?? def.balance,
    credit_limit: existing.credit_limit ?? def.credit_limit,
    api_enabled: existing.api_enabled ?? def.api_enabled,
    webhook_url: existing.webhook_url ?? def.webhook_url,
    force_dlr: existing.force_dlr ?? def.force_dlr,
    force_dlr_timeout_mode: existing.force_dlr_timeout_mode ?? 'fixed',
    dlr_timeout: existing.dlr_timeout ?? 150,
    routing_plan_id: existing.routing_plan_id ?? '',
    status: existing.status ?? 'active',
  };
}

// ============================================================
// Default form tests
// ============================================================
describe('AddClient — defaultForm', () => {
  it('initializes all required fields as empty strings', () => {
    const df = defaultForm();
    expect(df.client_code).toBe('');
    expect(df.company_name).toBe('');
    expect(df.contact_person).toBe('');
    expect(df.email).toBe('');
    expect(df.smpp_username).toBe('');
    expect(df.smpp_password).toBe('');
  });

  it('sets default smpp_port to 2775', () => {
    expect(defaultForm().smpp_port).toBe(2775);
  });

  it('sets default max_tps to 100', () => {
    expect(defaultForm().max_tps).toBe(100);
  });

  it('sets default billing_mode to dlr', () => {
    expect(defaultForm().billing_mode).toBe('dlr');
  });

  it('sets default currency to EUR', () => {
    expect(defaultForm().currency).toBe('EUR');
  });

  it('sets default status to active', () => {
    expect(defaultForm().status).toBe('active');
  });

  it('sets force_dlr to true by default', () => {
    expect(defaultForm().force_dlr).toBe(true);
  });

  it('sets force_dlr_timeout_mode to fixed', () => {
    expect(defaultForm().force_dlr_timeout_mode).toBe('fixed');
  });

  it('sets dlr_timeout to 150', () => {
    expect(defaultForm().dlr_timeout).toBe(150);
  });

  it('initializes optional fields as empty', () => {
    const df = defaultForm();
    expect(df.phone).toBe('');
    expect(df.address).toBe('');
    expect(df.country).toBe('');
    expect(df.smpp_ip).toBe('');
    expect(df.webhook_url).toBe('');
    expect(df.routing_plan_id).toBe('');
  });

  it('initializes balance and credit_limit to zero', () => {
    const df = defaultForm();
    expect(df.balance).toBe(0);
    expect(df.credit_limit).toBe(0);
  });

  it('initializes api_enabled to false', () => {
    expect(defaultForm().api_enabled).toBe(false);
  });
});

// ============================================================
// Validation tests
// ============================================================
describe('AddClient — validateForm', () => {
  it('returns valid=true when all required fields are filled', () => {
    const form = { ...defaultForm(), client_code: 'CLT001', company_name: 'Acme', contact_person: 'John', email: 'john@acme.com', smpp_username: 'acme_smpp', smpp_password: 'p4ssw0rd123!' };
    const result = validateForm(form);
    expect(result.valid).toBe(true);
    expect(Object.keys(result.errors).length).toBe(0);
  });

  it('fails when client_code is empty', () => {
    const form = { ...defaultForm(), company_name: 'A', contact_person: 'B', email: 'a@b.com', smpp_username: 'u', smpp_password: 'p' };
    const result = validateForm(form);
    expect(result.valid).toBe(false);
    expect(result.errors.client_code).toBe('Client code is required');
  });

  it('fails when company_name is empty', () => {
    const form = { ...defaultForm(), client_code: 'CLT001', contact_person: 'B', email: 'a@b.com', smpp_username: 'u', smpp_password: 'p' };
    const result = validateForm(form);
    expect(result.valid).toBe(false);
    expect(result.errors.company_name).toBe('Company name is required');
  });

  it('fails when contact_person is empty', () => {
    const form = { ...defaultForm(), client_code: 'CLT001', company_name: 'A', email: 'a@b.com', smpp_username: 'u', smpp_password: 'p' };
    const result = validateForm(form);
    expect(result.valid).toBe(false);
    expect(result.errors.contact_person).toBe('Contact person is required');
  });

  it('fails when email is empty', () => {
    const form = { ...defaultForm(), client_code: 'CLT001', company_name: 'A', contact_person: 'B', smpp_username: 'u', smpp_password: 'p' };
    const result = validateForm(form);
    expect(result.valid).toBe(false);
    expect(result.errors.email).toBe('Email is required');
  });

  it('fails when email has invalid format (missing @)', () => {
    const form = { ...defaultForm(), client_code: 'CLT001', company_name: 'A', contact_person: 'B', email: 'notanemail', smpp_username: 'u', smpp_password: 'p' };
    const result = validateForm(form);
    expect(result.valid).toBe(false);
    expect(result.errors.email).toBe('Invalid email format');
  });

  it('fails when email has invalid format (missing domain)', () => {
    const form = { ...defaultForm(), client_code: 'CLT001', company_name: 'A', contact_person: 'B', email: 'a@b', smpp_username: 'u', smpp_password: 'p' };
    const result = validateForm(form);
    expect(result.valid).toBe(false);
    expect(result.errors.email).toBe('Invalid email format');
  });

  it('fails when email has invalid format (no TLD dot)', () => {
    const form = { ...defaultForm(), client_code: 'CLT001', company_name: 'A', contact_person: 'B', email: 'a@b.', smpp_username: 'u', smpp_password: 'p' };
    const result = validateForm(form);
    expect(result.valid).toBe(false);
    expect(result.errors.email).toBe('Invalid email format');
  });

  it('accepts valid email formats', () => {
    const validEmails = ['a@b.c', 'john@techcorp.com', 'user+tag@domain.co.uk', 'test_123@sub.example.org'];
    for (const email of validEmails) {
      const form = { ...defaultForm(), client_code: 'CLT', company_name: 'A', contact_person: 'B', email, smpp_username: 'u', smpp_password: 'p' };
      const result = validateForm(form);
      expect(result.valid).toBe(true);
    }
  });

  it('fails when smpp_username is empty', () => {
    const form = { ...defaultForm(), client_code: 'CLT001', company_name: 'A', contact_person: 'B', email: 'a@b.com', smpp_password: 'p' };
    const result = validateForm(form);
    expect(result.valid).toBe(false);
    expect(result.errors.smpp_username).toBe('SMPP username is required');
  });

  it('fails when smpp_password is empty', () => {
    const form = { ...defaultForm(), client_code: 'CLT001', company_name: 'A', contact_person: 'B', email: 'a@b.com', smpp_username: 'u' };
    const result = validateForm(form);
    expect(result.valid).toBe(false);
    expect(result.errors.smpp_password).toBe('SMPP password is required');
  });

  it('returns multiple errors for multiple missing fields', () => {
    const form = defaultForm();
    const result = validateForm(form);
    expect(result.valid).toBe(false);
    expect(result.errors.client_code).toBeTruthy();
    expect(result.errors.company_name).toBeTruthy();
    expect(result.errors.contact_person).toBeTruthy();
    expect(result.errors.email).toBeTruthy();
    expect(result.errors.smpp_username).toBeTruthy();
    expect(result.errors.smpp_password).toBeTruthy();
    expect(Object.keys(result.errors).length).toBe(6);
  });

  it('optional fields (phone, address, country, smpp_ip) do not cause validation errors when empty', () => {
    const form = { ...defaultForm(), client_code: 'CLT', company_name: 'A', contact_person: 'B', email: 'a@b.com', smpp_username: 'u', smpp_password: 'p' };
    const result = validateForm(form);
    expect(result.valid).toBe(true);
  });

  it('routing_plan_id is optional (empty string is valid)', () => {
    const form = { ...defaultForm(), client_code: 'CLT', company_name: 'A', contact_person: 'B', email: 'a@b.com', smpp_username: 'u', smpp_password: 'p', routing_plan_id: '' };
    const result = validateForm(form);
    expect(result.valid).toBe(true);
  });
});

// ============================================================
// Code generation tests
// ============================================================
describe('AddClient — generatePassword', () => {
  it('generates exactly 12 characters', () => {
    for (let i = 0; i < 20; i++) {
      expect(generatePassword().length).toBe(12);
    }
  });

  it('only uses characters from the allowed charset', () => {
    for (let i = 0; i < 50; i++) {
      const pw = generatePassword();
      for (const ch of pw) {
        expect(PASSWORD_CHARS.includes(ch)).toBe(true);
      }
    }
  });

  it('generates different passwords on successive calls (probabilistic)', () => {
    const pws = new Set<string>();
    for (let i = 0; i < 50; i++) {
      pws.add(generatePassword());
    }
    // Extremely unlikely to get 50 identical 12-char passwords from a 68-char alphabet
    expect(pws.size).toBeGreaterThan(1);
  });

  it('includes uppercase, lowercase, digits, and special chars in the charset', () => {
    expect(PASSWORD_CHARS).toMatch(/[A-Z]/);
    expect(PASSWORD_CHARS).toMatch(/[a-z]/);
    expect(PASSWORD_CHARS).toMatch(/[0-9]/);
    expect(PASSWORD_CHARS).toMatch(/[!@#$%]/);
  });
});

describe('AddClient — generateClientCode', () => {
  it('always starts with CLT prefix', () => {
    for (let i = 0; i < 20; i++) {
      expect(generateClientCode().startsWith('CLT')).toBe(true);
    }
  });

  it('is 7 characters long (CLT + 4 digits)', () => {
    for (let i = 0; i < 20; i++) {
      expect(generateClientCode().length).toBe(7);
    }
  });

  it('has digits in the range 1000-9999', () => {
    for (let i = 0; i < 50; i++) {
      const code = generateClientCode();
      const num = parseInt(code.slice(3), 10);
      expect(num).toBeGreaterThanOrEqual(1000);
      expect(num).toBeLessThanOrEqual(9999);
    }
  });

  it('generates different codes on successive calls (probabilistic)', () => {
    const codes = new Set<string>();
    for (let i = 0; i < 50; i++) {
      codes.add(generateClientCode());
    }
    expect(codes.size).toBeGreaterThan(1);
  });
});

// ============================================================
// updateField tests
// ============================================================
describe('AddClient — updateField', () => {
  it('updates the specified field value', () => {
    const { form } = updateField(defaultForm(), 'phone', '+1234567890', {});
    expect(form.phone).toBe('+1234567890');
  });

  it('does not mutate other fields', () => {
    const { form } = updateField(defaultForm(), 'phone', '+1234567890', {});
    expect(form.client_code).toBe('');
    expect(form.company_name).toBe('');
  });

  it('clears the error for the updated field', () => {
    const prevErrors = { email: 'Email is required', client_code: 'Client code is required' };
    const { errors } = updateField(defaultForm(), 'email', 'a@b.com', prevErrors);
    expect(errors.email).toBeUndefined();
    expect(errors.client_code).toBe('Client code is required'); // other errors preserved
  });

  it('does nothing to errors if no error for that field', () => {
    const prevErrors = { client_code: 'Client code is required' };
    const { errors } = updateField(defaultForm(), 'email', 'a@b.com', prevErrors);
    expect(Object.keys(errors)).toEqual(['client_code']);
  });
});

// ============================================================
// mapExistingToForm tests
// ============================================================
describe('AddClient — mapExistingToForm', () => {
  it('returns default form when existing is null or undefined', () => {
    expect(mapExistingToForm(null as unknown as Partial<ClientFormData>)).toEqual(defaultForm());
    expect(mapExistingToForm(undefined as unknown as Partial<ClientFormData>)).toEqual(defaultForm());
  });

  it('maps partial existing data, using defaults for missing fields', () => {
    // client_code missing — should still map the fields that ARE present
    const result = mapExistingToForm({ company_name: 'Acme' });
    expect(result.client_code).toBe('');
    expect(result.company_name).toBe('Acme');
  });

  it('maps all known fields from existing client', () => {
    const existing = {
      client_code: 'CLT042', company_name: 'TestCorp', contact_person: 'Alice',
      email: 'alice@test.com', phone: '+999', address: '1 Main St', country: 'Canada',
      smpp_username: 'test_smpp', smpp_password: 'secret', smpp_ip: '10.0.0.5',
      smpp_port: 3000, system_type: 'HTTP', max_tps: 200,
      billing_mode: 'submit', currency: 'USD', balance: 500, credit_limit: 2000,
      api_enabled: true, webhook_url: 'https://hook.example.com', force_dlr: false,
      force_dlr_timeout_mode: 'random_0_5', dlr_timeout: 60,
      routing_plan_id: '3', status: 'suspended',
    };
    const result = mapExistingToForm(existing);
    expect(result.client_code).toBe('CLT042');
    expect(result.company_name).toBe('TestCorp');
    expect(result.contact_person).toBe('Alice');
    expect(result.email).toBe('alice@test.com');
    expect(result.phone).toBe('+999');
    expect(result.address).toBe('1 Main St');
    expect(result.country).toBe('Canada');
    expect(result.smpp_username).toBe('test_smpp');
    expect(result.smpp_password).toBe('secret');
    expect(result.smpp_ip).toBe('10.0.0.5');
    expect(result.smpp_port).toBe(3000);
    expect(result.system_type).toBe('HTTP');
    expect(result.max_tps).toBe(200);
    expect(result.billing_mode).toBe('submit');
    expect(result.currency).toBe('USD');
    expect(result.balance).toBe(500);
    expect(result.credit_limit).toBe(2000);
    expect(result.api_enabled).toBe(true);
    expect(result.webhook_url).toBe('https://hook.example.com');
    expect(result.force_dlr).toBe(false);
    expect(result.force_dlr_timeout_mode).toBe('random_0_5');
    expect(result.dlr_timeout).toBe(60);
    expect(result.routing_plan_id).toBe('3');
    expect(result.status).toBe('suspended');
  });

  it('uses defaults for fields missing from existing client', () => {
    const existing = {
      client_code: 'CLT001', company_name: 'Minimal', contact_person: 'X',
      email: 'x@y.com', smpp_username: 'u', smpp_password: 'p',
    };
    const result = mapExistingToForm(existing);
    // Required fields come from existing
    expect(result.client_code).toBe('CLT001');
    // Optional fields fall back to defaults
    expect(result.phone).toBe('');
    expect(result.country).toBe('');
    expect(result.smpp_ip).toBe('');
    expect(result.webhook_url).toBe('');
    expect(result.smpp_port).toBe(2775);
    expect(result.max_tps).toBe(100);
    expect(result.balance).toBe(0);
  });

  it('handles zero values correctly (not replaced by defaults)', () => {
    const existing = {
      client_code: 'CLT', company_name: 'A', contact_person: 'B',
      email: 'a@b.com', smpp_username: 'u', smpp_password: 'p',
      balance: 0, credit_limit: 0, max_tps: 0,
    };
    const result = mapExistingToForm(existing);
    expect(result.balance).toBe(0);
    expect(result.credit_limit).toBe(0);
    expect(result.max_tps).toBe(0);
  });

  it('handles false booleans correctly (not replaced by defaults)', () => {
    const existing = {
      client_code: 'CLT', company_name: 'A', contact_person: 'B',
      email: 'a@b.com', smpp_username: 'u', smpp_password: 'p',
      api_enabled: false, force_dlr: false,
    };
    const result = mapExistingToForm(existing);
    expect(result.api_enabled).toBe(false);
    expect(result.force_dlr).toBe(false);
  });
});
