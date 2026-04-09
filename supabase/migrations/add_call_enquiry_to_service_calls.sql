-- Add missing columns to service_calls table for call enquiry integration
ALTER TABLE public.service_calls ADD COLUMN IF NOT EXISTS call_enquiry_id uuid REFERENCES public.call_enquiries(id) ON DELETE SET NULL;
ALTER TABLE public.service_calls ADD COLUMN IF NOT EXISTS service_type text;

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_service_calls_call_enquiry_id ON public.service_calls(call_enquiry_id);
CREATE INDEX IF NOT EXISTS idx_service_calls_service_type ON public.service_calls(service_type);
