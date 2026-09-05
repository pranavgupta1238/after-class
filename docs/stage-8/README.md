# Stage 8 — Campus Safety, Incident Review Center & Admin Portal

This document details the campus moderation infrastructure, real-time report review workflow, administrator access governance, and student safety mechanisms.

---

## 1. Overview & Safety Architecture

Because Afterclass is designed as an anonymous student network, safety and conduct enforcement are foundational to the platform's survival:

- **Strict Identity Traceability for Safety**: While students are anonymous to one another, authorized administrators and campus safety personnel can review flagged incident context and trace malicious actors internally.
- **Dedicated Admin Portal (`/admin`)**: A centralized moderation hub accessible strictly to verified administrators with multi-tab management for Incident Reports, Student Verifications, and Administrator Access.
- **Zero Self-Lockout Governance**: Robust role hierarchy safeguarding the platform from accidental owner lockouts or orphaned systems.

---

## 2. Real-Time Incident Reporting & Review Center

### Flagging & Reporting Context
- Students can report any campus message or private chat directly via the **•••** menu or hover action.
- **Categorized Violation Tags**:
  - `harassment`: Targeted intimidation, stalking, or abusive language.
  - `hate_speech`: Slurs, hate symbols, or discriminatory remarks.
  - `impersonation`: Pretending to be university faculty, administration, or another student.
  - `catfishing`: Misrepresenting gender or identity to deceive peers.
  - `spam`: Commercial ads, unsolicited links, or room flooding.
- Submissions snapshot the offending message context, reporter pseudonym, timestamp, and surrounding room state.

### Disciplinary Actions (`POST /api/admin/reports/:id/action`)
Administrators can execute immediate disciplinary interventions:
1. **Dismiss Report**: Clears the flag when no violation occurred.
2. **Delete Flagged Message**: Removes the message permanently from chat and real-time socket streams.
3. **24-Hour Timeout**: Mutes the offending student from posting in chat or applying to plans for 24 hours.
4. **7-Day Suspension**: Restricts all account privileges for 7 days.
5. **Issue Formal Warning Email**: Dispatches an official policy violation notice to the student's university inbox via Resend.

---

## 3. Administrator Roles & Access Governance

The platform implements a multi-tier governance model distinguishing platform owners from temporary moderators:

| Role | Permissions | Management Rules |
| :--- | :--- | :--- |
| **👑 Permanent Root Owner** | Full system control, infrastructure management, role delegation. | Stored in `ADMIN_EMAILS` (`.env` and process memory). Permanent root access. |
| **🛡️ Team Moderator** | Incident review, selfie verification approval/rejection, content moderation. | Stored in Redis. Can be added or revoked dynamically via the Admin Portal. |

### Security Safeguards
1. **Self-Lockout Guard**:
   - The logged-in administrator is marked with `🔒 You (Primary Owner)`.
   - `DELETE /api/admin/moderators/:email` rejects self-deletion attempts (`400: You cannot remove your own administrative access`).
2. **Minimum Admin Requirement**:
   - The backend guarantees that at least one Primary System Administrator must remain on the platform at all times, preventing orphaned 0-admin states.
3. **Co-Owner Removal**:
   - Platform owners have full authority to revoke access for *other* primary administrators or team moderators as operational needs dictate.

---

## 4. Anti-Catfishing Rejections & Gender Locking

To protect women-only or gender-specific campus spaces from bad-faith entry:

1. **Rejection with Gender Correction**:
   - If a student declares *Woman* to enter female study groups but submits a male selfie, an administrator can select **"Correct Profile to Man & Lock"**.
   - The user's profile is updated to `gender = 'man'`, and `genderLocked = true` is enforced in the database.
2. **Permanent Flip-Flop Prevention**:
   - Once `genderLocked` is set to `true`, the student cannot alter their gender declared in settings or onboarding, preventing continuous catfishing loops.
