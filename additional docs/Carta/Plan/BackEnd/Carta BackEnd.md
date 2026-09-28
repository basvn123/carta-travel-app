Here is the technical setup blueprint for the Carta admin architecture, continuing exactly where your codebase is today.

&nbsp;

## **Phase 1: Database Security & RPC Hardening**

Your existing security model relies on admin\_guard() and SECURITY DEFINER. This phase hardens that foundation to prevent token theft and accidental overwrites without changing the UI architecture.

&nbsp;

* **MFA (AAL2) Enforcement on Destructive Actions:**  
* 

  * **What to set up:** Modify the PostgreSQL RPCs for admin\_delete\_user and admin\_ban\_user.  
  * &nbsp;  
  * **How it works:** Inside the PL/pgSQL function, before executing the delete/ban, extract the Authenticator Assurance Level claim from the session: auth.jwt() \-\>\> 'aal'. If the value is not 'aal2', explicitly raise a PostgreSQL exception RAISE EXCEPTION 'MFA required for this action'. This ensures that even if an admin's session token is stolen, the attacker cannot execute destructive actions without the physical second factor.  
  * &nbsp;  
* **Audit Log Rollback State:**  
* 

  * **What to set up:** Upgrade the functions admin\_set\_config and admin\_set\_override.  
  * &nbsp;  
  * **How it works:** Instead of only logging the *new* value in the audit table, the RPC must first SELECT the current value from site\_config or content\_overrides. It then writes a JSONB object containing {"previous": {old\_val}, "new": {new\_val}} to the audit log, creating a complete historical ledger that allows you to instantly revert a broken configuration.  
  * &nbsp;  
* **Elevate Guard Tiers:**  
* 

  * **What to set up:** Update the internal tier checks for admin\_set\_config, admin\_set\_override, and admin\_set\_feedback\_status.  
  * &nbsp;  
  * **How it works:** Change their internal execution to require admin\_guard('destructive') instead of the standard read tier, as these functions immediately change what all public users see without a deployment.  
  * &nbsp;  
* **Config Visibility Scoping:**  
* 

  * **What to set up:** Add a public BOOLEAN DEFAULT false column to the site\_config PostgreSQL table.  
  * &nbsp;  
  * **How it works:** Rewrite the Row-Level Security (RLS) SELECT policy for the anon and authenticated roles to USING (public \= true) rather than USING (true). This prevents users from querying internal API keys or backend thresholds if you eventually store them in this table.  
  * &nbsp;

## **Phase 2: Public Content Moderation (EU DSA Compliance)**

Because trip\_plans can be set to is\_public \= true, Carta hosts user-generated content in the EU. You must set up tooling to comply with the Digital Services Act (DSA) Article 16 (Notice and Action mechanisms).

&nbsp;

* **Public Guides Index (Read Model):**  
* 

  * **What to set up:** An RPC named admin\_list\_public\_guides().  
  * &nbsp;  
  * **How it works:** Returns all rows in trip\_plans where is\_public \= true, ordered by newest first, joining the author's email and the plan's view counts. This feeds a new tab in AdminPage.jsx so you finally have visibility into what users are publishing.  
  * &nbsp;  
* **Electronic Notice Mechanism (The Reporting Pipeline):**  
* 

  * **What to set up:** A new table content\_reports and an anon-callable RPC report\_guide(plan\_id, reason, contact\_email).  
  * &nbsp;  
  * **How it works:** The DSA requires an electronic, accessible mechanism for anyone to report illegal content. This RPC inserts the user's report into the queue. It must be strictly rate-limited by IP/user (e.g., 5 per hour) using your existing paywall\_events or a dedicated rate-limit table to prevent spam attacks.  
  * &nbsp;  
* **The Takedown RPC:**  
* 

  * **What to set up:** A function admin\_unpublish\_guide(plan\_id, reason).  
  * &nbsp;  
  * **How it works:** This function sets is\_public \= false on the targeted trip plan and logs the action/reason in the audit table. Crucially, it must *never* delete the underlying row, as the user still owns their private itinerary data.  
  * &nbsp;  
* **DSAR (Data Subject Access Request) Export:**  
* 

  * **What to set up:** An export\_user\_data(target\_user\_id) RPC.  
  * &nbsp;  
  * **How it works:** Aggregates a user's rows across trip\_plans, trip\_plan\_stops, paywall\_events, and content\_overrides into a single downloadable JSON blob, placed next to the existing account deletion button to satisfy GDPR data portability requirements.  
  * &nbsp;

