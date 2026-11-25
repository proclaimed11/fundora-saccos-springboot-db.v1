# Fundora Credit Solutions API Documentation

Base URL (local): `http://localhost:8081`
Base URL (production): `http://3.127.183.244`

The production server runs behind an Nginx reverse proxy on port `80`, forwarding to the Spring Boot app on port `8081`. Do **not** append `:8081` when testing against production — use the base URL above directly, e.g. `http://3.127.183.244/api/auth/login`.

A `GET /` health check is available at the production base URL and returns:
```json
{ "service": "Fundora Credit Solutions API", "status": "UP", "docs": "See API_DOCUMENTATION.md in the repository" }
```

All request/response bodies are JSON. All timestamps are ISO-8601 (`yyyy-MM-ddTHH:mm:ss`).

## Table of Contents

1. [Authentication](#authentication)
2. [Session Management](#session-management)
3. [Applicant Onboarding & KYC](#applicant-onboarding--kyc)
4. [Loan Origination](#loan-origination)
5. [Loan Application Process Tracking](#loan-application-process-tracking)
6. [Disbursement & Repayment Schedule](#disbursement--repayment-schedule)
7. [Payments & Penalties](#payments--penalties)
8. [Collections, Recovery, NPL & GL](#collections-recovery-npl--gl)
9. [Reports & Dashboards](#reports--dashboards)
10. [Notifications & Audit Trail](#notifications--audit-trail)
11. [Settings & Security](#settings--security)
12. [Generic CRUD Modules](#generic-crud-modules)
13. [Error Format](#error-format)

---

## Authentication

Base path: `/api/auth`

These endpoints are **public** (no session token required).

### POST `/api/auth/login`

Authenticates a staff user and issues a session token.

**Request body**
```json
{
  "email": "masudihmfaume@gmail.com",
  "password": "admin@123!"
}
```

**Response `200 OK` without 2FA**
```json
{
  "success": true,
  "message": "Login successful",
  "userId": 1,
  "username": "admin",
  "firstName": "System",
  "middleName": null,
  "lastName": "Administrator",
  "role": "Admin",
  "token": "405ea04913d141b4a1a5de297231e143",
  "permissions": [
    { "id": 1, "area": "dashboard", "page": "stats", "action": "view", "label": "View dashboard stat cards", "kind": "stat" },
    { "id": 4, "area": "applicants", "page": null, "action": "view", "label": "View applicants", "kind": null },
    ...
  ]
}
```

`permissions` is the full grant list resolved via `users.role_id → role_permissions → permissions` — use it to gate UI pages, buttons, and dashboard widgets (`kind` is only set for `dashboard` widgets: `stat`, `chart`, `list`). `page` is `null` for whole-area permissions.

**Response `200 OK` with 2FA enabled**

If `User.isTwoFactorEnabled = true`, the API does not issue a session token immediately. Instead it emails a 6-digit OTP to the user's `email` and returns a `twoFactorToken` to be used on `POST /api/auth/verify-2fa`:

```json
{
  "success": true,
  "message": "A 2FA code has been sent to masudihmfaume@gmail.com",
  "userId": 1,
  "username": "admin",
  "role": "Admin",
  "requiresTwoFactor": true,
  "twoFactorToken": "360571a591284188ab7fabe2a7785884"
}
```

On failure (`400` credentials, disabled account):
```json
{ "success": false, "message": "Invalid email or password" }
```

Use the returned `token` as a Bearer token on all subsequent requests to protected endpoints:

```
Authorization: Bearer 405ea04913d141b4a1a5de297231e143
```

### POST `/api/auth/verify-2fa`

Completes the two-factor login flow. The `twoFactorToken` comes from `POST /api/auth/login` and the `code` is the 6-digit OTP emailed to the user. Code expires after **5 minutes** and is single-use.

**Request body**
```json
{
  "twoFactorToken": "360571a591284188ab7fabe2a7785884",
  "code": "482913"
}
```

**Response `200 OK`**
```json
{
  "success": true,
  "message": "Login successful",
  "userId": 1,
  "username": "admin",
  "firstName": "System",
  "middleName": null,
  "lastName": "Administrator",
  "role": "Admin",
  "token": "405ea04913d141b4a1a5de297231e143",
  "permissions": [ ... ]
}
```

Same shape as `POST /api/auth/login` — includes `firstName`/`middleName`/`lastName` and the full `permissions` grant list.

Failure cases:
```json
{ "success": false, "message": "Two-factor token and code are required" }
{ "success": false, "message": "Invalid or expired two-factor session" }
{ "success": false, "message": "2FA code has expired" }
{ "success": false, "message": "Invalid 2FA code" }
{ "success": false, "message": "User not found" }
```

### POST `/api/auth/2fa/toggle`

Allows an authenticated user to enable or disable two-factor authentication for their own account. `enabled` must be `true` or `false`.

**Headers**
```
Authorization: Bearer <token>
```

**Request body**
```json
{ "enabled": true }
```

**Response `200 OK`**
```json
{ "success": true, "message": "Two-factor authentication enabled", "userId": 1, "username": "admin", "role": null }
```

Failure cases:
```json
{ "success": false, "message": "Enabled flag is required" }
{ "success": false, "message": "Invalid or expired session" }
```

> **Note:** The seeded `admin` account has 2FA disabled by default. After logging in, the admin can enable it via this endpoint and subsequent logins will then require the emailed OTP.

### POST `/api/auth/logout`

Invalidates the current session token. Requires the `Authorization` header.

**Headers**
```
Authorization: Bearer <token>
```

**Response `200 OK`**
```json
{ "success": true, "message": "Logged out successfully" }
```

### POST `/api/auth/forgot-password`

Generates a 6-digit reset code, emails it to the user via Gmail SMTP (see [MailService](#email-otp-configuration) in the README), and does **not** return the code in the response.

**Request body**
```json
{ "email": "masudihmfaume@gmail.com" }
```

**Response `200 OK`**
```json
{ "success": true, "message": "If the email is registered, a password reset code has been sent to it" }
```

The response is identical whether the email exists or not — the API never reveals which addresses are registered.

### POST `/api/auth/reset-password`

Verifies the emailed reset code and sets a new password of the caller's choice. Code expires after **5 minutes** and is single-use.

**Request body**
```json
{
  "email": "masudihmfaume@gmail.com",
  "code": "482913",
  "newPassword": "MyNewPassword123"
}
```

**Response `200 OK`**
```json
{ "success": true, "message": "Password reset successfully" }
```

Failure cases:
```json
{ "success": false, "message": "Invalid or expired reset code" }
{ "success": false, "message": "New password must be at least 8 characters" }
```

`Invalid or expired reset code` covers a wrong code, an expired code, no pending reset, and an unregistered email — they are intentionally indistinguishable. After **5 wrong codes** the reset code is invalidated and a new one must be requested.

---

## Session Management

- Every login creates a `UserSession` record with a unique bearer token. Tokens are stored **SHA-256 hashed** — the raw token only exists in the login response, so a database leak cannot be used to hijack sessions.
- **Idle timeout:** 30 minutes of inactivity invalidates the session.
- **Absolute timeout:** 12 hours after login, regardless of activity.
- **Login lockout:** 5 consecutive failed password attempts lock the account for 15 minutes (`users.locked_until`).
- All OTP codes (onboarding, 2FA, password reset) are single-use, expire in 5 minutes, and are **invalidated after 5 wrong attempts**.
- **Resend cooldown:** a new OTP cannot be requested within 60 seconds of the previous one (onboarding OTP and password reset). `POST /api/onboarding/otp/send` returns an error during the window; `forgot-password` returns its usual generic response without sending another email.
- **Admin-gated paths** — callers whose role is not `Admin` get `403` on: `/api/users`, `/api/roles`, `/api/role-permissions`, `/api/permissions`, `/api/otp-verifications`, `/api/audit-logs`, `/api/security-settings`, `/api/settings` (and sub-paths).
- All endpoints under `/api/**` require a valid `Authorization: Bearer <token>` header **except**:
  - `/api/auth/**` (login, logout, forgot-password, reset-password, verify-2fa)
  - `/api/onboarding/**` (public applicant self-service onboarding)
  - `/api/receipts/**` (public repayment receipt viewing)
  - `/api/loan-origination/contracts/*/print` (public printable contract page)
  - `/api/loan-origination/contracts/*/verify` (public contract verification page)
- Requests to protected endpoints without a valid/active token receive:

```json
{ "success": false, "message": "Unauthorized or session expired" }
```
with HTTP status `401`.

---

## Applicant Onboarding & KYC

Base path: `/api/onboarding`

Public endpoints (no auth token required) covering applicant registration, OTP verification, and KYC.

### POST `/api/onboarding/register`

Registers a new applicant and captures identification documents.

**Request body**
```json
{
  "firstName": "John",
  "middleName": "",
  "lastName": "Doe",
  "gender": "Male",
  "dateOfBirth": "1990-01-01",
  "phone": "0700000000",
  "email": "john@example.com",
  "address": "123 Street",
  "nationality": "Tanzanian",
  "occupation": "Software Engineer",
  "locationName": "Dar es Salaam City Center",
  "locationPin": "TZ-DOM-001",
  "isReturning": false,
  "nidaNumber": "NIDA123",                     // required
  "nidaDocumentPath": "/uploads/nida-123.pdf", // required (idScanFilePath also satisfies this)
  "tinNumber": "TIN123",                       // optional
  "tinDocumentPath": "/uploads/tin-123.pdf",   // optional
  "idScanFilePath": "/uploads/id-scan-1.jpg",
  "idScanFileName": "id-scan-1.jpg",
  "idScanMimeType": "image/jpeg"
}
```

**Response `200 OK`**
```json
{
  "success": true,
  "message": "Applicant registered. Proceed to OTP verification.",
  "data": {
    "id": 1,
    "applicantNo": "APP-1786436767272",
    "firstName": "John",
    "lastName": "Doe",
    "status": "IDENTITY_VERIFICATION",
    "address": "123 Street",
    "nationality": "Tanzanian",
    "occupation": "Software Engineer",
    "locationName": "Dar es Salaam City Center",
    "locationPin": "TZ-DOM-001",
    "isReturning": false,
    "createdAt": "2026-08-11T11:26:07.272"
  }
}
```

**Duplicate email `200 OK`**
```json
{ "success": false, "message": "This email is already registered. Use the resend-code or returning-applicant flow to continue." }
```

Applicant emails must be unique — a `UNIQUE` index (`uk_applicant_email`) backs this at the database level. If the existing applicant is marked `isReturning`, the message directs the caller to the returning-applicant KYC check instead.

### Stepped registration flow

Registration can also be completed step-by-step; each call advances the applicant `status` and is rejected if the steps arrive out of order:

```
1. POST /api/onboarding/personal-details   -> status PERSONAL_DETAILS
2. POST /api/onboarding/address-details    -> status ADDRESS_DETAILS          (requires applicantId)
3. POST /api/onboarding/identification     -> status IDENTITY_VERIFICATION    (requires applicantId; captures NIDA/TIN numbers + ID scan)
4. POST /api/onboarding/otp/send + /otp/verify -> status OTP_VERIFIED
5. POST /api/onboarding/kyc/decision       -> status KYC_APPROVED | REJECTED   (staff-authenticated)
```

**Step 1 body** — `firstName`, `middleName`, `lastName`, `gender`, `dateOfBirth`, `phone`, `email`, `isReturning`. **Step 2 body** — `applicantId`, `address`, `locationName`, `locationPin`. **Step 3 body** — `applicantId`, `nationality`, `occupation`, `nidaNumber` (**required**), `nidaDocumentPath` (**required** — `idScanFilePath` also satisfies this), `tinNumber` (optional), `tinDocumentPath` (optional), `idScanFilePath`, `idScanFileName`, `idScanMimeType`. Missing NIDA fields fail with `NIDA number is required` / `NIDA document file is required`. NIDA and TIN rows are written to `applicant_identification`; the ID scan file goes to `applicant_document`.

**Identification storage (no extra columns needed — existing schema):**

`applicant_identification` — one row per ID type:

| API field | Column | Example row |
|---|---|---|
| `nidaNumber` | `id_number` | `id_type='NIDA', id_number='1990…012'` |
| `nidaDocumentPath` | `document_path` | `document_path='docs/nida.pdf'` |
| `tinNumber` | `id_number` | `id_type='TIN', id_number='TIN123'` |
| `tinDocumentPath` | `document_path` | `document_path='docs/tin.pdf'` |

`document_path` is shared — each identification row carries its own document path, so NIDA and TIN both store their files there.

`applicant_document` — file records with metadata:

| API field | Column |
|---|---|
| `idScanFilePath` | `file_path` (`document_type='ID_SCAN'`) |
| `idScanFileName` | `file_name` |
| `idScanMimeType` | `mime_type` |

**Viewing stored files (staff, session token required):**

- `GET /api/applicant-documents/{id}/file` — streams the document (photos, ID scans, etc.) inline
- `GET /api/applicant-identifications/{id}/file` — streams the NIDA/TIN document inline

All extensions are served — the response `Content-Type` comes from `mime_type`, else guessed from the file extension, else `application/octet-stream`. `Content-Disposition: inline` renders images/PDFs in the browser; other types download. `file_path`/`document_path` may be a path under the upload dir, an absolute path, a `data:` base64 URI, or an `http(s)` URL (returned as a redirect). `404` when the row or the underlying file is missing.

**Frontend usage — important:** the raw `file_path`/`document_path` value is only a storage reference and is **not** a displayable URL. To show an applicant image or open a document, point the UI at the `/file` endpoint instead:

```html
<img src="/api/applicant-documents/12/file" />
<a href="/api/applicant-identifications/7/file" target="_blank">View NIDA document</a>
```

These routes require the session token — for `<img>`/`<a>` tags that cannot set headers, fetch the bytes yourself and create an object URL:

```js
const res = await fetch(`/api/applicant-documents/${doc.id}/file`, {
  headers: { Authorization: `Bearer ${sessionToken}` }
});
const blobUrl = URL.createObjectURL(await res.blob());
img.src = blobUrl;
```

The status names the **last completed step** — an applicant at `PERSONAL_DETAILS` is ready for the address step. Out-of-order calls fail with `success=false` and a message naming the expected step. `POST /api/onboarding/register` (single call, lands directly on `IDENTITY_VERIFICATION`) remains supported for backward compatibility.

### POST `/api/onboarding/otp/send`

Generates and sends a one-time password (also logged as a `Notification` row — inspect via `GET /api/notifications`). `channel: "EMAIL"` delivers a real email via Gmail SMTP (requires the `MAIL_PASSWORD` env var — see the README); `SMS` is logged only, no SMS gateway is wired yet.

**Request body**
```json
{
  "applicantId": 1,
  "channel": "EMAIL",
  "destination": "john@example.com"
}
```

**Response `200 OK`**
```json
{ "success": true, "message": "OTP sent to john@example.com" }
```

OTP expires in **5 minutes** and is single-use.

### POST `/api/onboarding/otp/verify`

**Request body**
```json
{ "applicantId": 1, "code": "761211" }
```

**Response `200 OK`**
```json
{ "success": true, "message": "OTP verified successfully" }
```

On success, applicant status moves to `OTP_VERIFIED`.

Failure cases:
```json
{ "success": false, "message": "No pending OTP for this applicant" }
{ "success": false, "message": "OTP has expired" }
{ "success": false, "message": "Invalid OTP code" }
```

### POST `/api/onboarding/identification/verify`

Manual staff verification of a NIDA/TIN identification record.

**Request body**
```json
{ "identificationId": 1, "verifiedBy": 1 }
```

**Response `200 OK`**
```json
{ "success": true, "message": "Identification marked as verified" }
```

### POST `/api/onboarding/kyc/check-returning/{applicantId}`

Re-checks an existing, still-valid KYC record for a returning applicant (`isReturning = true`). Skips full KYC if a prior `APPROVED` record has not expired (valid for 12 months).

**Response `200 OK`** (valid existing KYC found)
```json
{
  "success": true,
  "message": "Existing KYC still valid; applicant may proceed",
  "data": { "id": 1, "status": "APPROVED", "expiresAt": "2027-08-11T11:27:15.879" }
}
```

**Response** (no valid KYC — full KYC required)
```json
{ "success": false, "message": "No valid existing KYC found; full KYC required" }
```

### POST `/api/onboarding/kyc/decision`

Staff decision recording full KYC approval/rejection for a new applicant.

**Request body**
```json
{
  "applicantId": 1,
  "status": "APPROVED",
  "remarks": "All documents verified",
  "verifiedBy": 1
}
```
`status` is either `APPROVED` or `REJECTED`.

**Response `200 OK`**
```json
{
  "success": true,
  "message": "KYC decision recorded",
  "data": {
    "id": 1,
    "status": "APPROVED",
    "verificationType": "FULL_KYC",
    "expiresAt": "2027-08-11T11:27:15.879",
    "applicantId": 1
  }
}
```

Applicant status becomes `KYC_APPROVED` or `REJECTED` accordingly. A rejected applicant's application stops here (per spec, application halts on KYC failure).

### GET `/api/onboarding/{applicantId}/status`

Fetches the applicant record and current onboarding status.

**Response `200 OK`**
```json
{
  "id": 1,
  "applicantNo": "APP-1786436767272",
  "firstName": "John",
  "lastName": "Doe",
  "status": "KYC_APPROVED",
  "nationality": "Tanzanian",
  "occupation": "Software Engineer",
  "isReturning": false
}
```

**Applicant status lifecycle:** `PERSONAL_DETAILS` → `ADDRESS_DETAILS` → `IDENTITY_VERIFICATION` → `OTP_VERIFIED` → `KYC_APPROVED` (or `REJECTED`)
Every transition is recorded in `applicant_status_history` (personal details → `PERSONAL_DETAILS`, address → `ADDRESS_DETAILS`, identification → `IDENTITY_VERIFICATION`, OTP verify → `OTP_VERIFIED`, KYC outcome → `KYC_APPROVED`/`REJECTED`).

### GET `/api/applicant-status-historys/applicant/{applicantId}`

Requires a valid session token. Returns the applicant's status transitions in chronological order — feed this to the onboarding stepper/timeline.

**Response `200 OK`**
```json
[
  { "id": 1, "applicantId": 1, "oldStatus": null, "newStatus": "IDENTITY_VERIFICATION", "changedBy": null, "remarks": "Applicant registered", "changedAt": "2026-11-04T09:00:00" },
  { "id": 2, "applicantId": 1, "oldStatus": "IDENTITY_VERIFICATION", "newStatus": "OTP_VERIFIED", "changedBy": null, "remarks": "OTP verified", "changedAt": "2026-11-04T09:04:00" },
  { "id": 3, "applicantId": 1, "oldStatus": "OTP_VERIFIED", "newStatus": "KYC_APPROVED", "changedBy": 2, "remarks": "Documents verified", "changedAt": "2026-11-04T11:20:00" }
]
```

Stepper mapping (status = last completed step): `PERSONAL_DETAILS` → step 1 done, `ADDRESS_DETAILS` → step 2 done, `IDENTITY_VERIFICATION` → step 3 done, `OTP_VERIFIED` → step 4 done, `KYC_APPROVED` → step 5 done, `REJECTED` → rejected.

Read-only list/by-id (`GET`, `GET /{id}`) also exists under `/api/applicant-status-historys`. History is append-only — rows are written by the onboarding service; no API writes.

---

## Loan Origination

Base path: `/api/loan-origination`

All endpoints require a valid session token (see [Session Management](#session-management)). This is the workflow that turns an approved applicant (`Applicant.status = KYC_APPROVED`) into a disbursement-ready `Loan`.

**Interest convention:** `interestRate` is an **annual percentage rate** (e.g. `24` for 24% p.a.), `tenure`/`finalTenure` are in **months**. `interestMethod` is `FLAT` (simple interest over the tenure) or `REDUCING` (declining-balance EMI amortization).

**Application status lifecycle:**
```
SUBMITTED → (guarantor/collateral verification, if required) → CREDIT_APPROVED | REJECTED
→ PENDING_APPROVAL (one Approval per ApprovalLevel) → APPROVED | REJECTED
→ CONTRACT_GENERATED → CONTRACT_SIGNED → LOAN_CREATED
```

### POST `/api/loan-origination/applications/submit`

Submits a new loan application for an applicant whose KYC is `APPROVED`.

**Request body**
```json
{
  "applicantId": 1,
  "loanOfficerId": 2,
  "requestedAmount": 5000000,
  "interestMethod": "REDUCING",
  "interestRate": 24,
  "tenure": 12,
  "penaltyRate": 2,
  "guarantorRequired": true,
  "collateralRequired": false,
  "creditAssessmentRequired": false
}
```

**Response `200 OK`**
```json
{ "success": true, "message": "Loan application submitted successfully", "data": { "id": 1, "applicationNo": "LA-1786...", "status": "SUBMITTED", ... } }
```

### POST `/api/loan-origination/applications/{applicationId}/guarantors/{guarantorId}/verify`

Guarantor must first be created via `POST /api/guarantors` with `applicationId` set. Marks the guarantor `VERIFIED` only if both flags are true.

**Request body**
```json
{ "idVerified": true, "exposureVerified": true, "verifiedBy": 2, "remarks": "ID and exposure confirmed" }
```

### POST `/api/loan-origination/applications/{applicationId}/guarantors/{guarantorId}/otp/send`

Sends a 6-digit OTP to the guarantor's `email` (requires a session token — staff trigger this). The code is hashed into `otp_verification` (`guarantor_id` set, `channel=EMAIL`), expires in **24 hours**, is single-use, max **5 attempts**, and a resend is refused within **60 seconds** of the last send. Fails if the guarantor has no email on record.

```json
{ "success": true, "message": "OTP sent to guarantor email guarantor@example.com" }
```

### POST `/api/loan-origination/applications/{applicationId}/guarantors/{guarantorId}/otp/verify`

Staff enter the code the guarantor received. On success the guarantor is marked `VERIFIED` (a `guarantor_verification` row is written with `verifiedBy`/`verifiedAt`/`remarks`), satisfying the credit-assessment gate. Requires a session token.

**Request body**
```json
{ "code": "123456", "verifiedBy": 2, "remarks": "optional — defaults to 'Verified via OTP sent to <email>'" }
```

**Errors:** `No pending OTP for this guarantor`, `OTP has expired`, `Invalid OTP code` (max 5 attempts, then the code is invalidated — request a new one).

### Guarantor deactivate / activate (soft delete)

Guarantors are never hard-deleted. `DELETE /api/guarantors/{id}` sets `is_active=false`; `POST /api/guarantors/{id}/activate` restores it to `true`. New rows default to `is_active=true`.

While deactivated, the guarantor is ignored by the credit-assessment gate (doesn't count toward "all guarantors must be VERIFIED") and `verify`/`otp/send`/`otp/verify` return `"Guarantor is deactivated"`. The row stays visible in `GET /api/guarantors` and the workflow view.

### POST `/api/loan-origination/applications/{applicationId}/collaterals/{collateralId}/verify`

Collateral must first be created via `POST /api/collaterals` with `applicationId` set.

**Request body**
```json
{ "ownershipVerified": true, "existingPledgeVerified": true, "verifiedBy": 2, "remarks": "Title deed verified, no existing pledge" }
```

### POST `/api/loan-origination/applications/{applicationId}/credit-assessment`

Runs a debt-to-income check. Requires all guarantors/collaterals `VERIFIED` first (if required by the application). Existing debts are pulled automatically from `/api/existing-debts` by `applicantId`.

If the application was submitted with `creditAssessmentRequired: false`, this endpoint immediately sets the application to `CREDIT_APPROVED` without running DTI checks. In that case `income` and `expenses` are not required.

**Request body (normal DTI assessment)**
```json
{ "income": 2000000, "expenses": 800000, "hasPendingPayments": false, "assessedBy": 3, "notes": "Stable income" }
```

**Request body (credit assessment disabled)**
```json
{ "assessedBy": 3, "notes": "Credit assessment not required" }
```

**Response `200 OK`**
```json
{ "success": true, "message": "Credit assessment recorded: APPROVE", "data": { "decision": "APPROVE", "cashFlow": 1200000, ... } }
```
On `APPROVE` the application moves to `CREDIT_APPROVED`; on `REJECT` it moves to `REJECTED`.

### POST `/api/loan-origination/applications/{applicationId}/approve`
### POST `/api/loan-origination/applications/{applicationId}/reject`

Routes the application through the active `ApprovalHierarchy`'s ordered `ApprovalLevel`s (one decision per level, in order). The approver's role (via `Role.name`) must match `ApprovalLevel.requiredRole`.

**Request body**
```json
{ "approverId": 4, "comments": "Looks good" }
```

On the final level's `APPROVED` decision the application becomes `APPROVED`; any `REJECTED` decision at any level halts the application as `REJECTED`.

### POST `/api/loan-origination/applications/{applicationId}/generate-contract`

Requires application status `APPROVED`. Creates a `LoanContract` (status `GENERATED`) using the application's requested amount/rate/tenure. Application moves to `CONTRACT_GENERATED`.

### POST `/api/loan-origination/contracts/{contractId}/send`

Requires contract status `GENERATED`. Sends a "Loan Contract Ready for Download" email to the applicant's email address with a public link to the printable contract. Sets contract status to `SENT`.

### GET `/api/loan-origination/contracts/{contractId}/print`

**Public** — no session token required.

Returns a printable HTML contract page for the borrower to download/print, sign, and return to the office. The page includes:

- the contract number, borrower details, loan terms, and a signature line
- a **"Download / Print Contract"** button (hidden in the printed/PDF output)
- a **QR code** that links to `GET /api/loan-origination/contracts/{contractId}/verify` for contract authenticity verification

### GET `/api/loan-origination/contracts/{contractId}/verify`

**Public** — no session token required.

Returns a contract verification HTML page that can be used to confirm the contract is registered in the Fundora system. Scanning the QR code on the printed contract opens this page.

The page displays:

- contract number, borrower, principal, tenure, interest rate
- whether the contract is `SIGNED` (green badge) or its current status
- generated/signed timestamps

### POST `/api/loan-origination/contracts/{contractId}/sign`

Requires contract status `SENT`. Upload the signed hard copy as `multipart/form-data`. Creates a `ContractDocument` record, stores the uploaded file, and marks the contract `SIGNED`. The loan application then moves to `CONTRACT_SIGNED`.

**Request**
```
Content-Type: multipart/form-data
```

| Part | Type | Description |
|---|---|---|
| `file` | file (required) | The signed contract document (PDF, image, etc.) |

**Response `200 OK`**
```json
{ "success": true, "message": "Contract signed", "data": { "id": 1, "status": "SIGNED", ... } }
```

### POST `/api/loan-origination/contracts/{contractId}/create-loan`

Requires contract status `SIGNED`. Creates the `Loan` record (`status = PENDING_DISBURSEMENT`), computing `interestAmount`/`totalAmount` via the flat or reducing-balance formula matching the application's `interestMethod`. Application moves to `LOAN_CREATED`. See [Disbursement & Repayment Schedule](#disbursement--repayment-schedule) for the next step.

### GET `/api/loan-origination/applications/{applicationId}/workflow`

Aggregated view of the full origination workflow for one application: the application itself, guarantors, collaterals, credit assessments, approvals, the latest contract, the created loan (if any), and the full status history.

---

## Loan Application Process Tracking

Base path: `/api/loan-applications`. Requires a valid session token.

Tracks a loan application through a multi-stage wizard. The application is created as a `DRAFT` and can be edited until the administrator finalizes it. Once finalized, the record is locked and the origination workflow takes over.

**Application status lifecycle:**
```
DRAFT (currentStage: APPLICANT → LOAN_DETAILS → ...) → SUBMITTED (finalized)
```

### POST `/api/loan-applications/start`

Starts a new draft application for a `KYC_APPROVED` applicant.

**Request body**
```json
{
  "applicantId": 1,
  "loanOfficerId": 2
}
```

**Response `200 OK`**
```json
{
  "success": true,
  "message": "Loan application started",
  "data": {
    "id": 1,
    "applicationNo": "LA-1786...",
    "applicantId": 1,
    "loanOfficerId": 2,
    "status": "DRAFT",
    "currentStage": "APPLICANT",
    "finalized": false,
    "createdAt": "2026-08-14T09:50:00",
    "updatedAt": "2026-08-14T09:50:00"
  }
}
```

Failure cases:
```json
{ "success": false, "message": "Applicant not found" }
{ "success": false, "message": "Applicant must have an approved KYC before a loan application can be started" }
```

### PUT `/api/loan-applications/{id}/progress`

Saves progress for a draft application. Any provided fields are updated and `currentStage` is recorded. Called automatically as the administrator completes each stage.

**Request body**
```json
{
  "currentStage": "LOAN_DETAILS",
  "requestedAmount": 5000000,
  "interestMethod": "REDUCING",
  "interestRate": 24,
  "tenure": 12,
  "penaltyRate": 2,
  "guarantorRequired": true,
  "creditAssessmentRequired": false,
  "collateralRequired": false,
  "loanOfficerId": 2
}
```

`currentStage` is optional — common values are `APPLICANT`, `LOAN_DETAILS`, `GUARANTOR`, `COLLATERAL`, `CREDIT_ASSESSMENT`, `APPROVAL`, `CONTRACT`, `SUBMITTED`.

**Response `200 OK`**
```json
{
  "success": true,
  "message": "Progress saved",
  "data": { ... }
}
```

Failure cases:
```json
{ "success": false, "message": "Loan application not found" }
{ "success": false, "message": "Application is already finalized and cannot be edited" }
```

### GET `/api/loan-applications/latest`

Resumes the most recent non-finalized application for an applicant.

**Query parameter**
- `applicantId` (required)

**Response `200 OK`**
```json
{
  "success": true,
  "message": "In-progress application retrieved",
  "data": {
    "id": 1,
    "status": "DRAFT",
    "currentStage": "LOAN_DETAILS",
    "finalized": false,
    ...
  }
}
```

Failure:
```json
{ "success": false, "message": "No in-progress application found for this applicant" }
```

### POST `/api/loan-applications/{id}/finalize`

Finalizes the draft application and transitions it to `SUBMITTED`. After finalization the record is locked; no further edits are allowed.

**Response `200 OK`**
```json
{
  "success": true,
  "message": "Loan application finalized and submitted",
  "data": {
    "id": 1,
    "status": "SUBMITTED",
    "currentStage": "SUBMITTED",
    "finalized": true,
    "submittedAt": "2026-08-14T10:00:00",
    ...
  }
}
```

Failure cases:
```json
{ "success": false, "message": "Loan application not found" }
{ "success": false, "message": "Application is already finalized" }
{ "success": false, "message": "Requested amount must be greater than zero" }
{ "success": false, "message": "Tenure must be greater than zero" }
{ "success": false, "message": "Interest rate is required" }
```

---

## Disbursement & Repayment Schedule

Base path: `/api/disbursement`. Requires a valid session token. Picks up where Loan Origination leaves off: a `Loan` with `status = PENDING_DISBURSEMENT`.

### POST `/api/disbursement/loans/{loanId}/disburse`

Disburses the loan to a `MemberAccount` belonging to the same applicant, then automatically generates the full `RepaymentSchedule` + `Installment` rows (amortized using the application's `interestMethod`: `FLAT` = equal principal/interest per period, `REDUCING` = declining-balance EMI). A loan can only be disbursed once.

**Request body**
```json
{
  "accountId": 1,
  "amount": 1000000,
  "paymentMethod": "BANK_TRANSFER",
  "referenceNumber": "TXN-00123",
  "approvedBy": 4,
  "processedBy": 2
}
```
`amount` is optional — defaults to the loan's `principalAmount` if omitted.

**Response `200 OK`**
```json
{ "success": true, "message": "Loan disbursed and repayment schedule generated", "data": { "id": 1, "status": "COMPLETED", "loanId": 1, "amount": 1000000, ... } }
```
On success the `Loan.status` becomes `ACTIVE`, `disbursementDate` is set to today, and `maturityDate` is recalculated from the disbursement date.

Failure cases:
```json
{ "success": false, "message": "Loan must be PENDING_DISBURSEMENT to disburse (current: ACTIVE)" }
{ "success": false, "message": "Disbursement account does not belong to the loan's applicant" }
{ "success": false, "message": "This loan has already been disbursed" }
```

### GET `/api/disbursement/loans/{loanId}/schedule`

Returns the loan, its (latest) `RepaymentSchedule`, and the full ordered list of `Installment`s.

**Response `200 OK`**
```json
{
  "success": true,
  "message": "Repayment schedule retrieved",
  "data": {
    "loan": { "id": 1, "status": "ACTIVE", "principalAmount": 1000000, "totalAmount": 1071154.86, ... },
    "schedule": { "id": 1, "loanId": 1, "startDate": "2026-08-11", "endDate": "2027-02-11", "frequencyDays": 30, "totalScheduledAmount": 1071154.86, "status": "ACTIVE" },
    "installments": [
      { "id": 1, "installmentNo": 1, "dueDate": "2026-09-11", "principalDue": 158477.86, "interestDue": 20000.00, "totalDue": 178477.86, "outstandingAmount": 178477.86, "status": "PENDING" },
      { "id": 2, "installmentNo": 2, "dueDate": "2026-10-11", ... }
    ]
  }
}
```

---

## Payments & Penalties

Base path: `/api/payments-workflow`. Requires a valid session token. Operates on a `Loan` with `status = ACTIVE` (i.e. already disbursed — see [Disbursement & Repayment Schedule](#disbursement--repayment-schedule)).

### POST `/api/payments-workflow/loans/{loanId}/accrue-penalties`

Scans the loan's installments and charges a **one-time** late penalty (`Installment.outstandingAmount × LoanApplication.penaltyRate%`) on any installment past its due date (plus any active `GracePeriod.graceDays` for the loan). Idempotent per installment — an installment is only charged once (checked via existing `Penalty` rows), so calling this repeatedly will not compound penalties. Overdue installments are marked `OVERDUE`.

**Response `200 OK`**
```json
{
  "success": true,
  "message": "1 penalty(ies) accrued",
  "data": [ { "id": 1, "loanId": 1, "installmentId": 2, "rate": 2.00, "amount": 3570.52, "appliedDate": "2026-10-15", "status": "ACTIVE", "remarks": "Late payment penalty for installment #2" } ]
}
```
A daily cron job also runs this at 06:30 UTC for all active loans.

### POST `/api/repayment-reminders/send?upcomingWindowDays=3`

Sends repayment reminders to borrowers with installments due within `upcomingWindowDays` (default 3) or already overdue. For each qualifying installment, an email is sent if the applicant has an email address, and a `Notification` record is logged. Triggered automatically at 06:00 UTC daily; can also be called manually.

**Response `200 OK`**
```json
{
  "success": true,
  "message": "Repayment reminders sent",
  "data": {
    "upcoming": 0,
    "overdue": 1,
    "emailsSent": 1,
    "notificationsLogged": 1
  }
}
```

### POST `/api/payments-workflow/loans/{loanId}/pay`

Records a payment and allocates it across unpaid installments **in due-date order**, using a **penalty → interest → principal** waterfall per installment before moving to the next. Updates `Loan.outstandingPrincipal/outstandingInterest/outstandingPenalty`. If every installment becomes `PAID`, the loan is closed (`Loan.status = CLOSED`, `RepaymentSchedule.status = COMPLETED`).

**Request body**
```json
{ "amount": 178525.81, "paymentMethod": "MOBILE_MONEY", "referenceNumber": "PMT-00045", "receivedBy": 2 }
```

**Response `200 OK`**
```json
{
  "success": true,
  "message": "Payment recorded and allocated",
  "data": {
    "payment": { "id": 1, "loanId": 1, "amount": 178525.81, "status": "COMPLETED", "paymentDate": "2026-09-11", ... },
    "allocations": [ { "id": 1, "paymentId": 1, "installmentId": 1, "principalAmount": 158525.81, "interestAmount": 20000.00, "penaltyAmount": 0.00, "totalAllocated": 178525.81 } ],
    "loan": { "id": 1, "status": "ACTIVE", "outstandingPrincipal": 841474.19, "outstandingInterest": 51154.86, "outstandingPenalty": 0.00, ... },
    "unallocatedAmount": 0.00
  }
}
```
`unallocatedAmount` is any leftover amount the payment exceeded the total outstanding balance by (not currently stored anywhere — refund/credit handling is a future enhancement).

Failure cases:
```json
{ "success": false, "message": "Loan must be ACTIVE to accept payments (current: PENDING_DISBURSEMENT)" }
{ "success": false, "message": "Payment amount must be greater than zero" }
{ "success": false, "message": "No repayment schedule found for this loan" }
```

### GET `/api/payments-workflow/loans/{loanId}/balance`

Returns the loan, its full installment list, total outstanding balance, and the next unpaid installment.

**Response `200 OK`**
```json
{
  "success": true,
  "message": "Loan balance retrieved",
  "data": {
    "loan": { "id": 1, "status": "ACTIVE", ... },
    "installments": [ ... ],
    "totalOutstanding": 892629.05,
    "nextDueInstallment": { "id": 2, "installmentNo": 2, "dueDate": "2026-10-11", "status": "PENDING", ... }
  }
}
```

---

## Collections, Recovery, NPL & GL

Two base paths: `/api/collections-workflow` (NPL classification, collection cases, recovery, write-off) and `/api/gl-workflow` (GL double-entry posting). Both require a valid session token.

### POST `/api/collections-workflow/loans/{loanId}/classify-npl?classifiedBy=1`

Scans the loan's installments, computes the maximum overdue days across unpaid installments, and classifies the loan into a standard NPL bucket:

| Overdue days | Classification |
|---|---|
| 0 | `CURRENT` |
| 1–30 | `WATCH` |
| 31–90 | `SUBSTANDARD` |
| 91–180 | `DOUBTFUL` |
| >180 | `LOSS` |

`Loan.overdueDays` is updated and `Loan.isNpl = true` once overdue days reach 90+. Creates an `NplClassification` record. A daily cron job runs this at 07:00 UTC for all active loans; the endpoint can also be called on-demand.

**Response `200 OK`**
```json
{ "success": true, "message": "Loan classified as SUBSTANDARD (45 days overdue)", "data": { "id": 1, "loanId": 1, "overdueDays": 45, "classificationDate": "2026-10-26", "classification": "SUBSTANDARD", "classifiedBy": 1 } }
```

### POST `/api/collections-workflow/loans/{loanId}/open-case`

Opens a `CollectionCase` (`status = OPEN`). Requires `Loan.overdueDays > 0` (run NPL classification first) and no other open case for the loan. A daily cron job also opens cases automatically at 07:15 UTC for all active overdue loans.

**Request body**
```json
{ "assignedTo": 3, "remarks": "First follow-up call scheduled" }
```

### POST `/api/collections-workflow/cases/{caseId}/activities`

Logs a `CollectionActivity` against an `OPEN` case (call, SMS, visit, etc.).

**Request body**
```json
{ "activityType": "PHONE_CALL", "description": "Reminded borrower of overdue installment", "performedBy": 3, "outcome": "PROMISED_TO_PAY" }
```

### POST `/api/collections-workflow/cases/{caseId}/close`

Closes the case (`status = CLOSED`). Body: `{ "remarks": "Borrower paid in full" }`.

### GET `/api/collections-workflow/cases/{caseId}`

Returns the case plus its full activity timeline.

### POST `/api/collections-workflow/cases/{caseId}/escalate-to-recovery`

Escalates an unresolved case to a `RecoveryCase` (`status = OPEN`). Requires `Loan.isNpl = true` and no other open recovery case for the loan. Marks the source `CollectionCase` as `ESCALATED`.

Body: `{ "remarks": "Handed to legal team" }`.

### POST `/api/collections-workflow/recovery-cases/{recoveryCaseId}/actions`

Logs a `RecoveryAction` (legal notice, asset seizure, negotiated settlement, etc.) against an `OPEN` recovery case. This is a record-only log — any actual money collected must still go through `POST /api/payments-workflow/loans/{loanId}/pay`.

**Request body**
```json
{ "actionType": "LEGAL_NOTICE", "description": "Demand letter sent via courier", "amount": 0, "documentPath": "/docs/notice-1.pdf", "performedBy": 5 }
```

### POST `/api/collections-workflow/recovery-cases/{recoveryCaseId}/close`

Closes the recovery case. Body: `{ "remarks": "..." }`.

### POST `/api/collections-workflow/loans/{loanId}/write-off`

Terminal action for a bad loan. Requires `Loan.isNpl = true` and not already written off. Creates a `WriteOff` record for the full outstanding balance (principal + interest + penalty), zeroes out the loan's outstanding balances, sets `Loan.status = WRITTEN_OFF` and `Loan.isWrittenOff = true`, and auto-closes any open collection/recovery cases for the loan.

**Request body**
```json
{ "reason": "Borrower untraceable after 200 days overdue", "approvedBy": 1 }
```

---

### Chart of Accounts — `/api/chart-of-accounts`

The Chart of Accounts is the master list of GL accounts used for double-entry posting. It is managed through raw CRUD. All GL posting workflows require the following accounts to exist before the first use:

- `LOAN_RECEIVABLE`
- `CASH`
- `INTEREST_INCOME`
- `PENALTY_INCOME`
- `WRITE_OFF_EXPENSE`

These are seeded automatically on startup if missing.

**Account fields**

```json
{
  "id": 1,
  "accountCode": "LOAN_RECEIVABLE",
  "accountName": "Loan Receivable",
  "accountTypeName": "ASSET",
  "openingBalance": 0.00,
  "currentBalance": 0.00
}
```

- `accountCode` — unique short code (uppercase, no spaces)
- `accountName` — human-readable account name
- `accountTypeName` — classification such as `ASSET`, `LIABILITY`, `EQUITY`, `INCOME`, `EXPENSE`
- `openingBalance` — opening balance at the start of the accounting period
- `currentBalance` — running balance, updated by GL postings

**Endpoints (require session token)**

- `GET /api/chart-of-accounts` — list all accounts
- `GET /api/chart-of-accounts/{id}` — get one account
- `POST /api/chart-of-accounts` — create a new account
- `PUT /api/chart-of-accounts/{id}` — update an existing account
- `DELETE /api/chart-of-accounts/{id}` — delete an account

**Request `POST /api/chart-of-accounts`**

```json
{
  "accountCode": "SUSPENSE",
  "accountName": "Suspense Account",
  "accountTypeName": "ASSET",
  "openingBalance": 0,
  "currentBalance": 0
}
```

**Response `200 OK`**

```json
{
  "id": 12,
  "accountCode": "SUSPENSE",
  "accountName": "Suspense Account",
  "accountTypeName": "ASSET",
  "openingBalance": 0,
  "currentBalance": 0
}
```

---

### GL Posting — `/api/gl-workflow`

The GL workflow posts standard double-entry bookkeeping entries automatically from loan, payment, and write-off events. Each endpoint is idempotent — calling it a second time for the same source record returns a clear error instead of double-posting.

Before posting, the required Chart of Accounts must exist. The system will fail with a clear message if an account is missing.

#### POST `/api/gl-workflow/disbursements/{disbursementId}/post`

Records a loan disbursement as:

- **Debit** `LOAN_RECEIVABLE` — disbursed principal
- **Credit** `CASH` — disbursed principal

#### POST `/api/gl-workflow/payments/{paymentId}/post`

Records a repayment, using the payment allocation breakdown:

- **Debit** `CASH` — full payment amount
- **Credit** `LOAN_RECEIVABLE` — principal portion
- **Credit** `INTEREST_INCOME` — interest portion
- **Credit** `PENALTY_INCOME` — penalty portion, only if non-zero

#### POST `/api/gl-workflow/write-offs/{writeOffId}/post`

Records a bad-loan write-off:

- **Debit** `WRITE_OFF_EXPENSE` — write-off amount
- **Credit** `LOAN_RECEIVABLE` — write-off amount

**Response `200 OK` (all three endpoints)**

```json
{
  "success": true,
  "message": "Payment posted to GL",
  "data": {
    "transaction": {
      "id": 1,
      "transactionNo": "GLT-1786...",
      "transactionType": "REPAYMENT",
      "loanId": 1,
      "paymentId": 1,
      "totalAmount": 178525.81,
      "status": "POSTED"
    },
    "entries": [
      { "id": 1, "glTransactionId": 1, "accountId": 2, "entryType": "DEBIT",  "amount": 178525.81, "description": "Payment received" },
      { "id": 2, "glTransactionId": 1, "accountId": 1, "entryType": "CREDIT", "amount": 158525.81, "description": "Principal repayment" },
      { "id": 3, "glTransactionId": 1, "accountId": 3, "entryType": "CREDIT", "amount": 20000.00,  "description": "Interest income" }
    ]
  }
}
```

**Failure example — missing account**

```json
{
  "success": false,
  "message": "Missing chart of accounts: create 'LOAN_RECEIVABLE' and 'CASH' via /api/chart-of-accounts first"
}
```

---

## Reports & Dashboards

Base paths: `/api/dashboard` and `/api/reports`. Requires a valid session token.

Provides a high-level dashboard and read-only aggregated reports of the loan portfolio, NPL classification, collections aging, collection efficiency, and the GL trial balance.

### GET `/api/dashboard`

Returns a high-level operational dashboard.

**Response `200 OK`**
```json
{
  "success": true,
  "message": "Dashboard retrieved",
  "data": {
    "totalApplicants": 1,
    "activeLoans": 0,
    "pendingApprovals": 1,
    "overdueLoans": 0,
    "nplLoans": 0,
    "totalDisbursed": 1000000.00,
    "totalOutstanding": 0,
    "totalCollectedToday": 0,
    "totalCollectedThisMonth": 178525.81
  }
}
```

### GET `/api/reports/portfolio-summary`

Returns a high-level overview of the loan portfolio.

**Response `200 OK`**
```json
{
  "success": true,
  "message": "Portfolio summary retrieved",
  "data": {
    "totalLoans": 5,
    "loansByStatus": { "ACTIVE": 3, "CLOSED": 1, "WRITTEN_OFF": 1 },
    "activeLoanCount": 3,
    "closedLoanCount": 1,
    "writtenOffLoanCount": 1,
    "nplLoanCount": 1,
    "totalPrincipalDisbursed": 3000000.00,
    "totalOutstandingPrincipal": 1500000.00,
    "totalOutstandingInterest": 120000.00,
    "totalOutstandingPenalty": 5000.00,
    "totalOutstanding": 1625000.00,
    "nplOutstandingAmount": 250000.00,
    "nplRatioPercent": 15.38,
    "portfolioAtRiskAmount": 300000.00,
    "portfolioAtRiskRatioPercent": 18.46,
    "totalWrittenOffAmount": 892629.05
  }
}
```

### GET `/api/reports/npl`

Breaks down the active portfolio into NPL classification buckets.

**Response `200 OK`**
```json
{
  "success": true,
  "message": "NPL report retrieved",
  "data": {
    "buckets": [
      { "classification": "CURRENT", "loanCount": 2, "outstandingAmount": 1000000.00 },
      { "classification": "WATCH", "loanCount": 0, "outstandingAmount": 0 },
      { "classification": "SUBSTANDARD", "loanCount": 0, "outstandingAmount": 0 },
      { "classification": "DOUBTFUL", "loanCount": 1, "outstandingAmount": 250000.00 },
      { "classification": "LOSS", "loanCount": 0, "outstandingAmount": 0 }
    ],
    "totalLoanCount": 3,
    "totalOutstandingAmount": 1250000.00,
    "nplLoanCount": 1,
    "nplOutstandingAmount": 250000.00,
    "nplRatioPercent": 20.00
  }
}
```

### GET `/api/reports/collections-aging`

Groups active overdue loans into aging buckets.

**Response `200 OK`**
```json
{
  "success": true,
  "message": "Collections aging report retrieved",
  "data": {
    "buckets": [
      { "bucketLabel": "1-30 days", "loanCount": 1, "outstandingAmount": 120000.00, "loanIds": [3] },
      { "bucketLabel": "31-60 days", "loanCount": 0, "outstandingAmount": 0, "loanIds": [] },
      { "bucketLabel": "61-90 days", "loanCount": 0, "outstandingAmount": 0, "loanIds": [] },
      { "bucketLabel": "90+ days", "loanCount": 1, "outstandingAmount": 250000.00, "loanIds": [5] }
    ],
    "totalOverdueLoanCount": 2,
    "totalOverdueAmount": 370000.00
  }
}
```

### GET `/api/reports/gl-trial-balance`

Computes debit/credit balances per chart of account.

**Response `200 OK`**
```json
{
  "success": true,
  "message": "GL trial balance retrieved",
  "data": {
    "accountBalances": [
      { "accountId": 1, "accountCode": "LOAN_RECEIVABLE", "accountName": "Loan Receivable", "accountType": "ASSET", "totalDebit": 3000000.00, "totalCredit": 1200000.00, "netBalance": 1800000.00 },
      { "accountId": 2, "accountCode": "CASH", "accountName": "Cash", "accountType": "ASSET", "totalDebit": 500000.00, "totalCredit": 3000000.00, "netBalance": -2500000.00 },
      { "accountId": 3, "accountCode": "INTEREST_INCOME", "accountName": "Interest Income", "accountType": "INCOME", "totalDebit": 0, "totalCredit": 120000.00, "netBalance": -120000.00 }
    ],
    "totalDebit": 3500000.00,
    "totalCredit": 3500000.00,
    "balanced": true
  }
}
```

### GET `/api/reports/collection-efficiency`

Compares total collected payments against the total expected from scheduled installments.

**Response `200 OK`**
```json
{
  "success": true,
  "message": "Collection efficiency retrieved",
  "data": {
    "totalExpected": 1071154.88,
    "totalCollected": 178525.81,
    "efficiencyPercent": 16.67,
    "paidInstallments": 1,
    "dueInstallments": 5
  }
}
```

---

## Notifications & Audit Trail

Two base paths: `/api/notifications` and `/api/audit-logs`. `/api/notifications` requires a valid session token; `/api/audit-logs` additionally requires the **Admin** role. Both are **read-only via API** — rows are written by system services (OTP sends, workflow actions, logins), never through endpoints.

### GET `/api/notifications`

Lists notifications with optional filters and a read/unread summary.

**Query parameters**
- `applicantId` (optional)
- `loanId` (optional)
- `status` (optional) — `SENT` or `READ`

**Response `200 OK`**
```json
{
  "success": true,
  "message": "Notifications retrieved",
  "data": {
    "total": 1,
    "read": 0,
    "unread": 1,
    "notifications": [
      { "id": 1, "applicantId": 1, "loanId": 1, "eventType": "TEST", "channel": "EMAIL", "recipient": "test@example.com", "message": "Test notification", "status": "SENT" }
    ]
  }
}
```

### POST `/api/notifications/{id}/read`

Marks a notification as read.

**Response `200 OK`**
```json
{
  "success": true,
  "message": "Notification marked as read",
  "data": { "id": 1, "status": "READ" }
}
```

### GET `/api/audit-logs`

Query audit logs. All parameters are optional.

**Query parameters**
- `userId` — user who performed the action
- `action` — e.g. `CREATE`, `UPDATE`, `DELETE`
- `entityType` — e.g. `LOAN`, `APPLICANT`
- `entityId`
- `from` — `yyyy-MM-dd`
- `to` — `yyyy-MM-dd`

**Response `200 OK`**
```json
{
  "success": true,
  "message": "Audit logs retrieved",
  "data": [
    { "id": 1, "userId": 1, "action": "CREATE", "entityType": "LOAN", "entityId": 1, "createdAt": "2026-08-12T07:00:05.894680038" }
  ]
}
```

### GET `/api/audit-logs/summary`

Returns a summary of total logs and breakdowns by `action` and `entityType`.

**Response `200 OK`**
```json
{
  "success": true,
  "message": "Audit log summary retrieved",
  "data": {
    "totalLogs": 1,
    "byAction": { "CREATE": 1 },
    "byEntityType": { "LOAN": 1 }
  }
}
```

---

## Settings & Security

These endpoints cover the v1 Settings module defaults and security configuration. All require a valid session token.

### GET `/api/company-profiles/current`

Returns the first (current) company profile used on contracts and notices.

**Response `200 OK`**
```json
{
  "id": 1,
  "companyName": "Fundora Credit Solutions",
  "email": "support@fundora.co.tz",
  "phone": "+255 700 000 000",
  "location": "Dar es Salaam, Tanzania",
  "currency": "TZS",
  "language": "English"
}
```

### GET `/api/approval-hierarchys/default`

Returns the active default approval hierarchy for v1.

**Response `200 OK`**
```json
{
  "id": 1,
  "name": "Default v1 hierarchy",
  "isDefault": true,
  "isActive": true
}
```

### GET `/api/approval-hierarchys/{id}/levels`

Returns the levels for a hierarchy, sorted by `levelNo`.

**Response `200 OK`**
```json
[
  { "id": 1, "hierarchyId": 1, "levelNo": 1, "levelName": "Admin", "requiredRole": "Admin", "isActive": true },
  { "id": 2, "hierarchyId": 1, "levelNo": 2, "levelName": "Manager", "requiredRole": "Loan Officer", "isActive": true },
  { "id": 3, "hierarchyId": 1, "levelNo": 3, "levelName": "Committee", "requiredRole": "Approver", "isActive": true }
]
```

### GET `/api/security/settings`

Returns the active security policy values.

**Response `200 OK`**
```json
{
  "success": true,
  "message": "Security settings retrieved",
  "data": {
    "minPasswordLength": 8,
    "idleTimeoutMinutes": 30,
    "absoluteTimeoutHours": 12,
    "otpExpiryMinutes": 5
  }
}
```

### `POST /api/users`

Creates a new user. Accepts `username`, `email`, `phone`, `firstName`, `middleName`, `lastName`, `roleId`, `isActive`, `isTwoFactorEnabled` and a plain-text `passwordHash` (validated against the minimum length of 8, then hashed before storage).

`PUT /api/users/{id}` **merges** fields — only values present in the request body are updated; omitted fields keep their current values. A non-blank `passwordHash` is re-hashed and replaces the stored password; a blank or missing one keeps the existing hash.

### Roles & permissions

Roles use standard CRUD under `/api/roles`. The `isSys` flag marks system-managed roles (all seeded roles — `Admin`, `Loan Officer`, `Approver` — are `isSys = true`).

```json
{ "id": 1, "name": "Admin", "description": "System Administrator", "isActive": true, "isSys": true, "createdAt": "2026-11-04T10:00:00", "updatedAt": "2026-11-04T10:00:00" }
```

#### GET `/api/permissions`

Read-only permission catalogue, seeded once at startup and never editable via the API. Results are sorted by `area`, `page`, `action`.

**Response `200 OK`**
```json
[
  { "id": 1, "area": "dashboard", "page": "stats", "action": "view", "label": "View dashboard stat cards", "kind": "stat" },
  { "id": 4, "area": "applicants", "page": null, "action": "view", "label": "View applicants", "kind": null },
  { "id": 90, "area": "reports", "page": null, "action": "view", "label": "View reports", "kind": null }
]
```

`page` is `null` when the permission covers the whole area. `kind` is only set for dashboard widgets (`stat`, `chart`, `list`). Unique key on `(area, page, action)`.

#### GET `/api/roles/{id}/permissions`

Returns the `Permission` objects granted to a role — an empty array when none are assigned.

#### PUT `/api/roles/{id}/permissions`

Replaces the role's **entire** permission set inside a transaction. The body is a JSON array of permission ids; duplicates are ignored and every id must exist in the catalogue.

**Request body**
```json
[1, 2, 3, 90]
```

**Response `200 OK`**
```json
{
  "success": true,
  "message": "Role permissions updated",
  "data": [
    { "id": 1, "area": "dashboard", "page": "stats", "action": "view", "label": "View dashboard stat cards", "kind": "stat" }
  ]
}
```

Failure:
```json
{ "success": false, "message": "One or more permission ids are invalid" }
```

Deleting a role also removes its `role_permissions` rows. The seeded `Admin` role is granted the full catalogue on startup; other roles start empty and are configured through this endpoint.

---

## Generic CRUD Modules

The following modules currently expose standard REST CRUD (`GET`, `GET /{id}`, `POST`, `PUT /{id}`, `DELETE /{id}`) under `/api/<resource>` and **require a valid session token** (see [Session Management](#session-management)).

**Workflow-driven via `/api/loan-origination`** (see [Loan Origination](#loan-origination)) — use the dedicated endpoints instead of raw CRUD for status transitions on: `loan-applications`, `guarantors`, `guarantor-verifications`, `collaterals`, `collateral-verifications`, `credit-assessments`, `approvals`, `approval-hierarchies`, `approval-levels`, `loan-contracts`, `loans`, `application-status-histories`.

**Workflow-driven via `/api/onboarding`** (see [Applicant Onboarding & KYC](#applicant-onboarding--kyc)): `applicant-status-historys` — rows are written automatically on each status transition; the timeline endpoint is `GET /api/applicant-status-historys/applicant/{applicantId}`.

**Workflow-driven via `/api/disbursement`** (see [Disbursement & Repayment Schedule](#disbursement--repayment-schedule)): `disbursements`, `repayment-schedules`, `installments`.

**Workflow-driven via `/api/payments-workflow`** (see [Payments & Penalties](#payments--penalties)): `payments`, `payment-allocations`, `penalties`. `grace-periods` are still raw CRUD — create one to grant a loan leeway before penalty accrual kicks in.

**Workflow-driven via `/api/collections-workflow`** (see [Collections, Recovery, NPL & GL](#collections-recovery-npl--gl)): `collection-cases`, `collection-activities`, `npl-classifications`, `recovery-cases`, `recovery-actions`, `write-offs`.

**Workflow-driven via `/api/gl-workflow`** (see [Collections, Recovery, NPL & GL](#collections-recovery-npl--gl)): `gl-transactions`, `gl-entries`. `chart-of-accounts` is still raw CRUD — seed the required account codes there before posting.

Raw CRUD on all the above remains available for initial data entry (e.g. creating a `Guarantor`/`Collateral`/`MemberAccount`/`GracePeriod`/`ChartOfAccount` row before verification/disbursement/accrual/posting) and admin corrections.

**Exception — soft delete:** `DELETE /api/guarantors/{id}` does not remove the row; it deactivates it (`is_active=false`). Use `POST /api/guarantors/{id}/activate` to reactivate.

**Read-only via API** (system services write the rows; no POST/PUT/DELETE exposed): `otp-verifications`, `notifications`, `audit-logs`, `applicant-status-historys`, `application-status-historys`.

**No workflow/business rules yet** — direct data-entry endpoints pending later phases (notifications, audit trail views):

`applicants`, `applicant-documents`, `applicant-identifications`, `chart-of-accounts`, `collateral-documents`, `collateral-releases`, `company-profiles`, `contract-documents`, `existing-debts`, `financial-profiles`, `grace-periods`, `guarantor-liabilities`, `kyc-verifications`, `member-accounts`, `roles`, `users`

Example (`loan-applications`):

```
GET    /api/loan-applications
GET    /api/loan-applications/{id}
POST   /api/loan-applications
PUT    /api/loan-applications/{id}
DELETE /api/loan-applications/{id}
```

Example (`applicants`):

```
`POST`/`PUT` return `{ "success": true, "message": "...", "data": {...} }` and respond `409` with a failure body when the `email` is already used by another applicant (applicant emails are unique).

GET    /api/applicants
GET    /api/applicants/{id}
POST   /api/applicants
PUT    /api/applicants/{id}
DELETE /api/applicants/{id}
```

Refer to the corresponding model class under `src/main/java/com/fundora/creditsolutions/model` for the exact field names accepted in the request body (fields use `snake_case` internally but are serialized as `camelCase` JSON, e.g. `requested_amount` → `requestedAmount`).

---

## Error Format

Unhandled validation/framework errors return Spring Boot's default error shape:

```json
{
  "timestamp": "2026-08-10T14:27:16.003+00:00",
  "status": 400,
  "error": "Bad Request",
  "path": "/api/auth/login"
}
```

Business-logic failures (onboarding, auth) use the `ApiResponse` / `AuthResponse` shape:

```json
{ "success": false, "message": "<reason>" }
```

Unauthorized/expired session:

```json
{ "success": false, "message": "Unauthorized or session expired" }
```
(HTTP `401`)
