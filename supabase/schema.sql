-- ============================================================
-- RO INVENTORY SYSTEM — FULL SCHEMA v2
-- Run entire file in Supabase SQL Editor
-- ============================================================
create extension if not exists "uuid-ossp";

-- Drop all tables safely
drop table if exists entrepreneur_kpi_scores  cascade;
drop table if exists entrepreneur_kpi_criteria cascade;
drop table if exists kpi_company_scores       cascade;
drop table if exists kpi_staff_scores         cascade;
drop table if exists extra_hours_requests     cascade;
drop table if exists job_time_log             cascade;
drop table if exists bag_stock_log            cascade;
drop table if exists bag_stock                cascade;
drop table if exists online_orders            cascade;
drop table if exists service_calls            cascade;
drop table if exists purifiers                cascade;
drop table if exists customers                cascade;
drop table if exists jobs                     cascade;
drop table if exists zone_technicians         cascade;
drop table if exists zones                    cascade;
drop table if exists products                 cascade;
drop table if exists stock_movements          cascade;
drop table if exists stock                    cascade;
drop table if exists update_log               cascade;
drop table if exists app_settings             cascade;
drop table if exists app_users                cascade;

-- ============================================================
-- TABLES
-- ============================================================

create table app_users (
  id         uuid primary key default uuid_generate_v4(),
  name       text not null,
  phone      text unique not null,
  password   text not null,
  role       text not null check (role in ('admin','manager','technician')),
  area       text default 'ALL',
  status     text default 'active' check (status in ('active','inactive')),
  created_at timestamptz default now()
);

create table app_settings (
  key        text primary key,
  value      text,
  updated_at timestamptz default now()
);

create table update_log (
  id          uuid primary key default uuid_generate_v4(),
  logged_at   timestamptz default now(),
  by_user_id  uuid,
  by_name     text,
  by_role     text,
  category    text,
  description text,
  extra       text default ''
);

-- stock: business = 'b2c' or 'b2b'
create table stock (
  id                  uuid primary key default uuid_generate_v4(),
  business            text not null check (business in ('b2c','b2b')),
  name                text not null,
  category            text default 'General',
  qty                 int default 0,
  min_qty             int default 5,
  landing_price       numeric(10,2) default 0,
  purchase_price      numeric(10,2) default 0,
  selling_price       numeric(10,2) default 0,
  notes               text default '',
  last_updated_by     text,
  last_updated_at     timestamptz default now(),
  created_at          timestamptz default now()
);

create table stock_movements (
  id            uuid primary key default uuid_generate_v4(),
  stock_id      uuid references stock(id) on delete cascade,
  stock_name    text,
  business      text,
  type          text check (type in ('receive','use','add','dispatch')),
  qty_change    int,
  qty_before    int,
  qty_after     int,
  selling_price numeric(10,2) default 0,
  note          text default '',
  by_name       text,
  by_role       text,
  created_at    timestamptz default now()
);

create table products (
  id          uuid primary key default uuid_generate_v4(),
  type        text not null check (type in ('b2c','b2b')),
  name        text not null,
  model       text not null,
  description text default '',
  category    text default 'General',
  price       numeric(10,2) default 0,
  image_url   text,
  created_at  timestamptz default now()
);

create table customers (
  id                uuid primary key default uuid_generate_v4(),
  name              text not null,
  mobile            text not null,
  address           text default '',
  area              text default '',
  business_type     text not null check (business_type in ('b2c','b2b')),
  source            text not null check (source in ('offline','online')) default 'offline',
  since             date,
  status            text default 'pending' check (status in ('pending','completed','rejected')),
  status_changed_at timestamptz,
  status_changed_by uuid,
  status_note       text default '',
  created_at        timestamptz default now()
);

create table purifiers (
  id                uuid primary key default uuid_generate_v4(),
  customer_id       uuid references customers(id) on delete cascade,
  model             text not null,
  serial_no         text not null,
  installed_date    date,
  last_service_date date,
  total_services    int default 4,
  interval_days     int default 90,
  done_count        int default 0,
  image_url         text,
  status            text default 'active' check (status in ('active','inactive')),
  created_at        timestamptz default now()
);

