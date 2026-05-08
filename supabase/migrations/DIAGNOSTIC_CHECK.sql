-- DIAGNOSTIC SCRIPT: Check Database Status and Fix Data Display Issues
-- Run this to diagnose why data isn't showing

-- =============================================================================
-- SECTION 1: CHECK TABLE EXISTENCE AND ROW COUNTS
-- =============================================================================
SELECT 
  t.tablename,
  (SELECT COUNT(*) FROM information_schema.tables WHERE table_name = t.tablename) as exists,
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = t.tablename) as column_count
FROM (
  SELECT 'app_users' as tablename
  UNION SELECT 'customers'
  UNION SELECT 'purifiers'
  UNION SELECT 'service_calls'
  UNION SELECT 'jobs'
  UNION SELECT 'stock'
  UNION SELECT 'purifier_models'
  UNION SELECT 'call_enquiries'
  UNION SELECT 'update_log'
  UNION SELECT 'bag_stock'
  UNION SELECT 'online_orders'
) t;

-- =============================================================================
-- SECTION 2: CHECK DATA IN EACH TABLE
-- =============================================================================
SELECT 'app_users' as table_name, COUNT(*) as row_count FROM app_users
UNION ALL SELECT 'customers', COUNT(*) FROM customers
UNION ALL SELECT 'purifiers', COUNT(*) FROM purifiers
UNION ALL SELECT 'service_calls', COUNT(*) FROM service_calls
UNION ALL SELECT 'jobs', COUNT(*) FROM jobs
UNION ALL SELECT 'stock', COUNT(*) FROM stock
UNION ALL SELECT 'purifier_models', COUNT(*) FROM purifier_models
UNION ALL SELECT 'call_enquiries', COUNT(*) FROM call_enquiries
UNION ALL SELECT 'update_log', COUNT(*) FROM update_log
UNION ALL SELECT 'bag_stock', COUNT(*) FROM bag_stock
UNION ALL SELECT 'online_orders', COUNT(*) FROM online_orders
UNION ALL SELECT 'zones', COUNT(*) FROM zones
UNION ALL SELECT 'zone_technicians', COUNT(*) FROM zone_technicians
UNION ALL SELECT 'products', COUNT(*) FROM products
UNION ALL SELECT 'stock_movements', COUNT(*) FROM stock_movements
UNION ALL SELECT 'job_time_log', COUNT(*) FROM job_time_log;

-- =============================================================================
-- SECTION 3: CHECK RLS STATUS (Row Level Security)
-- =============================================================================
SELECT 
  schemaname,
  tablename,
  (SELECT count(*) > 0 FROM information_schema.table_privileges 
   WHERE table_schema = schemaname AND table_name = tablename 
   AND grantee != 'postgres') as has_rls_policies,
  (SELECT count(*) FROM information_schema.table_constraints 
   WHERE table_schema = schemaname AND table_name = tablename 
   AND constraint_type = 'CHECK') as check_constraints
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;

-- =============================================================================
-- SECTION 4: DISABLE RLS ON ALL TABLES (CRITICAL FOR DEVELOPMENT)
-- =============================================================================
-- If RLS is enabled, this will disable it
ALTER TABLE IF EXISTS app_users DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS customers DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS purifiers DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS purifier_models DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS service_calls DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS jobs DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS job_time_log DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS job_pauses DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS stock DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS stock_movements DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS products DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS zones DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS zone_technicians DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS bag_stock DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS bag_stock_log DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS online_orders DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS call_enquiries DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS update_log DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS app_settings DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS kpi_staff_scores DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS kpi_company_scores DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS entrepreneur_kpi_criteria DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS entrepreneur_kpi_scores DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS extra_hours_requests DISABLE ROW LEVEL SECURITY;

-- =============================================================================
-- SECTION 5: SAMPLE DATA VERIFICATION
-- =============================================================================
-- Show sample customers
SELECT 'CUSTOMERS' as section, COUNT(*) as total_count FROM customers;
SELECT id, name, mobile, business_type, status FROM customers LIMIT 5;

-- Show sample service calls
SELECT 'SERVICE CALLS' as section, COUNT(*) as total_count FROM service_calls;
SELECT id, customer_id, total_amount, status FROM service_calls LIMIT 5;

-- Show sample jobs
SELECT 'JOBS' as section, COUNT(*) as total_count FROM jobs;
SELECT id, customer_name, status, service_type FROM jobs LIMIT 5;

-- Show sample stock
SELECT 'STOCK' as section, COUNT(*) as total_count FROM stock;
SELECT id, name, business, qty FROM stock LIMIT 5;

-- Show sample call enquiries
SELECT 'CALL ENQUIRIES' as section, COUNT(*) as total_count FROM call_enquiries;
SELECT id, phone, status, inquiry_type FROM call_enquiries LIMIT 5;

-- Show sample update log
SELECT 'UPDATE LOG' as section, COUNT(*) as total_count FROM update_log;
SELECT id, by_name, category, description FROM update_log LIMIT 5;

-- Show sample bag stock
SELECT 'BAG STOCK' as section, COUNT(*) as total_count FROM bag_stock;
SELECT id, technician_name, stock_name FROM bag_stock LIMIT 5;

-- Show sample online orders
SELECT 'ONLINE ORDERS' as section, COUNT(*) as total_count FROM online_orders;
SELECT id, order_number, customer_name FROM online_orders LIMIT 5;

-- =============================================================================
-- SECTION 6: ENSURE AUTHENTICATION USER EXISTS
-- =============================================================================
SELECT 'TEST USER ACCOUNTS' as section, COUNT(*) as user_count FROM app_users;
SELECT id, name, phone, role, status FROM app_users;

-- =============================================================================
-- SECTION 7: TEST BASIC QUERIES (Like the UI would run)
-- =============================================================================
-- Test query for Customers page
SELECT 
  c.id, c.name, c.mobile, c.business_type, c.status,
  COUNT(p.id) as purifier_count,
  COUNT(s.id) as service_call_count
FROM customers c
LEFT JOIN purifiers p ON c.id = p.customer_id
LEFT JOIN service_calls s ON c.id = s.customer_id
WHERE c.business_type = 'b2c'
GROUP BY c.id, c.name, c.mobile, c.business_type, c.status
LIMIT 10;

-- Test query for Jobs page
SELECT j.id, j.customer_name, j.status, j.service_type, j.assigned_to_name
FROM jobs j
ORDER BY j.created_at DESC
LIMIT 10;

-- Test query for Service Calls page
SELECT s.id, s.customer_id, s.total_amount, s.status
FROM service_calls s
ORDER BY s.call_datetime DESC
LIMIT 10;

-- =============================================================================
-- SECTION 8: FINAL VERIFICATION
-- =============================================================================
-- This query tells you if everything is ready
SELECT 
  CASE WHEN COUNT(*) > 0 THEN '✅ USERS READY' ELSE '❌ NO USERS' END as users,
  (SELECT CASE WHEN COUNT(*) > 0 THEN '✅' ELSE '❌' END FROM customers) as customers,
  (SELECT CASE WHEN COUNT(*) > 0 THEN '✅' ELSE '❌' END FROM service_calls) as service_calls,
  (SELECT CASE WHEN COUNT(*) > 0 THEN '✅' ELSE '❌' END FROM jobs) as jobs,
  (SELECT CASE WHEN COUNT(*) > 0 THEN '✅' ELSE '❌' END FROM stock) as stock,
  (SELECT CASE WHEN COUNT(*) > 0 THEN '✅' ELSE '❌' END FROM purifier_models) as purifier_models
FROM app_users;
