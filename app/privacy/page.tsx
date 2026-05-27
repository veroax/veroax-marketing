import Link from "next/link";

import { SUPPORT } from "@/lib/site";
export const metadata = {
  title: "Privacy Policy, Veroax",
  description: "Privacy Policy for Veroax disclosure analysis software.",
};

const EFFECTIVE_DATE = "May 20, 2026";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-white text-slate-900">
      {/* Header */}
      <header
        className="sticky top-0 z-50 border-b border-white/10 backdrop-blur-md"
        style={{ background: "linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)" }}
      >
        <div className="max-w-4xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="text-white font-bold text-xl tracking-tight">
            Veroax
          </Link>
          <Link
            href="/"
            className="text-sm text-indigo-200 hover:text-white transition-colors"
          >
            ← Back to veroax.com
          </Link>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-3xl mx-auto px-6 py-16">
        <div className="space-y-3 mb-12">
          <span className="inline-block bg-indigo-100 text-indigo-700 text-xs font-semibold uppercase tracking-widest px-4 py-1.5 rounded-full">
            Legal
          </span>
          <h1 className="text-4xl font-bold text-slate-900">Privacy Policy</h1>
          <p className="text-sm text-gray-500">
            Effective date: {EFFECTIVE_DATE}
          </p>
        </div>

        <article className="prose prose-slate max-w-none">
          <Section title="Quick summary">
            <p className="italic text-gray-600">
              This summary is for ease of reading. The detailed policy below controls if there is
              any conflict.
            </p>
            <ul>
              <li>
                <strong>Who we are:</strong> Veroax, Inc., a California corporation. We build AI-
                assisted disclosure analysis software for licensed real estate professionals.
              </li>
              <li>
                <strong>What we collect:</strong> account information (name, email, license
                number), billing information (handled by Stripe), and the disclosure documents
                you upload to be analyzed.
              </li>
              <li>
                <strong>How we use it:</strong> to provide the Service, deliver Reports, bill you,
                support you, and comply with law.
              </li>
              <li>
                <strong>Who we share it with:</strong> a small set of subprocessors that help us
                run the Service (Stripe, Vercel, Resend, our AI model providers). We do not sell
                your personal information, and we do not use Customer Content to train foundation
                models.
              </li>
              <li>
                <strong>How long we keep it:</strong> seller personal information uploaded with
                disclosure packages is purged from temporary processing storage after the Report
                is delivered. We keep a minimal audit log for up to seven (7) years for
                compliance and dispute-resolution purposes.
              </li>
              <li>
                <strong>Your rights:</strong> California residents have rights to know, delete,
                correct, and opt out of certain processing. Contact{" "}
                <a href={`mailto:${SUPPORT.email}`}>{SUPPORT.email}</a> to exercise them.
              </li>
            </ul>
          </Section>

          <Section title="1. Scope">
            <p>
              This Privacy Policy describes how Veroax, Inc. (&ldquo;Veroax,&rdquo; &ldquo;we,&rdquo;
              &ldquo;us,&rdquo; or &ldquo;our&rdquo;) collects, uses, discloses, and protects
              personal information in connection with the website at <strong>veroax.com</strong>,
              the Veroax disclosure analysis software, and any related services (collectively, the
              &ldquo;Service&rdquo;).
            </p>
            <p>
              Use of the Service is also subject to our{" "}
              <Link href="/terms" className="text-indigo-700 underline">
                Terms of Service
              </Link>
              .
            </p>
          </Section>

          <Section title="2. Information we collect">
            <p>We collect information in three categories:</p>

            <h3 className="text-base font-bold text-slate-900 mt-6 mb-2">
              a. Information you provide directly
            </h3>
            <ul>
              <li>
                <strong>Account and contact information:</strong> name, business email, phone
                number, real estate license number (e.g., California DRE number), brokerage
                affiliation, mailing address.
              </li>
              <li>
                <strong>Billing information:</strong> handled by our payment processor, Stripe.
                We do not store your full payment card number. We receive limited billing details
                from Stripe (card brand, last four digits, billing ZIP) and your subscription
                status.
              </li>
              <li>
                <strong>Support communications:</strong> the contents of emails, calls, or form
                submissions you send us.
              </li>
            </ul>

            <h3 className="text-base font-bold text-slate-900 mt-6 mb-2">
              b. Customer Content
            </h3>
            <p>
              When you use the Service to analyze a disclosure package, you upload documents such
              as Transfer Disclosure Statements (TDS), Seller Property Questionnaires (SPQ),
              Agent Visual Inspection Disclosures (AVID), Natural Hazard Disclosures (NHD),
              homeowner association documents, inspection reports, and other third-party
              disclosure materials. These documents frequently contain personal information about
              sellers (names, property addresses, mortgage balances, lender details) and about
              the property itself.
            </p>
            <p>
              We treat this Customer Content as confidential information processed on your
              behalf. You represent that you are authorized to upload it for the purpose of
              providing services to your buyer client in a transaction you are professionally
              engaged in.
            </p>

            <h3 className="text-base font-bold text-slate-900 mt-6 mb-2">
              c. Information we collect automatically
            </h3>
            <ul>
              <li>
                <strong>Log and device data:</strong> IP address, browser type and version,
                operating system, referrer URL, pages visited, timestamps, and similar diagnostic
                information.
              </li>
              <li>
                <strong>Cookies and similar technologies:</strong> we use a small number of
                first-party cookies to keep you signed in and to remember your preferences (such
                as monthly/annual pricing display). We may use a privacy-respecting analytics
                tool to understand aggregate usage patterns. We do not use third-party
                advertising cookies or sell your information to ad networks.
              </li>
            </ul>
          </Section>

          <Section title="3. How we use information">
            <p>We use personal information to:</p>
            <ul>
              <li>Provide, maintain, and improve the Service.</li>
              <li>Generate and deliver Reports.</li>
              <li>Verify eligibility for free trials by checking the license number you provide.</li>
              <li>Authenticate you, secure your account, and prevent fraud or abuse.</li>
              <li>Bill you and manage your subscription.</li>
              <li>Respond to support requests and other inquiries.</li>
              <li>Send you transactional emails about your account, Reports, and the Service.</li>
              <li>
                Send you optional product and marketing communications (with the ability to opt
                out at any time).
              </li>
              <li>Comply with legal obligations and enforce our Terms of Service.</li>
              <li>
                Conduct internal analytics, perform debugging, and develop new features in a way
                that does not identify individual users in published materials.
              </li>
            </ul>
            <p>
              <strong>
                We do not use Customer Content to train foundation models, and we do not sell
                personal information.
              </strong>
            </p>
          </Section>

          <Section title="4. Subprocessors and sharing">
            <p>
              We share personal information with a small set of service providers
              (&ldquo;subprocessors&rdquo;) that perform functions on our behalf and are bound by
              confidentiality and security obligations. As of the effective date above, our
              subprocessors include:
            </p>
            <ul>
              <li>
                <strong>Stripe, Inc.</strong> for payment processing and subscription billing.
              </li>
              <li>
                <strong>Vercel Inc.</strong> for application hosting, edge delivery, and serverless
                compute.
              </li>
              <li>
                <strong>Resend, Inc.</strong> for transactional email delivery.
              </li>
              <li>
                <strong>AI model providers</strong> (such as Anthropic, OpenAI, or equivalent
                providers we may use from time to time) for large language model inference, used to
                generating Reports. Our agreements with these providers prohibit use of Customer
                Content for foundation model training.
              </li>
            </ul>
            <p>We may also share information:</p>
            <ul>
              <li>
                <strong>With your direction.</strong> When you direct us to share Reports or
                information with a buyer client or other party, we will do so.
              </li>
              <li>
                <strong>For legal reasons.</strong> When we believe in good faith that disclosure
                is required by law, by a valid legal request, or to protect the rights, property,
                or safety of Veroax, our users, or the public.
              </li>
              <li>
                <strong>In a corporate transaction.</strong> If we are involved in a merger,
                acquisition, financing, or sale of assets, personal information may be transferred
                as part of that transaction. We will notify affected users where required.
              </li>
            </ul>
          </Section>

          <Section title="5. Data retention">
            <p>
              We retain personal information only as long as needed for the purposes for which it
              was collected, unless a longer period is required by law.
            </p>
            <ul>
              <li>
                <strong>Customer Content (disclosure documents, including seller PII):</strong>{" "}
                purged from temporary processing storage promptly after the corresponding Report
                is delivered. We may retain a non-PII representation (such as a hashed identifier
                and aggregate findings counts) in our audit log.
              </li>
              <li>
                <strong>Reports we delivered to you:</strong> retained in your account for as
                long as your account is active so you can access prior Reports. You may request
                deletion of specific Reports.
              </li>
              <li>
                <strong>Account and billing records:</strong> retained for the duration of your
                relationship with us, and for up to seven (7) years after account closure to
                meet tax, accounting, fraud-prevention, and dispute-resolution obligations.
              </li>
              <li>
                <strong>Audit log:</strong> retained for up to seven (7) years.
              </li>
              <li>
                <strong>Support communications:</strong> retained for up to three (3) years.
              </li>
              <li>
                <strong>Marketing email lists:</strong> retained until you unsubscribe.
              </li>
            </ul>
          </Section>

          <Section title="6. Security">
            <p>
              We use commercially reasonable administrative, technical, and physical safeguards to
              protect personal information, including encryption in transit (TLS) and at rest for
              data stored with our subprocessors. No method of transmission or storage is one
              hundred percent secure. You are responsible for keeping your account credentials
              confidential and for notifying us promptly at{" "}
              <a href={`mailto:${SUPPORT.email}`}>{SUPPORT.email}</a> if you suspect
              unauthorized access.
            </p>
          </Section>

          <Section title="7. Your choices and rights">
            <p>
              <strong>Account information.</strong> You may review and update your account
              information at any time, or contact us at{" "}
              <a href={`mailto:${SUPPORT.email}`}>{SUPPORT.email}</a> for help.
            </p>
            <p>
              <strong>Marketing emails.</strong> You may unsubscribe from marketing emails using
              the unsubscribe link in each message. Transactional emails (Report delivery,
              billing, security notices) are necessary to provide the Service and cannot be
              opted out of while you remain a customer.
            </p>
            <p>
              <strong>Cookies.</strong> Most browsers allow you to refuse cookies or to delete
              them. Disabling cookies may affect the functionality of the Service (for example,
              you may need to sign in repeatedly).
            </p>
          </Section>

          <Section title="8. California privacy rights (CCPA / CPRA)">
            <p>
              If you are a California resident, the California Consumer Privacy Act (as amended
              by the California Privacy Rights Act) gives you specific rights regarding your
              personal information:
            </p>
            <ul>
              <li>
                <strong>Right to know.</strong> You may request that we disclose what personal
                information we have collected about you, the categories of sources, the purposes
                for which we use it, the categories of third parties with whom we share it, and
                the specific pieces of personal information we have collected.
              </li>
              <li>
                <strong>Right to delete.</strong> You may request that we delete personal
                information we have collected from you, subject to certain exceptions (for
                example, completing a transaction you requested, complying with a legal
                obligation, or detecting security incidents).
              </li>
              <li>
                <strong>Right to correct.</strong> You may request that we correct inaccurate
                personal information we maintain about you.
              </li>
              <li>
                <strong>Right to opt out of sale or sharing.</strong> We do not sell your
                personal information, and we do not share it for cross-context behavioral
                advertising as those terms are defined under the CPRA.
              </li>
              <li>
                <strong>Right to limit use of sensitive personal information.</strong> We do not
                use sensitive personal information for purposes that would require this right to
                be offered.
              </li>
              <li>
                <strong>Right to non-discrimination.</strong> We will not discriminate against
                you for exercising any of these rights.
              </li>
            </ul>
            <p>
              To exercise these rights, email{" "}
              <a href={`mailto:${SUPPORT.email}`}>{SUPPORT.email}</a> with the subject line
              &ldquo;CCPA request.&rdquo; We may need to verify your identity before responding.
              You may also designate an authorized agent to make a request on your behalf,
              subject to verification.
            </p>
            <p>
              <strong>Categories of personal information we collect</strong> (as defined by the
              CCPA): identifiers (name, email, license number, IP address); commercial information
              (subscription history); internet or other electronic network activity information
              (log data); geolocation data (approximate, derived from IP); professional or
              employment-related information (brokerage affiliation); and inferences drawn from
              the foregoing.
            </p>
            <p>
              <strong>Categories of personal information we disclose for a business purpose:</strong>{" "}
              the same categories listed above are disclosed to the subprocessors identified in
              Section 4 for the business purposes of providing, securing, and improving the
              Service.
            </p>
          </Section>

          <Section title="9. Children">
            <p>
              The Service is intended for licensed real estate professionals and is not directed
              to children under thirteen (13). We do not knowingly collect personal information
              from children under thirteen. If you believe a child under thirteen has provided us
              with personal information, contact us at{" "}
              <a href={`mailto:${SUPPORT.email}`}>{SUPPORT.email}</a> and we will delete it.
            </p>
          </Section>

          <Section title="10. International users">
            <p>
              Veroax is based in the United States and the Service is currently offered in the
              United States. If you access the Service from outside the United States, you
              understand that your personal information will be transferred to and processed in
              the United States. The laws of the United States may differ from the laws of your
              country of residence.
            </p>
          </Section>

          <Section title="11. Changes to this Privacy Policy">
            <p>
              We may update this Privacy Policy from time to time. If we make material changes,
              we will provide notice by email or by posting an updated effective date on this
              page. Your continued use of the Service after the new effective date constitutes
              acceptance of the updated Privacy Policy.
            </p>
          </Section>

          <Section title="12. Contact">
            <p>
              <strong>Veroax, Inc.</strong>
              <br />
              3964 Rivermark Plaza, Unit #2783
              <br />
              Santa Clara, CA 95054
              <br />
              Email:{" "}
              <a href={`mailto:${SUPPORT.email}`}>{SUPPORT.email}</a>
              <br />
              Phone:{" "}
              <a href={`tel:${SUPPORT.phoneTel}`}>(866) AISTUFF · ${SUPPORT.phone}</a>
            </p>
          </Section>
        </article>

        <div className="mt-16 pt-8 border-t border-gray-200 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-gray-500">
          <p>
            See also the{" "}
            <Link href="/terms" className="text-indigo-700 underline">
              Terms of Service
            </Link>
            .
          </p>
          <Link href="/" className="text-indigo-700 hover:text-indigo-900 transition-colors">
            ← Back to veroax.com
          </Link>
        </div>
      </main>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10 space-y-3 text-slate-700 leading-relaxed">
      <h2 className="text-xl font-bold text-slate-900 mt-8">{title}</h2>
      <div className="space-y-3 [&_a]:text-indigo-700 [&_a]:underline [&_a]:underline-offset-2 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:space-y-1.5 [&_li]:leading-relaxed">
        {children}
      </div>
    </section>
  );
}
