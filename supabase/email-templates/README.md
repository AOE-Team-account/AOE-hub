# Email templates for Supabase

Paste into Supabase: Authentication, Emails (under Notifications), Templates.

| Template in Supabase | Subject | Body file |
|---|---|---|
| Reset password | Reset your AOEhub password / 重置您的 AOEhub 密码 | reset-password.html |
| Confirm sign up | Welcome to AOEhub: confirm your email / 欢迎来到 AOEhub：请确认邮箱 | confirm-signup.html |

The links use `{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=...` so they work from any device and land on the hub's /auth/confirm page. Other templates (magic link, change email, invite) are not used by the hub and can stay as they are.

These are drafts; the final wording is written by Clara.
