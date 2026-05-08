create extension if not exists "uuid-ossp";

drop table if exists entrepreneur_kpi_scores cascade;
drop table if exists entrepreneur_kpi_criteria cascade;
drop table if exists kpi_company_scores cascade;
drop table if exists kpi_staff_scores cascade;
drop table if exists extra_hours_requests cascade;
drop table if exists job_time_log cascade;
drop table if exists bag_stock_log cascade;
drop table if exists bag_stock cascade;
drop table if exists online_orders cascade;
drop table if exists service_calls cascade;
drop table if exists call_enquiries cascade;
drop table if exists purifiers cascade;
drop table if exists customers cascade;
drop table if exists jobs cascade;
drop table if exists zone_technicians cascade;
drop table if exists zones cascade;
drop table if exists products cascade;
drop table if exists stock_movements cascade;
drop table if exists stock cascade;
drop table if exists update_log cascade;
drop table if exists app_settings cascade;
drop table if exists app_users cascade;

create table app_users (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  phone text unique not null,
  password text not null,
  role text not null check (role in ('admin','manager','technician')),
  area text default 'ALL',
  status text default 'active' check (status in ('active','inactive')),
  created_at timestamptz default now()
);

create table app_settings (
  key text primary key,
  value text,
  updated_at timestamptz default now()
);

create table update_log (
  id uuid primary key default uuid_generate_v4(),
  logged_at timestamptz default now(),
  by_user_id uuid,
  by_name text,
  by_role text,
  category text,
  description text,
  extra text default ''
);

create table stock (
  id uuid primary key default uuid_generate_v4(),
  business text not null check (business in ('b2c','b2b')),
  name text not null,
  category text default 'General',
  qty int default 0,
  min_qty int default 5,
  landing_price numeric(10,2) default 0,
  purchase_price numeric(10,2) default 0,
  selling_price numeric(10,2) default 0,
  notes text default '',
  last_updated_by text,
  last_updated_at timestamptz default now(),
  created_at timestamptz default now()
);

create table stock_movements (
  id uuid primary key default uuid_generate_v4(),
  stock_id uuid references stock(id) on delete cascade,
  stock_name text,
  business text,
  type text check (type in ('receive','use','add','dispatch')),
  qty_change int,
  qty_before int,
  qty_after int,
  selling_price numeric(10,2) default 0,
  note text default '',
  by_name text,
  by_role text,
  created_at timestamptz default now()
);

create table products (
  id uuid primary key default uuid_generate_v4(),
  type text not null check (type in ('b2c','b2b')),
  name text not null,
  model text not null,
  description text default '',
  category text default 'General',
  price numeric(10,2) default 0,
  image_url text,
  created_at timestamptz default now()
);

create table purifier_models (
  id uuid primary key default uuid_generate_v4(),
  name text not null unique,
  description text default '',
  created_at timestamptz default now()
);

create table customers (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  mobile text not null,
  address text default '',
  area text default '',
  business_type text not null check (business_type in ('b2c','b2b')),
  source text not null check (source in ('offline','online')) default 'offline',
  since date,
  status text default 'pending' check (status in ('pending','completed','rejected')),
  status_changed_at timestamptz,
  status_changed_by uuid,
  status_note text default '',
  purifier_model_id uuid references purifier_models(id),
  last_service_date timestamptz,
  next_service_due_date timestamptz,
  days_since_last_service int,
  created_at timestamptz default now()
);

create table purifiers (
  id uuid primary key default uuid_generate_v4(),
  customer_id uuid references customers(id) on delete cascade,
  model text not null,
  serial_no text not null,
  installed_date date,
  last_service_date date,
  total_services int default 4,
  interval_days int default 90,
  done_count int default 0,
  image_url text,
  status text default 'active' check (status in ('active','inactive')),
  created_by uuid,
  created_at timestamptz default now()
);

create table service_calls (
  id uuid primary key default uuid_generate_v4(),
  customer_id uuid references customers(id) on delete cascade,
  call_datetime timestamptz not null,
  total_amount numeric(10,2) default 0,
  received_amount numeric(10,2) default 0,
  pending_amount numeric(10,2) default 0,
  payment_mode text default 'CASH',
  admin_note text default '',
  status text default 'pending' check (status in ('pending','complete')),
  completed_at timestamptz,
  completed_by_name text,
  spares_replaced text default '',
  assigned_to uuid references app_users(id),
  call_enquiry_id uuid,
  created_at timestamptz default now()
);

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

