# Afterclass: from free time to a real connection

Research and implementation review, 9 November 2026.

## Product decision

Afterclass should help a student answer: **“I’m free. Who can I do something with?”** The longer-term dating offering should be an explicit, optional intention, not a hidden assumption attached to every coffee invitation. Finding a lasting partner is a possible outcome, not something an algorithm can promise.

Founder-confirmed launch rule: every new one-to-one match pairs one verified account declaring “man” with one verified account declaring “woman.” Group campus chat remains separate. This narrows the eligible audience and does not serve same-gender friendship pairing; communicate that clearly rather than marketing unrestricted friendship matching. It also makes the smaller side of the eligible campus pool a likely constraint. Do not compensate with fake members, activity, or matches.

## Evidence and what it means

| Problem | Evidence or limitation | Afterclass response to validate |
| --- | --- | --- |
| Harassment and unwanted sexual contact | Pew's 2023 US report: 38% of people who had used online dating reported unsolicited explicit messages/images; 30% reported continued contact after expressing disinterest. These are US findings, not estimates for Indian campuses. | Mutual acceptance before private chat, bidirectional block enforcement, report receipts and review status, no unsolicited image attachments. |
| Attention imbalance | Pew found 54% of current/recent women users felt overwhelmed by message volume, compared with 25% of men. | Small, manageable invitation batches; pause incoming interest; fair exposure and clear rejection/withdrawal, without public popularity scores. |
| Too much choice | Pronk and Denissen's three studies found increasing rejection over successive options. This supports investigating smaller batches, not assuming all swiping is harmful. | A finite set of plans that fit availability, location and intention, with an explanation of fit. |
| Ghosting, flaking and stalled chats | Interview research describes ghosting and anxious text exchanges. It is qualitative evidence, not a prevalence estimate or proof of a universal cause. | A shared time/place proposal, explicit confirmation, easy rescheduling/cancellation, and a private “did you meet?” check-in. Never punish someone for declining an unsafe encounter. |
| Unclear authenticity | Hinge's own documentation says selfie verification compares likeness/liveness and does not guarantee safety. | Distinct labels for campus-email verification and selfie review; disclose what each check establishes. Recheck eligibility on every new match. |
| Different intentions | A design risk to test locally; a coffee or study invitation is not consent to a date. | Explicit “social plan” and later “date” intentions. Both must choose dating before romantic matching. No silent conversion of social accounts. |
| Paywall friction | Hinge already includes matching/messaging in its free offer; free chat alone is not a unique advantage. | Keep the complete first-meeting flow free; never charge for blocking, reporting, privacy or verification needed to participate. |
| Empty local feed | Observed in the supplied screenshots, not a market-wide research statistic. | Launch at one campus, around a small number of recurring time windows; recruit actual hosts and measure response time before expanding. |

Sources:

