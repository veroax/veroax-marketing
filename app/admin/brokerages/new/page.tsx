// New-brokerage form. Site admin only (layout-gated).
//
// The form takes the minimum to bring a brokerage online: name, DRE
// license, contact email, and the three allocation knobs
// (agent_seat_limit, reports_per_month, per_report_overage_cents).
// Branding fields (logo, accent color) and the owner-admin invite
// happen on the detail page after the row exists.

import { NewBrokerageForm } from "./_components/NewBrokerageForm";

export const metadata = {
  title: "New brokerage, Veroax admin",
};

export default function NewBrokeragePage() {
  return (
    <div className="space-y-6 max-w-2xl">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">
          Onboard a brokerage
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Creates the brokerage row + an initial allocation. Logo,
          accent color, and the owner-admin invite happen on the next
          screen.
        </p>
      </header>
      <NewBrokerageForm />
    </div>
  );
}