create table online_orders (
  id uuid primary key default uuid_generate_v4(),
  order_number text unique not null,
  order_date date not null,
  stock_id uuid references stock(id) on delete cascade,
  stock_name text not null,
  business text not null check (business in ('b2c','b2b')),
  quantity_ordered int not null,
  customer_name text default 'Online Customer',
  status text default 'completed' check (status in ('pending','completed','cancelled','returned')),
  platform text default 'Direct' check (platform in ('Direct','Flipkart','Amazon','Other')),
  order_price numeric(10,2) default 0,
  notes text default '',
  created_by text,
  created_at timestamptz default now()
);

create table zones (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  description text default '',
  color text default '#185FA5',
  km_from_kpm int default 0,
  created_by text,
  created_at timestamptz default now()
);

create table zone_technicians (
  id uuid primary key default uuid_generate_v4(),
  zone_id uuid references zones(id) on delete cascade,
  technician_id uuid references app_users(id) on delete cascade,
  assigned_by text,
  assigned_at timestamptz default now(),
  unique(zone_id, technician_id)
);

create table jobs (
  id uuid primary key default uuid_generate_v4(),
  customer_name text not null,
  customer_location text,
  zone_id uuid references zones(id),
  assigned_to uuid references app_users(id),
  assigned_to_name text,
  service_type text,
  working_hours_allowed numeric(4,1) default 2,
  long_distance boolean default false,
  extra_hours_approved numeric(4,1) default 0,
  status text default 'pending' check (status in ('pending','active','extra_hrs_requested','completed','flagged')),
  notes text default '',
  created_by text,
  created_at timestamptz default now(),
  start_time timestamptz,
  travel_start_time timestamptz,
  travel_end_time timestamptz,
  end_time timestamptz,
  total_duration_minutes int,
  travel_duration_minutes int
);

create table job_time_log (
  id uuid primary key default uuid_generate_v4(),
  job_id uuid references jobs(id) on delete cascade,
  event text,
  event_time timestamptz default now(),
  by_name text,
  by_role text,
  notes text default ''
);

create table extra_hours_requests (
  id uuid primary key default uuid_generate_v4(),
  job_id uuid references jobs(id) on delete cascade,
  technician_id uuid references app_users(id),
  technician_name text,
  reason text default '',
  requested_at timestamptz default now(),
  status text default 'pending' check (status in ('pending','approved','rejected')),
  reviewed_by text,
  reviewed_at timestamptz,
  extra_hours_granted numeric(4,1) default 0,
  review_notes text default ''
);

create table bag_stock (
  id uuid primary key default uuid_generate_v4(),
  technician_id uuid references app_users(id),
  technician_name text,
  stock_id uuid references stock(id),
  stock_name text,
  category text,
  business text,
  qty_dispatched int default 0,
  remaining_qty int default 0,
  dispatched_by text,
  dispatched_at timestamptz default now(),
  last_used_at timestamptz
);

create table bag_stock_log (
  id uuid primary key default uuid_generate_v4(),
  bag_stock_id uuid references bag_stock(id),
  technician_id uuid references app_users(id),
  technician_name text,
  stock_id uuid,
  stock_name text,
  qty_used int,
  note text default '',
  used_by text,
  used_at timestamptz default now()
);

create table kpi_staff_scores (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references app_users(id),
  criteria_id int,
  criteria_name text,
  month int,
  year int,
  actual_value numeric default 0,
  points numeric default 0,
  edited_by text,
  updated_at timestamptz default now(),
  unique(user_id, criteria_id, month, year)
);

create table kpi_company_scores (
  id uuid primary key default uuid_generate_v4(),
  year int,
  month_idx int,
  criteria_id int,
  criteria_name text,
  points numeric default 0,
  edited_by text,
  updated_at timestamptz default now(),
  unique(year, month_idx, criteria_id)
);

