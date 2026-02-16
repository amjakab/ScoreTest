-- Create the federal_funds_rate table
CREATE TABLE IF NOT EXISTS public.federal_funds_rate (
  id INTEGER PRIMARY KEY,
  rate NUMERIC(4,1) NOT NULL DEFAULT 2.0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Insert initial row with default rate
INSERT INTO public.federal_funds_rate (id, rate, updated_at)
VALUES (1, 2.0, NOW())
ON CONFLICT (id) DO NOTHING;

-- Enable Row Level Security
ALTER TABLE public.federal_funds_rate ENABLE ROW LEVEL SECURITY;

-- Create policy to allow everyone to read the rate
CREATE POLICY "Anyone can read federal funds rate"
  ON public.federal_funds_rate
  FOR SELECT
  USING (true);

-- Create policy to allow updates (for the daily rate generation)
CREATE POLICY "Anyone can update federal funds rate"
  ON public.federal_funds_rate
  FOR UPDATE
  USING (true);

-- Add comment to table
COMMENT ON TABLE public.federal_funds_rate IS 'Stores the current Brady Point Federal Funds Rate - updated daily with probability-based generation';
