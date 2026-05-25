// Sales and Marketing AI integration. Pushes new Veroax signups
// into a marketing group in salesandmarketing.ai so the founder can
// run campaigns against the user list.
//
// Their API is a simple POST to /v1/contact/addContact with two
// custom headers for auth (secretKey + authToken) and a memberId
// in the body that identifies the founder's account. groupId
// selects which marketing list to drop new contacts into.
//
// Configured via env vars (set on Vercel). All four are required
// for the integration to fire; missing any one and addContact()
// returns reason='not_configured' without erroring. That way the
// code stays safe to ship before the founder finishes setup.
//
//   SAM_AI_SECRET_KEY        secretKey header value
//   SAM_AI_AUTH_TOKEN        authToken header value
//   SAM_AI_MEMBER_ID         numeric memberId in the body
//   SAM_AI_DEFAULT_GROUP_ID  numeric groupId for new signups
//
// To find the group ID: log into salesandmarketing.ai, create a
// group called something like "Veroax signups", then GET their
// /v1/group/getGroupList endpoint (or look it up in their UI) to
// see the numeric ID.

const API_BASE = "https://api.salesandmarketing.ai/v1";

export type AddContactInput = {
  email: string;
  fullName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  // Up to 10 string values stuffed into udf1..udf10 in declared
  // order. Useful for signup source, DRE license, plan name,
  // referrer, etc. Keys become the human-readable prefix.
  customFields?: Record<string, string>;
};

export type AddContactResult = {
  ok: boolean;
  reason: "sent" | "not_configured" | "send_failed";
  detail?: string;
};

export async function addContactToMarketingGroup(
  input: AddContactInput,
): Promise<AddContactResult> {
  const secretKey = process.env.SAM_AI_SECRET_KEY;
  const authToken = process.env.SAM_AI_AUTH_TOKEN;
  const memberIdRaw = process.env.SAM_AI_MEMBER_ID;
  const groupIdRaw = process.env.SAM_AI_DEFAULT_GROUP_ID;

  if (!secretKey || !authToken || !memberIdRaw) {
    return { ok: false, reason: "not_configured" };
  }
  const memberId = Number.parseInt(memberIdRaw, 10);
  if (!Number.isFinite(memberId)) {
    return {
      ok: false,
      reason: "not_configured",
      detail: "SAM_AI_MEMBER_ID is not a number.",
    };
  }
  const groupId = groupIdRaw ? Number.parseInt(groupIdRaw, 10) : null;

  const body: Record<string, unknown> = {
    email: input.email,
    memberId,
  };
  if (input.fullName) body.fullName = input.fullName;
  if (input.firstName) body.firstName = input.firstName;
  if (input.lastName) body.lastName = input.lastName;
  if (input.phone) body.phoneNumber = input.phone;
  if (Number.isFinite(groupId)) body.groupId = groupId;

  // Custom fields packed into udf1..udf10. Cap at 10 (their limit).
  if (input.customFields) {
    const entries = Object.entries(input.customFields).slice(0, 10);
    entries.forEach(([key, value], idx) => {
      body[`udf${idx + 1}`] = `${key}: ${value}`;
    });
  }

  try {
    const response = await fetch(`${API_BASE}/contact/addContact`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        secretKey,
        authToken,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      console.error(
        `[salesandmarketing] addContact failed ${response.status}:`,
        errText.slice(0, 500),
      );
      return {
        ok: false,
        reason: "send_failed",
        detail: `HTTP ${response.status}: ${errText.slice(0, 200)}`,
      };
    }
    return { ok: true, reason: "sent" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[salesandmarketing] addContact threw:", err);
    return { ok: false, reason: "send_failed", detail: message };
  }
}
