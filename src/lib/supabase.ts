import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

const supabaseKey = supabasePublishableKey || supabaseAnonKey

if (!supabaseUrl || !supabaseKey) {
  throw new Error('缺少 Supabase 环境变量：请在 .env 中配置 VITE_SUPABASE_URL 和 VITE_SUPABASE_PUBLISHABLE_KEY（或 VITE_SUPABASE_ANON_KEY）')
}

export const supabase = createClient(supabaseUrl, supabaseKey)