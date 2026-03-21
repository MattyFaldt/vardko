# ADDITIONAL DEVELOPMENT RULES — Add to existing coding rules in CLAUDE.md

> **IMPORTANT: These rules are ADDITIONS to the existing coding rules already defined in CLAUDE.md and the project specification. Do NOT replace existing rules — ADD these to them.**
>
> **PRIORITY ORDER FOR ALL CODING RULES:**
> 1. **SECURITY is the highest priority** — all security requirements previously specified (encryption, GDPR, zero PII storage, audit trail, input validation, tenant isolation, OWASP hardening) always take precedence over everything else. If a development rule below conflicts with a security requirement, security wins.
> 2. The development rules below are the second highest priority.
> 3. All other coding conventions follow after.
>
> **Add these rules to the "Critical Rules" section in CLAUDE.md so they persist across all future sessions.**

> **These rules are NON-NEGOTIABLE. They apply to every function, component, endpoint, and feature you build. Violating any of these rules means the work must be redone.**

---

## Rule 1: FULL IMPLEMENTATION ONLY — No stubs, no placeholders, no demos

- Every function you write must be **fully implemented and production-ready**.
- **NEVER** write placeholder code such as `// TODO: implement later`, `console.log("not implemented")`, `throw new Error("not implemented")`, or empty function bodies.
- **NEVER** return hardcoded mock data, dummy values, or simulated responses from any function. Every function must operate on real data from the actual database, cache, or service it is designed to interact with.
- **NEVER** write simplified or "demo" versions of logic with the intention of replacing it later. Write the real version the first time.
- If a function depends on another function that does not yet exist, **stop and build the dependency first**, then come back and complete the original function.
- If you cannot fully implement something because of a missing external service or unclear requirement, **ask me** — do not create a stub.

## Rule 2: ZERO TEST DATA IN THE SYSTEM — No seed data, no fake records

- **NEVER** insert test data, seed data, demo users, sample records, placeholder organizations, fake clinics, or any other synthetic data into the database or cache as part of building a feature.
- The system must start completely empty. Data only enters the system through actual user actions via the UI or API.
- Database seed files (`seeds/`) are allowed ONLY for setting up the **schema** (e.g., enum values, system configuration defaults) — never for creating fake business data.
- If you need to verify a feature works, write an **automated test** (see Rule 3) — do not manually insert data.

## Rule 3: END-TO-END VERIFICATION OF EVERY UI FUNCTION

- For **every** user-facing function in the UI, you must verify the **complete chain** from button click to actual system effect:
  - Button click → event handler → API call → server route → business logic → database write → response → UI update
- After building a UI feature, **trace through the entire flow** and confirm:
  1. The button/form/action in the UI triggers the correct event handler
  2. The event handler calls the correct API endpoint with the correct payload
  3. The API route validates input, runs business logic, and persists to the real database
  4. The response is correctly handled by the UI and the user sees the real result
  5. The data actually exists in the database after the action
- Write a **Playwright E2E test** for every user-facing flow that validates this chain works from browser to database.
- **NEVER** mark a UI feature as complete until this verification is done.

## Rule 4: EVERY FUNCTION MUST HAVE AN API ENDPOINT

- **Every single feature** that exists in the application must be accessible through a documented REST API endpoint.
- If a user can do it in the UI, an external system must be able to do it via the API. No exceptions.
- The API endpoint must:
  1. Be properly routed (correct HTTP method and path)
  2. Validate all input with a Zod schema
  3. Enforce authentication and authorization
  4. Execute the same business logic as the UI path (shared service layer — never duplicate logic)
  5. Return a response following the standard API response format
  6. Be included in the OpenAPI documentation
  7. Have at least one integration test (happy path + error path)
- The UI must call the **same API endpoints** that external consumers would use. The frontend is just another API client. **NEVER** create separate internal-only routes for the UI that bypass the public API.

## Rule 5: SHARED SERVICE LAYER — No logic in routes or components

- All business logic lives in the **service layer** (`apps/api/src/services/`).
- API route handlers must be thin: validate input → call service → return response.
- React components must be thin: call API → render result.
- This ensures Rule 4 is automatically satisfied — the API and UI always share the same logic.

---

## Summary: The Checklist Before Any Feature Is "Done"

Before you tell me a feature is complete, confirm ALL of the following:

- [ ] Every function is fully implemented — no stubs, no TODOs, no mocks
- [ ] No test data or seed data was inserted into the system
- [ ] The UI flow works end-to-end: click → API → database → response → UI update
- [ ] A Playwright E2E test covers the UI flow
- [ ] A corresponding REST API endpoint exists and is documented
- [ ] The API endpoint has an integration test (happy path + error path)
- [ ] The API endpoint uses the same service layer as the UI
- [ ] The endpoint is included in the OpenAPI spec

**If any box is unchecked, the feature is not done. Go back and complete it.**