create table entrepreneur_kpi_criteria (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references app_users(id),
  name text,
  max_points numeric default 10,
  description text default '',
  sort_order int default 0,
  created_at timestamptz default now()
);

create table entrepreneur_kpi_scores (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references app_users(id),
  criteria_id uuid references entrepreneur_kpi_criteria(id) on delete cascade,
  criteria_name text,
  month int,
  year int,
  points numeric default 0,
  updated_at timestamptz default now(),
  unique(user_id, criteria_id, month, year)
);

create index idx_stock_business on stock(business);
create index idx_stock_qty on stock(qty);
create index idx_jobs_status on jobs(status);
create index idx_jobs_assigned on jobs(assigned_to);
create index idx_update_log_at on update_log(logged_at);
create index idx_bag_stock_tech on bag_stock(technician_id);
create index idx_movements_stock on stock_movements(stock_id);
create index idx_service_calls_customer on service_calls(customer_id);
create index idx_service_calls_status on service_calls(status);
create index idx_customers_business on customers(business_type);
create index idx_call_enquiries_phone on call_enquiries(phone);
create index idx_call_enquiries_status on call_enquiries(status);
create index idx_call_enquiries_customer_id on call_enquiries(customer_id);
create index idx_call_enquiries_due_date on call_enquiries(due_date desc);
create index idx_call_enquiries_call_status on call_enquiries(call_status);
create index idx_call_enquiries_last_called_at on call_enquiries(last_called_at desc);
create index idx_customers_last_service_date on customers(last_service_date desc);

insert into storage.buckets (id, name, public) values ('purifier-images','purifier-images',true) on conflict (id) do nothing;

insert into app_users (id, name, phone, password, role, area) values
  ('aaaaaaaa-0000-0000-0000-000000000001','ADMIN',     '9000000001','admin123', 'admin',      'ALL'),
  ('aaaaaaaa-0000-0000-0000-000000000002','MANAGER',   '9000000002','mgr123',   'manager',    'ALL'),
  ('aaaaaaaa-0000-0000-0000-000000000003','TECH_001',  '9445937023','tech123',  'technician', 'KPM'),
  ('aaaaaaaa-0000-0000-0000-000000000004','TECH_002',  '9876543210','tech123',  'technician', 'SRP'),
  ('aaaaaaaa-0000-0000-0000-000000000005','TECH_003',  '9123456780','tech123',  'technician', 'ANR');

insert into app_settings (key, value) values
  ('b2c_monthly_target','1500000'),
  ('b2b_monthly_target','3500000'),
  ('analytics_shared','false');

insert into zones (id, name, description, color, km_from_kpm, created_by) values
  ('bbbbbbbb-0000-0000-0000-000000000001','Zone A', 'Central Area', '#185FA5', 0, 'MANAGER'),
  ('bbbbbbbb-0000-0000-0000-000000000002','Zone B', 'Rural Area', '#0F6E56', 25, 'MANAGER'),
  ('bbbbbbbb-0000-0000-0000-000000000003','Zone C', 'Industrial Area', '#854F0B', 45, 'MANAGER');

insert into zone_technicians (zone_id, technician_id, assigned_by) values
  ('bbbbbbbb-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000003','MANAGER'),
  ('bbbbbbbb-0000-0000-0000-000000000002','aaaaaaaa-0000-0000-0000-000000000004','MANAGER'),
  ('bbbbbbbb-0000-0000-0000-000000000003','aaaaaaaa-0000-0000-0000-000000000005','MANAGER');

insert into stock (business, name, category, qty, min_qty, landing_price, purchase_price, selling_price, last_updated_by) values
  ('b2c','250 SPUN Filter','Filter',15,5,12,15,30,'MANAGER'),
  ('b2c','POST CARBON Filter','Filter',8,5,70,80,150,'MANAGER'),
  ('b2c','24V Solenoid Valve','Valve',12,5,100,120,250,'MANAGER'),
  ('b2b','Commercial RO 500 LPH','Commercial RO',2,1,20000,23000,38000,'MANAGER'),
  ('b2b','Solar Panel 250W','Solar',5,2,5500,6200,10000,'MANAGER');

