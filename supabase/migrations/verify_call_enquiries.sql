-- Verification Query: Check call_enquiries due dates distribution
-- Run this in Supabase SQL Editor to verify due dates

SELECT 
  CASE 
    WHEN due_date < CURRENT_DATE THEN 'Overdue'
    WHEN due_date = CURRENT_DATE THEN 'Today'
    ELSE 'Future'
  END as date_category,
  COUNT(*) as count_in_category,
  MIN(due_date) as earliest_due_date,
  MAX(due_date) as latest_due_date
FROM public.call_enquiries
GROUP BY 
  CASE 
    WHEN due_date < CURRENT_DATE THEN 'Overdue'
    WHEN due_date = CURRENT_DATE THEN 'Today'
    ELSE 'Future'
  END
ORDER BY MIN(due_date);

-- Check distribution by status
SELECT 
  call_status,
  COUNT(*) as count,
  MIN(due_date) as earliest_due,
  MAX(due_date) as latest_due,
  COUNT(CASE WHEN due_date < CURRENT_DATE THEN 1 END) as overdue_count
FROM public.call_enquiries
GROUP BY call_status
ORDER BY count DESC;

-- Check if customers have last_service_date
SELECT 
  COUNT(*) as total_customers,
  COUNT(last_service_date) as with_last_service_date,
  COUNT(CASE WHEN last_service_date IS NULL THEN 1 END) as without_last_service_date,
  AVG(EXTRACT(DAY FROM (NOW() - last_service_date)))::int as avg_days_since_service,
  MAX(last_service_date) as most_recent_service
FROM public.customers
WHERE business_type = 'b2c' AND status = 'completed';
