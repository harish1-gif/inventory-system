# 🔧 Database Fix Guide - Data Display Issue Resolution

## Problem Summary
The database contains all the data, but it was not displaying in the UI across all pages because:
1. **Missing `purifier_models` table** - Customers.jsx was looking for this table
2. **Incomplete `call_enquiries` table** - Missing required columns (`customer_id`, `due_date`, `call_status`, etc.)
3. **Missing customer columns** - `last_service_date`, `purifier_model_id`, `days_since_last_service`
4. **Missing trigger functions** - For updating customer service dates automatically
5. **Outdated schema** - schema_sql2.sql didn't include migration changes

## ✅ Fixes Applied

### 1. Updated schema_sql2.sql
- Added `purifier_models` table
- Enhanced `call_enquiries` table with all required columns
- Added missing columns to `customers` table
- Added trigger functions for automatic data updates
- Added all necessary indexes

### 2. Created Migration File
- Location: `supabase/migrations/fix_schema_and_data.sql`
- Contains all schema fixes in proper order
- Includes data integrity checks

## 🚀 How to Apply the Fix

### Option A: Using Supabase Dashboard (Recommended)
1. Go to https://supabase.com and log in
2. Select your project
3. Go to **SQL Editor**
4. Click **New Query**
5. Copy the content from `supabase/migrations/fix_schema_and_data.sql`
6. Click **Run** (or press Ctrl+Enter)
7. Wait for the query to complete

### Option B: Using Supabase CLI
```bash
# If you have Supabase CLI installed
cd c:\Users\monis\OneDrive\Desktop\projects\inventory-system-SPAG
supabase db push
```

### Option C: Using schema_sql2.sql (Complete Rebuild)
⚠️ **WARNING**: This will drop all tables and recreate them (data loss!)
Only use if you want a complete fresh start:

1. Go to Supabase Dashboard → SQL Editor
2. Copy entire content of `supabase/schema_sql2.sql`
3. Run it completely
4. This will recreate all tables with data

---

## 📋 What Each Fix Does

### Fix 1: Purifier Models Table
```sql
CREATE TABLE purifier_models (
  id uuid PRIMARY KEY,
  name text UNIQUE,
  description text,
  created_at timestamptz
);
```
**Why**: Customers page queries this table to display purifier models

### Fix 2: Call Enquiries Columns
Added columns:
- `customer_id` - Link to customer
- `customer_name`, `customer_mobile`, `customer_area` - Customer details
- `due_date` - When service is due
- `call_status` - Status of the call (pending, called, confirmed, etc.)
- `call_attempts` - Track call attempts
- `last_called_at`, `last_called_by` - History tracking
- And more...

**Why**: ServiceCalls page filters and displays by these fields

### Fix 3: Customer Columns
Added:
- `purifier_model_id` - Links purifier model to customer
- `last_service_date` - Auto-updated by trigger
- `next_service_due_date` - Calculated field
- `days_since_last_service` - Auto-updated by trigger

**Why**: Needed for service tracking and purifier management

### Fix 4: Trigger Functions
Two main triggers:
1. **update_customer_last_service** - Auto-updates `last_service_date` when service call is created
2. **update_call_enquiry_timestamp** - Updates `updated_at` on call enquiries

**Why**: Keeps data automatically synchronized without manual updates

---

## ✨ After Running the Migration

### Pages That Will Now Display Data:

| Page | Data Shown | Source |
|------|-----------|--------|
| Customers | All customers with purifiers | customers, purifiers, service_calls |
| Jobs | All active/completed jobs | jobs, job_time_log |
| Services Calls | All service calls and enquiries | service_calls, call_enquiries |
| Inventory | Stock and movements | stock, stock_movements |
| Bag Stock | Technician stock dispatches | bag_stock, bag_stock_log |
| Online Orders | Orders by platform | online_orders |
| Updates | Action log entries | update_log |
| Users | Staff members | app_users |
| Zones | Service zones | zones, zone_technicians |
| Products | Product catalog | products |
| Purifiers | Purifier units | purifiers |

---

## 🔍 Verification Steps

After running the migration, verify data is displaying:

### In Supabase Dashboard
```sql
-- Check record counts
SELECT 'Customers' as table_name, COUNT(*) as count FROM customers
UNION ALL SELECT 'Jobs', COUNT(*) FROM jobs
UNION ALL SELECT 'Service Calls', COUNT(*) FROM service_calls
UNION ALL SELECT 'Call Enquiries', COUNT(*) FROM call_enquiries
UNION ALL SELECT 'Stock', COUNT(*) FROM stock
UNION ALL SELECT 'Purifiers', COUNT(*) FROM purifiers
UNION ALL SELECT 'Update Log', COUNT(*) FROM update_log;
```

### In Your Application
1. Open the app and log in
2. Go to each page (Customers, Jobs, Inventory, etc.)
3. You should now see data populated
4. If not, check browser console for error messages

---

## 🐛 Troubleshooting

### "Table doesn't exist" Error
- Migrate didn't run successfully
- Run the migration again in Supabase dashboard
- Check SQL syntax in browser console

### Still No Data Showing
1. **Clear browser cache**: Ctrl+Shift+Delete
2. **Hard refresh**: Ctrl+Shift+R
3. **Check Supabase connection**:
   ```javascript
   // Open browser console and run:
   import { supabase } from './src/lib/supabase.js'
   supabase.from('customers').select('count()', { count: 'exact' }).then(r => console.log(r))
   ```

### Authentication Issues
- Make sure you're logged in with correct role (admin/manager/technician)
- Different roles see different data
- Check `app_users` table has your user

---

## 📝 Files Modified

### Main Files:
1. **supabase/schema_sql2.sql** - Added tables, columns, triggers
2. **supabase/migrations/fix_schema_and_data.sql** - NEW migration file

### No Frontend Changes Needed
The frontend code was already correct - it was just the database schema that was incomplete.

---

## 🎯 Next Steps

1. **Run the migration** using one of the options above
2. **Verify data** using the verification queries
3. **Test the app** - refresh each page
4. **Check for errors** in browser console
5. **Report any issues** with specific page names

---

## 📞 Need Help?

If data still doesn't show after running migrations:
1. Check Supabase project status (https://supabase.com/dashboard)
2. Verify `.env.local` has correct VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
3. Check RLS policies (should be disabled on all tables for development)
4. Review browser console for specific error messages

---

**Migration Status**: ✅ Ready to Apply
**All Pages**: ✅ Code Already Correct
**Expected Result**: ✅ All Data Visible After Migration
