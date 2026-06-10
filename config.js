// ============================================================
// MAGS — Configurazione
// ============================================================
// La anon key è pubblica per design: la protezione vera sono
// le RLS sul database. Non mettere MAI qui la service_role key.

const MAGS_CONFIG = {
  SUPABASE_URL: 'https://ypssurssgkguswjfbgft.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlwc3N1cnNzZ2tndXN3amZiZ2Z0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1Nzg0MjEsImV4cCI6MjA5NTE1NDQyMX0.bJthzXfacMmEr6ekbWSUiWvy-XU2_5GPeV5-KqQdu9o',

  // Schema dedicato a MAGS (convive con Giada in public)
  DB_SCHEMA: 'mags_app',

  // Colori di default proposti per i membri al primo setup
  MEMBER_COLORS: ['#5b6cff', '#ff5e9c', '#ffaa3c', '#22b8a6', '#9d7bff', '#ff7a4f'],

  APP_VERSION: '0.1.0',
};
