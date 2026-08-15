# Private beta operations

The hosted studio uses an invite-only Supabase Auth policy. The public landing
page accepts requests through the rate-limited API and stores them in
`public.access_requests`; the browser never receives database write credentials.

## Review requests

Open the `access_requests` table in the Supabase Table Editor, or use a privileged
SQL connection:

```sql
select id, email, name, use_case, status, created_at
from public.access_requests
where status = 'pending'
order by created_at asc;
```

Treat names, email addresses, and use cases as private beta data. Do not paste
them into public issues or logs.

## Invite an approved user

1. In Supabase, open Authentication → Users and choose **Invite user**.
2. Send the invite to the exact reviewed email address.
3. Mark the request as invited:

```sql
update public.access_requests
set status = 'invited', updated_at = now()
where email = 'approved@example.com';
```

After the user accepts, set the status to `accepted`. Supabase admin invitations
continue to work while public user signup is disabled.

## Abuse controls

- Keep **Allow new users to sign up** disabled in Supabase Auth.
- Configure both `VITE_TURNSTILE_SITE_KEY` on Vercel and
  `TURNSTILE_SECRET_KEY` on Railway when request volume warrants CAPTCHA.
- The API defaults to five access requests per IP per hour and 180 total requests
  per identity/IP per minute.
- Review Railway CPU/memory and Supabase storage before raising project, build,
  asset, snapshot, or share limits.

## Rollback

If the public request endpoint is abused, remove `VITE_TURNSTILE_SITE_KEY` only
after also removing `TURNSTILE_SECRET_KEY`, or temporarily remove the request
form from the landing page. Do not re-enable open Supabase signup as a shortcut.

If preview building is under pressure, lower `QUOTA_BUILDS_PER_DAY`,
`BUILD_MAX_CONCURRENT`, or `PREVIEW_MAX_CONCURRENT` on Railway and redeploy.
