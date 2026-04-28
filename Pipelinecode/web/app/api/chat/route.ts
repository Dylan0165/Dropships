import { NextRequest, NextResponse } from "next/server";
import {
  messageRateLimiter,
  getClientIp,
  rateLimitResponse,
} from "../../../../src/server/security/rate-limiter";
import { scrubApiKey } from "../../../../src/server/security/key-encryption";

// Node.js runtime required: in-memory rate limiter uses module-level state that
// Edge Runtime resets on every request. For Vercel streaming, consider upgrading
// to an external rate limit store (e.g. Vercel KV / Redis) and re-enabling edge.
export const maxDuration = 300; // 5 min — requires Vercel Pro plan

export async function POST(req: NextRequest) {
  const ip = getClientIp(req.headers);

  // ── Rate limiting: 30 messages/min per IP ─────────────────────────────────
  const rl = messageRateLimiter.check(ip);
  if (!rl.allowed) {
    return rateLimitResponse(rl) as unknown as NextResponse;
  }

  try {
    const body = await req.json();
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

    // Determine provider: DeepSeek takes priority, falls back to Anthropic
    const useDeepSeek = !!process.env.DEEPSEEK_API_KEY;
    const headers: Record<string, string> = { "Content-Type": "application/json" };

    if (useDeepSeek) {
      headers["Authorization"] = `Bearer ${process.env.DEEPSEEK_API_KEY}`;
    } else if (process.env.ANTHROPIC_API_KEY) {
      // ANTHROPIC_API_KEY stays server-side; never echoed to the browser
      headers["Authorization"] = `Bearer ${process.env.ANTHROPIC_API_KEY}`;
    }

    const response = await fetch(`${apiUrl}/api/chat`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        ...body,
        provider: useDeepSeek ? "deepseek" : "anthropic",
      }),
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: "Backend request failed" },
        { status: response.status }
      );
    }

    // Stream the response through without buffering
    return new NextResponse(response.body, {
      headers: {
        "Content-Type": response.headers.get("Content-Type") ?? "application/json",
      },
    });
  } catch (error) {
    // Scrub potential API keys from error messages before logging
    const message = error instanceof Error ? scrubApiKey(error.message) : "Unknown error";
    console.error("Chat API error:", message);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
