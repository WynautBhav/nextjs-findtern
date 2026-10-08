/**
 * Loads Razorpay's checkout.js once and hands back the `Razorpay` constructor.
 *
 * The script is injected on first use rather than via next/script in a layout:
 * checkout.js is ~50KB and only the two money pages ever need it, so loading
 * it site-wide would tax every visitor for a flow most never open.
 */

declare global {
  interface Window {
    Razorpay?: RazorpayConstructor;
  }
}

export interface RazorpaySuccess {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

export interface RazorpayFailure {
  error: {
    code: string;
    description: string;
    reason?: string;
  };
}

interface RazorpayOptions {
  key: string;
  order_id: string;
  amount: number;
  currency: string;
  name: string;
  description?: string;
  prefill?: { name?: string; email?: string; contact?: string };
  theme?: { color?: string };
  handler: (response: RazorpaySuccess) => void;
  modal?: { ondismiss?: () => void };
}

interface RazorpayInstance {
  open(): void;
  on(event: "payment.failed", handler: (response: RazorpayFailure) => void): void;
}

type RazorpayConstructor = new (options: RazorpayOptions) => RazorpayInstance;

let pending: Promise<RazorpayConstructor> | null = null;

export function loadRazorpay(): Promise<RazorpayConstructor> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Razorpay can only load in the browser"));
  }
  if (window.Razorpay) return Promise.resolve(window.Razorpay);
  if (pending) return pending;

  pending = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => {
      if (window.Razorpay) resolve(window.Razorpay);
      else reject(new Error("Razorpay loaded but did not initialise"));
    };
    script.onerror = () => {
      pending = null;
      reject(new Error("Could not load the payment gateway. Check your connection and try again."));
    };
    document.body.appendChild(script);
  });

  return pending;
}

/** Brand-700 from globals.css; Razorpay themes the modal chrome with it. */
export const RAZORPAY_THEME_COLOR = "#0e6049";
