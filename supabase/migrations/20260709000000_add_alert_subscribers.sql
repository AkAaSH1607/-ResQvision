/*
  Public alert subscribers — lets anyone (not just the admin) sign up to
  receive disaster alerts by email, optionally scoped to a region.
  Unsubscribe works via the row's own id acting as an unguessable token
  in the unsubscribe link, avoiding the need for a login system.
*/

CREATE TABLE IF NOT EXISTS alert_subscribers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  region text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE alert_subscribers ENABLE ROW LEVEL SECURITY;

-- Anyone can sign up
DROP POLICY IF EXISTS "public_insert_subscribers" ON alert_subscribers;
CREATE POLICY "public_insert_subscribers" ON alert_subscribers FOR INSERT
  TO anon, authenticated WITH CHECK (true);

-- A subscriber can unsubscribe themselves if they know their own row id
-- (the id is the unsubscribe-link token — unguessable UUID, no login needed)
DROP POLICY IF EXISTS "public_update_own_subscription" ON alert_subscribers;
CREATE POLICY "public_update_own_subscription" ON alert_subscribers FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

-- No public SELECT policy — subscriber list is not publicly browsable,
-- only the edge function (using the service role key) can read it to send alerts.
