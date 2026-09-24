ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS text_size TEXT NOT NULL DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS display_density TEXT NOT NULL DEFAULT 'comfortable',
  ADD COLUMN IF NOT EXISTS use_device_text_size BOOLEAN NOT NULL DEFAULT true;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_preferences_text_size_check') THEN
    ALTER TABLE public.user_preferences
      ADD CONSTRAINT user_preferences_text_size_check CHECK (text_size IN ('standard','large','xlarge'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_preferences_display_density_check') THEN
    ALTER TABLE public.user_preferences
      ADD CONSTRAINT user_preferences_display_density_check CHECK (display_density IN ('compact','comfortable','spacious'));
  END IF;
END $$;