insert into products (type, name, model, description, category, price) values
  ('b2c','KENT RO Water Purifier','KENT UP','Standard wall-mounted RO','Water Purifier',12500),
  ('b2c','RO Spare Parts Kit','BASIC-KIT','Complete filter set for 1 year','Maintenance Kit',2500),
  ('b2b','Commercial RO System 500 LPH','CR-500','For offices and schools','Commercial RO',35000),
  ('b2b','Solar RO System 100 LPH','SOLAR-100','Off-grid solar powered','Solar RO',55000);

insert into customers (name, mobile, address, area, business_type, source, since, status) values
  ('Ravi Kumar','9111111111','MG Road, Apt 205','Zone A','b2c','offline','2025-06-15','completed'),
  ('Murugan Industries','9222222222','SIPCOT Industrial Area','Zone B','b2b','offline','2025-08-01','completed'),
  ('Priya Sharma','9333333333','Lakshmi Nagar, House 45','Zone A','b2c','online','2026-01-10','completed'),
  ('Sriram Hospital','9444444444','Medical Complex, Main Road','Zone C','b2b','offline','2025-11-20','completed'),
  ('Anjali Residence','9555555555','Sector 7, Villa 12','Zone B','b2c','offline','2026-02-05','pending'),
  ('TechWater Solutions','9666666666','Business Park, Building C','Zone C','b2b','online','2025-09-30','completed'),
  ('Deepak Apartment','9777777777','New Colony, Flat 3B','Zone A','b2c','offline','2026-03-12','pending');

insert into purifiers (customer_id, model, serial_no, installed_date, last_service_date, total_services, done_count, status, created_by) values
  ((select id from customers where mobile='9111111111'),'KENT UP','KUP-001-2025','2025-06-15','2026-04-15',4,3,'active','aaaaaaaa-0000-0000-0000-000000000001'),
  ((select id from customers where mobile='9111111111'),'Dolphin DX3','DX3-001-2025','2025-08-20','2026-05-01',4,2,'active','aaaaaaaa-0000-0000-0000-000000000001'),
  ((select id from customers where mobile='9222222222'),'CR-500','CR500-001-2025','2025-08-01','2026-04-30',4,2,'active','aaaaaaaa-0000-0000-0000-000000000001'),
  ((select id from customers where mobile='9333333333'),'Aquaguard AU55','AU55-001-2026','2026-01-15','2026-04-20',4,1,'active','aaaaaaaa-0000-0000-0000-000000000001'),
  ((select id from customers where mobile='9444444444'),'CR-1000','CR1000-001-2025','2025-11-20','2026-05-05',4,3,'active','aaaaaaaa-0000-0000-0000-000000000001'),
  ((select id from customers where mobile='9555555555'),'KENT UP','KUP-002-2026','2026-02-05',null,4,0,'active','aaaaaaaa-0000-0000-0000-000000000002'),
  ((select id from customers where mobile='9666666666'),'SOLAR-100','SOL100-001-2025','2025-09-30','2026-04-25',4,2,'active','aaaaaaaa-0000-0000-0000-000000000001');

insert into jobs (customer_name, customer_location, zone_id, assigned_to, assigned_to_name, service_type, working_hours_allowed, status, long_distance, created_by, start_time, end_time, total_duration_minutes) values
  ('Ravi Kumar','MG Road, Apt 205','bbbbbbbb-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000003','TECH_001','General Service',2,'completed',false,'ADMIN','2026-05-01T09:00:00+05:30','2026-05-01T11:00:00+05:30',120),
  ('Murugan Industries','SIPCOT Area','bbbbbbbb-0000-0000-0000-000000000002','aaaaaaaa-0000-0000-0000-000000000004','TECH_002','Membrane Replacement',3,'completed',true,'ADMIN','2026-05-02T10:00:00+05:30','2026-05-02T13:30:00+05:30',210),
  ('Priya Sharma','Lakshmi Nagar','bbbbbbbb-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000003','TECH_001','Filter Change',2,'completed',false,'ADMIN','2026-05-03T08:30:00+05:30','2026-05-03T10:15:00+05:30',105),
  ('Sriram Hospital','Medical Complex','bbbbbbbb-0000-0000-0000-000000000003','aaaaaaaa-0000-0000-0000-000000000005','TECH_003','Pump Service',3,'completed',true,'MANAGER','2026-05-04T09:00:00+05:30','2026-05-04T12:45:00+05:30',225),
  ('Anjali Residence','Sector 7','bbbbbbbb-0000-0000-0000-000000000002','aaaaaaaa-0000-0000-0000-000000000004','TECH_002','New Installation',4,'active',false,'ADMIN','2026-05-07T10:00:00+05:30',null,null),
  ('TechWater Solutions','Business Park','bbbbbbbb-0000-0000-0000-000000000003','aaaaaaaa-0000-0000-0000-000000000005','TECH_003','Full Overhaul',4,'pending',true,'MANAGER',null,null,null);

