CREATE OR REPLACE FUNCTION public.assign_tracking_code()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  next_num integer;
BEGIN
  IF NEW.tracking_code IS NULL THEN
    SELECT COALESCE(MAX(right(tracking_code, 4)::integer), 0) + 1
      INTO next_num
      FROM public.reports
      WHERE tracking_code ~ '^CFX-[0-9]{4}-[0-9]{4}$';
    NEW.tracking_code := 'CFX-2026-' || lpad(next_num::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;
