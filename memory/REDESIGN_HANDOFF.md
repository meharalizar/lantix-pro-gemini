# LANTIX Pro PDF redesign and master-admin handoff

## Authorized scope
PDF reference: uploaded Lantix-design.pdf. Preserve existing live functionality, redesign application screens, complete dedicated master administration and disputes, run targeted tests then ONE practical self-audit, fix regressions, deploy once only if all checks pass. No charges, real subscriptions, SMS, emails, provider actions, destructive data changes or production account changes during implementation.

## Admin secret handling
Credential comes exclusively from ADMIN_CODE in environment/config. NEVER print it or save it in any project file, test script, fixture, report or chat. Read at runtime only. Historical working-file copies were redacted and legacy browser persistence removed. New /master-admin uses an independent two-hour HttpOnly SameSite=Strict cookie, secure over HTTPS; normal company/crew cookies and legacy headers do not authorize it. Config rotation invalidates existing admin sessions. No actual credential is recorded here.

## Implemented
- Light-grey/purple design tokens; company/admin white desktop sidebar, crew top navigation, mobile navigation/cards and bottom show CTA.
- Landing/auth/reset/profile/directory/jobs/RFP/show/staffing/calendar/invitation/timesheet/billing surfaces redesigned using existing components and real data.
- Company overview uses actual shows, assignments, pending timesheets and jobs; dedicated Shows/Post a Show/Applicants/Billing navigation.
- /master-admin: companies/users/crew/shows/jobs/RFPs/assignments/timesheets, grant/revoke Jobs/RFP posting access, activate/suspend users, internal disputes with linked records, comments, statuses and resolution history.
- Backend enforcement for suspended sessions/logins and Jobs/RFP paidVerified posting gates; no subscription/provider calls added.
- US-state search/location display fixes and state persistence for RFP/services. Existing shows/assignment/timesheet guards preserved.
- Removed ordinary page-visit seeding and broken UI dev-login shortcuts; normal demo email/password accounts retained.

## Test/deploy status
Latest user instruction: DO NOT DEPLOY. Run only affected dispute/history/logout retest, final practical visual audit, and deployment-readiness check; report remaining blockers. User will rotate ADMIN_CODE separately through secure configuration before final deployment.

- BillingCard corrected: demo/admin posting permission is distinct from actual subscription state; access-only accounts show Not subscribed and no subscription cancel/resume/renewal controls. Browser verified.
- Fresh company show/staffing creation/edit/persistence and desktop/mobile checks completed. Fresh QA invitation accepted and assigned count verified. Timesheet submitted, rejected, corrected/resubmitted and approved; saved rates preserved, $550 to $525, version1 to4, approved locked.
- Admin posting revoke/grant passed and demo restored enabled. New critical dispute UI transition crash fixed in components/master-admin.jsx: data scoped by pageKey, previous-tab reload removed after creation, null-safe category. Affected dispute creation/review/resolution/history/logout retest passed12/12; logged-out overview401.
- Practical screenshot audit completed: billing displays correct access-only state and ordinary company session sees locked /master-admin with blank masked credential input. No runtime exception; non-blocking Radix missing-description warnings remain.
- Deployment-readiness scanner completed with WARN: compilation passed; current environment and supervisor checks passed. Existing backend hardcoded database-name fallback is a configuration warning, not changed under latest scope. DB_NAME, MONGO_URL and NEXT_PUBLIC_BASE_URL presence verified in current environment only; production configuration not inspected. User-managed ADMIN_CODE rotation remains outstanding before any deployment. Do not deploy without renewed user instruction.
- No backend or integration changes in this continuation; earlier passed backend tests were not repeated. No charges, real SMS or emails triggered. No deployment performed.


## Test rules
Use preview/local demo accounts; regular account credentials are in memory/test_credentials.md. Create missing preview demo crew only if needed and record its details. Company: demo.company@lantixpro.com; crew: demo.crew@lantixpro.com. Do not change production accounts. No actual job posts that could notify crew. Billing UI may GET /api/billing/status (DB-only); block ALL billing mutations/provider calls. Block /api/email and SMS/notification paths. Master admin tests must obtain ADMIN_CODE at runtime without logging or storing it. Use temporary isolated Mongo collections for destructive test cleanup; never delete existing records. Browser tests: dismiss Welcome Skip before nav if shown; company now has dedicated Shows/Post a Show tabs; crew top navigation. Both desktop and mobile must be checked.

## Remaining limitations intentionally unchanged
External calendar sync/GPS/payroll/payouts and live provider activation are not in this task. Master authentication uses the approved environment credential, not named admin RBAC accounts. Existing legacy APIs remain credential-gated; new admin URL requires its own session. No deletion actions in master admin.