create table service_calls (
  id                uuid primary key default uuid_generate_v4(),
  customer_id       uuid references customers(id) on delete cascade,
  call_datetime     timestamptz not null,
  total_amount      numeric(10,2) default 0,
  received_amount   numeric(10,2) default 0,
  pending_amount    numeric(10,2) default 0,
  payment_mode      text default 'CASH',
  admin_note        text default '',
  status            text default 'pending' check (status in ('pending','complete')),
  completed_at      timestamptz,
  completed_by_name text,
  spares_replaced   text default '',
  assigned_to       uuid references app_users(id),
  created_at        timestamptz default now()
);

create table online_orders (
  id               uuid primary key default uuid_generate_v4(),
  order_number     text unique not null,
  order_date       date not null,
  stock_id         uuid references stock(id) on delete cascade,
  stock_name       text not null,
  business         text not null check (business in ('b2c','b2b')),
  quantity_ordered int not null,
  customer_name    text default 'Online Customer',
  status           text default 'completed' check (status in ('pending','completed','cancelled','returned')),
  platform         text default 'Direct' check (platform in ('Direct','Flipkart','Amazon','Other')),
  order_price      numeric(10,2) default 0,
  notes            text default '',
  created_by       text,
  created_at       timestamptz default now()
);

create table zones (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,
  description text default '',
  color       text default '#185FA5',
  km_from_kpm int default 0,
  created_by  text,
  created_at  timestamptz default now()
);

create table zone_technicians (
  id             uuid primary key default uuid_generate_v4(),
  zone_id        uuid references zones(id) on delete cascade,
  technician_id  uuid references app_users(id) on delete cascade,
  assigned_by    text,
  assigned_at    timestamptz default now(),
  unique(zone_id, technician_id)
);

create table jobs (
  id                    uuid primary key default uuid_generate_v4(),
  customer_name         text not null,
  customer_location     text,
  zone_id               uuid references zones(id),
  assigned_to           uuid references app_users(id),
  assigned_to_name      text,
  service_type          text,
  working_hours_allowed numeric(4,1) default 2,
  long_distance         boolean default false,
  extra_hours_approved  numeric(4,1) default 0,
  status                text default 'pending'
    check (status in ('pending','active','extra_hrs_requested','completed','flagged')),
  notes                 text default '',
  created_by            text,
  created_at            timestamptz default now(),
  start_time            timestamptz,
  travel_start_time     timestamptz,
  travel_end_time       timestamptz,
  end_time              timestamptz,
  total_duration_minutes int,
  travel_duration_minutes int
);

create table job_time_log (
  id          uuid primary key default uuid_generate_v4(),
  job_id      uuid references jobs(id) on delete cascade,
  event       text,
  event_time  timestamptz default now(),
  by_name     text,
  by_role     text,
  notes       text default ''
);

create table extra_hours_requests (
  id                   uuid primary key default uuid_generate_v4(),
  job_id               uuid references jobs(id) on delete cascade,
  technician_id        uuid references app_users(id),
  technician_name      text,
  reason               text default '',
  requested_at         timestamptz default now(),
  status               text default 'pending' check (status in ('pending','approved','rejected')),
  reviewed_by          text,
  reviewed_at          timestamptz,
  extra_hours_granted  numeric(4,1) default 0,
  review_notes         text default ''
);

create table bag_stock (
  id               uuid primary key default uuid_generate_v4(),
  technician_id    uuid references app_users(id),
  technician_name  text,
  stock_id         uuid references stock(id),
  stock_name       text,
  category         text,
  business         text,
  qty_dispatched   int default 0,
  remaining_qty    int default 0,
  dispatched_by    text,
  dispatched_at    timestamptz default now(),
  last_used_at     timestamptz
);

