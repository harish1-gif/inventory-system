# 🔍 Why Data Isn't Showing - Troubleshooting Guide

## Common Causes (In Order of Likelihood)

### 🚨 MOST LIKELY: Row Level Security (RLS) is Enabled

**What is RLS?**
- RLS is a Supabase security feature that blocks all queries unless you explicitly allow them
- Even though we disabled it in migrations, Supabase might have re-enabled it

**How to Fix:**
1. Go to **Supabase Dashboard** → Your Project
2. Click **SQL Editor** → **New Query**
3. Copy & Run this script:
```sql
ALTER TABLE app_users DISABLE ROW LEVEL SECURITY;
ALTER TABLE customers DISABLE ROW LEVEL SECURITY;
ALTER TABLE purifiers DISABLE ROW LEVEL SECURITY;
ALTER TABLE service_calls DISABLE ROW LEVEL SECURITY;
ALTER TABLE jobs DISABLE ROW LEVEL SECURITY;
ALTER TABLE stock DISABLE ROW LEVEL SECURITY;
ALTER TABLE call_enquiries DISABLE ROW LEVEL SECURITY;
ALTER TABLE update_log DISABLE ROW LEVEL SECURITY;
ALTER TABLE bag_stock DISABLE ROW LEVEL SECURITY;
ALTER TABLE online_orders DISABLE ROW LEVEL SECURITY;
ALTER TABLE zones DISABLE ROW LEVEL SECURITY;
ALTER TABLE products DISABLE ROW LEVEL SECURITY;
-- ... (run COMPLETE_FIX_RLS_AND_DATA.sql for all tables)
```

---

## Step-by-Step Diagnostic (Do This First)

### Step 1: Check if Data Exists in Database
1. Go to **Supabase Dashboard** → **SQL Editor**
2. Run this query:
```sql
SELECT 'Customers' as table_name, COUNT(*) as count FROM customers
UNION ALL SELECT 'Service Calls', COUNT(*) FROM service_calls
UNION ALL SELECT 'Jobs', COUNT(*) FROM jobs
UNION ALL SELECT 'Stock', COUNT(*) FROM stock;
```

**Result:**
- ✅ If you see numbers > 0: Data exists, issue is with RLS or frontend
- ❌ If you see 0: Data wasn't inserted properly, need full migration

---

### Step 2: Check if RLS is Blocking Queries
1. Go to **Supabase Dashboard** → **Authentication** → **Policies**
2. Look for any policies listed
3. If you see policies, that's the problem!

**To Fix:**
- Click each policy
- Delete them all
- Then disable RLS on all tables

---

### Step 3: Test a Simple Query
1. Go to **Supabase Dashboard** → **SQL Editor**
2. Run:
```sql
SELECT COUNT(*) FROM customers;
SELECT * FROM customers LIMIT 1;
```

**Result:**
- ✅ If it returns data: Database is fine
- ❌ If it says "permission denied" or "access denied": RLS is the problem
- ❌ If it says "table doesn't exist": Need to run migrations

---

## Fix Order (Follow These Steps)

### 🔥 NUCLEAR OPTION (Fastest - Fixes Everything)

**⚠️ This resets the entire database but ensures everything works:**

1. Go to Supabase Dashboard → **Settings** → **Database**
2. Scroll to "Danger zone" → Click **Reset Database**
   - ⚠️ THIS DELETES ALL DATA but resets RLS to default OFF
3. After reset, run this migration:
4. Copy entire content from: `supabase/migrations/schema_sql2.sql`
5. Run it in SQL Editor
6. Refresh your app

---

### ✅ PREFERRED OPTION (Safer - Keep Your Data)

Run migrations in this exact order:

**Step 1: Disable All RLS Policies**
```
Copy & Run: supabase/migrations/COMPLETE_FIX_RLS_AND_DATA.sql
```

**Step 2: Verify Data**
```
Copy & Run: supabase/migrations/DIAGNOSTIC_CHECK.sql
```

**Step 3: Hard Refresh App**
- Press `Ctrl+Shift+R` in your browser
- Close browser completely
- Reopen the app
- Log back in

---

## If Data Still Doesn't Show

### Issue: "Cannot fetch data" Error in Console

**Check these:**

1. **Verify Supabase Connection**
   - Open browser console (F12)
   - Paste and run:
   ```javascript
   import { supabase } from './src/lib/supabase.js'
   supabase.from('customers').select('count()', { count: 'exact' })
     .then(r => console.log('Customers:', r.data))
     .catch(e => console.log('Error:', e))
   ```
   - Should show: `Customers: [{ count: 7 }]` (or your number)

