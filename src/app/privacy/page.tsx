import Link from "next/link";

export const metadata = {
  title: "Privacy Policy — Drover",
  description: "How Drover collects, uses, and protects data.",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">{title}</h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
        {children}
      </div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-white dark:bg-zinc-950">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-6">
        <Link href="/" className="flex items-center gap-1.5">
          <span className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Drover
          </span>
          <span className="h-1.5 w-1.5 rounded-full bg-amber-400" aria-hidden />
        </Link>
        <Link
          href="/"
          className="text-sm font-medium text-zinc-600 transition hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          Back to home
        </Link>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Privacy Policy
        </h1>
        <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">Effective date: June 22, 2026</p>

        <p className="mt-6 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          Drover (&ldquo;Drover,&rdquo; &ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;) provides software
          that helps direct-to-consumer brands manage their TikTok Shop affiliate creator programs. This Privacy
          Policy explains what information we collect, how we use it, who we share it with, and the choices available
          to you. Drover is operated by Millad Afshar (sole proprietor, DBA Drover), located at 5017 Gresham Dr, El
          Dorado Hills, CA 95762, United States.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          This policy applies to the Drover web application and the marketing site at droverlabs.app (together, the
          &ldquo;Service&rdquo;). Drover is a business-to-business product intended for use by brand operators and
          their teams. It is not directed to consumers or to children.
        </p>

        <Section title="1. Who our users are">
          <p>
            Our direct users are representatives of brands (our &ldquo;Customers&rdquo;) who sign in to manage
            affiliate creator programs. When a Customer connects their TikTok Shop account to Drover, we process data
            from TikTok&rsquo;s APIs on that Customer&rsquo;s behalf and at their direction. In that respect Drover acts
            as a service provider (processor) to the Customer for the TikTok-derived data, and as the controller for
            the account and usage data we collect directly from our users.
          </p>
        </Section>

        <Section title="2. Information we collect">
          <p><strong>Account information.</strong> When you create an account or sign in, we collect your name, email address, and authentication credentials. Passwords are handled by our authentication provider and stored only in hashed form; we do not have access to your plaintext password.</p>
          <p><strong>Brand configuration data.</strong> Information you enter to configure your program, such as brand criteria, scoring preferences, approved product claims, and content-brief settings.</p>
          <p><strong>TikTok Shop integration data.</strong> When you authorize Drover to connect to your TikTok Shop account, we receive and store OAuth access and refresh tokens and basic shop identifiers needed to make authorized API calls on your behalf. Tokens are stored server-side and are used only to operate the Service for your account.</p>
          <p><strong>Creator and marketplace data.</strong> On your instruction, we retrieve data about affiliate creators from TikTok&rsquo;s Creator Marketplace and affiliate APIs, such as public creator profile information and performance metrics. This data is processed to score creators, support your approval decisions, and operate outreach workflows.</p>
          <p><strong>Usage and audit data.</strong> We maintain an append-only audit trail of key actions taken in the Service, along with standard technical logs needed to operate, secure, and troubleshoot the Service.</p>
          <p>We do not knowingly collect special categories of personal data, and we do not collect data from individuals under 18.</p>
        </Section>

        <Section title="3. How we use information">
          <p>We use the information above to provide and operate the Service and your account; score and rank affiliate creators against your brand-specific criteria; generate compliance-conscious content briefs and run FTC/FDA-oriented compliance scans; manage creator approval workflows and outreach on your behalf; maintain an audit trail of decisions; secure the Service and prevent abuse; and communicate with you about your account and material changes.</p>
          <p>We do not sell personal information, and we do not use creator or Customer data to train third-party models.</p>
        </Section>

        <Section title="4. How we share information">
          <p>We share information only as needed to operate the Service. We rely on a small number of sub-processors, all of which process data in the United States: <strong>Vercel Inc.</strong> (application hosting), <strong>Supabase, Inc.</strong> (database, authentication, and storage), and <strong>Anthropic, PBC</strong> (AI content generation for briefs and compliance scanning). Each provider processes data on our behalf and is not authorized to use it for its own purposes.</p>
          <p>To operate the integration, we exchange data with TikTok Shop&rsquo;s APIs using the authorization you grant. Data obtained through TikTok&rsquo;s APIs is used solely to provide the Service to the authorizing Customer and is handled in accordance with TikTok&rsquo;s developer terms.</p>
          <p>We may disclose information if required by law or to protect the rights, safety, or property of Drover, our users, or others. If Drover is involved in a merger, acquisition, or sale of assets, information may be transferred as part of that transaction.</p>
        </Section>

        <Section title="5. Data security">
          <p>We take a least-privilege approach to data access. Data is encrypted in transit (TLS) and at rest. Tenant data is isolated using row-level security so each account can access only its own data. Trusted server-side operations and user-facing requests use separate database credentials, and credentials and access tokens are stored server-side and are not exposed in logs or to client code. No method of transmission or storage is completely secure, and we cannot guarantee absolute security.</p>
        </Section>

        <Section title="6. Data retention">
          <p>We retain account, configuration, and audit data for as long as your account is active and as needed to provide the Service and support accountability for outreach decisions. When you close your account or request deletion, we delete or de-identify your data within a reasonable period, except where we are required to retain it to comply with legal obligations, resolve disputes, or enforce agreements.</p>
        </Section>

        <Section title="7. Your choices and rights">
          <p>You may request to access, correct, or delete the personal information we hold about you, and you may disconnect your TikTok Shop authorization at any time, which revokes our ongoing access to that data. Depending on your location, you may have additional rights under applicable law. To make a request, contact us using the details below.</p>
          <p>Because Drover is a business product, requests from individuals whose data we process on behalf of a Customer (for example, affiliate creators) may be directed to the relevant Customer, and we will assist that Customer in responding.</p>
        </Section>

        <Section title="8. Children's privacy">
          <p>The Service is intended for business users and is not directed to individuals under 18. We do not knowingly collect personal information from children. If you believe a child has provided us information, contact us and we will delete it.</p>
        </Section>

        <Section title="9. International users">
          <p>Drover is operated from the United States, and all processing occurs in the United States. If you access the Service from outside the United States, you understand that your information will be processed in the United States.</p>
        </Section>

        <Section title="10. Changes to this policy">
          <p>We may update this Privacy Policy from time to time. When we make material changes, we will update the effective date above and, where appropriate, notify you. Your continued use of the Service after changes take effect constitutes acceptance of the updated policy.</p>
        </Section>

        <Section title="11. Contact us">
          <p>
            If you have questions about this Privacy Policy or our handling of your data, contact Drover (Millad
            Afshar, sole proprietor) at{" "}
            <a className="underline hover:text-zinc-900 dark:hover:text-zinc-200" href="mailto:milliafshar@gmail.com">
              milliafshar@gmail.com
            </a>
            , 5017 Gresham Dr, El Dorado Hills, CA 95762, United States.
          </p>
        </Section>
      </main>

      <footer className="border-t border-zinc-100 dark:border-zinc-900">
        <div className="mx-auto flex w-full max-w-5xl flex-col items-start justify-between gap-3 px-6 py-8 text-sm text-zinc-500 sm:flex-row sm:items-center">
          <p>© {new Date().getFullYear()} Drover</p>
          <div className="flex items-center gap-5">
            <Link href="/privacy" className="transition hover:text-zinc-900 dark:hover:text-zinc-200">Privacy</Link>
            <a href="mailto:milliafshar@gmail.com" className="transition hover:text-zinc-900 dark:hover:text-zinc-200">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
