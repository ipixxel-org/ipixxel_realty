-- Super Admin Lead Management adds four canonical stages to the existing CRM
-- lifecycle. The legacy org stages (site_visit / negotiation / won) remain for
-- backwards compatibility and are normalised in the admin API.
ALTER TYPE "templates"."LeadStatus" ADD VALUE IF NOT EXISTS 'connected';
ALTER TYPE "templates"."LeadStatus" ADD VALUE IF NOT EXISTS 'interested';
ALTER TYPE "templates"."LeadStatus" ADD VALUE IF NOT EXISTS 'not_interested';
ALTER TYPE "templates"."LeadStatus" ADD VALUE IF NOT EXISTS 'converted';
