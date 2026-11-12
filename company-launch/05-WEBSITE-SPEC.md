# 05 — Website Spec

Built by Claude Code in a **new, separate GitHub repo** (`[name]-site`), not in any employer repo.

## Stack (recommended)
- Astro + Tailwind CSS, content in Markdown/MDX.
- Motion: GSAP + ScrollTrigger for scroll scenes; Lenis for smooth scroll; SVG line-draw animations.
- Hosting: Netlify (already familiar), forms via Netlify Forms.
- Analytics: Plausible or GA4 (decide with cookie notice).

Why Astro: static, fast, good SEO, little JavaScript by default; animations are added only where needed.

## Sitemap
| Page | Purpose |
|---|---|
| Home | Offer, how it works, sample sheet preview, coverage map, CTA |
| Services | Plan sets, structural letters, electrical stamps, battery add-on, revisions |
| Sample Work | Labeled concept sets and permitted past work, sheet viewer |
| Coverage | State map: "stamping available" vs "design only" |
| Resources | Articles: code notes, AHJ tips (feeds SEO and social) |
| Partners / Careers | PE partnership call, designer talent network |
| About | Founder, process, how PE review works |
| Contact / Get a quote | Form: company, state, system size, attachments |
| Legal | Privacy, terms |

## Signature animations
1. **Hero:** a roof plan draws itself line by line, modules snap onto the array, dimension lines and title block fade in.
2. **How it works:** scroll-pinned 4 steps (send site info → design → PE review → permit-ready set).
3. **Single-line diagram:** current "flows" from array to inverter to main panel on scroll.
4. **Sheet viewer:** sample pages flip like a plan set, with zoom.
5. **Coverage map:** states light up amber.
6. Micro-interactions: amber underline on links, cursor crosshair over drawings.

Rules: respect `prefers-reduced-motion`; no animation blocks content; LCP under 2.5 s on mobile.

## Content rules
- Every sample tagged "Concept design" or "Client project (shared with permission)".
- No client logos, counts or testimonials until real.
- State claims match signed PE partners.

## SEO basics
- Title pattern: "[Service] for [State] installers | [NAME]".
- Pages per launch state (CA, TX, FL, AZ) with real local content: adopted code cycle, common AHJ requirements, utility notes.
- Schema: Organization, Service, Article, FAQ.

## Acceptance
- [ ] Lighthouse mobile: Performance 90+, Accessibility 95+, SEO 95+.
- [ ] Form submission reaches the business inbox.
- [ ] Works at 360 px width; keyboard navigable.
- [ ] OG images per page in brand style.
