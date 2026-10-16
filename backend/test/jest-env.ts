// Unit tests must not pick up a developer's local billing testing aids from
// backend/.env (BILLING_CLOCK_OVERRIDE moves "now"; BILLING_V2 changes what
// happens when grace ends). Set empty so a later dotenv load can't fill them
// in; tests that need them set them explicitly.
process.env.BILLING_CLOCK_OVERRIDE = '';
process.env.BILLING_V2 = '';