create table bag_stock_log (
  id              uuid primary key default uuid_generate_v4(),
  bag_stock_id    uuid references bag_stock(id),
  technician_id   uuid references app_users(id),
  technician_name text,
  stock_id        uuid,
  stock_name      text,
  qty_used        int,
  note            text default '',
  used_by         text,
  used_at         timestamptz default now()
);

create table kpi_staff_scores (
  id             uuid primary key default uuid_generate_v4(),
  user_id        uuid references app_users(id),
  criteria_id    int,
  criteria_name  text,
  month          int,
  year           int,
  actual_value   numeric default 0,
  points         numeric default 0,
  edited_by      text,
  updated_at     timestamptz default now(),
  unique(user_id, criteria_id, month, year)
);

create table kpi_company_scores (
  id            uuid primary key default uuid_generate_v4(),
  year          int,
  month_idx     int,
  criteria_id   int,
  criteria_name text,
  points        numeric default 0,
  edited_by     text,
  updated_at    timestamptz default now(),
  unique(year, month_idx, criteria_id)
);

create table entrepreneur_kpi_criteria (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid references app_users(id),
  name        text,
  max_points  numeric default 10,
  description text default '',
  sort_order  int default 0,
  created_at  timestamptz default now()
);

create table entrepreneur_kpi_scores (
  id           uuid primary key default uuid_generate_v4(),
  user_id      uuid references app_users(id),
  criteria_id  uuid references entrepreneur_kpi_criteria(id) on delete cascade,
  criteria_name text,
  month        int,
  year         int,
  points       numeric default 0,
  updated_at   timestamptz default now(),
  unique(user_id, criteria_id, month, year)
);

-- ============================================================
-- INDEXES
-- ============================================================
create index idx_stock_business    on stock(business);
create index idx_stock_qty         on stock(qty);
create index idx_jobs_status       on jobs(status);
create index idx_jobs_assigned     on jobs(assigned_to);
create index idx_update_log_at     on update_log(logged_at);
create index idx_bag_stock_tech    on bag_stock(technician_id);
create index idx_movements_stock   on stock_movements(stock_id);

-- ============================================================
-- SUPABASE STORAGE
-- ============================================================
insert into storage.buckets (id, name, public) values ('purifier-images','purifier-images',true) on conflict (id) do nothing;

-- ============================================================
-- USERS (fixed UUIDs)
-- ============================================================
insert into app_users (id, name, phone, password, role, area) values
  ('aaaaaaaa-0000-0000-0000-000000000001','MANAGER', '9000000001','mgr123',   'manager',    'ALL'),
  ('aaaaaaaa-0000-0000-0000-000000000002','ADMIN',   '9000000002','admin123', 'admin',      'ALL'),
  ('aaaaaaaa-0000-0000-0000-000000000003','RAVI',    '9445937023','ravi123',  'technician', 'KPM,VLC'),
  ('aaaaaaaa-0000-0000-0000-000000000004','SURESH',  '9876543210','suresh123','technician', 'ANR,RNP'),
  ('aaaaaaaa-0000-0000-0000-000000000005','PRAVEEN', '9123456780','praveen123','technician','SRP,CGP');

-- ============================================================
-- SETTINGS
-- ============================================================
insert into app_settings (key, value) values
  ('analytics_shared','false'),
  ('b2c_monthly_target','1500000'),
  ('b2b_monthly_target','3500000');

