# 09 — Domain and Email

Chrome side panel does the navigation and form filling; you enter payment and verification codes.

## Steps
1. Buy domain after name checks pass (Cloudflare Registrar, Namecheap or Squarespace Domains). Budget about $10–15/yr for `.com`. Turn on auto-renew and registrar lock.
2. Google Workspace Business Starter (about $7 per user per month): 1 paid user.
3. Addresses: one mailbox `[first]@domain`, plus free aliases `hello@`, `quotes@`, `careers@`, `partners@`.
4. DNS records: MX, SPF (`v=spf1 include:_spf.google.com ~all`), DKIM (generate in Admin console), DMARC (start `p=none`, move to `quarantine` after 2–4 weeks of clean reports).
5. Point domain to Netlify for the website (A/CNAME or Netlify DNS).
6. Signature: name, title, company, site; no licence claims you do not hold.
7. Test: send to Gmail and Outlook, check headers show SPF/DKIM/DMARC pass.

## Accounts to create with the business email
LinkedIn page admin (via personal profile), Instagram, Facebook Page/Meta Business Suite, GitHub org or repo, Netlify, Canva, Higgsfield, Google Search Console, Google Business Profile (only if eligible: service-area business with real address verification).

## Security
Password manager, 2FA on every account, recovery codes stored offline. Never paste passwords into chat.

## First-year cost estimate
| Item | Cost |
|---|---|
| Domain | ~$12 |
| Workspace, 1 user | ~$84 |
| Netlify | $0 (free tier) |
| Canva / Meta Suite | $0–$120 |
| Higgsfield | plan price for the sprint month |
| LLC + registered agent | varies by state, roughly $100–$500 |
