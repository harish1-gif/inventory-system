import { format } from 'date-fns'
import { supabase } from './supabase'

export const fmt12  = d => { if (!d) return '—'; try { return format(new Date(d),'dd MMM yy  hh:mm a') } catch { return '—' } }
export const fmtD   = d => { if (!d) return '—'; try { return format(new Date(d),'dd MMM yy') } catch { return '—' } }
export const fmtM   = n => '₹' + Number(Math.round(Number(n)||0)).toLocaleString('en-IN')
export const fmtNum = n => Number(Math.round(Number(n)||0)).toLocaleString('en-IN')

export const CAT_COLORS = {
  stock:'#185FA5', bagstock:'#854F0B', job:'#3B6D11',
  kpi:'#534AB7', zone:'#0F6E56', settings:'#5F5E5A', customer:'#993C1D'
}
export const CAT_LABELS = {
  stock:'Stock', bagstock:'Bag Stock', job:'Job',
  kpi:'KPI', zone:'Zone', settings:'Settings', customer:'Customer'
}

/** Write a permanent log entry to update_log */
export async function logAction(user, category, description, extra = '') {
  await supabase.from('update_log').insert({
    by_name: user.name, by_role: user.role, by_user_id: user.id,
    category, description, extra, logged_at: new Date().toISOString(),
  })
}

export const BUSINESS_LABEL = { b2c: 'B2C', b2b: 'B2B' }
export const BUSINESS_TARGET = { b2c: 1500000, b2b: 3500000 }

export const SERVICE_TYPES = [
  'General Service','Inline Set','Membrane Replacement',
  'Pump Service','Breakdown','New Installation','Old Unit Exchange','Miscellaneous'
]