- [Pew Research Center, 2023: Key findings about online dating](https://www.pewresearch.org/short-reads/2023/02/02/key-findings-about-online-dating-in-the-u-s/). Survey of 6,034 US adults conducted July 2022.
- [Pronk & Denissen, 2020: A rejection mind-set](https://research.tilburguniversity.edu/en/publications/a-rejection-mind-set-choice-overload-in-online-dating/).
- [AoIR, 2021: Bored ghosts and anxious text games](https://spir.aoir.org/ojs/index.php/spir/article/view/11995). Fifty in-depth interviews; qualitative findings.
- [Hinge: Selfie verification](https://help.hinge.co/hc/en-us/articles/10303221435539-What-is-Selfie-Verification).
- [Hinge: Subscription and purchase benefits](https://help.hinge.co/hc/en-us/articles/38014282744595-Subscription-and-Purchase-Benefits).
- [Bumble: Discover, ID verification, Share Date](https://bumble.com/en/the-buzz/bumble-dating-features).
- [Hinge: Conversation starters](https://hinge.co/newsroom/convo-starters). Company claims, not independent comparative evidence.

This is a targeted review, not an exhaustive literature review. No reviewed study establishes which exact interface will succeed at NIIT University. Product proposals are hypotheses to test with students.

## Competitive position

Verification, prompts, date-sharing and preference filters already exist at large competitors. Afterclass's proposed advantage is the combination of a dense campus network, overlapping free time, nearby public venues, and invitations that already contain an activity. Measure how often people actually meet and want to return, not how long they scroll. Branding must make the utility feel considered; decoration cannot solve missing community activity.

## Prioritized roadmap

### Before expanding the pilot

1. Finish the trust foundation: enforce blocks across discovery, applications, private chat and realtime events; provide report status and moderator accountability. Audit existing live-location consent, deletion and access controls. Do not add more location collection.
2. Make verification honest and reviewable. A university email verifies access to an address; a selfie does not establish age, gender, harmlessness or background. Do not infer gender from face/voice. Use declared gender and a documented correction/review process. Separate account authenticity from gender preferences.
3. Complete availability-based planning: expiring availability windows, public venue presets, clear duration and no exact live-location disclosure. Current day filters are only the first step; a full availability matching engine is not implemented.
4. Add confirm/reschedule/cancel actions and user-controlled reminders. Show stale or closed plans in history, not as live opportunities.
5. Run a concentrated campus pilot with genuine hosts; maintain transparent empty states.

### After the pilot demonstrates repeat meetings

6. Add richer profiles: a few specific interests, prompts and optional voice introductions; alias-first visibility with explicit reveal controls. Avoid invented compatibility percentages and attractiveness rankings.
7. Add opt-in, **18+ dating** with a separate profile/visibility scope, reciprocal intentions, age assurance, and adult eligibility gates before discovery and matching. Campus membership alone does not prove someone is 18. The current User model has no date-of-birth/adult eligibility field, so the present app is not ready for this claim.
8. Suggest a small set of introductions based on overlapping schedules, interests and explicit preferences. Explain the shared reasons; do not claim “soulmate detection.”
9. Pilot hosted small-group activities as a separate product if users want them; this would need its own membership and safety model and does not change the founder's one-to-one rule.

### Monetization after demonstrated value

Keep discovery, basic matching, accepted chat, plan creation, safety tools and core verification free. Consider optional cosmetic profile customization and optional paid hosted events later. Test affordability with actual students; do not pick a subscription price without willingness-to-pay and cost data. Avoid paid visibility that makes nonpaying members effectively invisible.

Free to users is different from zero operating cost. Hosting, email, verification review, moderation and support have capacity limits. Track cost per active student and per completed meetup; choose a capped pilot, not a promise of free infrastructure at arbitrary scale.

## Validation plan

Interview 12–15 students across genders, including people who avoid dating apps. Ask about the last time they were free but could not find company, what prevented the meeting, what would make them decline, and what “verified” means to them. This is discovery, not a representative survey.

Run task-based usability sessions: find a plan tomorrow, understand whether it is social or romantic, express interest, cancel, and report a concern. Test with empty and populated feeds. Then run a two-week opt-in pilot with disclosed data collection.

Track: time to first relevant invitation; acceptance rate; mutual confirmations; self-reported meetings (with response rate); repeat participation; no-show/cancellation rate; unwanted-contact reports per active user; moderation response time; verification completion and appeals. Review outcomes separately across eligible groups to catch an uneven experience. Do not set success claims from raw signups alone.

## Delivered in this change

- Activity-led Home with Today/Tomorrow/This week filters, actionable presets and a campus-chat entry.
- Inbox conversation empty state, upcoming/past-plan views, and a “Plan again” action that drafts a future invitation without publishing it.
- Server policy for approved, verified, active man–woman accounts from the same campus. Applied to discovery eligibility and checked again when applying and accepting. Administrators do not bypass the pairing policy.
- Expired/closed-plan checks and an atomic request claim before room creation, preventing duplicate accepts.
- Existing chat history remains intact. No dating mode, age assurance, new verification provider, paid feature or production database migration was added.

Remaining limitation: policy relies on the existing account-verification process and declared gender. It does not independently certify identity, gender or age. Manual administrative verification still exists and needs a dedicated trust-process audit before public dating launch.
