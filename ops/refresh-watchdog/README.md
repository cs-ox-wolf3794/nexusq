# Independent refresh watchdog

This free Cloudflare Worker checks the production publication every five minutes. It triggers the existing GitHub refresh pipeline if quotes are at least four minutes old during the weekday 12:00–23:59 UTC operating window, or a full source refresh is overdue. It does not host the app, fetch market prices itself, change analytical methods or guarantee a market-data service level.

Full refresh targets: weekdays 06:19, 16:19, 18:19 and 22:19 UTC, plus Saturday 06:19. The watchdog catches up for two hours and retries a failed full attempt after ten minutes. Quote publication continues separately during that backoff.

## Credentials and deployment

- Cloudflare Workers Free. Use Wrangler with account/user read, Workers scripts write and Workers tail read access. No DNS, billing, zone, storage or paid service change is required.
- `GITHUB_ACTIONS_TOKEN`: dedicated fine-grained GitHub token restricted to `cs-ox-wolf3794/nexusq`, Actions read/write and mandatory metadata read. Set an explicit expiry, record its renewal date in the operator's credential manager and rotate before expiry. Do not reuse a broad development token.
- `WATCHDOG_SIGNING_KEY`: at least 40 random characters, stored both as a Cloudflare encrypted Worker secret and a GitHub Actions repository secret. Neither credential belongs in source, a browser bundle, a log or a chat.
- Install dependencies in this directory with `npm ci`. Deploy with `wrangler deploy`. Production configuration uses `ENABLED=true`; for a new account, deploy with `--var ENABLED:false` until the secrets and default-branch workflow are installed. Preserve the intended enabled state when publishing subsequent changes.
- No workers.dev endpoint, preview URL, public control route or HTTP dispatch switch. Only Cloudflare's scheduled handler starts recovery. Cron configuration can take up to 15 minutes to propagate.

## Duplicate prevention and truthful status

The Worker verifies manifest/file checksums, checks active GitHub work, then sends an expiring HMAC-signed ticket. The backup entry point verifies the signature, time window and recently used nonce, and rechecks whether newer data already covers the request. A backup-level lock and the common refresh lock prevent overlapping writers. Failed API inspection stops dispatch instead of flooding the queue. Work older than 22 minutes is reported as stalled; it is not silently cancelled.

`quotes.json.refresh.lastAutomaticAt`, `lastAutomaticSource` and `lastAutomaticRunUrl` identify a completed automatic publication. `lastScheduledAt` continues to represent GitHub cron only. Manual recovery preserves both histories. Accepted dispatch, enabled cron, successful build and fresh retrieval timestamps are not proof of fresh market observations. Production verification separately checks all quote observation/retrieval times, missing quotes, analytical coverage and source/QC health.

The backup still depends on GitHub Actions runners, GitHub Pages and the existing free providers. It covers a missing primary trigger; it cannot recover a complete GitHub outage, expired credentials or blocked providers. The app retains dated values and exposes these failures rather than inventing freshness.

## Verification before incident closure

1. Tail actual Cloudflare cron events and record scheduled time, decision and nonce. Never record credentials or signatures.
2. Observe at least three distinct unattended backup runs through authentication, refresh, data commit, deployment and live verification. Record run URLs, actual quote observation ages and automatic origin from the checksum-verified live publication.
3. Test recovery with the primary scheduled entry point disabled, keeping the reusable pipeline enabled. Let an actual Cloudflare tick detect overdue publication, then verify the replacement live data. Restore the primary entry point in a finally block even if verification fails.
4. Confirm healthy cycles do not dispatch duplicates and a manual recovery does not receive automatic credit. Run the full production verifier and inspect the client data-status alerts.
5. Check full-source recovery as well as quote-only recovery: NexSI constituent/model counts, news/guidance coverage, retained or failed source disclosures, and QC alerts. Missing evidence must not become a claim of no relevant news.
   For a bounded full-source drill between normal full-refresh slots, deploy with `--var FULL_REFRESH_REQUESTED_AT:<current-UTC-ISO-timestamp>`. The next real cron processes the request after the normal ten-minute full-attempt backoff. A successful full publication satisfies it; it expires after two hours. Remove the temporary variable after the drill. Record that this was an operator-requested full recovery serviced by automatic cron, not an ordinary calendar slot.
6. Record any unresolved primary-trigger issue and external-source limitations. Keep the incident open if repeated automatic refreshes or recovery cannot be demonstrated.

## Operations

Inspect Cloudflare scheduled logs and GitHub `Cloudflare backup refresh` / `Deploy` runs. Expired token or missing secret errors require credential renewal; an HTTP 401/403/429 is not a successful check. A stalled refresh requires inspecting the run before cancelling it. A deployment failure requires checking the build and manifest, not resetting data timestamps.

To pause recovery without changing data, deploy `ENABLED=false` in the same configuration. Keep GitHub scheduling and manual recovery available. To recover manually, run `Refresh data snapshots` with `quotes` or `full`; the resulting publication must remain identified as manual.