-- ============================================================
-- ZONES — Around Kanchipuram Bus Stand (~80km radius)
-- ============================================================
insert into zones (id, name, description, color, km_from_kpm, created_by) values
  ('bbbbbbbb-0000-0000-0000-000000000001','Kanchipuram Central',    'KPM town & surrounding 10km',                '#185FA5', 0,  'MANAGER'),
  ('bbbbbbbb-0000-0000-0000-000000000002','Kanchipuram Rural',      'Uthiramerur, Walajabad, Madurantakam road',  '#0F6E56', 20, 'MANAGER'),
  ('bbbbbbbb-0000-0000-0000-000000000003','Sriperumbudur Zone',     'Sriperumbudur, Oragadam industrial belt',    '#854F0B', 30, 'MANAGER'),
  ('bbbbbbbb-0000-0000-0000-000000000004','Arakkonam Zone',         'Arakkonam, Sholingur, Ranipet border',       '#534AB7', 50, 'MANAGER'),
  ('bbbbbbbb-0000-0000-0000-000000000005','Ranipet / Walajapet',    'Ranipet, Walajapet, Arcot town',             '#993C1D', 60, 'MANAGER'),
  ('bbbbbbbb-0000-0000-0000-000000000006','Chengalpattu Zone',      'Chengalpattu, Maraimalai Nagar',             '#3B6D11', 40, 'MANAGER'),
  ('bbbbbbbb-0000-0000-0000-000000000007','Guduvanchery / Tambaram','Guduvanchery, Urapakkam, Tambaram',          '#BA7517', 55, 'MANAGER'),
  ('bbbbbbbb-0000-0000-0000-000000000008','Maduranthakam Zone',     'Maduranthakam, Cheyyur, coastal area',       '#0C447C', 55, 'MANAGER'),
  ('bbbbbbbb-0000-0000-0000-000000000009','Thirukalukundram Zone',  'Thirukalukundram, Mahabalipuram road area',  '#712B13', 60, 'MANAGER'),
  ('bbbbbbbb-0000-0000-0000-000000000010','Vellore Border Zone',    'Towards Vellore — Sholingur, Arcot',         '#3C3489', 80, 'MANAGER');

-- Assign technicians to zones
insert into zone_technicians (zone_id, technician_id, assigned_by) values
  ('bbbbbbbb-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000003','MANAGER'),
  ('bbbbbbbb-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000004','MANAGER'),
  ('bbbbbbbb-0000-0000-0000-000000000002','aaaaaaaa-0000-0000-0000-000000000003','MANAGER'),
  ('bbbbbbbb-0000-0000-0000-000000000003','aaaaaaaa-0000-0000-0000-000000000005','MANAGER'),
  ('bbbbbbbb-0000-0000-0000-000000000004','aaaaaaaa-0000-0000-0000-000000000004','MANAGER'),
  ('bbbbbbbb-0000-0000-0000-000000000006','aaaaaaaa-0000-0000-0000-000000000005','MANAGER'),
  ('bbbbbbbb-0000-0000-0000-000000000007','aaaaaaaa-0000-0000-0000-000000000003','MANAGER');

