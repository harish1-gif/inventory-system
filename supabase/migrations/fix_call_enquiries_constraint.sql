-- Complete Fix for Database Schema and Data Issues
-- This migration fixes all data display problems

-- Step 1: Drop call_enquiries table and recreate with correct schema
drop table if exists call_enquiries cascade;

create table call_enquiries (
  id uuid primary key default uuid_generate_v4(),
  customer_id uuid references customers(id) on delete cascade,
  customer_name text,
  customer_mobile text,
  customer_area text default '',
  phone text not null,
  location text,
  product_type text,
  inquiry_type text check (inquiry_type in ('service','new_connection','service_call')),
  service_type text check (service_type in ('general_service','inline_set','membrane','other')),
  due_date date,
  call_status text default 'pending' check (call_status in ('pending','called_no_answer','called_callback','confirmed','service_done','skipped')),
  call_attempts int default 0,
  last_called_at timestamptz,
  last_called_by text,
  scheduled_date date,
  confirmed_at timestamptz,
  confirmed_by text,
  status text default 'pending' check (status in ('pending','assigned','completed','rejected')),
  service_call_id uuid references service_calls(id),
  notes text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Step 2: Create indexes for call_enquiries
create index if not exists idx_call_enquiries_customer_id on call_enquiries(customer_id);
create index if not exists idx_call_enquiries_due_date on call_enquiries(due_date desc);
create index if not exists idx_call_enquiries_status on call_enquiries(status);
create index if not exists idx_call_enquiries_call_status on call_enquiries(call_status);
create index if not exists idx_call_enquiries_last_called_at on call_enquiries(last_called_at desc);
create index if not exists idx_call_enquiries_phone on call_enquiries(phone);

-- Step 3: Ensure purifier_models table exists
create table if not exists purifier_models (
  id uuid primary key default uuid_generate_v4(),
  name text not null unique,
  description text default '',
  created_at timestamptz default now()
);

-- Step 4: Add missing columns to customers table if they don't exist
alter table customers add column if not exists purifier_model_id uuid references purifier_models(id);
alter table customers add column if not exists last_service_date timestamptz default null;
alter table customers add column if not exists next_service_due_date timestamptz default null;
alter table customers add column if not exists days_since_last_service int default null;

-- Step 5: Create indexes for customers
create index if not exists idx_customers_last_service_date on customers(last_service_date desc);

-- Step 6: Create or replace trigger function for updating customer last_service_date
create or replace function update_customer_last_service()
returns trigger as $$
begin
  update public.customers
  set 
    last_service_date = new.call_datetime,
    days_since_last_service = extract(day from (now() - new.call_datetime))::integer
  where id = new.customer_id;
  return new;
end;
$$ language plpgsql;

-- Step 7: Create or replace trigger for service_calls
drop trigger if exists trigger_update_customer_last_service on service_calls;
create trigger trigger_update_customer_last_service
after insert on service_calls
for each row
execute function update_customer_last_service();

-- Step 8: Create or replace trigger function for call_enquiries timestamp
create or replace function update_call_enquiry_timestamp()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Step 9: Create or replace trigger for call_enquiries
drop trigger if exists trigger_update_call_enquiry_timestamp on call_enquiries;
create trigger trigger_update_call_enquiry_timestamp
before update on call_enquiries
for each row
execute function update_call_enquiry_timestamp();

-- Step 10: Insert purifier models
insert into purifier_models (name) values
  ('KENT RO Water Purifier'),
  ('Dolphin DX3'),
  ('CR-500'),
  ('Aquaguard AU55'),
  ('CR-1000'),
  ('SOLAR-100')
on conflict (name) do nothing;

-- Step 11: Populate last_service_date from existing service_calls
update public.customers c
set last_service_date = (
  select call_datetime
  from public.service_calls
  where customer_id = c.id
  order by call_datetime desc
  limit 1
)
where exists (
  select 1 from public.service_calls
  where customer_id = c.id
);

-- Step 12: Insert call enquiries with properly populated data
insert into call_enquiries (phone, location, product_type, inquiry_type, status, notes, created_at)
values
  ('9333333333','Zone A','RO Purifier','service','completed','Service call booked','2026-05-03T08:00:00+05:30'),
  ('9444444444','Zone C','Commercial RO','new_connection','completed','New system installation','2026-05-04T09:00:00+05:30'),
  ('9555555555','Zone B','KENT UP','service_call','pending','Filter replacement inquiry','2026-05-07T10:30:00+05:30'),
  ('9888888888','Zone A','Water Softener','new_connection','pending','Inquiry for home','2026-05-08T11:00:00+05:30'),
  ('9999999999','Zone C','Solar RO','service','pending','Maintenance call','2026-05-08T12:30:00+05:30'),
  ('9101010101','Zone B','Aquaguard','service_call','pending','Urgent repair','2026-05-08T14:00:00+05:30'),
  ('9111111112','Zone A','Commercial RO','new_connection','pending','Bulk inquiry','2026-05-08T15:30:00+05:30')
on conflict do nothing;

-- Step 13: Ensure RLS is disabled on all tables
alter table if exists purifier_models disable row level security;
alter table call_enquiries disable row level security;

-- Step 14: Verify data integrity
select 'Customers' as table_name, count(*) as count from customers
union all
select 'Service Calls', count(*) from service_calls
union all
select 'Jobs', count(*) from jobs
union all
select 'Purifiers', count(*) from purifiers
union all
select 'Call Enquiries', count(*) from call_enquiries
union all
select 'Stock', count(*) from stock
union all
select 'Bag Stock', count(*) from bag_stock
union all
select 'Update Log', count(*) from update_log
union all
select 'Online Orders', count(*) from online_orders;
