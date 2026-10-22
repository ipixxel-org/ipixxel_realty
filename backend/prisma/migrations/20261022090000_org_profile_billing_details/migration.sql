-- Billing details now come from the organisation profile (Settings → General).
-- Data only, no schema change. Safe to run more than once.
--
-- 1. organisations.state was free text; it is now a 2-digit GST state code.
--    Names and common spellings / abbreviations are matched case- and
--    spacing-insensitively ("Karnataka", " karnataka ", "KA" → '29').
--    Anything that doesn't match is cleared, so the org is asked to pick one.
-- 2. Orgs with a billing.billing_profiles row get its values copied into the
--    profile fields that are still empty (never overwriting a filled one),
--    GSTIN included. Its legal name isn't copied: invoices use the
--    organisation name. billing_profiles itself is kept (deprecated, unused).

DO $$
DECLARE
  n_matched   integer := 0;
  n_cleared   integer := 0;
  n_backfill  integer := 0;
BEGIN
  IF to_regclass('identity.organisations') IS NULL THEN
    RETURN;
  END IF;

  DROP TABLE IF EXISTS pg_temp._gst_state_alias;
  CREATE TEMP TABLE _gst_state_alias (k text PRIMARY KEY, code text NOT NULL) ON COMMIT DROP;
  INSERT INTO _gst_state_alias (k, code) VALUES
    -- names (normalised: lower case, "&" → "and", letters/digits only)
    ('jammuandkashmir','01'),('himachalpradesh','02'),('punjab','03'),('chandigarh','04'),
    ('uttarakhand','05'),('haryana','06'),('delhi','07'),('rajasthan','08'),('uttarpradesh','09'),
    ('bihar','10'),('sikkim','11'),('arunachalpradesh','12'),('nagaland','13'),('manipur','14'),
    ('mizoram','15'),('tripura','16'),('meghalaya','17'),('assam','18'),('westbengal','19'),
    ('jharkhand','20'),('odisha','21'),('chhattisgarh','22'),('madhyapradesh','23'),('gujarat','24'),
    ('dadraandnagarhavelianddamananddiu','26'),('maharashtra','27'),('karnataka','29'),('goa','30'),
    ('lakshadweep','31'),('kerala','32'),('tamilnadu','33'),('puducherry','34'),
    ('andamanandnicobarislands','35'),('telangana','36'),('andhrapradesh','37'),('ladakh','38'),
    ('otherterritory','97'),
    -- common spellings
    ('newdelhi','07'),('nctofdelhi','07'),('nationalcapitalterritoryofdelhi','07'),('delhincr','07'),
    ('orissa','21'),('pondicherry','34'),('uttaranchal','05'),('chattisgarh','22'),('chhatisgarh','22'),
    ('telengana','36'),('andamanandnicobar','35'),('damananddiu','26'),('dadraandnagarhaveli','26'),
    ('jandk','01'),('tamilnaadu','33'),('bengal','19'),
    -- abbreviations (vehicle / postal codes)
    ('jk','01'),('hp','02'),('pb','03'),('ch','04'),('uk','05'),('ut','05'),('hr','06'),('dl','07'),
    ('rj','08'),('up','09'),('br','10'),('sk','11'),('ar','12'),('nl','13'),('mn','14'),('mz','15'),
    ('tr','16'),('ml','17'),('as','18'),('wb','19'),('jh','20'),('od','21'),('or','21'),('cg','22'),
    ('ct','22'),('mp','23'),('gj','24'),('dd','26'),('dn','26'),('mh','27'),('ka','29'),('ga','30'),
    ('ld','31'),('kl','32'),('tn','33'),('py','34'),('an','35'),('ts','36'),('tg','36'),('ap','37'),
    ('la','38');
  -- The codes themselves ('29', and '9' for '09').
  INSERT INTO _gst_state_alias (k, code)
    SELECT DISTINCT code, code FROM _gst_state_alias
    ON CONFLICT (k) DO NOTHING;
  INSERT INTO _gst_state_alias (k, code)
    SELECT ltrim(code, '0'), code FROM _gst_state_alias WHERE code LIKE '0%' AND k = code
    ON CONFLICT (k) DO NOTHING;

  -- 1a. Free text → code.
  UPDATE identity.organisations o
     SET state = a.code
    FROM _gst_state_alias a
   WHERE o.state IS NOT NULL
     AND lower(regexp_replace(replace(o.state, '&', 'and'), '[^A-Za-z0-9]', '', 'g')) = a.k
     AND o.state IS DISTINCT FROM a.code;
  GET DIAGNOSTICS n_matched = ROW_COUNT;

  -- 1b. Anything left that isn't a code (incl. blanks) → NULL.
  UPDATE identity.organisations o
     SET state = NULL
   WHERE o.state IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM _gst_state_alias a WHERE a.k = a.code AND a.code = o.state);
  GET DIAGNOSTICS n_cleared = ROW_COUNT;

  -- 2. Copy billing profiles into empty org fields.
  IF to_regclass('billing.billing_profiles') IS NOT NULL THEN
    UPDATE identity.organisations o
       SET address_line1 = CASE WHEN coalesce(btrim(o.address_line1), '') = '' AND btrim(b.address_line1) <> '' THEN btrim(b.address_line1) ELSE o.address_line1 END,
           address_line2 = CASE WHEN coalesce(btrim(o.address_line2), '') = '' AND coalesce(btrim(b.address_line2), '') <> '' THEN btrim(b.address_line2) ELSE o.address_line2 END,
           city          = CASE WHEN coalesce(btrim(o.city), '')          = '' AND btrim(b.city)          <> '' THEN btrim(b.city)          ELSE o.city END,
           state         = CASE WHEN o.state IS NULL AND EXISTS (SELECT 1 FROM _gst_state_alias a WHERE a.k = a.code AND a.code = b.state) THEN b.state ELSE o.state END,
           postal_code   = CASE WHEN coalesce(btrim(o.postal_code), '')   = '' AND btrim(b.pincode)       <> '' THEN btrim(b.pincode)       ELSE o.postal_code END,
           gstin         = CASE WHEN coalesce(btrim(o.gstin), '')         = '' AND coalesce(btrim(b.gstin), '') <> '' THEN upper(btrim(b.gstin)) ELSE o.gstin END
      FROM billing.billing_profiles b
     WHERE b.organisation_id = o.id
       AND (
            (coalesce(btrim(o.address_line1), '') = '' AND btrim(b.address_line1) <> '')
         OR (coalesce(btrim(o.address_line2), '') = '' AND coalesce(btrim(b.address_line2), '') <> '')
         OR (coalesce(btrim(o.city), '')          = '' AND btrim(b.city)          <> '')
         OR (o.state IS NULL AND EXISTS (SELECT 1 FROM _gst_state_alias a WHERE a.k = a.code AND a.code = b.state))
         OR (coalesce(btrim(o.postal_code), '')   = '' AND btrim(b.pincode)       <> '')
         OR (coalesce(btrim(o.gstin), '')         = '' AND coalesce(btrim(b.gstin), '') <> '')
       );
    GET DIAGNOSTICS n_backfill = ROW_COUNT;
  END IF;

  RAISE NOTICE 'org billing details: % state(s) matched to a code, % cleared, % org(s) filled from billing profiles',
    n_matched, n_cleared, n_backfill;
END $$;
