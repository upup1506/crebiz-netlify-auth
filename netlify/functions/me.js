const jwt = require("jsonwebtoken");

function getCookie(event, name) {
  const raw = event.headers.cookie || event.headers.Cookie || "";
  const parts = raw.split(";").map(s => s.trim());
  const found = parts.find(p => p.startsWith(name + "="));
  if (!found) return null;
  return decodeURIComponent(found.split("=").slice(1).join("="));
}

exports.handler = async (event) => {
  const JWT_SECRET = process.env.JWT_SECRET;
  if (!JWT_SECRET) return { statusCode: 500, body: "Server misconfigured" };

  const token = getCookie(event, "session");
  if (!token) {
    return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ loggedIn: false }) };
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ loggedIn: true, user: { id: payload.sub, name: payload.name } })
    };
  } catch {
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ loggedIn: false })
    };
  }
};
