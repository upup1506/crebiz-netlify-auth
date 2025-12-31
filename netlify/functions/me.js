const jwt = require("jsonwebtoken");

function getCookie(event, name) {
  const header = event.headers?.cookie || event.headers?.Cookie || "";
  const pairs = header.split(";").map(v => v.trim()).filter(Boolean);
  for (const p of pairs) {
    const idx = p.indexOf("=");
    if (idx < 0) continue;
    const k = p.slice(0, idx).trim();
    const v = p.slice(idx + 1).trim();
    if (k === name) return decodeURIComponent(v);
  }
  return null;
}

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const JWT_SECRET = process.env.JWT_SECRET;
  if (!JWT_SECRET) {
    return { statusCode: 500, body: "Server misconfigured: JWT_SECRET missing" };
  }

  const token = getCookie(event, "session");
  if (!token) {
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ loggedIn: false })
    };
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        loggedIn: true,
        user: { id: payload.sub, name: payload.name || payload.sub }
      })
    };
  } catch {
    // 토큰 만료/변조
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ loggedIn: false })
    };
  }
};