insert into service_calls (customer_id, call_datetime, total_amount, received_amount, pending_amount, payment_mode, status, completed_at, completed_by_name, spares_replaced, assigned_to) values
  ((select id from customers where mobile='9111111111'),'2026-05-01T09:00:00+05:30',500,500,0,'CASH','complete','2026-05-01T11:00:00+05:30','TECH_001','250 SPUN Filter','aaaaaaaa-0000-0000-0000-000000000003'),
  ((select id from customers where mobile='9222222222'),'2026-05-02T10:00:00+05:30',3500,3500,0,'UPI','complete','2026-05-02T13:30:00+05:30','TECH_002','75GPD Membrane, Solenoid Valve','aaaaaaaa-0000-0000-0000-000000000004'),
  ((select id from customers where mobile='9333333333'),'2026-05-03T08:30:00+05:30',350,350,0,'CASH','complete','2026-05-03T10:15:00+05:30','TECH_001','POST CARBON Filter','aaaaaaaa-0000-0000-0000-000000000003'),
  ((select id from customers where mobile='9444444444'),'2026-05-04T09:00:00+05:30',2000,1500,500,'CASH','complete','2026-05-04T12:45:00+05:30','TECH_003','Membrane Housing, Pump','aaaaaaaa-0000-0000-0000-000000000005'),
  ((select id from customers where mobile='9555555555'),'2026-05-07T10:00:00+05:30',12500,0,12500,'PENDING','pending',null,null,'Full Unit','aaaaaaaa-0000-0000-0000-000000000004'),
  ((select id from customers where mobile='9666666666'),'2026-05-08T14:00:00+05:30',5000,5000,0,'UPI','complete','2026-05-08T16:30:00+05:30','TECH_003','Solar Panel, RO Membrane','aaaaaaaa-0000-0000-0000-000000000005'),
  ((select id from customers where mobile='9111111111'),'2026-05-08T10:00:00+05:30',450,450,0,'CASH','complete','2026-05-08T11:30:00+05:30','TECH_001','UV Lamp','aaaaaaaa-0000-0000-0000-000000000003');

insert into stock_movements (stock_id, stock_name, business, type, qty_change, qty_before, qty_after, selling_price, note, by_name, by_role, created_at) values
  ((select id from stock where name='250 SPUN Filter'),'250 SPUN Filter','b2c','use',1,15,14,30,'Used in service call','TECH_001','technician','2026-05-01T11:00:00+05:30'),
  ((select id from stock where name='POST CARBON Filter'),'POST CARBON Filter','b2c','use',1,8,7,150,'Used in service call','TECH_001','technician','2026-05-03T10:15:00+05:30'),
  ((select id from stock where name='24V Solenoid Valve'),'24V Solenoid Valve','b2c','use',1,12,11,250,'Used in service call','TECH_002','technician','2026-05-02T13:30:00+05:30'),
  ((select id from stock where name='250 SPUN Filter'),'250 SPUN Filter','b2c','receive',5,14,19,30,'Received from supplier','MANAGER','manager','2026-05-06T10:00:00+05:30'),
  ((select id from stock where name='POST CARBON Filter'),'POST CARBON Filter','b2c','use',1,7,6,150,'Used in service call','TECH_003','technician','2026-05-04T12:45:00+05:30'),
  ((select id from stock where name='Commercial RO 500 LPH'),'Commercial RO 500 LPH','b2b','dispatch',1,2,1,38000,'Dispatched to customer','MANAGER','manager','2026-05-05T09:00:00+05:30');

