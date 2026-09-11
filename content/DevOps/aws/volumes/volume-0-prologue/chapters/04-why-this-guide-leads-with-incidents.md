## Why This Guide Leads With Incidents

Most AWS material teaches you which buttons to press. That knowledge has a half-life of about eighteen months, because the buttons move.

The reasoning doesn't move. And the fastest route to the reasoning is through the failures, because AWS is unusually transparent about them — the company publishes detailed public postmortems, and the security research community has documented its breaches in forensic detail. That's a rare gift for a learner. You can read the actual account of the day a single mistyped command took down a large chunk of the web, and then go look at the feature they shipped afterward to make it impossible.

A few of the incidents waiting for you in later volumes:

- **April 2011.** A routine network change triggered a feedback loop in EBS where storage volumes frantically tried to re-replicate themselves, consuming the very capacity they needed to recover. Reddit, Quora, and Foursquare went dark. Netflix didn't. Volume 4 and Volume 8 explain why.
- **Christmas Eve 2012.** An operational process deleted state data belonging to the production load balancing service. Netflix went down on one of the highest-traffic nights of the year. Volume 4.
- **February 2017.** An engineer debugging the S3 billing system ran a command with a typo in one parameter. It removed far more capacity than intended, and S3 in us-east-1 stopped serving requests. A large portion of the internet went with it — including, memorably, status dashboards that were themselves hosted on S3 and therefore couldn't report the outage. Volume 5.
- **2019.** An attacker reached a misconfigured resource at Capital One, used a server-side request forgery to reach that odd `169.254.169.254` address, obtained temporary credentials, and exfiltrated data on roughly a hundred million people. The direct product consequence was IMDSv2. Volume 2.
- **April 2018.** Attackers hijacked BGP routes to hijack DNS — redirecting Route 53 answers for a cryptocurrency site to a server they controlled, and draining wallets. Volume 5.
- **December 2021.** A problem inside AWS's own internal network took down the control plane in us-east-1. Not the servers — the *ability to manage* the servers. Including, for many customers, the ability to fail over away from us-east-1. Volume 1.

Each of these is a lesson that no tutorial can substitute for.

---

