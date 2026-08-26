# Founder decisions — Afterclass / NIIT University

Answer these before the related feature is marked production-ready. Defaults are recommendations, not final decisions.

## Product scope

- [ ] Is the initial product strictly for friendship/activity plans, or should it include dating-style matching at launch?
  - Recommended: activity/friendship only at launch; introduce a clearly separate dating mode later.
- [ ] Which activity categories should be available initially (for example coffee, food, sports, study, arts, events, walks)?
- [ ] Should a student be able to create more than one open plan at once?
  - Recommended: one open plan at a time; maximum five new plans per day.
- [ ] Should plans expire after 48 hours, or at the scheduled time if that is sooner?

## Matching and privacy (Stage 6)

- [ ] Can every verified NIIT student browse/apply to every activity plan, or must matching preferences be completed first?
  - Recommended: everyone may use activity matching; preferences are optional and only used for a future dating mode.
- [ ] If preferences are used, what gender/orientation options and matching rules are appropriate?
- [ ] What may be shown after mutual identity reveal: optional first name only, first name plus course/year, or something else?
  - Recommended: optional chosen first name only at launch.
- [ ] Can either participant request identity reveal again after the other declines?
  - Recommended: no; keep both anonymous for that match.
- [ ] Should either participant be able to cancel a match at any time?
  - Recommended: yes, with no explanation required to the other student.
- [ ] How should no-shows be determined after an outing?
  - Recommended: collect both attendance responses; flag a disagreement for review rather than automatically penalising either person.
- [ ] What reputation impact, if any, should confirmed no-shows have?
  - Recommended: warning first, then a temporary matching suspension after repeated confirmed no-shows.

## Identity and retention (Stage 7)

- [ ] Should public aliases rotate weekly, only after a completed outing, or both?
  - Recommended: both; weekly rotation plus immediate rotation after a completed outing.
- [ ] Should students be able to manually rotate an alias? If yes, how often?
- [ ] How long should deleted accounts, messages, reports, and moderation records be retained?
- [ ] Who is authorized to access internal email/account records in a safety incident?

## Safety and moderation (Stage 8)

- [ ] Who will be the initial moderator/admin, and what secure admin account should they use?
- [ ] What email or contact channel should students use for urgent safety concerns?
- [ ] Which conduct rules should appear in the community guidelines?
- [ ] Do three reports from distinct students in 24 hours trigger an automatic 24-hour mute?
  - Recommended: yes, with admin review before suspension/ban.
- [ ] What are the exact mute, suspension, and permanent-ban durations and appeal process?
- [ ] Is screenshot watermarking desired for private chats?
  - Recommended: do not present it as protection; implement only after legal/privacy review.

## NIIT University launch and legal

- [ ] Do you have NIIT University authorization to use `@niituniversity.in` verification and invite students?
- [ ] What is the product’s official public name, logo, and final web domain?
- [ ] Who owns the privacy policy, terms, and community guidelines?
- [ ] What age/eligibility policy applies to students using the platform?
- [ ] Where should user data be hosted, and are there university/legal data-residency requirements?

## Deployment and operations

- [ ] Which account will own Supabase, Railway, Vercel, Resend, and the domain?
- [ ] What monthly budget and cost alert threshold are approved?
- [ ] What production sender domain will Resend use for OTP email?
- [ ] Who receives outage, error, moderation, and cost alerts?
- [ ] Which additional universities are planned after NIIT University, and what are their verified student email domains?
