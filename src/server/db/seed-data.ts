import type { TicketPriority, TicketStatus } from "@/lib/domain";

/** Keys into the seeded Northwind team (see DEMO_ACCOUNTS). */
export type StaffKey = "olivia" | "adam" | "aisha" | "marco";

export interface SeedMessage {
  from: "customer" | StaffKey;
  internal?: boolean;
  hoursAfter: number;
  body: string;
}

export interface SeedTicket {
  subject: string;
  description: string;
  requester: [name: string, email: string];
  priority: TicketPriority;
  status: TicketStatus;
  assignee: StaffKey | null;
  daysAgo: number;
  thread: SeedMessage[];
}

/** Northwind Agency's support queue: the agency's clients reporting issues. */
export const NORTHWIND_TICKETS: SeedTicket[] = [
  {
    subject: "Checkout returns a 500 error after card payment",
    description:
      "Since this morning's deploy, customers on harborfitness.com see a 500 error right after paying for a membership. Stripe shows the charges as succeeded, so people are being billed but never receive their confirmation email or account access. We've had 14 complaints in two hours.",
    requester: ["Dana Whitfield", "dana@harborfitness.com"],
    priority: "urgent",
    status: "open",
    assignee: "aisha",
    daysAgo: 0,
    thread: [
      {
        from: "aisha",
        hoursAfter: 0.3,
        body: "Thanks Dana, I'm on it. I can reproduce the 500 on the confirmation step. Could you confirm whether any of the affected members used discount codes?",
      },
      {
        from: "customer",
        hoursAfter: 0.6,
        body: "Most of them did, we're running the SPRING25 promo this week. A couple paid full price though and still got the error.",
      },
      {
        from: "aisha",
        internal: true,
        hoursAfter: 0.9,
        body: "Datadog shows a spike in `POST /checkout/confirm` errors starting 09:12, right after release 4.18. Stack trace points at the welcome-email template: `membership.tier` is null for promo signups. Looping in Marco for the hotfix.",
      },
      {
        from: "marco",
        internal: true,
        hoursAfter: 1.2,
        body: "Hotfix PR is up: default the tier and make the email job retryable. I'll also backfill access for the 14 affected members once it's merged.",
      },
      {
        from: "customer",
        hoursAfter: 1.5,
        body: "Any ETA? Our front desk is getting calls from members who can't log in to book classes.",
      },
    ],
  },
  {
    subject: "Booking widget shows wrong timezone for London clinic",
    description:
      "Patients booking at our London location see appointment slots one hour off. Our Manchester clinic looks fine. Started after the clocks changed last weekend.",
    requester: ["Priya Raman", "priya@brightlinedental.co.uk"],
    priority: "high",
    status: "pending",
    assignee: "marco",
    daysAgo: 2,
    thread: [
      {
        from: "marco",
        hoursAfter: 2,
        body: "Hi Priya, the London location record has a fixed UTC offset instead of Europe/London, so it didn't pick up the DST change. I've corrected it on staging. Could you check a few slots there before we ship?",
      },
      { from: "customer", hoursAfter: 20, body: "Staging looks right now. I'll get our receptionist to double-check tomorrow morning." },
    ],
  },
  {
    subject: "Request: add Google Analytics 4 events to the new landing pages",
    description:
      "Marketing needs form submissions and CTA clicks on the three spring campaign landing pages tracked as GA4 conversions before the campaign launches next Monday.",
    requester: ["Tom Okafor", "tom@acmebakery.com"],
    priority: "normal",
    status: "open",
    assignee: "aisha",
    daysAgo: 1,
    thread: [
      { from: "aisha", hoursAfter: 3, body: "Happy to help, Tom. Do you want the events wired via GTM, or directly in the site code?" },
    ],
  },
  {
    subject: "Invoices PDF export is missing the VAT number",
    description: "The monthly invoice PDFs generated from the client portal no longer include our VAT registration number in the footer, which our accountant needs.",
    requester: ["Lena Fischer", "lena@nordlichtdesign.de"],
    priority: "high",
    status: "open",
    assignee: null,
    daysAgo: 1,
    thread: [],
  },
  {
    subject: "Site speed dropped after hero video was added",
    description: "Our homepage Lighthouse performance score fell from 92 to 54 after the new hero video went live. Mobile visitors are bouncing more.",
    requester: ["Carlos Mendes", "carlos@verdetravel.com"],
    priority: "normal",
    status: "pending",
    assignee: "marco",
    daysAgo: 4,
    thread: [
      {
        from: "marco",
        hoursAfter: 5,
        body: "The video is a 38 MB MP4 loaded eagerly. I'd suggest a compressed WebM with a poster image and lazy loading below 768px. Shall I go ahead?",
      },
      { from: "customer", hoursAfter: 30, body: "Yes please, but keep the video on desktop if possible. The client loves it." },
      { from: "marco", hoursAfter: 52, body: "Done on staging: the score is back to 89 on mobile. Waiting for your sign-off to deploy." },
    ],
  },
  {
    subject: "Password reset emails going to spam",
    description: "Several of our customers say the password reset email lands in their spam folder (mostly Outlook users).",
    requester: ["Grace Lee", "grace@lumenyoga.com"],
    priority: "normal",
    status: "resolved",
    assignee: "aisha",
    daysAgo: 6,
    thread: [
      {
        from: "aisha",
        hoursAfter: 4,
        body: "Your sending domain was missing a DMARC record and the SPF include for the email provider. I've sent the two DNS records to add.",
      },
      { from: "customer", hoursAfter: 26, body: "Added them yesterday. Our test reset just landed in the inbox." },
      { from: "aisha", hoursAfter: 27, body: "Great, I've verified the records too. Closing this one out; shout if it reappears." },
    ],
  },
  {
    subject: "Add a new team member to the CMS",
    description: "Please create an editor account for our new content writer, Sam (sam@acmebakery.com).",
    requester: ["Tom Okafor", "tom@acmebakery.com"],
    priority: "low",
    status: "closed",
    assignee: "adam",
    daysAgo: 9,
    thread: [{ from: "adam", hoursAfter: 1, body: "Done. Sam should have an invite in their inbox now." }],
  },
  {
    subject: "Contact form submissions not reaching our inbox",
    description: "We haven't received any enquiries through the website contact form since Friday. Normally we get 5-10 per day.",
    requester: ["Henrik Berg", "henrik@fjordarchitects.no"],
    priority: "urgent",
    status: "resolved",
    assignee: "marco",
    daysAgo: 11,
    thread: [
      {
        from: "marco",
        hoursAfter: 0.5,
        body: "Found it: the SMTP credentials expired on Friday. I've rotated them and replayed the 23 queued submissions to your inbox.",
      },
      { from: "customer", hoursAfter: 2, body: "Received them all, thank you for the quick turnaround!" },
    ],
  },
  {
    subject: "Update opening hours for the holidays",
    description: "Please update the opening hours banner on all location pages for the upcoming bank holiday.",
    requester: ["Priya Raman", "priya@brightlinedental.co.uk"],
    priority: "low",
    status: "resolved",
    assignee: "aisha",
    daysAgo: 12,
    thread: [{ from: "aisha", hoursAfter: 6, body: "Banner is live on all six location pages." }],
  },
  {
    subject: "Shopify product images loading slowly",
    description: "Collection pages take 6+ seconds to show product images on mobile.",
    requester: ["Mia Russo", "mia@russoceramics.com"],
    priority: "normal",
    status: "open",
    assignee: "marco",
    daysAgo: 3,
    thread: [],
  },
  {
    subject: "Accessibility audit findings on the signup flow",
    description: "Our accessibility consultant flagged missing labels and low contrast on the signup form. Report attached in the shared drive.",
    requester: ["Dana Whitfield", "dana@harborfitness.com"],
    priority: "high",
    status: "pending",
    assignee: "aisha",
    daysAgo: 5,
    thread: [
      { from: "aisha", hoursAfter: 8, body: "We've fixed 9 of the 11 findings. The remaining two need copy changes from your side; details in the doc." },
    ],
  },
  {
    subject: "Monthly SEO report for March",
    description: "Can we get the March SEO performance report before Thursday's board meeting?",
    requester: ["Carlos Mendes", "carlos@verdetravel.com"],
    priority: "normal",
    status: "closed",
    assignee: "adam",
    daysAgo: 16,
    thread: [{ from: "adam", hoursAfter: 20, body: "Report attached to the shared folder. Organic sessions up 18% month over month." }],
  },
  {
    subject: "Newsletter template broken in Outlook desktop",
    description: "Our latest newsletter renders with overlapping columns in Outlook 2019.",
    requester: ["Grace Lee", "grace@lumenyoga.com"],
    priority: "normal",
    status: "open",
    assignee: null,
    daysAgo: 2,
    thread: [],
  },
  {
    subject: "Cookie banner reappears on every page",
    description: "Visitors who accept cookies still see the banner again after navigating to another page.",
    requester: ["Lena Fischer", "lena@nordlichtdesign.de"],
    priority: "high",
    status: "open",
    assignee: "aisha",
    daysAgo: 0,
    thread: [],
  },
  {
    subject: "Request quote for a loyalty programme feature",
    description: "We'd like a points-based loyalty programme in the app. Could you send a rough estimate?",
    requester: ["Tom Okafor", "tom@acmebakery.com"],
    priority: "low",
    status: "pending",
    assignee: "adam",
    daysAgo: 7,
    thread: [{ from: "adam", hoursAfter: 30, body: "Sent a scoped estimate with two options by email. Happy to walk through it on a call." }],
  },
  {
    subject: "SSL certificate warning on staging site",
    description: "Our team sees a certificate warning when opening the staging URL.",
    requester: ["Henrik Berg", "henrik@fjordarchitects.no"],
    priority: "normal",
    status: "resolved",
    assignee: "marco",
    daysAgo: 8,
    thread: [{ from: "marco", hoursAfter: 3, body: "The staging certificate hadn't auto-renewed. Renewed and fixed the renewal job." }],
  },
  {
    subject: "Blog posts missing author bios",
    description: "Author bios disappeared from all blog posts after the theme update.",
    requester: ["Mia Russo", "mia@russoceramics.com"],
    priority: "low",
    status: "open",
    assignee: null,
    daysAgo: 6,
    thread: [],
  },
  {
    subject: "Double charge reported by a customer",
    description: "A customer says they were charged twice for one order (#58213). Can you check the payment logs?",
    requester: ["Mia Russo", "mia@russoceramics.com"],
    priority: "urgent",
    status: "pending",
    assignee: "marco",
    daysAgo: 1,
    thread: [
      {
        from: "marco",
        hoursAfter: 1,
        body: "The second charge is an authorization hold from a retried request; it will drop off within 5 business days. I've added an idempotency key to the checkout call so retries can't do this again.",
      },
    ],
  },
  {
    subject: "Map embed not showing on the contact page",
    description: "The Google Map on our contact page is blank.",
    requester: ["Carlos Mendes", "carlos@verdetravel.com"],
    priority: "normal",
    status: "resolved",
    assignee: "aisha",
    daysAgo: 10,
    thread: [{ from: "aisha", hoursAfter: 5, body: "The Maps API key was restricted to the old domain. Updated the restriction; map is back." }],
  },
  {
    subject: "Translate the pricing page into German",
    description: "We're launching in DACH next month and need the pricing page in German.",
    requester: ["Lena Fischer", "lena@nordlichtdesign.de"],
    priority: "normal",
    status: "open",
    assignee: "adam",
    daysAgo: 4,
    thread: [],
  },
  {
    subject: "Members can't upload profile photos",
    description: "Uploading a profile photo in the member area fails with 'file too large' even for small images.",
    requester: ["Dana Whitfield", "dana@harborfitness.com"],
    priority: "high",
    status: "open",
    assignee: "marco",
    daysAgo: 3,
    thread: [],
  },
  {
    subject: "Analytics dashboard access for new marketing lead",
    description: "Please give our new marketing lead, Ola, view access to the analytics dashboard.",
    requester: ["Henrik Berg", "henrik@fjordarchitects.no"],
    priority: "low",
    status: "closed",
    assignee: "adam",
    daysAgo: 13,
    thread: [{ from: "adam", hoursAfter: 2, body: "Access granted. Ola will get an email from Looker Studio." }],
  },
];

/** A second tenant, used to demonstrate (and test) tenant isolation. */
export const GLOBEX_TICKETS: SeedTicket[] = [
  {
    subject: "Globex: CRM sync failing overnight",
    description: "The nightly CRM sync has failed three nights in a row.",
    requester: ["Ravi Shah", "ravi@initech.example"],
    priority: "high",
    status: "open",
    assignee: null,
    daysAgo: 1,
    thread: [],
  },
  {
    subject: "Globex: update footer links",
    description: "Footer still links to the old careers page.",
    requester: ["Ravi Shah", "ravi@initech.example"],
    priority: "low",
    status: "resolved",
    assignee: null,
    daysAgo: 5,
    thread: [],
  },
];
