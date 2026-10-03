# LANTIX Pro — Twilio A2P 10DLC Registration Package

Everything you need to register your **Brand** and **Campaign** in the Twilio Console
(Messaging → Regulatory Compliance → A2P 10DLC). Copy/paste the fields below.

> Keep the business name, address, phone, email, and website **identical** to what is on
> lantixpro.com and your DUNS/EIN records — reviewers cross-check these.

---

## 1) Brand registration (the legal business)

| Field | Value |
|------|-------|
| Legal company name | **True Life Entertainment LLC** |
| DBA / brand name | **Lantix Pro** |
| Business type | Private / Corporation (select what matches your EIN filing) |
| EIN / Tax ID | *(your EIN)* |
| Business address | 16 Hiawatha Road, Boston, MA 02126, USA |
| Business phone | +1 (617) 955-7915 |
| Support email | admin@lantixpro.com (and/or hello@truelifeentertainment.com) |
| Website | https://lantixpro.com |
| Industry / vertical | Staffing / Live events / Professional services |
| Business contact name | *(your name / title)* |

> If you don't have an EIN, register as a **Sole Proprietor** brand (lower throughput but no EIN required).

---

## 2) Campaign registration

**Use case:** `Mixed` (or `Low Volume Mixed` if you expect < ~2,000 msgs/day). Our messages are
transactional job notifications plus occasional account/announcement messages.

**Campaign description (paste this):**
> LANTIX Pro (operated by True Life Entertainment LLC) sends job-related SMS notifications to
> live-event crew members who have created an account and provided their mobile number. Messages
> include job/shift match alerts, booking confirmations, schedule changes and cancellations, and
> occasional service announcements. Crew opt in by entering their mobile number in their profile and
> agreeing to our Terms & Privacy Policy, which include SMS consent. Only registered users who
> provided their number receive messages. Reply STOP to opt out, HELP for help.

**Message flow / how it works (if asked):**
> A crew member signs up, builds a profile, and enters their cell number (consent captured at that
> step). When a company posts a job that matches the crew member's role, skills and city, LANTIX Pro
> texts them an alert. When a company confirms them for a job, they receive a confirmation text with
> the job details. If a job is cancelled, they receive a cancellation notice.

**Opt-in type:** Web form (account signup / profile). 
**Opt-in keywords:** N/A (opt-in is via the website form, not a keyword).
**Help keyword response / STOP:** handled by Twilio Advanced Opt-Out (see section 4).

---

## 3) Sample messages (provide 3–5; these mirror what the app actually sends)

1. **Job match alert**
   > LANTIX Pro: New job match — FOH Engineer in Boston on 2025-08-20, call 3:00 PM, $650. Open the app to apply. Reply STOP to opt out.

2. **Booking confirmation**
   > LANTIX Pro: You're CONFIRMED for Monitor Engineer in Worcester on 2025-08-22, call 9:00 AM. Company contact is now unlocked in the app. Reply STOP to opt out.

3. **Job cancellation notice**
   > LANTIX Pro: Heads up — the LED Tech job in Cambridge on 2025-08-18 was cancelled by the company (24hr+ notice). Reply STOP to opt out.

4. **Crew cancellation to company**
   > LANTIX Pro: A crew member cancelled for Rigger on 2025-08-19 (24hr+ notice). Re-open the role in the app to find a replacement. Reply STOP to opt out.

5. **Service announcement (broadcast)**
   > LANTIX Pro: Reminder — update your availability for this weekend's festivals so you show up in company searches. Reply STOP to opt out.

> Tip: Twilio wants at least one sample to clearly show the **brand name** and **opt-out** language.

---

## 4) Opt-in, opt-out & help language

**Opt-in disclosure (already on the site — sign-in dialog + Privacy Policy):**
> "By continuing you agree to our Terms of Service & Privacy Policy."
> Privacy Policy: "By adding a cell number, crew consent to receive job-related SMS from LANTIX Pro
> (operated by True Life Entertainment LLC). Message frequency varies; message and data rates may
> apply. Reply STOP to opt out at any time, or HELP for help."

**Recommended HELP reply:**
> LANTIX Pro (True Life Entertainment LLC) support: admin@lantixpro.com, (617) 955-7915. Msg & data
> rates may apply. Reply STOP to unsubscribe.

**Recommended STOP reply (auto-handled by Twilio):**
> You are unsubscribed from LANTIX Pro and will receive no more messages. Reply START to resubscribe.

**Message frequency:** "Message frequency varies."
**Rates:** "Message and data rates may apply."

> Enable **Advanced Opt-Out** on your Messaging Service so Twilio auto-handles STOP/HELP/START.

---

## 5) Consent proof (have ready in case reviewers ask)
- Screenshot of the **sign-up / profile** screen where the cell number is entered.
- Screenshot of the **sign-in dialog** showing the "Terms & Privacy" agreement line.
- Link to the **Privacy Policy** SMS section on lantixpro.com (visible in the site footer).

---

## 6) Submission checklist
- [ ] lantixpro.com is **re-published** with the business name, address, phone, both emails, and Privacy/Terms live.
- [ ] Brand registered (True Life Entertainment LLC, DBA Lantix Pro) with matching EIN/address.
- [ ] Messaging Service created; your Twilio phone number added to its sender pool.
- [ ] Campaign submitted (Mixed / Low Volume Mixed) with the description + 3–5 samples above.
- [ ] Advanced Opt-Out enabled (STOP/HELP/START).
- [ ] Campaign associated with the Messaging Service.
- [ ] In the app env: set `TWILIO_MESSAGING_SERVICE_SID` (MG…) once approved (preferred over a raw From number for production).

> Approval typically takes ~1–3 business days for the campaign after the brand is verified (can be longer). You can send test messages to your own verified number in the meantime.
