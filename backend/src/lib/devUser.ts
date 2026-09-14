// Placeholder single-user id until real auth exists. The DB's RLS policy is
// also wide open for the same reason -- see db/schema.sql's "dev: allow all"
// policy, which must be replaced alongside real auth.
export const DEV_USER_ID = "00000000-0000-0000-0000-000000000001";
