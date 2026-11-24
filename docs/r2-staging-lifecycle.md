# Staging bucket clean-up rule (AOE-INF-11)

The staging bucket (the one named in `R2_STAGING_BUCKET_NAME`) only holds files
on their way to the virus scan. Normally the hub deletes each file there within
minutes. A few things can be left behind:

- an upload link is still valid for up to 30 minutes (3 hours for the parts of a
  big file) after "complete" sealed the file, so someone could send a file to the
  old address again. It is never scanned or published, but it takes space;
- sealed copies (`sealed/...`) of uploads whose scan never finished;
- big uploads that were started but never finished (multipart).

The hub also refuses a "complete" that comes more than 3.5 hours after the upload
started, and the `check-pending-scans` job marks uploads that never finished
after a day. The rule below removes whatever is still left. It is a setting in
Cloudflare, not code, so it has to be added by hand once.

## The rule (staging bucket ONLY, never the main bucket)

Cloudflare dashboard > R2 object storage > the **staging** bucket > Settings >
Object lifecycle rules > **Add rule**, twice:

| Rule name | Applies to | Action |
|---|---|---|
| `staging-delete-after-7-days` | Whole bucket (leave prefix empty) | Delete objects **7 days** after upload |
| `staging-abort-multipart-1-day` | Whole bucket (leave prefix empty) | Abort incomplete multipart uploads **1 day** after start |

Why 7 days and not 1: R2 rules can only choose by prefix, so the rule also covers
sealed copies still waiting for a scan. 7 days leaves room for a scanner outage
of several days. Leftovers cost little; deleting a waiting file would fail that
upload.

Same rules with Wrangler (adds to the existing rules; run from your own computer,
logged in to Cloudflare):

```sh
npx wrangler r2 bucket lifecycle add <STAGING_BUCKET_NAME> staging-delete-after-7-days --expire-days 7
npx wrangler r2 bucket lifecycle add <STAGING_BUCKET_NAME> staging-abort-multipart-1-day --abort-multipart-days 1
npx wrangler r2 bucket lifecycle list <STAGING_BUCKET_NAME>
```

(Check `npx wrangler r2 bucket lifecycle add --help` first: option names can
change between Wrangler versions. Avoid `lifecycle set`: it replaces ALL rules
of the bucket.)

## Check

`npx wrangler r2 bucket lifecycle list <STAGING_BUCKET_NAME>` shows both rules,
and a test file uploaded to staging shows an `x-amz-expiration` header about 7
days out. Do **not** add this rule to the main bucket: it would delete members' files.
