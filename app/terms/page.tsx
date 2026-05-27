import Link from "next/link";

import { SUPPORT } from "@/lib/site";
export const metadata = {
  title: "Terms of Service, Veroax",
  description: "Terms of Service for Veroax disclosure analysis software.",
};

const EFFECTIVE_DATE = "May 20, 2026";

export default function TermsPage() {
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
          <h1 className="text-4xl font-bold text-slate-900">Terms of Service</h1>
          <p className="text-sm text-gray-500">
            Effective date: {EFFECTIVE_DATE}
          </p>
        </div>

        <article className="prose prose-slate max-w-none">
          <Section title="1. Acceptance of these terms">
            <p>
              These Terms of Service (the &ldquo;Terms&rdquo;) govern your access to and use of
              the website at <strong>veroax.com</strong>, the Veroax disclosure analysis
              software, and any related reports, content, and services (collectively, the
              &ldquo;Service&rdquo;), all provided by Veroax, Inc., a corporation organized in
              the State of California (&ldquo;Veroax,&rdquo; &ldquo;we,&rdquo; &ldquo;us,&rdquo;
              or &ldquo;our&rdquo;).
            </p>
            <p>
              By creating an account, requesting a free report, or paying for a subscription, you
              agree to these Terms. If you do not agree, do not use the Service.
            </p>
            <p>
              You must be at least 18 years old and have authority to enter into these Terms on
              behalf of yourself or the entity you represent.
            </p>
          </Section>

          <Section title="2. What Veroax does">
            <p>
              Veroax provides AI-assisted analysis of residential real estate disclosure packages.
              When you upload a disclosure package, the Service generates a structured report (the
              &ldquo;Report&rdquo;) intended to help licensed real estate agents identify findings,
              estimate regional repair costs, and prepare buyers for negotiation and inspection
              decisions.
            </p>
            <p>
              <strong>Veroax is a software tool, not a licensed real estate professional, attorney,
              home inspector, contractor, appraiser, or insurance professional.</strong> Reports
              are informational and advisory. They are not a substitute for licensed professional
              inspection, legal counsel, appraisal, or any other professional service that a
              prudent real estate transaction may require.
            </p>
          </Section>

          <Section title="3. Eligibility and account">
            <p>
              The Service is offered to (a) individuals who hold an active real estate license in
              a jurisdiction where Veroax operates, and (b) brokerages and entities that employ
              licensed real estate professionals.
            </p>
            <p>You agree that:</p>
            <ul>
              <li>You will provide accurate, current, and complete information at sign-up.</li>
              <li>
                You will keep your login credentials confidential. You are responsible for all
                activity that occurs under your account.
              </li>
              <li>
                You will notify us promptly at{" "}
                <a href={`mailto:${SUPPORT.email}`}>{SUPPORT.email}</a> if you suspect
                unauthorized access.
              </li>
            </ul>
          </Section>

          <Section title="4. Free trial">
            <p>
              We may offer a free trial limited to one Report per California Department of Real
              Estate (&ldquo;DRE&rdquo;) license number, or the equivalent licensing identifier in
              other jurisdictions. To qualify, you must provide a valid license number that we may
              verify against publicly available licensing records. We reserve the right to refuse,
              limit, or rescind any free trial for any reason, including suspected misuse or
              attempts to obtain multiple trials per license number.
            </p>
            <p>
              Free trials do not require a credit card. The free trial period ends after the first
              Report is delivered to you, regardless of elapsed time.
            </p>
          </Section>

          <Section title="5. Subscriptions, billing, and cancellation">
            <p>
              Paid plans are billed in advance on a recurring basis (monthly or annual, as you
              select) by our payment processor, Stripe, Inc. By subscribing, you authorize Veroax
              and Stripe to charge your payment method for the applicable plan fees plus any
              applicable taxes.
            </p>
            <p>
              <strong>Plan inclusions and overages.</strong> Each plan includes a stated number of
              Reports per billing period. Reports generated beyond the included amount are billed
              at the published per-report overage rate for your plan and added to your next
              invoice. Unused included Reports do not roll over to the next billing period.
            </p>
            <p>
              <strong>Cancellation.</strong> You may cancel your subscription at any time from
              your account or by contacting us. Cancellation takes effect at the end of your
              current billing period. You will retain access to the Service through the end of the
              paid period.
            </p>
            <p>
              <strong>Refunds.</strong> Except where required by applicable law, fees already paid
              are non-refundable. We do not pro-rate refunds for partial months or for unused
              Reports in an annual term. If we materially fail to provide a Report due to a fault
              on our side and cannot remedy the failure within seven (7) days, we will, at our
              discretion, either re-issue the Report at no cost or refund the corresponding
              portion of your subscription.
            </p>
            <p>
              <strong>Price changes.</strong> We may change plan pricing on at least thirty (30)
              days&rsquo; notice. If you do not accept a price change, you may cancel before the
              new pricing takes effect.
            </p>
            <p>
              <strong>Failed payments.</strong> If a charge fails, Stripe may retry per its
              standard dunning logic. We may suspend the Service if a charge remains unpaid after
              reasonable retries.
            </p>
          </Section>

          <Section title="6. How you may use the Service">
            <p>You agree to use the Service only for lawful purposes related to real estate transactions you are professionally involved in, and only as permitted by these Terms. You will not:</p>
            <ul>
              <li>
                Upload disclosure documents or related materials that you are not authorized to
                possess or process.
              </li>
              <li>
                Re-sell, sub-license, or distribute the Service or its Reports as a stand-alone
                product to third parties, except for delivery of completed Reports to clients in
                the context of a transaction in which you represent that client.
              </li>
              <li>
                Use the Service to generate or distribute content that is fraudulent, misleading,
                defamatory, or unlawful.
              </li>
              <li>
                Attempt to reverse-engineer, scrape, or extract the underlying models, prompts,
                templates, or analytical logic of the Service.
              </li>
              <li>
                Interfere with the Service&rsquo;s operation, attempt to access another user&rsquo;s
                account, or use the Service to test or exploit security vulnerabilities other than
                through a responsible disclosure to{" "}
                <a href={`mailto:${SUPPORT.email}`}>{SUPPORT.email}</a>.
              </li>
              <li>
                Use the Service to provide legal advice, render a licensed professional opinion
                that you are not qualified to render, or otherwise represent the Service&rsquo;s
                output as a substitute for licensed professional review.
              </li>
            </ul>
          </Section>

          <Section title="7. Your content and the Reports">
            <p>
              You retain all rights in the disclosure documents and other content you upload to the
              Service (&ldquo;Customer Content&rdquo;). You grant Veroax a limited, non-exclusive,
              worldwide license to host, process, analyze, and transmit your Customer Content for
              the purpose of generating Reports and providing the Service to you. We do not use
              Customer Content to train foundation models, and we do not sell Customer Content.
            </p>
            <p>
              We deliver the Report to you. You may share the Report with the buyer client(s) you
              represent in the transaction it pertains to. We grant you a perpetual, non-exclusive
              license to use and distribute the delivered Report for that purpose. The underlying
              software, templates, prompts, and analytical methodology remain the property of
              Veroax.
            </p>
            <p>
              <strong>Quality and accuracy.</strong> Reports are generated using AI models combined
              with a structured agent review before delivery. We use commercially reasonable
              efforts to make Reports accurate, but Reports may contain errors, omissions, or
              outdated information. You are responsible for reviewing each Report before sharing
              it with a client and for confirming material findings against original source
              documents, inspections, contractor bids, and licensed professional advice as
              appropriate.
            </p>
          </Section>

          <Section title="8. Privacy and data handling">
            <p>
              Our handling of personal information is governed by our{" "}
              <Link href="/privacy" className="text-indigo-700 underline">
                Privacy Policy
              </Link>
              , which is incorporated by reference into these Terms.
            </p>
            <p>
              Disclosure packages frequently contain personal information about sellers, including
              names, addresses, mortgage balances, lender details, and related materials.{" "}
              <strong>
                You represent that you are authorized to upload such information to the Service in
                connection with a real estate transaction you are professionally engaged in.
              </strong>{" "}
              You are responsible for complying with any obligations you have to sellers, listing
              agents, brokerages, or other third parties regarding the use of those documents.
            </p>
            <p>
              We purge seller personal information from temporary processing storage after the
              corresponding Report is delivered. We retain a minimal audit log for compliance,
              fraud-prevention, and dispute-resolution purposes as described in the Privacy
              Policy.
            </p>
          </Section>

          <Section title="9. No professional advice; advisory only">
            <p>
              <strong>
                The Service does not provide legal, financial, tax, insurance, inspection, or
                appraisal advice. Reports are informational and advisory only.
              </strong>{" "}
              Statements in a Report about repair cost estimates, severity ratings, negotiation
              leverage, risk assessments, lender concerns, insurability, code compliance, permit
              status, and overall property ratings are estimates and informed opinions generated
              from the materials provided. They are not a guarantee, warranty, or representation
              of any kind regarding the physical condition, legal status, title, financial
              suitability, or future value of any property.
            </p>
            <p>
              You should obtain licensed professional inspections, attorney review, lender
              underwriting confirmation, insurance binders, and any other professional services
              required by the transaction. The Service is not a substitute for those services.
            </p>
          </Section>

          <Section title="10. Service availability and changes">
            <p>
              We aim to make the Service available continuously, but we do not guarantee
              uninterrupted availability. We may suspend or modify the Service, in whole or in
              part, with or without notice, for maintenance, security, or business reasons.
            </p>
            <p>
              We may add, remove, or change features, and we may add, remove, or change supported
              jurisdictions. If a material adverse change reduces the value of your active paid
              subscription, you may cancel and receive a pro-rated refund for the remainder of the
              prepaid period.
            </p>
          </Section>

          <Section title="11. Disclaimers">
            <p>
              <strong>
                THE SERVICE AND ALL REPORTS ARE PROVIDED &ldquo;AS IS&rdquo; AND &ldquo;AS
                AVAILABLE&rdquo; WITHOUT WARRANTIES OF ANY KIND, WHETHER EXPRESS, IMPLIED,
                STATUTORY, OR OTHERWISE.
              </strong>{" "}
              Veroax expressly disclaims all warranties, including without limitation any
              warranties of merchantability, fitness for a particular purpose, non-infringement,
              title, accuracy, completeness, or uninterrupted availability. No advice or
              information obtained from the Service or from Veroax shall create any warranty not
              expressly stated in these Terms.
            </p>
            <p>
              Veroax does not warrant that the Service will meet your requirements, that any
              defects will be corrected, or that the Service will be free of viruses or other
              harmful components.
            </p>
          </Section>

          <Section title="12. Limitation of liability">
            <p>
              <strong>
                TO THE MAXIMUM EXTENT PERMITTED BY LAW, IN NO EVENT WILL VEROAX, ITS OFFICERS,
                DIRECTORS, EMPLOYEES, AFFILIATES, OR LICENSORS BE LIABLE FOR ANY INDIRECT,
                INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR FOR ANY LOSS OF
                PROFITS, REVENUE, COMMISSIONS, GOODWILL, DATA, OR BUSINESS OPPORTUNITY, ARISING OUT
                OF OR RELATED TO YOUR USE OF, OR INABILITY TO USE, THE SERVICE OR ANY REPORT,
                EVEN IF VEROAX HAS BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.
              </strong>
            </p>
            <p>
              <strong>
                VEROAX&rsquo;S TOTAL CUMULATIVE LIABILITY FOR ALL CLAIMS ARISING OUT OF OR RELATED
                TO THE SERVICE OR THESE TERMS WILL NOT EXCEED THE GREATER OF (A) THE FEES YOU PAID
                TO VEROAX IN THE TWELVE (12) MONTHS IMMEDIATELY PRECEDING THE EVENT GIVING RISE TO
                THE CLAIM, OR (B) ONE HUNDRED U.S. DOLLARS ($100).
              </strong>
            </p>
            <p>
              The limitations in this Section reflect a reasonable allocation of risk between you
              and Veroax in light of the fees paid for the Service and the advisory nature of
              Reports. Some jurisdictions do not allow certain limitations of liability, so some
              of the above limitations may not apply to you.
            </p>
          </Section>

          <Section title="13. Indemnification">
            <p>
              You agree to defend, indemnify, and hold harmless Veroax and its officers,
              directors, employees, and affiliates from and against any and all claims, damages,
              liabilities, losses, costs, and expenses (including reasonable attorneys&rsquo;
              fees) arising out of or related to:
            </p>
            <ul>
              <li>Your use of the Service or any Report;</li>
              <li>
                Your delivery, distribution, or reliance on a Report in connection with a real
                estate transaction;
              </li>
              <li>Customer Content you upload to the Service;</li>
              <li>Your breach of these Terms or of any applicable law or regulation;</li>
              <li>
                Any claim by a third party (including a seller, buyer, brokerage, lender, or
                inspector) arising from your professional conduct in a transaction involving a
                Report.
              </li>
            </ul>
          </Section>

          <Section title="14. Suspension and termination">
            <p>
              We may suspend or terminate your access to the Service at any time for material
              breach of these Terms, for unpaid fees that remain unpaid after reasonable notice,
              for suspected fraud or misuse, or where required by law. We will use reasonable
              efforts to provide notice unless doing so would create a security or legal risk.
            </p>
            <p>
              Upon termination, your right to use the Service ends. The provisions of these Terms
              that by their nature should survive termination (including Sections 7 (Customer
              Content license), 9 (No professional advice), 11 (Disclaimers), 12 (Limitation of
              liability), 13 (Indemnification), and 16 (Governing law) will survive.
            </p>
          </Section>

          <Section title="15. Changes to these Terms">
            <p>
              We may update these Terms from time to time. If we make material changes, we will
              provide notice by email or by posting an updated effective date on this page. Your
              continued use of the Service after the new effective date constitutes acceptance of
              the updated Terms. If you do not accept the updated Terms, your remedy is to stop
              using the Service.
            </p>
          </Section>

          <Section title="16. Governing law and disputes">
            <p>
              These Terms are governed by the laws of the State of California, without regard to
              its conflict-of-law principles. The parties agree to submit to the exclusive
              jurisdiction of the state and federal courts located in Santa Clara County,
              California, for any dispute arising out of or related to these Terms or the Service,
              except that either party may seek injunctive relief in any court of competent
              jurisdiction to protect intellectual property rights.
            </p>
            <p>
              Before filing a claim, you agree to first contact us at{" "}
              <a href={`mailto:${SUPPORT.email}`}>{SUPPORT.email}</a> and attempt in good faith
              to resolve the dispute informally for at least sixty (60) days.
            </p>
          </Section>

          <Section title="17. Miscellaneous">
            <p>
              <strong>Entire agreement.</strong> These Terms and the documents they incorporate
              (including the Privacy Policy) are the entire agreement between you and Veroax
              regarding the Service.
            </p>
            <p>
              <strong>Severability.</strong> If any provision of these Terms is held to be
              unenforceable, the remaining provisions will remain in full effect.
            </p>
            <p>
              <strong>No waiver.</strong> Our failure to enforce any provision is not a waiver of
              our right to enforce it later.
            </p>
            <p>
              <strong>Assignment.</strong> You may not assign these Terms without our prior written
              consent. We may assign these Terms in connection with a merger, acquisition, or sale
              of substantially all of our assets.
            </p>
            <p>
              <strong>Force majeure.</strong> Neither party is liable for delays or failures caused
              by events outside its reasonable control.
            </p>
          </Section>

          <Section title="18. Contact">
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
            <Link href="/privacy" className="text-indigo-700 underline">
              Privacy Policy
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
