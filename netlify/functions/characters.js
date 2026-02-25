// netlify/functions/characters.js
// Netlify Functions (Node 18+) ya incluye fetch global, no uses node-fetch

const OWNER = process.env.GH_OWNER;          // tu usuario
const REPO  = process.env.GH_REPO;           // repo
const PATH  = process.env.GH_PATH || "data/characters.json";
const TOKEN = process.env.GH_TOKEN;          // token con permisos

function ghHeaders() {
  return {
    "Authorization": `Bearer ${TOKEN}`,
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Content-Type": "application/json",
};

async function ghGetFile(url) {
  const r = await fetch(url, { headers: ghHeaders() });
  const text = await r.text();
  if (!r.ok) {
    return { ok: false, status: r.status, body: text };
  }
  let json;
  try { json = JSON.parse(text); }
  catch { return { ok: false, status: 500, body: "GitHub returned non-JSON" }; }
  return { ok: true, status: 200, json };
}

async function ghPutFile(url, contentBase64, sha, message) {
  const r = await fetch(url, {
    method: "PUT",
    headers: { ...ghHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      content: contentBase64,
      sha,
    }),
  });
  const text = await r.text();
  return { ok: r.ok, status: r.status, body: text };
}

exports.handler = async (event) => {
  try {
    if (!TOKEN || !OWNER || !REPO) {
      return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ ok:false, error:"Missing GH env vars" }) };
    }

    const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${PATH}`;

    // Preflight
    if (event.httpMethod === "OPTIONS") {
      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ ok: true }) };
    }

    // GET
    if (event.httpMethod === "GET") {
      const g = await ghGetFile(url);
      if (!g.ok) return { statusCode: g.status, headers: corsHeaders, body: g.body };

      const content = Buffer.from(g.json.content, "base64").toString("utf8");
      let parsed;
      try { parsed = JSON.parse(content); }
      catch { parsed = []; }

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ ok: true, data: parsed, sha: g.json.sha }),
      };
    }

    // POST (guardar)
    if (event.httpMethod === "POST") {
      let body;
      try { body = JSON.parse(event.body || "null"); }
      catch {
        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ ok:false, error:"JSON inválido" }) };
      }

      if (!Array.isArray(body)) {
        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ ok:false, error:"Se esperaba un array como raíz" }) };
      }

      // 1) Traer SHA actual
      const g0 = await ghGetFile(url);
      if (!g0.ok) return { statusCode: g0.status, headers: corsHeaders, body: g0.body };

      const contentBase64 = Buffer.from(JSON.stringify(body, null, 2), "utf8").toString("base64");

      // 2) Intento normal
      const put1 = await ghPutFile(
        url,
        contentBase64,
        g0.json.sha,
        `Update characters (${new Date().toISOString()})`
      );

      // ✅ Si conflicto (SHA cambió), reintentar 1 vez
      if (put1.status === 409) {
        const g1 = await ghGetFile(url);
        if (!g1.ok) return { statusCode: g1.status, headers: corsHeaders, body: g1.body };

        const put2 = await ghPutFile(
          url,
          contentBase64,
          g1.json.sha,
          `Retry update characters (${new Date().toISOString()})`
        );

        if (!put2.ok) {
          return { statusCode: put2.status, headers: corsHeaders, body: put2.body };
        }

        return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ ok: true, retried: true }) };
      }

      if (!put1.ok) {
        return { statusCode: put1.status, headers: corsHeaders, body: put1.body };
      }

      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ ok: true }) };
    }

    // Otros métodos
    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ ok:false, error:"Method not allowed" }) };

  } catch (e) {
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ ok:false, error:String(e) }) };
  }
};