2. **Check .env.local File**
   - Make sure you have:
   ```
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-long-anon-key-here
   ```
   - Get these from Supabase Dashboard → **Settings** → **API**

3. **Check Authentication**
   - You must be logged in with a valid user
   - Users in database:
     - Phone: `9000000001` | Password: `admin123` | Role: admin
     - Phone: `9000000002` | Password: `mgr123` | Role: manager
     - Phone: `9445937023` | Password: `tech123` | Role: technician

---

## Quick Reference: What to Run

### If Data Shows 0 Rows:
→ Run: `supabase/migrations/schema_sql2.sql` (full database setup)

### If Data Shows but UI is Blank:
→ Run: `supabase/migrations/COMPLETE_FIX_RLS_AND_DATA.sql` (RLS fix)

### If You See Permission Errors:
→ Run: `COMPLETE_FIX_RLS_AND_DATA.sql` then refresh browser

### If You Want to Diagnose First:
→ Run: `supabase/migrations/DIAGNOSTIC_CHECK.sql` and show me the output

---

## Browser Console Debugging

**Open Developer Console (F12) and check for:**

1. **Red error messages?**
   - Take screenshot of the error
   - This will tell us exactly what's wrong

2. **Network errors?**
   - Click **Network** tab
   - Look for any requests to `supabase.co` with red X
   - Check if they say "CORS" or "401" (authorization)

3. **Check .env variables:**
   ```javascript
   console.log(import.meta.env.VITE_SUPABASE_URL)
   console.log(import.meta.env.VITE_SUPABASE_ANON_KEY)
   // Both should show values, not "undefined"
   ```

---

## Pages and Required Data

| Page | Requires | Check With |
|------|----------|-----------|
| Customers | `customers`, `purifiers`, `service_calls` | SELECT COUNT(*) FROM customers; |
| Jobs | `jobs`, `job_time_log` | SELECT COUNT(*) FROM jobs; |
| Services | `service_calls`, `call_enquiries` | SELECT COUNT(*) FROM call_enquiries; |
| Inventory | `stock`, `stock_movements` | SELECT COUNT(*) FROM stock; |
| Bag Stock | `bag_stock`, `bag_stock_log` | SELECT COUNT(*) FROM bag_stock; |
| Update Log | `update_log` | SELECT COUNT(*) FROM update_log; |
| Users | `app_users` | SELECT COUNT(*) FROM app_users; |
| Zones | `zones`, `zone_technicians` | SELECT COUNT(*) FROM zones; |

---

## Common Errors & Solutions

### Error: "PGRST100: Insufficient privileges"
**Cause:** RLS policies are blocking access
**Fix:** Run `COMPLETE_FIX_RLS_AND_DATA.sql`

### Error: "relation does not exist"
**Cause:** Tables weren't created
**Fix:** Run full `schema_sql2.sql`

### Error: "violates not-null constraint"
**Cause:** Column definition wrong
**Fix:** Already fixed in recent schema updates

### Error: "Unauthorized" or "401"
**Cause:** Supabase keys in `.env.local` are wrong or missing
**Fix:** Check `.env.local` has correct values from Supabase Dashboard

### Page Shows Spinner but No Data
**Cause:** Query is executing but RLS is blocking result
**Fix:** Disable RLS with COMPLETE_FIX_RLS_AND_DATA.sql

---

## What to Do RIGHT NOW

1. **Run this diagnostic:**
   - Copy content from `DIAGNOSTIC_CHECK.sql`
   - Paste in Supabase SQL Editor
   - **Share the output with me** (the row counts)

2. **Then run this fix:**
   - Copy content from `COMPLETE_FIX_RLS_AND_DATA.sql`
   - Paste in Supabase SQL Editor
   - Run it

3. **Then:**
   - Hard refresh app: `Ctrl+Shift+R`
   - Log in again
   - Check if data shows

4. **If still no data:**
   - Open browser console: F12
   - Screenshot any errors
   - Send me the screenshot

---

## Migration Files Summary

| File | Purpose | Run If |
|------|---------|--------|
| `schema_sql2.sql` | Complete DB setup | No tables exist or full reset needed |
| `DIAGNOSTIC_CHECK.sql` | Check what's wrong | Want to diagnose before fixing |
| `COMPLETE_FIX_RLS_AND_DATA.sql` | Fix RLS + Recreate call_enquiries | Data exists but won't show (RLS issue) |
| `fix_schema_and_data.sql` | Older migration | Don't use, use COMPLETE_FIX instead |

**Recommendation:** Just run `COMPLETE_FIX_RLS_AND_DATA.sql` - it does everything needed!
