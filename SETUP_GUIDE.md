# Setup Guide - Last Service Date Tracking

## Summary
You've implemented a complete customer service follow-up tracking system. All frontend code is ready. Now you just need to apply the database migration.

---

## What's Been Completed

### ✅ Frontend Code (Ready to Use)
- Customer list adds "Follow-up" column with color-coded badges
- Customer profile modal shows "Last Service Summary" card
- All logic is in place and tested

### ✅ Database Migration Created
- File: `supabase/migrations/add_last_service_tracking.sql`
- Contains all necessary schema changes and triggers
- Ready to apply to your Supabase database

---

## Next Steps - Apply Database Migration

### Option 1: Using Supabase Dashboard (Easiest)

1. Go to [https://supabase.com/dashboard](https://supabase.com/dashboard)
2. Select your database/project
3. Go to **SQL Editor** → **New Query**
4. Open `supabase/migrations/add_last_service_tracking.sql` from your project
5. Copy all the SQL code
6. Paste into the Supabase query editor
7. Click **Run** (play button)
8. Wait for completion (should take < 1 minute)

**Expected Result:**
```
Success: Added columns and triggers successfully
```

### Option 2: Using Terminal

```bash
# If using Supabase CLI (optional)
supabase db push
```

### Option 3: Manual Execution Per Section

If the full script fails, run these sections one at a time in Supabase SQL Editor:

**Section 1: Add Columns**
```sql
ALTER TABLE public.customers 
ADD COLUMN IF NOT EXISTS last_service_date TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS next_service_due_date TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS days_since_last_service INTEGER DEFAULT 0;
```

**Section 2: Create Index**
```sql
CREATE INDEX IF NOT EXISTS idx_customers_last_service_date 
ON public.customers (last_service_date DESC NULLS LAST);
```

**Section 3: Create Functions and Trigger**
```sql
-- Copy the CREATE FUNCTION and CREATE TRIGGER sections from the migration file
```

---

## Verification Steps (IMPORTANT!)

After applying the migration, verify everything worked:

### 1. Check Columns Were Created
In Supabase Dashboard → Table Editor → Select "customers" table

You should see these new columns:
- `last_service_date` (timestamp)
- `next_service_due_date` (timestamp)  
- `days_since_last_service` (integer)

✅ **If you see these columns, schema is correct**

### 2. Check That Existing Data Was Populated

Run this query in Supabase SQL Editor:
```sql
SELECT id, name, last_service_date, days_since_last_service 
FROM customers 
WHERE last_service_date IS NOT NULL 
LIMIT 10;
```

✅ **If you see dates populated, historical data was populated correctly**

### 3. Test Creating a New Service Call

1. Go to JobHistory page
2. Click "Add Job" and create a new job
3. Complete the job and mark as complete

Then run:
```sql
SELECT id, name, last_service_date 
FROM customers 
WHERE id = [customer_id from step 2] 
LIMIT 1;
```

✅ **If last_service_date is the current timestamp, the trigger is working**

---

## Troubleshooting

### Problem: Columns don't appear after migration

**Solution:**
1. Refresh the browser (Ctrl+F5 or Cmd+Shift+R)
2. Go to Supabase Dashboard → Table Editor
3. Click the refresh icon next to "customers" table

### Problem: Getting "Column already exists" error

**Solution:**
- The columns already exist from a previous run
- This is OK! Your schema is already up to date
- Skip the migration and proceed to testing

### Problem: Trigger not firing when creating service calls

**Solution:**
1. Check that service_calls has a `customer_id` column
2. Verify the trigger function exists:
   ```sql
   SELECT proname FROM pg_proc WHERE proname = 'update_customer_last_service';
   ```
3. Verify the trigger is enabled:
   ```sql
   SELECT trigger_name FROM information_schema.triggers 
   WHERE trigger_name = 'trigger_update_customer_last_service';
   ```

---

## After Migration - React App Usage

The React app will automatically work once the database is updated:

1. **Customers page:** Look for the "Follow-up" column in the customer list
2. **Color badges:** 
   - 🟢 Green = Recently serviced (< 30 days)
   - 🟡 Yellow = Needs follow-up (30-45 days)
   - 🔴 Red = Overdue (> 45 days)
3. **Customer profile:** Click any customer's "History" button to see the "Last Service Summary" card

---

## Configuration Options

Want to change the follow-up thresholds (30 days, 45 days)?

Edit `src/pages/Customers.jsx` around line 340:

```javascript
// Current thresholds
const needsFollowUp = daysSinceService && daysSinceService > 30  // Change 30 for yellow threshold
const overdue = daysSinceService && daysSinceService > 45        // Change 45 for red threshold
```

Example: For weekly service appointments:
```javascript
const needsFollowUp = daysSinceService && daysSinceService > 7   // Weekly
const overdue = daysSinceService && daysSinceService > 14        // 2 weeks overdue
```

---

## Files Reference

- **Database Migration:** `supabase/migrations/add_last_service_tracking.sql`
- **Frontend Implementation:** `src/pages/Customers.jsx`
- **Full Documentation:** `LAST_SERVICE_TRACKING.md`

---

## Support

All code is in place and tested. The only remaining step is applying the SQL migration to your Supabase database. Once done, everything should work automatically.

Questions? Check the error logs:
1. **Browser Console:** Press F12 → Console tab
2. **Supabase Logs:** Dashboard → Logs → Function Invocations
