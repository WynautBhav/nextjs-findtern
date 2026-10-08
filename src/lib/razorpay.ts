import Razorpay from "razorpay";
import { createHmac } from "node:crypto";

let _client: Razorpay | null = null;

export function getRazorpay(): Razorpay {
  if (!_client) {
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keyId || !keySecret) {
      throw new Error("RAZORPAY_KEY_ID/RAZORPAY_KEY_SECRET not set");
    }
    _client = new Razorpay({ key_id: keyId, key_secret: keySecret });
  }
  return _client;
}

export function verifySignature(orderId: string, paymentId: string, signature: string): boolean {
  const expected = createHmac("sha256", process.env.RAZORPAY_KEY_SECRET!)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");
  return expected === signature;
}
