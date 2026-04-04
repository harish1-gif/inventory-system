-- Add last service date columns to customers table
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS last_service_date timestamp with time zone DEFAULT NULL;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS next_service_due_date timestamp with time zone DEFAULT NULL;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS days_since_last_service integer DEFAULT NULL;

-- Create an index for faster queries on last_service_date
CREATE INDEX IF NOT EXISTS idx_customers_last_service_date ON public.customers(last_service_date DESC);

-- Function to update last_service_date when a service call is created
CREATE OR REPLACE FUNCTION update_customer_last_service()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.customers
  SET 
    last_service_date = NEW.call_datetime,
    days_since_last_service = EXTRACT(DAY FROM (NOW() - NEW.call_datetime))::integer
  WHERE id = NEW.customer_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update customer last_service_date
DROP TRIGGER IF EXISTS trigger_update_customer_last_service ON public.service_calls;
CREATE TRIGGER trigger_update_customer_last_service
AFTER INSERT ON public.service_calls
FOR EACH ROW
EXECUTE FUNCTION update_customer_last_service();

-- Function to update days_since_last_service (run daily via cron or on page load)
CREATE OR REPLACE FUNCTION update_all_customers_days_since_last_service()
RETURNS void AS $$
BEGIN
  UPDATE public.customers
  SET days_since_last_service = EXTRACT(DAY FROM (NOW() - last_service_date))::integer
  WHERE last_service_date IS NOT NULL;
END;
$$ LANGUAGE plpgsql;

-- Populate last_service_date from existing service_calls
UPDATE public.customers c
SET last_service_date = (
  SELECT call_datetime
  FROM public.service_calls
  WHERE customer_id = c.id
  ORDER BY call_datetime DESC
  LIMIT 1
)
WHERE EXISTS (
  SELECT 1 FROM public.service_calls
  WHERE customer_id = c.id
);

-- Update days_since_last_service for all customers
SELECT update_all_customers_days_since_last_service();