-- ============================================================
-- B2C STOCK — RO Spare Parts (25 items)
-- ============================================================
insert into stock (business, name, category, qty, min_qty, landing_price, purchase_price, selling_price, last_updated_by) values
  ('b2c','250 SPUN Filter',       'Filter',         7,  5,  12,  15,  30, 'MANAGER'),
  ('b2c','350 SPUN Filter',       'Filter',         0,  3,  14,  18,  35, 'MANAGER'),
  ('b2c','Aquaguard SPUN',        'Filter',        14,  5,  16,  20,  40, 'MANAGER'),
  ('b2c','POST CARBON Filter',    'Filter',         0,  5,  70,  80, 150, 'MANAGER'),
  ('b2c','PRE CARBON Filter',     'Filter',         0,  5,  60,  70, 140, 'MANAGER'),
  ('b2c','SEDIMENT Filter',       'Filter',        15,  5,  20,  25,  50, 'MANAGER'),
  ('b2c','CTO Filter',            'Filter',        19,  5,  80,  90, 180, 'MANAGER'),
  ('b2c','24V Solenoid Valve',    'Valve',          9,  5, 100, 120, 250, 'MANAGER'),
  ('b2c','25 LPH Solenoid Valve', 'Valve',         12,  5, 130, 150, 300, 'MANAGER'),
  ('b2c','KENT Tap',              'Tap',            4, 10,  30,  40,  80, 'MANAGER'),
  ('b2c','Dolphin Tap',           'Tap',            3,  5,  28,  35,  70, 'MANAGER'),
  ('b2c','100 GPD Pump',          'Pump',           2,  3, 700, 800,1500, 'MANAGER'),
  ('b2c','75 GPD Membrane',       'Membrane',       0,  3, 450, 500,1000, 'MANAGER'),
  ('b2c','Membrane Housing',      'Housing',       36,  5, 130, 150, 300, 'MANAGER'),
  ('b2c','1/4 FTA Fitting',       'Fitting',       26,  5,   6,   8,  15, 'MANAGER'),
  ('b2c','3/8 FTA Fitting',       'Fitting',       50,  5,   8,  10,  20, 'MANAGER'),
  ('b2c','1/4 FHL Connector',     'Fitting',      156, 20,   4,   5,  10, 'MANAGER'),
  ('b2c','FR 300 Flow Restrictor','Flow Restrictor',35, 5,  38,  45,  90, 'MANAGER'),
  ('b2c','UV Lamp',               'Electrical',     2,  3, 170, 200, 400, 'MANAGER'),
  ('b2c','Alkaline Filter',       'Filter',         0,  2, 270, 300, 600, 'MANAGER'),
  ('b2c','AS Balls',              'Other',         18, 10,   4,   5,  10, 'MANAGER'),
  ('b2c','C Clamp',               'Other',         75, 10,   8,  10,  20, 'MANAGER'),
  ('b2c','1.5A Adapter',          'Electrical',    38,  5,  90, 110, 220, 'MANAGER'),
  ('b2c','KENT Float',            'Other',          8,  3,  45,  55, 100, 'MANAGER'),
  ('b2c','Mineral Cartridge',     'Filter',         1,  2, 170, 200, 400, 'MANAGER');

-- ============================================================
-- B2B STOCK — Commercial Products (20 items)
-- ============================================================
insert into stock (business, name, category, qty, min_qty, landing_price, purchase_price, selling_price, last_updated_by) values
  ('b2b','Commercial RO 250 LPH',   'Commercial RO',  3, 1,12000,14000,22000,'MANAGER'),
  ('b2b','Commercial RO 500 LPH',   'Commercial RO',  2, 1,20000,23000,38000,'MANAGER'),
  ('b2b','Commercial RO 1000 LPH',  'Commercial RO',  1, 1,35000,40000,65000,'MANAGER'),
  ('b2b','Solar Panel 100W',         'Solar',          8, 2, 2800, 3200, 5500,'MANAGER'),
  ('b2b','Solar Panel 250W',         'Solar',          5, 2, 5500, 6200,10000,'MANAGER'),
  ('b2b','Solar RO System 25 LPH',   'Solar RO',       2, 1,18000,20000,32000,'MANAGER'),
  ('b2b','Water Softener 100 LPH',   'Softener',       3, 1, 8000, 9500,16000,'MANAGER'),
  ('b2b','Water Softener 250 LPH',   'Softener',       2, 1,14000,16000,26000,'MANAGER'),
  ('b2b','Industrial Pump 0.5 HP',   'Pump',           4, 2, 2200, 2600, 4500,'MANAGER'),
  ('b2b','Industrial Pump 1 HP',     'Pump',           3, 1, 3800, 4400, 7500,'MANAGER'),
  ('b2b','RO Membrane 4040',         'Membrane',       6, 2, 3500, 4000, 7000,'MANAGER'),
  ('b2b','RO Membrane 8040',         'Membrane',       2, 1, 9000,10500,18000,'MANAGER'),
  ('b2b','Antiscalant Chemical 5L',  'Chemical',      10, 3,  800,  950, 1800,'MANAGER'),
  ('b2b','Resin Softener 25kg',      'Chemical',       5, 2, 1800, 2100, 3800,'MANAGER'),
  ('b2b','Sand Filter Media 50kg',   'Filter Media',   4, 2, 1200, 1400, 2500,'MANAGER'),
  ('b2b','Activated Carbon 50kg',    'Filter Media',   3, 1, 1500, 1800, 3200,'MANAGER'),
  ('b2b','Flow Meter Industrial',    'Meter',          5, 2, 1200, 1400, 2600,'MANAGER'),
  ('b2b','TDS Controller',           'Electronic',    12, 3,  600,  720, 1400,'MANAGER'),
  ('b2b','Dosing Pump',              'Pump',           4, 2, 3200, 3700, 6500,'MANAGER'),
  ('b2b','UV System 10 LPM',         'UV',             3, 1, 4500, 5200, 9000,'MANAGER');

