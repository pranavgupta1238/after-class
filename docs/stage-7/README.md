# Stage 7 — Student Identity, Avatar Studio & Ephemeral Data Retention

This document outlines the student identity framework, the procedural vector Avatar Studio, the live selfie verification pipeline, and the zero-storage ephemeral data retention policy.

---

## 1. Overview & Identity Philosophy

Afterclass guarantees campus psychological safety by decoupling real-world peer pressure from genuine conversation:

- **Rotating Anonymous Aliases**: Students interact via campus-assigned rotating pseudonyms (e.g. `CalmClover`, `SilentSparrow`), ensuring past discussions cannot be used for gossip or peer tracking.
- **Procedural SVG Avatar Studio**: An in-browser character customization studio allowing students to design unique, expressive illustrated avatars without uploading real photos.
- **Zero-Storage Verification**: Students verify their enrollment and gender through a live camera challenge. Verification selfies are stored ephemerally and **permanently deleted from disk** upon review.

---

## 2. Interactive SVG Avatar Customization Studio

The Avatar Studio generates fully procedural vector illustrations across an interactive customizer stage:

- **Strict 9-Layer Painter's Order**:
  1. Base silhouette & skin tone
  2. Eyes, eyebrows & expressions
  3. Signature permanent coral `✦` cheek star mark
  4. Core garments & outfits (Hoodies, Denim, Blazers, Sweaters, Athletic wear)
  5. Outerwear accents & contrast logo placement
  6. Hairstyles & volume layers (Afro, Buzz, Braids, Curls, Wavy, Buns)
  7. Eyewear (Classic wire, Round horn-rim, Cat-eye, Aviator)
  8. Headwear & Accessories (Beanie, Cap, Headphones, Ear piercings)
  9. Verified student scalloped seal badge (`renderVerifiedBadgeSvg`)
- **Showcase Stage with Dynamic Lighting**:
  - Volumetric overhead flood spotlight with luminous floor halo.
  - Interactive stage toggle between **Light Studio Mode** and **Dark Spotlight Mode** (`.dark-stage`).
  - One-click randomized character generation (`window.randomizeAvatarStudio`).

---

## 3. Live Selfie Verification & Zero-Storage Architecture

To eliminate catfishing, gender spoofing, and fake accounts while maintaining a **0 KB permanent storage footprint**:

1. **Client-Side Live Camera Stream (`src/main.js`)**:
   - High-aspect 4:3 camera viewfinder with corner reticles (`⌜ ⌝ ⌞ ⌟`).
   - Browser enforces live camera access (`navigator.mediaDevices.getUserMedia`); gallery file uploads are blocked.
   - Assigns a dynamic randomized gesture challenge (✌️ Peace sign, 👍 Thumbs up, 🖐️ Open palm, 🤟 Three fingers).
2. **In-Browser HTML5 Canvas Compression**:
   - Compresses the raw camera feed into `image/webp` @ 60% quality.
   - Reduces file size by **99.7%** (average payload: **25 KB to 35 KB**).
3. **Backend Review & Instant Physical Destruction (`server/index.js`)**:
   - `POST /api/verify/selfie`: Saves the temporary image to `server/uploads/verifications/` and flags user status as `pending`.
   - `POST /api/admin/verifications/:id/approve`:
     - Sets `user.isVerified = true` and `user.genderLocked = true`.
     - **Instantly deletes the photo file from disk** via `fs.unlinkSync()`.
     - Sets `user.verificationPhoto = null` in PostgreSQL.
     - Emits real-time WebSocket event `user:verified` with instant celebration unlock.
   - `POST /api/admin/verifications/:id/reject`: Immediately deletes the file from disk and records the rejection reason.
4. **Automated 24-Hour Garbage Collector**:
   - Scheduled routine runs every 6 hours to purge any orphaned verification files older than 24 hours.

---

## 4. Ephemeral Message Retention

To protect student privacy and ensure conversations have a finite digital lifespan:

- **Campus Public Chat**: Messages older than **7 days** are automatically pruned from the database.
- **Private 1-on-1 Matched DMs**: Conversations older than **14 days** post-match are permanently deleted.
- **24-Hour Disappearing Mode**: Students can toggle the disappearing messages switch in private chats, causing individual messages to automatically expire 24 hours after delivery.