## **Phase 3: Operational Telemetry & Quota Monitoring**

You are already collecting rate limits and AI usage, but it is currently invisible to the admin.

&nbsp;

* **AI Usage Rollups & Telemetry:**  
* 

  * **What to set up:** A PostgreSQL function admin\_ai\_usage(days INT).  
  * &nbsp;  
  * **How it works:** This aggregates your existing ai\_usage and ai\_daily\_total tables. It must return: total daily consumption against the AI\_GLOBAL\_DAILY\_CAP, cache hit rates from ai\_plan\_cache, top 10 heaviest users, and count of user-cap rejections versus global-cap rejections.  
  * &nbsp;  
* **Model Fallback Tracking:**  
* 

  * **What to set up:** Update the logging inside the plan-day edge function.  
  * &nbsp;  
  * **How it works:** When the primary Gemini model fails and Carta falls back to the next model in the chain, log exactly which model provided the successful answer to the ai\_usage table. This surfaces in the admin panel as an early warning that the primary free-tier budget is exhausted.  
  * &nbsp;  
* **Edge Error Telemetry (Sentry):**  
* 

  * **What to set up:** Client-side interception of structured error codes (ai\_timeout, ai\_bad\_output, url\_unreachable).  
  * &nbsp;  
  * **How it works:** Because edge functions currently return these codes to the client to render toasts but persist them nowhere, set up a Sentry integration (or a simple database insert RPC) to log these specific failures before the toast is shown.  
  * &nbsp;

## **Phase 4: Content Override & Static Pipeline Console**

Carta's data is built statically into app\_data.json, but patched live via content\_overrides. You must set up tooling to prevent these live patches from becoming permanent tech debt.

&nbsp;

* **Review Lifecycle & Expiry:**  
* 

  * **What to set up:** Add review\_by (timestamp), status (verified, temporary, stale), and author\_note columns to the content\_overrides table.  
  * &nbsp;  
  * **How it works:** Forces admins to justify the patch and sets a date for when the pipeline bug causing the need for the patch should be fixed. The UI will highlight overdue overrides.  
  * &nbsp;  
* **Orphan Patch Detection:**  
* 

  * **What to set up:** A Next.js utility in the admin dashboard.  
  * &nbsp;  
  * **How it works:** It fetches the live app\_data.json from the public directory, extracts all valid item\_id keys, and diffs them against the active content\_overrides table. If an override targets an ID the pipeline has since dropped, the UI flags it as dead weight.  
  * &nbsp;  
* **JSON Diff Viewer:**  
* 

  * **What to set up:** An OverrideDiffViewer.jsx component.  
  * &nbsp;  
  * **How it works:** Renders a visual side-by-side comparison between the base object in app\_data.json and the JSON patch in the override table, so the admin sees exactly what is changing in production.  
  * &nbsp;  
* **Pipeline Health Metrics:**  
* 

  * **What to set up:** Upgrade the admin\_health() RPC.  
  * &nbsp;  
  * **How it works:** Include the timestamp of the last successful pipeline run, the row counts per layer (beach, lake, mountain, etc.), and the boolean result of the pipeline drift-gate to ensure the catalog is current.  
  * &nbsp;

## **Phase 5: UI Architecture & Defense-in-Depth**

* **Component Splitting:**  
* 

  * **What to set up:** Break the monolithic 1,347-line AdminPage.jsx into smaller, domain-specific modules.  
  * &nbsp;  
  * **How it works:** Move logic into /components/admin/UsersList.jsx, ConfigManager.jsx, AuditLog.jsx, and ModerationQueue.jsx. AdminPage.jsx becomes strictly a layout and tab-routing shell. This must happen *before* building the new UI features.  
  * &nbsp;  
* **Automated RPC Security Testing:**  
* 

  * **What to set up:** A .sql test file using pgTap (or Supabase's native testing).  
  * &nbsp;  
  * **How it works:** Write a table-driven test that iterates over an array of all admin\_\* functions. Set the role to standard authenticated (simulating a normal user) and assert that executing each function throws a "forbidden" exception. This prevents future migrations from accidentally bypassing the admin\_guard().  
  * &nbsp;  
* **Parse-Failure Queue:**  
* 

  * **What to set up:** A storage mechanism for failures in the parse-booking edge function.  
  * &nbsp;  
  * **How it works:** When the LLM returns ai\_bad\_output for a booking parsing request, store the failure metadata (excluding the actual user documents) with a strict retention window. This gives you a corpus of structural failures to use for improving the parsing prompt without violating user privacy.

&nbsp;