-- ============================================================
-- B2C PRODUCTS — Retail Items
-- ============================================================
insert into products (type, name, model, description, category, price) values
  ('b2c','KENT RO Water Purifier','KENT UP', 'Standard wall-mounted RO purifier', 'Water Purifier', 12500),
  ('b2c','Dolphin RO Water Purifier','DX3', 'Compact RO system for homes', 'Water Purifier', 9800),
  ('b2c','Aquaguard RO System','AU55', 'Advanced RO with UV and TDS display', 'Water Purifier', 14999),
  ('b2c','RO Spare Parts Kit','BASIC-KIT', 'Complete filter set for 1 year maintenance', 'Maintenance Kit', 2500),
  ('b2c','Membrane Replacement','75GPD-MEM', 'Original brand membrane for upgrade', 'Spare Parts', 1200),
  ('b2c','Water Softener Cartridge','SOFT-25', 'Removes hard water minerals', 'Spare Parts', 1800),
  ('b2c','Installation Service','INST-SVC', 'Professional installation with pipe fitting', 'Service', 500),
  ('b2c','Annual Maintenance Plan','AMP-BC', 'Includes 2 service calls + parts replacement', 'Service Plan', 1500),
  ('b2c','UV Lamp Replacement','UV-15W', 'Bacteria-killing UV lamp', 'Spare Parts', 450),
  ('b2c','Water Purifier Filter Combo','3-COMBO', 'Sediment + Carbon + RO membrane bundle', 'Filter Pack', 3500);

-- ============================================================
-- B2B PRODUCTS — Commercial Solutions
-- ============================================================
insert into products (type, name, model, description, category, price) values
  ('b2b','Commercial RO System 500 LPH','CR-500', 'For offices, schools, hospitals (500 L/hour)', 'Commercial RO', 35000),
  ('b2b','Commercial RO System 1000 LPH','CR-1000', 'High capacity for factories, farms (1000 L/hour)', 'Commercial RO', 65000),
  ('b2b','Industrial Water Softener 500 LPH','SOFT-500', 'Removes hardness for industrial use', 'Softener', 28000),
  ('b2b','Solar RO System 100 LPH','SOLAR-100', 'Off-grid solar powered water purification', 'Solar RO', 55000),
  ('b2b','Water Vending Machine','VEND-PRO', 'Automated coin/card operated water dispenser', 'Vending', 95000),
  ('b2b','Mineral Water Plant Starter Kit','MWP-KIT', 'Complete system to start mineral water business', 'Business Kit', 145000),
  ('b2b','Bulk RO Membrane 4040','MEM-4040', 'Commercial grade membrane (pack of 5)', 'Membrane', 32000),
  ('b2b','Industrial Pump 2 HP','PUMP-2HP', 'Heavy duty pump for continuous operation', 'Pump', 12500),
  ('b2b','Water Tank 1000L Stainless','TANK-1K', 'Food-grade stainless storage tank', 'Tank', 18000),
  ('b2b','Maintenance Subscription B2B','MAINT-PRO', 'Quarterly visits + parts + emergency support', 'Service Plan', 5000),
  ('b2b','RO System Upgrade Package','UPGRADE-PRO', 'Upgrade old system to advanced technology', 'Service', 15000),
  ('b2b','Antiscalant & Chemicals Bundle','CHEM-BULK', '5L antiscalant + test kit + documentation', 'Chemicals', 2200);

