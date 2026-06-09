--
-- PostgreSQL database dump
--

\restrict rZ2f7V914rnvWhY5UYL517b06CYQLlFSvE6YuDQjJWyQJfnRCU96I5IEIcQXquQ

-- Dumped from database version 14.23 (Ubuntu 14.23-0ubuntu0.22.04.1)
-- Dumped by pg_dump version 14.23 (Ubuntu 14.23-0ubuntu0.22.04.1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: api_connectors; Type: TABLE DATA; Schema: public; Owner: sms_user
--



--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: sms_user
--

INSERT INTO public.users VALUES (2, 'support', '$2b$10$go8iES96OdPXtctpkUwB8O.YL3K.qYt9bXVc2eLpEKJ94JZBLK.rS', 'support@net2app.com', 'support', '{view_clients,view_suppliers,view_sms_logs,test_sms,manage_bind,view_reports}', NULL, NULL, 'Support Team', true, NULL, '2026-06-09 09:39:09.471572', '2026-06-09 09:51:24.733133');
INSERT INTO public.users VALUES (3, 'billing', '$2b$10$fBqvyfqZV6dZK7axci67HOUM8vuc2rvXcD0qYFNXysz3auDJB3H.y', 'billing@net2app.com', 'billing', '{manage_invoices,manage_payments,view_reports,view_clients,view_suppliers}', NULL, NULL, 'Billing Team', true, NULL, '2026-06-09 09:39:09.471572', '2026-06-09 09:51:24.833456');
INSERT INTO public.users VALUES (4, 'techcorp_user', '$2b$10$Zt.WIqiILxykAjWoVZPKDOgi10wCEzOzQOdPd67xvrEzsFzYoVnhy', 'user@techcorp.com', 'client', '{view_own_cdr,view_own_usage,view_own_payments,test_sms,send_sms}', NULL, NULL, 'TechCorp Client', true, NULL, '2026-06-09 09:39:09.471572', '2026-06-09 09:51:24.93314');
INSERT INTO public.users VALUES (5, 'globalsms_user', '$2b$10$sfB9PCsRuYtfTtIcXyz4oOCy0EIic0fi3f8hiOc0cLwDFL9tIpBWi', 'user@globalsms.com', 'supplier', '{view_own_cdr,view_own_usage,view_own_payments,view_bind_status}', NULL, NULL, 'GlobalSMS Supplier', true, NULL, '2026-06-09 09:39:09.471572', '2026-06-09 09:51:25.03261');
INSERT INTO public.users VALUES (1, 'admin', '$2b$10$Dgn0lX.YsCknRKpubzLPKupqvy43UK96e1osMOJkbXaDhFiQGqpQK', 'admin@net2app.com', 'super_admin', '{all}', NULL, NULL, 'Super Admin', true, '2026-06-09 14:14:55.890154', '2026-06-09 09:39:09.471572', '2026-06-09 14:14:55.890154');


--
-- Data for Name: audit_logs; Type: TABLE DATA; Schema: public; Owner: sms_user
--



--
-- Data for Name: clients; Type: TABLE DATA; Schema: public; Owner: sms_user
--

INSERT INTO public.clients VALUES (1, 'CLT001', 'TechCorp Global', 'John Smith', 'john@techcorp.com', '+1234567890', '123 Tech Street, Silicon Valley', 'USA', 'techcorp_smpp', 'secure123', '0.0.0.0', 2775, 'SMPP', 100, 'dlr', 'EUR', 5000.0000, 10000.0000, false, NULL, false, 150, NULL, NULL, 'active', '2026-06-09 09:39:09.507862', '2026-06-09 09:39:09.507862');
INSERT INTO public.clients VALUES (4, 'TriAngle', 'Triangle', NULL, 'triangle@gmail.com', NULL, NULL, NULL, 'tuesday', 'tuesday', '0.0.0.0', 2775, 'SMPP', 100, 'dlr', 'EUR', 0.0000, 100.0000, false, NULL, false, 150, NULL, NULL, 'active', '2026-06-09 11:27:01.12768', '2026-06-09 11:27:01.12768');


--
-- Data for Name: campaigns; Type: TABLE DATA; Schema: public; Owner: sms_user
--



--
-- Data for Name: campaigns_recipients; Type: TABLE DATA; Schema: public; Owner: sms_user
--



--
-- Data for Name: suppliers; Type: TABLE DATA; Schema: public; Owner: sms_user
--

INSERT INTO public.suppliers VALUES (7, 'SMS Gateway', 'SMS Gateway', NULL, NULL, NULL, 'smpp', '5.78.72.23', 2775, 'testing', 'test123', NULL, NULL, NULL, NULL, 'POST', 0.0000, 0.0000, 'EUR', 'bound', 0, 20, 'active', '2026-06-09 11:29:54.511931', '2026-06-09 14:43:01.961522');


--
-- Data for Name: sms_logs; Type: TABLE DATA; Schema: public; Owner: sms_user
--



--
-- Data for Name: dlr_queue; Type: TABLE DATA; Schema: public; Owner: sms_user
--



--
-- Data for Name: invoices; Type: TABLE DATA; Schema: public; Owner: sms_user
--



--
-- Data for Name: license; Type: TABLE DATA; Schema: public; Owner: sms_user
--



--
-- Data for Name: mccmnc; Type: TABLE DATA; Schema: public; Owner: sms_user
--

INSERT INTO public.mccmnc VALUES (1, 'United States', 'US', '310', '260', 'T-Mobile USA', 'GSM', 'active', '2026-06-09 09:39:09.675165');
INSERT INTO public.mccmnc VALUES (2, 'United States', 'US', '310', '410', 'AT&T Mobility', 'GSM', 'active', '2026-06-09 09:39:09.675165');
INSERT INTO public.mccmnc VALUES (3, 'United States', 'US', '311', '480', 'Verizon Wireless', 'CDMA', 'active', '2026-06-09 09:39:09.675165');
INSERT INTO public.mccmnc VALUES (4, 'United Kingdom', 'GB', '234', '10', 'O2 UK', 'GSM', 'active', '2026-06-09 09:39:09.675165');
INSERT INTO public.mccmnc VALUES (5, 'United Kingdom', 'GB', '234', '15', 'Vodafone UK', 'GSM', 'active', '2026-06-09 09:39:09.675165');
INSERT INTO public.mccmnc VALUES (6, 'Germany', 'DE', '262', '01', 'Telekom Deutschland', 'GSM', 'active', '2026-06-09 09:39:09.675165');
INSERT INTO public.mccmnc VALUES (7, 'France', 'FR', '208', '01', 'Orange France', 'GSM', 'active', '2026-06-09 09:39:09.675165');
INSERT INTO public.mccmnc VALUES (8, 'Spain', 'ES', '214', '01', 'Vodafone Spain', 'GSM', 'active', '2026-06-09 09:39:09.675165');
INSERT INTO public.mccmnc VALUES (9, 'India', 'IN', '404', '10', 'Airtel India', 'GSM', 'active', '2026-06-09 09:39:09.675165');
INSERT INTO public.mccmnc VALUES (10, 'Bangladesh', 'BD', '470', '01', 'Grameenphone', 'GSM', 'active', '2026-06-09 09:39:09.675165');
INSERT INTO public.mccmnc VALUES (11, 'Saudi Arabia', 'SA', '420', '01', 'STC', 'GSM', 'active', '2026-06-09 09:39:09.675165');


--
-- Data for Name: notification_templates; Type: TABLE DATA; Schema: public; Owner: sms_user
--

INSERT INTO public.notification_templates VALUES (1, 'Low Balance Alert', 'Low Balance Alert — {{client_name}} ({{client_code}})', 'Dear {{client_name}},\n\nYour account balance is low. Current balance: €{{balance}}\n\nPlease top up your account to continue service.\n\nNET2APP Hub', '{client_name,client_code,smpp_username,balance}', true, '2026-06-09 09:39:09.947337');
INSERT INTO public.notification_templates VALUES (2, 'Client Account Created', 'Welcome to {{platform_name}} — SMPP Account Created', 'Dear {{client_name}},\n\nWelcome to {{platform_name}}!\n\nClient Code: {{client_code}}SMPP Username: {{smpp_username}}\n\nBest regards,\nNET2APP Hub Team', '{client_name,company_name,client_code,smpp_username,platform_name}', true, '2026-06-09 09:39:09.947337');
INSERT INTO public.notification_templates VALUES (3, 'Supplier Account Created', 'Supplier Account Created — {{supplier_code}}', 'Dear {{contact_person}},\n\nSupplier account created.\n\nSupplier Code: {{supplier_code}}Connection Type: {{connection_type}}\n\nNET2APP Hub', '{contact_person,company_name,supplier_code,connection_type}', true, '2026-06-09 09:39:09.947337');
INSERT INTO public.notification_templates VALUES (4, 'Invoice Generated', 'Invoice {{invoice_number}} — {{client_name}}', 'Dear {{client_name}},\n\nInvoice {{invoice_number}} generated.\n\nPeriod: {{period_start}} to {{period_end}}Total: €{{total_amount}}Due: {{due_date}}\n\nNET2APP Hub', '{client_name,invoice_number,period_start,period_end,total_amount,due_date}', true, '2026-06-09 09:39:09.947337');
INSERT INTO public.notification_templates VALUES (5, 'Payment Received', 'Payment Received — €{{amount}} — {{entity_name}}', 'Dear {{entity_name}},\n\nPayment of €{{amount}} received via {{payment_method}}.\n\nReference: {{reference}}\n\nNET2APP Hub', '{entity_name,payment_number,amount,payment_method}', true, '2026-06-09 09:39:09.947337');
INSERT INTO public.notification_templates VALUES (6, 'Rate Change Notice', 'Rate Update Notice — {{destination}}', 'Dear {{entity_name}},\n\nRate change notification.\n\nDestination: {{destination}}Old Rate: €{{old_rate}} → New Rate: €{{new_rate}}Effective: {{effective_date}}\n\nNET2APP Hub', '{entity_name,entity_code,smpp_username,destination,old_rate,new_rate,effective_date}', true, '2026-06-09 09:39:09.947337');
INSERT INTO public.notification_templates VALUES (7, 'Channel Disconnect', '⚠ Channel Disconnected — {{entity_code}}', 'Alert! Channel disconnected.\n\nEntity: {{entity_name}} ({{entity_code}})Type: {{entity_type}}Failures: {{failure_count}}\n\nNET2APP Hub System', '{entity_code,entity_name,entity_type,smpp_username,failure_count}', true, '2026-06-09 09:39:09.947337');
INSERT INTO public.notification_templates VALUES (8, 'Payment Reminder', 'Payment Reminder — Invoice {{invoice_number}}', 'Dear {{client_name}},\n\nPayment reminder for invoice {{invoice_number}}.\n\nAmount Due: €{{amount_due}}Due Date: {{due_date}}\n\nPlease pay promptly.\n\nNET2APP Hub', '{client_name,invoice_number,amount_due,due_date}', true, '2026-06-09 09:39:09.947337');
INSERT INTO public.notification_templates VALUES (9, 'DLR Failure Alert', '⚠ DLR Failure Alert — {{route_name}}', 'Alert! High DLR failure rate detected.\n\nRoute: {{route_name}}Supplier: {{supplier_name}}Failures: {{failure_count}} in 20 consecutiveAction: Route auto-blocked\n\nNET2APP Hub System', '{route_name,supplier_name,failure_count,action_taken}', true, '2026-06-09 09:39:09.947337');


--
-- Data for Name: notifications; Type: TABLE DATA; Schema: public; Owner: sms_user
--



--
-- Data for Name: ott_devices; Type: TABLE DATA; Schema: public; Owner: sms_user
--



--
-- Data for Name: payments; Type: TABLE DATA; Schema: public; Owner: sms_user
--



--
-- Data for Name: platform_settings; Type: TABLE DATA; Schema: public; Owner: sms_user
--

INSERT INTO public.platform_settings VALUES (1, 'platform_name', 'NET2APP Hub', '2026-06-09 09:39:10.025429');
INSERT INTO public.platform_settings VALUES (2, 'support_email', 'support@net2app.com', '2026-06-09 09:39:10.025429');
INSERT INTO public.platform_settings VALUES (3, 'company_name', 'NET2APP Technologies', '2026-06-09 09:39:10.025429');
INSERT INTO public.platform_settings VALUES (4, 'company_address', '123 Tech Park, Innovation City', '2026-06-09 09:39:10.025429');
INSERT INTO public.platform_settings VALUES (5, 'company_phone', '+1-800-SMS-HUB', '2026-06-09 09:39:10.025429');
INSERT INTO public.platform_settings VALUES (6, 'company_email', 'info@net2app.com', '2026-06-09 09:39:10.025429');
INSERT INTO public.platform_settings VALUES (7, 'company_vat', 'VAT-2024-001', '2026-06-09 09:39:10.025429');
INSERT INTO public.platform_settings VALUES (8, 'currency', 'EUR', '2026-06-09 09:39:10.025429');
INSERT INTO public.platform_settings VALUES (9, 'invoice_prefix', 'INV-2024-', '2026-06-09 09:39:10.025429');
INSERT INTO public.platform_settings VALUES (10, 'payment_prefix', 'PAY-2024-', '2026-06-09 09:39:10.025429');
INSERT INTO public.platform_settings VALUES (11, 'default_tax_rate', '19.00', '2026-06-09 09:39:10.025429');
INSERT INTO public.platform_settings VALUES (12, 'force_dlr_default', 'true', '2026-06-09 09:39:10.025429');
INSERT INTO public.platform_settings VALUES (13, 'dlr_timeout_default', '150', '2026-06-09 09:39:10.025429');
INSERT INTO public.platform_settings VALUES (14, 'auto_block_failures', '20', '2026-06-09 09:39:10.025429');
INSERT INTO public.platform_settings VALUES (15, 'max_retry_attempts', '4', '2026-06-09 09:39:10.025429');
INSERT INTO public.platform_settings VALUES (16, 'voice_otp_retry_interval', '30', '2026-06-09 09:39:10.025429');
INSERT INTO public.platform_settings VALUES (17, 'voice_otp_max_retries', '4', '2026-06-09 09:39:10.025429');


--
-- Data for Name: rates; Type: TABLE DATA; Schema: public; Owner: sms_user
--

INSERT INTO public.rates VALUES (1, 'client', 1, '310', '*', 'United States', 'All', 0.025000, 'EUR', '2024-01-01', NULL, true, 2, '2026-06-09 09:39:09.666944');
INSERT INTO public.rates VALUES (2, 'client', 1, '310', '*', 'United States', 'All', 0.020000, 'EUR', '2023-06-01', NULL, false, 1, '2026-06-09 09:39:09.666944');
INSERT INTO public.rates VALUES (3, 'client', 1, '234', '*', 'United Kingdom', 'All', 0.022000, 'EUR', '2024-01-01', NULL, true, 1, '2026-06-09 09:39:09.666944');


--
-- Data for Name: routes; Type: TABLE DATA; Schema: public; Owner: sms_user
--

INSERT INTO public.routes VALUES (1, 'Premium OTP Route', '{2,1}', 'priority', true, '2026-06-09 09:39:09.602783');
INSERT INTO public.routes VALUES (2, 'Marketing Blend', '{1,3}', 'percentage', true, '2026-06-09 09:39:09.602783');
INSERT INTO public.routes VALUES (3, 'OTT Messaging', '{4}', 'lcr', true, '2026-06-09 09:39:09.602783');
INSERT INTO public.routes VALUES (4, 'Voice OTP Fallback', '{5}', 'priority', true, '2026-06-09 09:39:09.602783');


--
-- Data for Name: route_maps; Type: TABLE DATA; Schema: public; Owner: sms_user
--



--
-- Data for Name: route_plans; Type: TABLE DATA; Schema: public; Owner: sms_user
--

INSERT INTO public.route_plans VALUES (1, 'Premium Plan', '{1,3,4}', true, '2026-06-09 09:39:09.629467');
INSERT INTO public.route_plans VALUES (2, 'Marketing Plan', '{2}', false, '2026-06-09 09:39:09.629467');


--
-- Data for Name: smtp_config; Type: TABLE DATA; Schema: public; Owner: sms_user
--



--
-- Data for Name: tenants; Type: TABLE DATA; Schema: public; Owner: sms_user
--



--
-- Data for Name: translations; Type: TABLE DATA; Schema: public; Owner: sms_user
--



--
-- Data for Name: trunks; Type: TABLE DATA; Schema: public; Owner: sms_user
--



--
-- Data for Name: voice_otp_configs; Type: TABLE DATA; Schema: public; Owner: sms_user
--



--
-- Data for Name: voice_otp_logs; Type: TABLE DATA; Schema: public; Owner: sms_user
--



--
-- Name: api_connectors_id_seq; Type: SEQUENCE SET; Schema: public; Owner: sms_user
--

SELECT pg_catalog.setval('public.api_connectors_id_seq', 1, false);


--
-- Name: audit_logs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: sms_user
--

SELECT pg_catalog.setval('public.audit_logs_id_seq', 1, false);


--
-- Name: campaigns_id_seq; Type: SEQUENCE SET; Schema: public; Owner: sms_user
--

SELECT pg_catalog.setval('public.campaigns_id_seq', 1, false);


--
-- Name: campaigns_recipients_id_seq; Type: SEQUENCE SET; Schema: public; Owner: sms_user
--

SELECT pg_catalog.setval('public.campaigns_recipients_id_seq', 1, false);


--
-- Name: clients_id_seq; Type: SEQUENCE SET; Schema: public; Owner: sms_user
--

SELECT pg_catalog.setval('public.clients_id_seq', 4, true);


--
-- Name: dlr_queue_id_seq; Type: SEQUENCE SET; Schema: public; Owner: sms_user
--

SELECT pg_catalog.setval('public.dlr_queue_id_seq', 1, false);


--
-- Name: invoices_id_seq; Type: SEQUENCE SET; Schema: public; Owner: sms_user
--

SELECT pg_catalog.setval('public.invoices_id_seq', 1, false);


--
-- Name: license_id_seq; Type: SEQUENCE SET; Schema: public; Owner: sms_user
--

SELECT pg_catalog.setval('public.license_id_seq', 1, false);


--
-- Name: mccmnc_id_seq; Type: SEQUENCE SET; Schema: public; Owner: sms_user
--

SELECT pg_catalog.setval('public.mccmnc_id_seq', 11, true);


--
-- Name: notification_templates_id_seq; Type: SEQUENCE SET; Schema: public; Owner: sms_user
--

SELECT pg_catalog.setval('public.notification_templates_id_seq', 9, true);


--
-- Name: notifications_id_seq; Type: SEQUENCE SET; Schema: public; Owner: sms_user
--

SELECT pg_catalog.setval('public.notifications_id_seq', 1, false);


--
-- Name: ott_devices_id_seq; Type: SEQUENCE SET; Schema: public; Owner: sms_user
--

SELECT pg_catalog.setval('public.ott_devices_id_seq', 1, false);


--
-- Name: payments_id_seq; Type: SEQUENCE SET; Schema: public; Owner: sms_user
--

SELECT pg_catalog.setval('public.payments_id_seq', 1, false);


--
-- Name: platform_settings_id_seq; Type: SEQUENCE SET; Schema: public; Owner: sms_user
--

SELECT pg_catalog.setval('public.platform_settings_id_seq', 17, true);


--
-- Name: rates_id_seq; Type: SEQUENCE SET; Schema: public; Owner: sms_user
--

SELECT pg_catalog.setval('public.rates_id_seq', 6, true);


--
-- Name: route_maps_id_seq; Type: SEQUENCE SET; Schema: public; Owner: sms_user
--

SELECT pg_catalog.setval('public.route_maps_id_seq', 4, true);


--
-- Name: route_plans_id_seq; Type: SEQUENCE SET; Schema: public; Owner: sms_user
--

SELECT pg_catalog.setval('public.route_plans_id_seq', 2, true);


--
-- Name: routes_id_seq; Type: SEQUENCE SET; Schema: public; Owner: sms_user
--

SELECT pg_catalog.setval('public.routes_id_seq', 4, true);


--
-- Name: sms_logs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: sms_user
--

SELECT pg_catalog.setval('public.sms_logs_id_seq', 1, false);


--
-- Name: smtp_config_id_seq; Type: SEQUENCE SET; Schema: public; Owner: sms_user
--

SELECT pg_catalog.setval('public.smtp_config_id_seq', 1, false);


--
-- Name: suppliers_id_seq; Type: SEQUENCE SET; Schema: public; Owner: sms_user
--

SELECT pg_catalog.setval('public.suppliers_id_seq', 7, true);


--
-- Name: tenants_id_seq; Type: SEQUENCE SET; Schema: public; Owner: sms_user
--

SELECT pg_catalog.setval('public.tenants_id_seq', 1, false);


--
-- Name: translations_id_seq; Type: SEQUENCE SET; Schema: public; Owner: sms_user
--

SELECT pg_catalog.setval('public.translations_id_seq', 1, false);


--
-- Name: trunks_id_seq; Type: SEQUENCE SET; Schema: public; Owner: sms_user
--

SELECT pg_catalog.setval('public.trunks_id_seq', 5, true);


--
-- Name: users_id_seq; Type: SEQUENCE SET; Schema: public; Owner: sms_user
--

SELECT pg_catalog.setval('public.users_id_seq', 5, true);


--
-- Name: voice_otp_configs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: sms_user
--

SELECT pg_catalog.setval('public.voice_otp_configs_id_seq', 1, false);


--
-- Name: voice_otp_logs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: sms_user
--

SELECT pg_catalog.setval('public.voice_otp_logs_id_seq', 1, false);


--
-- PostgreSQL database dump complete
--

\unrestrict rZ2f7V914rnvWhY5UYL517b06CYQLlFSvE6YuDQjJWyQJfnRCU96I5IEIcQXquQ

