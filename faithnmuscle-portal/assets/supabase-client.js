import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL  = 'https://omvsxvkwbufskkowqhlr.supabase.co';
const SUPABASE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9tdnN4dmt3YnVmc2trb3dxaGxyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyNTI2MjMsImV4cCI6MjA5MTgyODYyM30.HS5YKPWCf8omfWTu-Fe2sK_lP9jxkzwePl5mwjCn0JE';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    flowType: 'implicit',  // hash-based tokens work across all browsers/devices
  },
});