-- ============================================================
-- JOBS (10 demo jobs)
-- ============================================================
insert into jobs (customer_name, customer_location, zone_id, assigned_to, assigned_to_name, service_type, working_hours_allowed, status, long_distance, created_by, start_time, end_time, total_duration_minutes) values
  ('Rajan Textiles','Near KPM Bus Stand','bbbbbbbb-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000003','RAVI','General Service',2,'completed',false,'ADMIN','2026-03-10T09:00:00+05:30','2026-03-10T10:45:00+05:30',105),
  ('Murugan Steel','Sriperumbudur SIPCOT','bbbbbbbb-0000-0000-0000-000000000003','aaaaaaaa-0000-0000-0000-000000000005','PRAVEEN','Membrane Replacement',3,'completed',true,'ADMIN','2026-03-11T10:00:00+05:30','2026-03-11T13:20:00+05:30',200),
  ('Lakshmi Hospital','Chengalpattu main road','bbbbbbbb-0000-0000-0000-000000000006','aaaaaaaa-0000-0000-0000-000000000005','PRAVEEN','New Installation',4,'completed',true,'MANAGER','2026-03-12T08:30:00+05:30','2026-03-12T13:00:00+05:30',270),
  ('PMKVY Office','Arakkonam','bbbbbbbb-0000-0000-0000-000000000004','aaaaaaaa-0000-0000-0000-000000000004','SURESH','Pump Service',2,'completed',false,'ADMIN','2026-03-13T09:30:00+05:30','2026-03-13T11:10:00+05:30',100),
  ('Selvam Residency','Ranipet','bbbbbbbb-0000-0000-0000-000000000005','aaaaaaaa-0000-0000-0000-000000000004','SURESH','Breakdown',2,'completed',true,'ADMIN','2026-03-14T08:00:00+05:30','2026-03-14T10:30:00+05:30',150),
  ('GreenTech Farm','Guduvanchery','bbbbbbbb-0000-0000-0000-000000000007','aaaaaaaa-0000-0000-0000-000000000003','RAVI','Inline Set',2,'completed',false,'ADMIN','2026-03-15T10:00:00+05:30','2026-03-15T11:45:00+05:30',105),
  ('KPM Nagar Flat','Kanchipuram Central','bbbbbbbb-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000003','RAVI','General Service',2,'active',false,'ADMIN','2026-03-21T09:00:00+05:30',null,null),
  ('Valliammal School','Maduranthakam','bbbbbbbb-0000-0000-0000-000000000008','aaaaaaaa-0000-0000-0000-000000000004','SURESH','Old Unit Exchange',3,'pending',true,'MANAGER',null,null,null),
  ('Coastal Resort','Thirukalukundram','bbbbbbbb-0000-0000-0000-000000000009','aaaaaaaa-0000-0000-0000-000000000005','PRAVEEN','New Installation',4,'pending',true,'MANAGER',null,null,null),
  ('Venkatesh Industries','Sriperumbudur','bbbbbbbb-0000-0000-0000-000000000003','aaaaaaaa-0000-0000-0000-000000000003','RAVI','Miscellaneous',2,'pending',false,'ADMIN',null,null,null);

-- ============================================================
-- UPDATE LOG (sample entries)
-- ============================================================
insert into update_log (by_name, by_role, category, description, logged_at) values
  ('ADMIN',  'admin',   'stock', 'Received +10 units of 250 SPUN Filter',              '2026-03-10T10:00:00+05:30'),
  ('MANAGER','manager', 'stock', '75 GPD Membrane PP updated: ₹420 → ₹500',            '2026-03-11T11:00:00+05:30'),
  ('ADMIN',  'admin',   'job',   'Job assigned to RAVI — General Service at KPM Nagar', '2026-03-21T08:30:00+05:30'),
  ('RAVI',   'technician','job', 'Job accepted — KPM Nagar Flat General Service',       '2026-03-21T09:00:00+05:30'),
  ('MANAGER','manager', 'zone',  'New zone created: Vellore Border Zone',               '2026-03-05T10:00:00+05:30');

-- ============================================================
-- DONE
-- ============================================================