insert into job_time_log (job_id, event, event_time, by_name, by_role, notes) values
  ((select id from jobs where customer_name='Ravi Kumar' and status='completed' order by created_at asc limit 1),'Job Created','2026-05-01T08:00:00+05:30','ADMIN','admin',''),
  ((select id from jobs where customer_name='Ravi Kumar' and status='completed' order by created_at asc limit 1),'Assigned to TECH_001','2026-05-01T08:30:00+05:30','ADMIN','admin',''),
  ((select id from jobs where customer_name='Ravi Kumar' and status='completed' order by created_at asc limit 1),'Started','2026-05-01T09:00:00+05:30','TECH_001','technician','Arrived at location'),
  ((select id from jobs where customer_name='Ravi Kumar' and status='completed' order by created_at asc limit 1),'Completed','2026-05-01T11:00:00+05:30','TECH_001','technician','Service done, filter replaced'),
  ((select id from jobs where customer_name='Murugan Industries' and status='completed' order by created_at asc limit 1),'Job Created','2026-05-02T09:00:00+05:30','ADMIN','admin',''),
  ((select id from jobs where customer_name='Murugan Industries' and status='completed' order by created_at asc limit 1),'Assigned to TECH_002','2026-05-02T09:30:00+05:30','ADMIN','admin',''),
  ((select id from jobs where customer_name='Murugan Industries' and status='completed' order by created_at asc limit 1),'Started','2026-05-02T10:00:00+05:30','TECH_002','technician','');

insert into bag_stock (technician_id, technician_name, stock_id, stock_name, category, business, qty_dispatched, remaining_qty, dispatched_by, dispatched_at) values
  ('aaaaaaaa-0000-0000-0000-000000000003','TECH_001',(select id from stock where name='250 SPUN Filter'),'250 SPUN Filter','Filter','b2c',5,3,'MANAGER','2026-05-01T07:30:00+05:30'),
  ('aaaaaaaa-0000-0000-0000-000000000003','TECH_001',(select id from stock where name='POST CARBON Filter'),'POST CARBON Filter','Filter','b2c',3,2,'MANAGER','2026-05-03T07:00:00+05:30'),
  ('aaaaaaaa-0000-0000-0000-000000000004','TECH_002',(select id from stock where name='24V Solenoid Valve'),'24V Solenoid Valve','Valve','b2c',4,3,'MANAGER','2026-05-02T06:30:00+05:30'),
  ('aaaaaaaa-0000-0000-0000-000000000005','TECH_003',(select id from stock where name='250 SPUN Filter'),'250 SPUN Filter','Filter','b2c',4,4,'MANAGER','2026-05-04T07:00:00+05:30'),
  ('aaaaaaaa-0000-0000-0000-000000000003','TECH_001',(select id from stock where name='24V Solenoid Valve'),'24V Solenoid Valve','Valve','b2c',3,2,'MANAGER','2026-05-06T07:30:00+05:30'),
  ('aaaaaaaa-0000-0000-0000-000000000004','TECH_002',(select id from stock where name='POST CARBON Filter'),'POST CARBON Filter','Filter','b2c',2,1,'MANAGER','2026-05-07T06:00:00+05:30');

