CREATE TABLE public.reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tracking_code text UNIQUE,
  reporter_name text,
  reporter_phone text,
  photo_url text,
  video_url text,
  text_description text,
  transcript text,
  location text,
  category text,
  severity_score integer,
  confidence_score double precision,
  duplicate_of uuid REFERENCES public.reports(id),
  model_name text,
  gpu_type text,
  latency_ms integer,
  status text DEFAULT 'reported',
  created_at timestamptz DEFAULT now()
);

GRANT SELECT ON public.reports TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reports TO authenticated;
GRANT ALL ON public.reports TO service_role;

ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Reports are publicly readable"
  ON public.reports FOR SELECT TO anon, authenticated USING (true);

CREATE OR REPLACE FUNCTION public.assign_tracking_code()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  next_num integer;
BEGIN
  IF NEW.tracking_code IS NULL THEN
    SELECT COALESCE(MAX(NULLIF(regexp_replace(tracking_code, '\D', '', 'g'), '')::bigint % 10000, 0)) + 1
      INTO next_num
      FROM public.reports
      WHERE tracking_code LIKE 'CFX-%';
    NEW.tracking_code := 'CFX-2026-' || lpad(next_num::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER reports_tracking_code
  BEFORE INSERT ON public.reports
  FOR EACH ROW EXECUTE FUNCTION public.assign_tracking_code();

CREATE INDEX reports_severity_idx ON public.reports (severity_score DESC);
CREATE INDEX reports_duplicate_of_idx ON public.reports (duplicate_of);
