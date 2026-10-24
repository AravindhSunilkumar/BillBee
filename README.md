# BillBee

A first-release Indian billing web app for independent businesses. Each account owns its own business workspaces; records are isolated in Postgres with row-level security and server-checked ownership.

Live app: https://billnest-billing.vercel.app/

The app and API are deployed. Public registration still needs custom SMTP and a completed production sign-in test. See [deployment status](docs/release-status.md) for verified checks and remaining setup.

## Included

- Email/password sign-up and sign-in, confirmation resend, and password reset with HttpOnly session cookies. Reset emails are bound to the browser that requested them using PKCE.
- Multiple separate business workspaces per account.
- Customers and a product/service catalogue with prices, HSN/SAC codes and configurable tax treatments.
- Draft invoices, server-recalculated totals, line discounts and quantities up to three decimal places.
- Domestic CGST + SGST/UTGST or IGST based on the selected place of supply. Non-GST and composition businesses never collect GST.
- Tax invoices, bills of supply and ordinary non-GST invoices. Mixed taxable/exempt documents are blocked for registered recipients.
- Financial-year invoice numbering assigned atomically when issuing; issued document snapshots cannot be edited.
- Payment recording, partial balances, reversals, cancellation reasons and an audit history. Payment forms record receipts; they do not collect money.
- Dashboard, sales register, CSV export, and browser printing / Save as PDF.

## Stack

Browser-native ES modules and CSS; Node.js 24 API functions on Vercel; Supabase Postgres and Auth. No npm runtime dependencies or third-party browser scripts.

## Local setup

### Windows

Install Node.js 24 or later, then extract the project into a folder. The prepared local ZIP includes the existing project's public connection settings. Double-click `start-local.bat` and open `http://localhost:4173`. Keep the terminal window open while using the app; press Ctrl+C to stop it.

When downloading the source directly from GitHub, first copy `.env.example` to `.env.local` and set the two Supabase connection values below. The launcher opens the configuration file when those values are missing.

The web app runs on your PC. Authentication and database storage still use Supabase over the internet, and accounts still require email confirmation. Local startup does not require a custom website domain or a new email provider.

### Terminal

1. Use Node.js 24 or later.
2. Copy `.env.example` to `.env.local`, then set `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` from your project. Never use a service-role or secret API key.
3. Apply `database/schema.sql` once to a new, empty Supabase project. It is the consolidated schema, including the audit-actor index. `database/002_audit_index.sql` is the incremental index migration for an installation created before that index was included.
4. Run `npm test`, then `npm run dev`.
5. Open `http://localhost:4173`. The server binds to the loopback address by default. Set `BILLBEE_HOST=0.0.0.0` only when a development environment needs access through a forwarded port. On non-localhost HTTP development hosts, the application uses Web Crypto `getRandomValues` for request UUIDs; HTTPS uses `randomUUID` when available.

The application uses the REST Auth and Data APIs directly from the Node backend. The browser never receives Supabase access or refresh tokens. All writes require a same-origin JSON request. Database write operations are exposed as a narrowly authorized RPC, backed by a private-schema transaction function with an explicit user/owner check. The browser's authenticated database role has read access under RLS and cannot directly modify financial records.

## Deploy

Create/link the intended Vercel project, set the two environment variables in production and preview, and deploy this repository. `vercel.json` points static output to `public`; `api/index.js` is the Node API entry point. No build step is needed. Set the project's Auth Site URL and allowed redirect URL in Supabase to the final HTTPS app origin.

Vercel deployment protection is preserved. To open registration beyond your Vercel collaborators, configure the intended deployment audience/protection settings deliberately; the application still requires its own business account login.

## Email setup for additional businesses

Supabase email confirmation remains enabled. The default SMTP service has recipient/rate restrictions and is intended for development; configure custom SMTP and the app Site URL in Supabase before offering sign-up to outside businesses. Credentials should be entered directly in the provider dashboard, never committed to this repository or pasted into chat.

Reference: https://supabase.com/docs/guides/auth/auth-smtp

Use **Resend confirmation email** for an expired signup link. Use **Forgot password?** to request a reset, then open the newest reset email in the same browser and set the new password. Email callbacks remove authentication parameters from the address bar; expired-link errors are displayed directly on the sign-in screen.

For password recovery on localhost, add the exact local address `http://localhost:4173/` to the Supabase Auth redirect allow list. Production uses the app's existing HTTPS Site URL. A browser that did not request the reset cannot exchange its code without the private verifier cookie.

## Scope of GST support

This release supports standard domestic outward-supply invoices. Tax rates are entered by the business; no product classification/rate advice is inferred. HSN/SAC entry is required for registered businesses. The business must select the correct tax treatment and place of supply.

IRN/e-invoice registration, signed QR codes, e-way bills, GST return filing, exports/SEZ, reverse charge, credit/debit notes, cess, inventory and purchase accounting, offline sync, staff invitations and SaaS subscription charging are not implemented. Do not treat the sales-register export as a filed tax return. Businesses that require those document types or integrations need them added before using this app for those transactions.

Official invoicing references:

- https://taxinformation.cbic.gov.in/content/html/tax_repository/gst/rules/cgst_rules/active/chapter6/rule46_v1.00.html
- https://gstcouncil.gov.in/sites/default/files/e-version-gst-flyers/Tax_Invoice_and_other_new.pdf

## Verification

- `npm test`: calculation, rounding, non-GST handling, CSV/HTML escaping, CSRF restrictions, method restrictions and HttpOnly cookie behavior.
- `tests/database_checks.sql`: real database transaction checks for ownership isolation, invoices, numbering, immutability, idempotent payments, overpayment rejection, reversals and reports. All its test data rolls back.
- `tests/ui-harness.js`: isolated, in-memory transport for internal browser UI checks. It creates no auth account, sends no email and writes no real database records. It must never be used as the production API or deployed as the development command.

The initial browser checks covered invoice composition, issuing, partial payment, reports and workspace switching against that isolated transport. A real end-to-end authentication/signup test is still required: automatic approval review rejected persistent test-account creation, so no QA credentials were created.

## Initial release limits

Catalogue and customer dropdowns load up to 1,000 records; the full customer/catalogue pages are paginated. Sales-register exports support up to 10,000 invoices per selected date range and ask for a narrower range above that. Each invoice supports up to 200 lines. There is one owner access level per account in this release.
