# Deployment status

BillBee is deployed at https://billnest-billing.vercel.app/.

## Completed

- The application source is published in https://github.com/AravindhSunilkumar/BillBee.
- Source commit `c1450963b1e9b6938140feeb4ed7fb2383b3754f` was deployed to the existing Vercel project `billnest-billing` through Vercel Drop. The deployment reached Ready.
- The production API has the Supabase URL and publishable-key environment variables. No service-role key is used.
- Supabase Auth Site URL was saved as `https://billnest-billing.vercel.app/` on 23 October 2026. Email confirmation remains enabled.
- Public HTTP checks on 24 October 2026 returned 200 with `configured: true` for `/api?action=health`, and 401 for an unauthenticated `/api?action=session`. Responses included the Content Security Policy and `Cache-Control: no-store, private`.
- Fourteen Node tests passed during implementation. Live database transaction checks passed with all fixtures rolled back.
- The isolated browser UI check issued a product/service invoice, recorded a partial receipt, verified report totals and switched to a separate empty workspace. It used the internal in-memory harness rather than a production authentication account.

## Local Windows startup

`start-local.bat` checks for Node.js 24+, loads `.env.local` and starts the app. The development server defaults to the loopback address. The prepared local ZIP includes only the existing Supabase URL and publishable key as connection settings; database content and authentication credentials are not packaged.

On 24 October 2026, a local server check returned 200 for the HTML, JavaScript, CSS and configured health endpoint, and 401 for an unauthenticated session. Supabase's public Auth settings endpoint also responded successfully with email sign-in enabled and email confirmation required. The Windows launcher was prepared on Linux and still needs to be run on the user's PC. A remote browser could not reach the forwarded local port, so no local browser sign-in is claimed.

## Account recovery

The login page includes confirmation resend and password reset. Expired email callbacks show a clear message, and authentication parameters are removed from the browser address. Reset requests use an S256 PKCE challenge with an HttpOnly verifier cookie; code exchanges keep Supabase session tokens in HttpOnly cookies. A signed-in user can change only their own password through the Auth user endpoint. No administrator key or direct authentication-table writes are used.

All 24 Node checks pass, including callback error handling, CSRF/method checks, private verifier binding, cookie-only session exchange, and password-update ownership. A real emailed reset and the account owner's new-password entry remain to be verified.

## Remaining before public registration

1. Choose an email provider and verified sending domain, then configure custom SMTP in Supabase. Enter SMTP credentials privately in the dashboard; never store them in the repository or chat. The default email service has recipient and rate restrictions.
2. Complete email confirmation and a real browser sign-in, then verify onboarding and billing through the production API. The interrupted secure sign-in did not establish a verified app session.
3. Review the Supabase Auth advisory for disabled leaked-password protection. The 24 October security check did not report public-table or RLS issues.

An earlier automatic approval review declined creation of a persistent QA authentication credential. No test account was created by the agent, and that action must not be retried without separate explicit authorization.

## Deployment maintenance

Vercel's GitHub app is not connected to this project. Repository commits do not currently deploy automatically; use a deliberate Vercel deployment or configure the Git connection with the account owner's approval. The Vercel connector could see the team but not the project, so the approved browser fallback was used.

The local development command remains `node --env-file-if-exists=.env.local server/dev.js`. The internal UI harness must never replace the production API or development command.

References:

- https://supabase.com/docs/guides/auth/auth-smtp
- https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection
