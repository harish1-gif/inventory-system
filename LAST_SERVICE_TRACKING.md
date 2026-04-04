# Last Service Date & Follow-up Tracking Implementation

## Overview
This implementation adds last service date tracking and automatic follow-up notifications for customers based on when their last service was performed.

---

## Database Changes

### New Columns Added to `customers` table:
```sql
- last_service_date (timestamp with time zone) - Date & time of the last service
- next_service_due_date (timestamp with time zone) - Calculated next service due date
- days_since_last_service (integer) - Calculated days since last service
```

### Database Migrations
**File:** `supabase/migrations/add_last_service_tracking.sql`

**Key Features:**
- ✅ Automatic index on `last_service_date` for fast queries
- ✅ Database trigger that updates customer's `last_service_date` when a new service is recorded
- ✅ Function to calculate days since last service
- ✅ Populates historical data from existing service_calls

### How It Works:
1. When a service call is created in `service_calls` table
2. The `trigger_update_customer_last_service` trigger fires automatically
3. Customer's `last_service_date` is updated to the new service call datetime
4. `days_since_last_service` is calculated

---

## Frontend Changes

### Customers Page - Customer List Table

#### New "Follow-up" Column
Located between "Last service" and "Pending ₹" columns

**Follow-up Status Indicators:**

| Status | Icon | Condition | Color |
|--------|------|-----------|-------|
| 🔴 Overdue | Red Badge | > 45 days since service | danger |
| 🟡 Follow-up needed | Orange Badge | 30-45 days since service | warn |
| 🟢 OK | Green Badge | < 30 days since service | ok |
| No service | Gray Text | No service history | gray |

**Example:**
```
🟡 37 days ago   (Badge showing customer needs follow-up)
```

**Logic in Code:**
```javascript
const lastServiceDate = c.last_service_date ? new Date(c.last_service_date) : null
const daysSinceService = lastServiceDate ? Math.floor((new Date() - lastServiceDate) / (1000 * 60 * 60 * 24)) : null
const needsFollowUp = daysSinceService && daysSinceService > 30
const overdue = daysSinceService && daysSinceService > 45
```

### Customer Profile Modal - Last Service Summary

#### New Section: "Last Service Summary"
Displays above the service timeline with:

**Fields Shown:**
- **Last Service Date** - Full timestamp (e.g., "04 Apr 26 11:30 AM")
- **Days Since Service** - Integer number of days (e.g., "37 days")
- **Follow-up Status Message:**
  - 🔴 "OVERDUE - Follow-up required immediately" (> 45 days)
  - 🟡 "Follow-up needed soon" (30-45 days)
  - 🟢 "Service within normal schedule" (< 30 days)

**Visual Style:**
- Gradient background (blue to purple)
- White cards displaying metrics
- Color-coded status message

---

## Configuration & Customization

### Follow-up Thresholds
You can modify these values in `src/pages/Customers.jsx`:

```javascript
const needsFollowUp = daysSinceService && daysSinceService > 30  // Change 30 to custom days
const overdue = daysSinceService && daysSinceService > 45        // Change 45 to custom days
```

### Recommended Settings:
- **Normal Service Schedule:** 30 days
- **Follow-up Reminder:** 30 days (show yellow badge)
- **Overdue Alert:** 45 days (show red badge)
- **Critical Alert:** 60+ days (consider SMS/email notification)

---

## Backend Services & Functions

### Database Functions Created:

1. **`update_customer_last_service()`**
   - Trigger function
   - Runs on INSERT to `service_calls`
   - Updates customer's last_service_date

2. **`update_all_customers_days_since_last_service()`**
   - Utility function
   - Can be called manually to refresh all days_since_last_service values
   - Should be called daily via scheduled job (optional)

### Usage Example:
```sql
-- Manually update all customers' days_since_last_service
SELECT update_all_customers_days_since_last_service();
```

---

## Data Flow

### When a Service is Completed:

```
1. Technician creates service_calls record
        ↓
2. Database trigger fires automatically
        ↓
3. Customer's last_service_date updated
        ↓
4. days_since_last_service calculated
        ↓
5. Customers page shows updated Follow-up badge
```

### When Viewing Customer Profile:

```
1. User clicks "History" button on customer row
        ↓
2. openProfile() fetches all customer data (includes last_service_date)
        ↓
3. Profile modal displays:
   - Last Service Summary card
   - Service timeline below
        ↓
4. Follow-up status calculated in real-time
```

---

## Files Modified

### Backend (Database):
- ✅ `supabase/migrations/add_last_service_tracking.sql` (NEW)

### Frontend:
- ✅ `src/pages/Customers.jsx`
  - Added follow-up status calculation
  - Added "Follow-up" column to customer list
  - Added "Last Service Summary" section to profile modal

---

## Testing Checklist

- [ ] Apply SQL migration to database
- [ ] Create test data with various service dates
- [ ] Verify "Follow-up" column appears in customer list
- [ ] Test badge colors (green < 30 days, yellow 30-45 days, red > 45 days)
- [ ] Open customer profile and verify "Last Service Summary" displays
- [ ] Create new service call and verify customer's last_service_date updates
- [ ] Test with 0 services (should show "No service")
- [ ] Verify historical data is populated from existing service calls

---

## Future Enhancements

Possible additions:
1. **Email/SMS Notifications** - Auto-send reminders when overdue
2. **Scheduled Service Form** - Pre-fill next appointment based on last service
3. **Service Analytics** - Track average days between services per customer
4. **Batch Follow-up Report** - Generate follow-up list for bulk outreach
5. **Service Plan Template** - Auto-schedule recurring services (e.g., every 30 days)
6. **Dashboard Widget** - Show "Overdue for Service" count on dashboard

---

## Support

For questions or issues:
1. Check database logs for trigger execution
2. Verify service_calls records have correct call_datetime
3. Ensure customer records have valid IDs linked in service_calls.customer_id
4. Check browser console for any JavaScript errors
