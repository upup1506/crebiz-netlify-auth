function buildCookie(name, value, opts = {}) {
  const parts = [`${name}=${value}`];

  if (opts.maxAge != null) parts.push(`Max-Age=${opts.maxAge}`);
  if (opts.httpOnly) parts.push("HttpOnly");
  if (opts.secure) parts.push("Secure");
  if (opts.sameSite) parts.push(`SameSite=${opts.sameSite}`);
  if (opts.path) parts.push(`Path=${opts.path}`);

  return parts.join("; ");
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const secureCookie = process.env.NODE_ENV === "production";

  // ✅ session 쿠키 만료
  const expired = buildCookie("session", "", {
    httpOnly: true,
    secure: secureCookie,
    sameSite: "Lax",
    path: "/",
    maxAge: 0
  });

  return {
    statusCode: 200,
    multiValueHeaders: {
      "Set-Cookie": [expired]
    },
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ ok: true })
  };
};
