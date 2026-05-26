// Cloudflare Worker 代理代码
// 作用：代替前端请求目标服务，获取状态码，绕过 CORS 限制

// 您需要监控的服务列表（与前端保持一致）
const SERVICES = [
  { name: "drtcx.com", url: "https://drtcx.com/wordpress" },
  { name: "chenxi-IM.drtcx.com", url: "https://chenxi-IM.drtcx.com" },
  { name: "chenxireader.drtcx.com", url: "https://chenxireader.drtcx.com" },
  { name: "chenximusic.drtcx.com", url: "https://chenximusic.drtcx.com" },
  { name: "chenxi-AGI.drtcx.com", url: "https://chenxi-AGI.drtcx.com" }
];

// 处理前端发来的请求
export default {
  async fetch(request, env, ctx) {
    // 处理 CORS 预检请求（OPTIONS）
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    // 健康检查接口：前端会调用 /api/status
    if (path === "/api/status") {
      const results = [];
      
      // 并行探测所有服务，提高响应速度
      const probes = SERVICES.map(async (service) => {
        const startTime = Date.now();
        let statusCode = null;
        let ok = false;
        
        try {
          // Worker 发起请求（无 CORS 限制）
          const res = await fetch(service.url, {
            method: "GET",
            headers: { "User-Agent": "DRTCX-Worker/1.0" },
            // 设置超时（通过 AbortController 实现）
            signal: AbortSignal.timeout(5000)
          });
          statusCode = res.status;
          // 200-299 或 400-499 都视为服务正常（与 Uptime-Kuma 逻辑一致）
          if ((statusCode >= 200 && statusCode <= 299) || (statusCode >= 400 && statusCode <= 499)) {
            ok = true;
          }
        } catch (err) {
          // 连接失败（超时、DNS错误、拒绝连接等）
          ok = false;
          statusCode = null;
        }
        
        return {
          name: service.name,
          ok: ok,
          statusCode: statusCode,
          url: service.url
        };
      });
      
      const probeResults = await Promise.all(probes);
      
      // 返回 JSON 结果给前端
      return new Response(JSON.stringify({ results: probeResults }), {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
        },
      });
    }
    
    // 其他路径返回 404
    return new Response("Not Found", { status: 404 });
  }
};