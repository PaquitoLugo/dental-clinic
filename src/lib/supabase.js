import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://eckmyiojowmystqshmxa.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVja215aW9qb3dteXN0cXNobXhhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MjEzMjgxNCwiZXhwIjoyMTA3NzA4ODE0fQ.8Gpkd6ffgpIymLFf8qBp8XjLhqWfYHGnk2gRtZ2719k'; // Click the 'Copy' button next to 'anon public' to get the full key

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);