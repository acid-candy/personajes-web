
const OWNER = process.env.GH_OWNER;          // tu usuario
const REPO  = process.env.GH_REPO;           // repo
const PATH  = process.env.GH_PATH || "data/characters.json";
const TOKEN = process.env.GH_TOKEN;          // token con permisos

function ghHeaders() {
  return {
    "Authorization": `Bearer ${TOKEN}`,
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28"
  };
}

exports.handler = async (event) => {
  try {
    if (!TOKEN || !OWNER || !REPO) {
      return { statusCode: 500, body: "Missing GH env vars" };
    }

    const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${PATH}`;

    // CORS básico para que funcione desde el navegador
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Content-Type": "application/json",
    };

    if (event.httpMethod === "OPTIONS") {
      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ ok: true }) };
    }

    if (event.httpMethod === "GET") {
      const r = await fetch(url, { headers: ghHeaders() });
      if (!r.ok) return { statusCode: r.status, headers: corsHeaders, body: await r.text() };

      const j = await r.json();
      const content = Buffer.from(j.content, "base64").toString("utf8");
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ ok: true, data: JSON.parse(content), sha: j.sha })
      };
    }

    if (event.httpMethod === "POST") {
      let body;
      try { body = JSON.parse(event.body || "null"); }
      catch { return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ ok:false, error:"JSON inválido" }) }; }

      if (!Array.isArray(body)) {
        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ ok:false, error:"Se esperaba un array como raíz" }) };
      }

      // traer SHA actual
      const r0 = await fetch(url, { headers: ghHeaders() });
      if (!r0.ok) return { statusCode: r0.status, headers: corsHeaders, body: await r0.text() };
      const j0 = await r0.json();

      const content = Buffer.from(JSON.stringify(body, null, 2), "utf8").toString("base64");

      const r1 = await fetch(url, {
        method: "PUT",
        headers: { ...ghHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          message: `Update characters (${new Date().toISOString()})`,
          content,
          sha: j0.sha
        })
      });

      if (!r1.ok) return { statusCode: r1.status, headers: corsHeaders, body: await r1.text() };

      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ ok: true }) };
    }

    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ ok:false, error:"Method not allowed" }) };

  } catch (e) {
    return { statusCode: 500, body: String(e) };
  }
};
