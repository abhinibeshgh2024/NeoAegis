# Security Specification & Threat Model (TDD)

## 1. Data Invariants
*   **User Profiles (`/users/{userId}`)**: A user profile can only be read and written by its authenticated owner. Setting role/privileges or updating other profiles is strictly denied.
*   **Scanned Emails (`/scanned_emails/{emailId}`)**: An email record is private to its creator (`ownerId == request.auth.uid`). No global reads or list permissions are granted to other authenticated accounts.
*   **Export Logs (`/exports/{exportId}`)**: Downloaded audit logs must belong to the active session owner (`ownerId == request.auth.uid`).

---

## 2. The "Dirty Dozen" Threat Payloads
These payloads attempt to exploit access gaps, bypass validation boundaries, or execute identity poisoning:

1.  **Identity Spoofing on Create (Email)**: Authenticated User A tries to insert an email with `ownerId = 'user-b'`.
2.  **Identity Spoofing on Update (Email)**: User A tries to update an existing email record to assign its ownership to User B.
3.  **Cross-User Profile Read**: Authenticated User B attempts to fetch `/users/user-a`.
4.  **Cross-User Profile Write**: Authenticated User B attempts to create or overwrite `/users/user-a`.
5.  **Ghost Field Injection**: Inserting an email record containing undocumented fields (`isSystemAdmin: true`, `riskOverride: true`).
6.  **Email Size Exceedance (Denial of Wallet)**: Injecting a 2MB email body payload attempting to cause resource storage abuse.
7.  **Unverified Email Authorization**: Writing records when the authentication token reports `email_verified == false`.
8.  **Subject Header Poisoning**: Creating an email with a 50,000-character subject string.
9.  **Export Log Identity Drift**: User A logging an export under User B's `ownerId`.
10. **Terminal State Locking Bypass**: Modifying analytical scores or core metrics once the record is stored as completed.
11. **Anomalous Document ID Poisoning**: Trying to create an email using special control characters or massive strings as the Document ID (e.g., `../poisoned/null`).
12. **Client-Assigned Server Timestamp**: Attempting to bypass strict `request.time` enforcement by submitting a client-side hardcoded timestamp value in `createdAt`.

---

## 3. Test Runner Design (`firestore.rules.test.ts`)
The matching test cases confirm that all the above 12 adversarial writes or unauthorized accesses return `PERMISSION_DENIED` under all circumstances.
