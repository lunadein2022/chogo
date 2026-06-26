// Netlify Edge Function (Deno 런타임): Anthropic 스트리밍 프록시
// 일반 서버리스 함수의 10초 제한을 피하려고, 응답을 스트리밍(SSE)으로 흘려보냅니다.
// API 키는 환경변수(ANTHROPIC_API_KEY)에만 두며 클라이언트에 노출되지 않습니다.
export default async (request) => {
  if (request.method !== "POST") return json({ error: "POST만 허용됩니다." }, 405);

  const apiKey = Netlify.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return json({ error: "서버에 ANTHROPIC_API_KEY가 설정되지 않았습니다." }, 500);

  let system, userText, images;
  try {
    const b = await request.json();
    system = b.system;
    userText = b.userText;
    images = Array.isArray(b.images) ? b.images : [];
  } catch {
    return json({ error: "잘못된 요청 형식입니다." }, 400);
  }
  if (!userText) return json({ error: "userText가 비어 있습니다." }, 400);

  // 이미지가 있으면 멀티모달 content 배열로 구성 (인재상 이미지 등)
  let content;
  if (images.length) {
    content = [
      ...images
        .filter((im) => im && im.data && im.media_type)
        .map((im) => ({ type: "image", source: { type: "base64", media_type: im.media_type, data: im.data } })),
      { type: "text", text: userText },
    ];
  } else {
    content = userText;
  }

  let upstream;
  try {
    upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6", // 필요 시 교체 (예: claude-opus-4-8)
        max_tokens: 8192,
        stream: true,
        system: system || "",
        messages: [{ role: "user", content }],
      }),
    });
  } catch (e) {
    return json({ error: "Anthropic 연결 실패: " + e.message }, 502);
  }

  if (!upstream.ok) {
    let msg = `Anthropic API 오류 (${upstream.status})`;
    try { const e = await upstream.json(); if (e && e.error && e.error.message) msg = e.error.message; } catch {}
    return json({ error: msg }, upstream.status);
  }

  // Anthropic SSE 스트림을 그대로 클라이언트로 전달
  return new Response(upstream.body, {
    status: 200,
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache",
    },
  });
};

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
