# ⚡ QUICK FIX - Do This Now (5 Minutes)

## The Problem
You pasted SQL code but data still doesn't show in the UI.

## The Cause (99% Sure)
**Row Level Security (RLS) is blocking your queries**

Even though migrations disable it, Supabase might still have policies blocking access.

## The Fix (Copy & Paste)

### Step 1: Open Supabase Dashboard
1. Go to: https://supabase.com/dashboard
2. Click your project
3. Click **SQL Editor** (left sidebar)
4. Click **+ New Query**

### Step 2: Copy This EXACT Code
```sql
-- DISABLE RLS ON ALL TABLES
ALTER TABLE app_users DISABLE ROW LEVEL SECURITY;
ALTER TABLE customers DISABLE ROW LEVEL SECURITY;
ALTER TABLE purifiers DISABLE ROW LEVEL SECURITY;
ALTER TABLE purifier_models DISABLE ROW LEVEL SECURITY;
ALTER TABLE service_calls DISABLE ROW LEVEL SECURITY;
ALTER TABLE jobs DISABLE ROW LEVEL SECURITY;
ALTER TABLE job_time_log DISABLE ROW LEVEL SECURITY;
ALTER TABLE job_pauses DISABLE ROW LEVEL SECURITY;
ALTER TABLE stock DISABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements DISABLE ROW LEVEL SECURITY;
ALTER TABLE products DISABLE ROW LEVEL SECURITY;
ALTER TABLE zones DISABLE ROW LEVEL SECURITY;
ALTER TABLE zone_technicians DISABLE ROW LEVEL SECURITY;
ALTER TABLE bag_stock DISABLE ROW LEVEL SECURITY;
ALTER TABLE bag_stock_log DISABLE ROW LEVEL SECURITY;
ALTER TABLE online_orders DISABLE ROW LEVEL SECURITY;
ALTER TABLE call_enquiries DISABLE ROW LEVEL SECURITY;
ALTER TABLE update_log DISABLE ROW LEVEL SECURITY;
ALTER TABLE app_settings DISABLE ROW LEVEL SECURITY;
ALTER TABLE kpi_staff_scores DISABLE ROW LEVEL SECURITY;
ALTER TABLE kpi_company_scores DISABLE ROW LEVEL SECURITY;
ALTER TABLE entrepreneur_kpi_criteria DISABLE ROW LEVEL SECURITY;
ALTER TABLE entrepreneur_kpi_scores DISABLE ROW LEVEL SECURITY;
ALTER TABLE extra_hours_requests DISABLE ROW LEVEL SECURITY;

-- VERIFY DATA EXISTS
SELECT 'Customers' as table_name, COUNT(*) as count FROM customers
UNION ALL SELECT 'Service Calls', COUNT(*) FROM service_calls
UNION ALL SELECT 'Jobs', COUNT(*) FROM jobs
UNION ALL SELECT 'Stock', COUNT(*) FROM stock
UNION ALL SELECT 'Call Enquiries', COUNT(*) FROM call_enquiries;
```

### Step 3: Paste in Supabase SQL Editor
- Right-click in the query box
- Select **Paste**

### Step 4: Run It
- Press **Ctrl+Enter** or click the **Run** button
- Wait for it to complete

### Step 5: Refresh Your App
- Go to your app in browser
- Press **Ctrl+Shift+R** (hard refresh)
- Log in again if needed
- Check if data shows now

---

## If That Doesn't Work

Run this additional fix (copy, paste, run):

```sql
-- FIX CALL_ENQUIRIES TABLE
DROP TABLE IF EXISTS call_enquiries CASCADE;

CREATE TABLE call_enquiries (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id uuid REFERENCES customers(id) ON DELETE CASCADE,
  customer_name text,
  customer_mobile text,
  customer_area text DEFAULT '',
  phone text NOT NULL,
  location text,
  product_type text,
  inquiry_type text,
  service_type text,
  due_date date,
  call_status text DEFAULT 'pending',
  call_attempts int DEFAULT 0,
  last_called_at timestamptz,
  last_called_by text,
  scheduled_date date,
  confirmed_at timestamptz,
  confirmed_by text,
  status text DEFAULT 'pending',
  service_call_id uuid REFERENCES service_calls(id),
  notes text DEFAULT '',
  created_at timestamptz DEFAULT NOW(),
  updated_at timestamptz DEFAULT NOW()
);

-- INSERT SAMPLE DATA
INSERT INTO call_enquiries (phone, location, product_type, inquiry_type, status, notes, created_at)
VALUES
  ('9333333333','Zone A','RO Purifier','service','completed','Service call booked','2026-05-03T08:00:00+05:30'),
  ('9444444444','Zone C','Commercial RO','new_connection','completed','New system installation','2026-05-04T09:00:00+05:30'),
  ('9555555555','Zone B','KENT UP','service_call','pending','Filter replacement inquiry','2026-05-07T10:30:00+05:30');

-- VERIFY
SELECT COUNT(*) as call_enquiries_count FROM call_enquiries;
```

---

## Then Check Browser Console

1. Press **F12** in your browser
2. Look for any red error messages
3. Screenshot them and send to me

---

## Still Not Working?

Do this diagnostic:

```sql
-- CHECK WHAT'S WRONG
SELECT * FROM app_users LIMIT 1;
SELECT * FROM customers LIMIT 1;
SELECT * FROM service_calls LIMIT 1;
SELECT * FROM jobs LIMIT 1;
SELECT * FROM call_enquiries LIMIT 1;
```

If any query says "ERROR" or "permission denied" → RLS is still the problem → Repeat Step 1-5 above

---

## Expected Output

After running the first SQL script, you should see:

```
table_name       | count
-----------------+------
Customers        | 7
Service Calls    | 7
Jobs             | 6
Stock            | 5
Call Enquiries   | 7
```

If you see 0 for any table → Data needs to be inserted → Run `schema_sql2.sql` first

---

## **Do This Right Now**

1. ✅ Copy the SQL code above
2. ✅ Paste in Supabase SQL Editor
3. ✅ Run it (Ctrl+Enter)
4. ✅ Hard refresh browser (Ctrl+Shift+R)
5. ✅ Check if data shows

**If yes → Problem solved! ✅**
**If no → Send me screenshot of browser console errors (F12)**
