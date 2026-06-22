// Netlify Function: Anthropic API 프록시
// CommonJS로 작성 — Git 배포/드래그 배포/로컬 어디서나 호환.
// API 키는 환경변수(ANTHROPIC_API_KEY)에만 두며 클라이언트에 노출되지 않습니다.
exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "POST만 허용됩니다." }) };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: "서버에 ANTHROPIC_API_KEY가 설정되지 않았습니다." }) };
  }

  let system, userText;
  try {
    ({ system, userText } = JSON.parse(event.body || "{}"));
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "잘못된 요청 형식입니다." }) };
  }
  if (!userText) {
    return { statusCode: 400, body: JSON.stringify({ error: "userText가 비어 있습니다." }) };
  }

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6", // 필요 시 교체 (예: claude-opus-4-8)
        max_tokens: 8192,
        system: system || "",
        messages: [{ role: "user", content: userText }],
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      const msg = (data && data.error && data.error.message) || `Anthropic API 오류 (${res.status})`;
      return { statusCode: res.status, body: JSON.stringify({ error: msg }) };
    }

    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: data.content }),
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