insert into bag_stock_log (bag_stock_id, technician_id, technician_name, stock_id, stock_name, qty_used, note, used_by, used_at) values
  ((select id from bag_stock where technician_id='aaaaaaaa-0000-0000-0000-000000000003' and stock_name='250 SPUN Filter' order by dispatched_at desc limit 1),'aaaaaaaa-0000-0000-0000-000000000003','TECH_001',(select id from stock where name='250 SPUN Filter'),'250 SPUN Filter',1,'Used in Ravi Kumar service','TECH_001','2026-05-01T11:00:00+05:30'),
  ((select id from bag_stock where technician_id='aaaaaaaa-0000-0000-0000-000000000003' and stock_name='POST CARBON Filter' order by dispatched_at desc limit 1),'aaaaaaaa-0000-0000-0000-000000000003','TECH_001',(select id from stock where name='POST CARBON Filter'),'POST CARBON Filter',1,'Used in Priya service','TECH_001','2026-05-03T10:15:00+05:30'),
  ((select id from bag_stock where technician_id='aaaaaaaa-0000-0000-0000-000000000004' and stock_name='24V Solenoid Valve' order by dispatched_at desc limit 1),'aaaaaaaa-0000-0000-0000-000000000004','TECH_002',(select id from stock where name='24V Solenoid Valve'),'24V Solenoid Valve',1,'Used in Murugan service','TECH_002','2026-05-02T13:30:00+05:30'),
  ((select id from bag_stock where technician_id='aaaaaaaa-0000-0000-0000-000000000005' and stock_name='250 SPUN Filter' order by dispatched_at desc limit 1),'aaaaaaaa-0000-0000-0000-000000000005','TECH_003',(select id from stock where name='250 SPUN Filter'),'250 SPUN Filter',0,'Stocked at bag','TECH_003','2026-05-04T07:00:00+05:30'),
  ((select id from bag_stock where technician_id='aaaaaaaa-0000-0000-0000-000000000003' and stock_name='24V Solenoid Valve' order by dispatched_at desc limit 1),'aaaaaaaa-0000-0000-0000-000000000003','TECH_001',(select id from stock where name='24V Solenoid Valve'),'24V Solenoid Valve',1,'Used in spare work','TECH_001','2026-05-06T14:00:00+05:30'),
  ((select id from bag_stock where technician_id='aaaaaaaa-0000-0000-0000-000000000004' and stock_name='POST CARBON Filter' order by dispatched_at desc limit 1),'aaaaaaaa-0000-0000-0000-000000000004','TECH_002',(select id from stock where name='POST CARBON Filter'),'POST CARBON Filter',1,'Emergency use','TECH_002','2026-05-07T11:30:00+05:30');

insert into update_log (by_name, by_role, category, description, logged_at) values
  ('ADMIN','admin','stock','Received +10 units of 250 SPUN Filter from supplier','2026-05-06T10:00:00+05:30'),
  ('MANAGER','manager','customer','New customer registered: Anjali Residence','2026-05-06T11:15:00+05:30'),
  ('TECH_001','technician','job','Service completed at Ravi Kumar - General Service','2026-05-01T11:00:00+05:30'),
  ('TECH_002','technician','job','Service completed at Murugan Industries - Membrane Replacement','2026-05-02T13:30:00+05:30'),
  ('MANAGER','manager','stock','Updated price: 250 SPUN Filter ₹25 → ₹30','2026-05-05T09:30:00+05:30'),
  ('ADMIN','admin','purifier','Added purifier for TechWater Solutions - Serial: SOL100-001-2025','2026-05-07T14:00:00+05:30'),
  ('TECH_003','technician','service','Service completed at Sriram Hospital - Pump Service','2026-05-04T12:45:00+05:30');

insert into call_enquiries (phone, location, product_type, inquiry_type, status, notes, created_at) values
  ('9333333333','Zone A','RO Purifier','service','completed','Service call booked','2026-05-03T08:00:00+05:30'),
  ('9444444444','Zone C','Commercial RO','new_connection','completed','New system installation','2026-05-04T09:00:00+05:30'),
  ('9555555555','Zone B','KENT UP','service_call','pending','Filter replacement inquiry','2026-05-07T10:30:00+05:30'),
  ('9888888888','Zone A','Water Softener','new_connection','pending','Inquiry for home','2026-05-08T11:00:00+05:30'),
  ('9999999999','Zone C','Solar RO','service','pending','Maintenance call','2026-05-08T12:30:00+05:30'),
  ('9101010101','Zone B','Aquaguard','service_call','pending','Urgent repair','2026-05-08T14:00:00+05:30'),
  ('9111111112','Zone A','Commercial RO','new_connection','pending','Bulk inquiry','2026-05-08T15:30:00+05:30');

