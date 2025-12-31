const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

function parseJsonSafe(s, fallback) {
  try { return JSON.parse(s); } catch { return fallback; }
}

function cookie(name, value, opts = {}) {
  const parts = [`${name}=${value}`];
  if (opts.maxAge != null) parts.push(`Max-Age=${opts.maxAge}`);
  if (opts.httpOnly) parts.push("HttpOnly");
  if (opts.secure) parts.push("Secure");
  if (opts.sameSite) parts.push(`SameSite=${opts.sameSite}`);
  if (opts.path) parts.push(`Path=${opts.path}`);
  return parts.join("; ");
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };

  const JWT_SECRET = process.env.JWT_SECRET;
  if (!JWT_SECRET) return { statusCode: 500, body: "Server misconfigured: JWT_SECRET missing" };

  const users = parseJsonSafe(process.env.USERS_JSON || "[]", []);
  if (!Array.isArray(users) || users.length === 0) {
    return { statusCode: 500, body: "Server misconfigured: USERS_JSON missing/empty" };
  }

  let body;
  try { body = JSON.parse(event.body || "{}"); }
  catch { return { statusCode: 400, body: "Invalid JSON" }; }

  const { id, pw } = body;
  if (typeof id !== "string" || typeof pw !== "string" || !id || !pw) {
    return { statusCode: 400, body: "Missing id/pw" };
  }

  const user = users.find(u => u.id === id);
  if (!user || !user.pw_hash) return { statusCode: 401, body: "Invalid credentials" };

  const ok = bcrypt.compareSync(pw, user.pw_hash);
  if (!ok) return { statusCode: 401, body: "Invalid credentials" };

  // 세션 토큰(JWT) 7일
  const token = jwt.sign(
    { sub: user.id, name: user.name || user.id },
    JWT_SECRET,
    { expiresIn: "7d" }
  );

  const sessionCookie = cookie("session", token, {
    httpOnly: true,
    secure: true,     // Netlify는 기본 https
    sameSite: "Lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7
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

