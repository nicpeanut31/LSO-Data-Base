LASALLIAN SYMPHONY ORCHESTRA — ONLINE SHARED MANAGEMENT SYSTEM
==============================================================

This release is the online counterpart of the Membership + Attendance Upgrade.
The visible features and workflow were retained. The storage and account layer
was changed from browser-only localStorage to a shared Supabase PostgreSQL
backend.

PRESERVED FEATURES
------------------
- Attendance calendar
- Individual attendance search, totals, percentages, and printable report
- Overall member attendance totals, percentages, and printable report
- Printable event roster
- Trainee, Probationary, and Membership Period workflow
- Automatic movement into the Members list at the Membership Period start date
- Printable official member record from Member Lookup
- Functional futuristic dashboard and notification center
- Account approval, roles, alerts, backup, import, and activity logging
- Instrument Inventory remains removed from the visible workflow

ONLINE DATA MODEL
-----------------
public.lso_accounts  — usernames, hashed passwords, approval and roles
public.lso_sessions  — hashed private session tokens
public.system_state  — shared members, events, attendance, settings and activity

The browser calls controlled PostgreSQL functions through Supabase RPC. Direct
public table access is revoked. The interface keeps a local cache for speed, but
Supabase is the source of truth after an approved login.

FILES THAT WERE CHANGED FOR ONLINE OPERATION
--------------------------------------------
auth.js
cloud.js
index.html (connection scripts and online status wording only)
management.js (one online account-deletion confirmation label)
supabase-config.js
supabase-setup.sql
START_HERE.txt
README.txt

All membership, attendance, dashboard, printing, styles, and workflow logic was
otherwise preserved from the supplied upgrade.

Read START_HERE.txt before replacing the live GitHub files.
