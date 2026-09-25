const ZEROBOUNCE_BASE_URL = "https://api.zerobounce.net/v2";

export type ZeroBounceStatus =
  | "valid"
  | "invalid"
  | "catch-all"
  | "unknown"
  | "spamtrap"
  | "abuse"
  | "do_not_mail"
  | "error";

export type ZeroBounceResult = {
  status: ZeroBounceStatus;
  subStatus: string | null;
  isDeliverable: boolean;
};

export async function verifyEmail(email: string): Promise<ZeroBounceResult> {
  try {
    const params = new URLSearchParams({
      api_key: process.env.ZEROBOUNCE_API_KEY || "",
      email,
    });

    const res = await fetch(`${ZEROBOUNCE_BASE_URL}/validate?${params.toString()}`);

    if (!res.ok) {
      return { status: "error", subStatus: null, isDeliverable: false };
    }

    const data = await res.json();
    const status = (data.status || "error") as ZeroBounceStatus;

    // "valid" aur "catch-all" ko deliverable maanenge
    // (catch-all domain ka matlab hai server sab emails accept karta hai,
    // guaranteed nahi lekin usually kaam kar jata hai)
    const isDeliverable = status === "valid" || status === "catch-all";

    return {
      status,
      subStatus: data.sub_status || null,
      isDeliverable,
    };
  } catch {
    return { status: "error", subStatus: null, isDeliverable: false };
  }
}