insert into online_orders (order_number, order_date, stock_id, stock_name, business, quantity_ordered, customer_name, platform, order_price, status, created_by) values
  ('ORD001','2026-05-01',(select id from stock where name='250 SPUN Filter'),'250 SPUN Filter','b2c',2,'Online Customer','Direct',60,'completed','MANAGER'),
  ('ORD002','2026-05-02',(select id from stock where name='POST CARBON Filter'),'POST CARBON Filter','b2c',1,'Online Customer','Flipkart',150,'completed','ADMIN'),
  ('ORD003','2026-05-03',(select id from stock where name='Commercial RO 500 LPH'),'Commercial RO 500 LPH','b2b',1,'Tech Corp','Amazon',38000,'completed','MANAGER'),
  ('ORD004','2026-05-04',(select id from stock where name='Solar Panel 250W'),'Solar Panel 250W','b2b',2,'GreenEnergy Co','Direct',20000,'completed','ADMIN'),
  ('ORD005','2026-05-06',(select id from stock where name='24V Solenoid Valve'),'24V Solenoid Valve','b2c',3,'Online Customer','Direct',750,'pending','MANAGER'),
  ('ORD006','2026-05-07',(select id from stock where name='250 SPUN Filter'),'250 SPUN Filter','b2c',5,'Bulk Buyer','Flipkart',150,'pending','ADMIN');

create table if not exists job_pauses (
  id uuid primary key default uuid_generate_v4(),
  job_id uuid references jobs(id) on delete cascade,
  reason text check (reason in ('break','waiting_for_parts','emergency_another_customer','other')),
  paused_at timestamptz default now(),
  resumed_at timestamptz,
  notes text default '',
  created_at timestamptz default now()
);

insert into job_pauses (job_id, reason, paused_at, resumed_at, notes) values
  ((select id from jobs where customer_name='Ravi Kumar' and status='completed' order by created_at asc limit 1),'break','2026-05-01T10:00:00+05:30','2026-05-01T10:15:00+05:30','Lunch break'),
  ((select id from jobs where customer_name='Murugan Industries' and status='completed' order by created_at asc limit 1),'waiting_for_parts','2026-05-02T11:00:00+05:30','2026-05-02T11:45:00+05:30','Waiting for membrane delivery');

-- Insert purifier models
insert into purifier_models (name) values
  ('KENT RO Water Purifier'),
  ('Dolphin DX3'),
  ('CR-500'),
  ('Aquaguard AU55'),
  ('CR-1000'),
  ('SOLAR-100');

-- Function to update customer last_service_date when a service call is created
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

-- Trigger to automatically update customer last_service_date
drop trigger if exists trigger_update_customer_last_service on public.service_calls;
create trigger trigger_update_customer_last_service
after insert on public.service_calls
for each row
execute function update_customer_last_service();

-- Function to update call_enquiry updated_at timestamp
create or replace function update_call_enquiry_timestamp()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Trigger for call_enquiries
drop trigger if exists trigger_update_call_enquiry_timestamp on public.call_enquiries;
create trigger trigger_update_call_enquiry_timestamp
before update on public.call_enquiries
for each row
execute function update_call_enquiry_timestamp();

-- Disable RLS on all tables
alter table app_users disable row level security;
alter table customers disable row level security;
alter table purifiers disable row level security;
alter table purifier_models disable row level security;
alter table service_calls disable row level security;
alter table jobs disable row level security;
alter table job_time_log disable row level security;
alter table job_pauses disable row level security;
alter table stock disable row level security;
alter table stock_movements disable row level security;
alter table products disable row level security;
alter table zones disable row level security;
alter table zone_technicians disable row level security;
alter table bag_stock disable row level security;
alter table bag_stock_log disable row level security;
alter table online_orders disable row level security;
alter table call_enquiries disable row level security;
alter table update_log disable row level security;
alter table app_settings disable row level security;
alter table kpi_staff_scores disable row level security;
alter table kpi_company_scores disable row level security;
alter table entrepreneur_kpi_criteria disable row level security;
alter table entrepreneur_kpi_scores disable row level security;
alter table extra_hours_requests disable row level security;

-- Check current business_type values
SELECT business_type, COUNT(*) FROM customers GROUP BY business_type;

-- Update all customers to B2C (if needed)
UPDATE customers SET business_type = 'b2c' WHERE business_type IS NULL OR business_type = '';
