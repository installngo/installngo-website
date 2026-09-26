# installngo.com

Static website: no build step, no dependencies. Vercel serves the folder as-is.

    index.html        home page (corporate)
    danglio.html       Danglio product page, served at /danglio
    404.html          page-not-found
    terms.html        Terms of Service   (/terms)
    privacy.html      Privacy Policy     (/privacy)
    refunds.html      Refund Policy      (/refunds)
    assets/           styles.css, danglio.js (the swinging star), favicon, charm artwork
    vercel.json       clean URLs (/danglio), /dangle redirect, security headers, asset caching

## Before going live: fill these in (search for "[")
- terms.html and privacy.html: [LEGAL NAME] = your full legal name exactly as on your
  passport; [COUNTRY] = the country you are based in (appears twice in terms.html).
- privacy.html: [RETENTION PERIOD, e.g. 24 months].
- danglio.html (Pricing): the two [PRICE] values, e.g. $4.99.
- Paddle checks that Terms, Privacy and Refunds are reachable from the site: they are
  linked in every page's footer and in the Pricing section.
- Only cleared artwork is used (Lucky Star, Tulsi). Keep it that way.

## Preview locally
    npx serve .        then open http://localhost:3000

## Deploy to Vercel
From this folder, either:
- CLI:  npx vercel        (preview)   then   npx vercel --prod
- Git:  push this folder to a GitHub repo and import it in Vercel (Framework preset: Other, no build command, output directory: .)

Then add the domain: Vercel project, Settings, Domains, add installngo.com and www.installngo.com, and set the DNS records Vercel shows at your domain registrar.
