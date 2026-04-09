-- Drop old table if it exists with incorrect schema
DROP TABLE IF EXISTS public.call_enquiries CASCADE;

-- Create call_enquiries table
CREATE TABLE IF NOT EXISTS public.call_enquiries (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  customer_name text NOT NULL,
  customer_mobile text NOT NULL,
  customer_area text DEFAULT '',
  service_type text NOT NULL CHECK (service_type IN ('general_service', 'inline_set', 'membrane', 'other')),
  due_date date NOT NULL,
  call_status text DEFAULT 'pending' CHECK (call_status IN ('pending', 'called_no_answer', 'called_callback', 'confirmed', 'service_done', 'skipped')),
  call_attempts int DEFAULT 0,
  last_called_at timestamptz,
  last_called_by text,
  scheduled_date date,
  confirmed_at timestamptz,
  confirmed_by text,
  notes text DEFAULT '',
  call_enquiry_id uuid,
  created_at timestamptz DEFAULT NOW(),
  updated_at timestamptz DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_call_enquiries_customer_id ON public.call_enquiries(customer_id);
CREATE INDEX IF NOT EXISTS idx_call_enquiries_due_date ON public.call_enquiries(due_date DESC);
CREATE INDEX IF NOT EXISTS idx_call_enquiries_status ON public.call_enquiries(call_status);
CREATE INDEX IF NOT EXISTS idx_call_enquiries_last_called_at ON public.call_enquiries(last_called_at DESC);

-- RPC Function to generate call enquiries for AMC customers
CREATE OR REPLACE FUNCTION public.generate_call_enquiries()
RETURNS void AS $$
DECLARE
  interval_days integer := 90;
  amc_customer RECORD;
BEGIN
  -- Remove existing pending enquiries that haven't been called
  DELETE FROM public.call_enquiries
  WHERE call_status = 'pending' 
  AND last_called_at IS NULL;

  -- Generate new enquiries for B2C customers based on their service due dates
  FOR amc_customer IN 
    SELECT 
      c.id,
      c.name,
      c.mobile,
      c.area,
      COALESCE(c.last_service_date, c.created_at) as last_service_date
    FROM public.customers c
    WHERE c.business_type = 'b2c'
    AND c.status = 'completed'
  LOOP
    -- Determine next service due date
    DECLARE
      next_due_date date;
      service_types text[] := ARRAY['general_service', 'inline_set', 'membrane'];
      st text;
    BEGIN
      next_due_date := (amc_customer.last_service_date::date + (interval_days || ' days')::interval)::date;
      
      -- Create enquiries for each service type
      FOREACH st IN ARRAY service_types LOOP
        INSERT INTO public.call_enquiries (
          customer_id,
          customer_name,
          customer_mobile,
          customer_area,
          service_type,
          due_date,
          call_status,
          created_at,
          updated_at
        ) VALUES (
          amc_customer.id,
          amc_customer.name,
          amc_customer.mobile,
          amc_customer.area,
          st,
          next_due_date,
          'pending',
          NOW(),
          NOW()
        )
        ON CONFLICT DO NOTHING;
      END LOOP;
    END;
  END LOOP;
  
  RAISE NOTICE 'Call enquiries generated successfully';
END;
$$ LANGUAGE plpgsql;

-- Trigger to update call_enquiry updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_call_enquiry_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_call_enquiry_timestamp ON public.call_enquiries;
CREATE TRIGGER trigger_update_call_enquiry_timestamp
BEFORE UPDATE ON public.call_enquiries
FOR EACH ROW
EXECUTE FUNCTION update_call_enquiry_timestamp();

-- Trigger to update service call enquiry status when service is completed
CREATE OR REPLACE FUNCTION public.update_call_enquiry_on_service()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'complete' AND NEW.call_enquiry_id IS NOT NULL THEN
    UPDATE public.call_enquiries
    SET 
      call_status = 'service_done',
      updated_at = NOW()
    WHERE id = NEW.call_enquiry_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_call_enquiry_on_service ON public.service_calls;
CREATE TRIGGER trigger_update_call_enquiry_on_service
AFTER INSERT OR UPDATE ON public.service_calls
FOR EACH ROW
EXECUTE FUNCTION update_call_enquiry_on_service();
