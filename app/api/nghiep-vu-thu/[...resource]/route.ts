const routes: Record<string,string> = {state:"/api/state", action:"/api/action","camera.js":"/camera.js","qr.png":"/qr.png"};
type Context = {params: Promise<{resource:string[]}>};

async function forward(request: Request, context: Context) {
  const url = new URL(request.url);
  if (process.env.NODE_ENV !== "development" || process.env.NEXT_PUBLIC_TEST_MODE !== "true" || !["localhost","127.0.0.1"].includes(url.hostname)) return new Response(null,{status:404});
  const host = request.headers.get("host") || "";
  if (!["localhost","127.0.0.1"].includes(host.split(":")[0])) return new Response(null,{status:404});
  const {resource}=await context.params;
  const key=resource.join("/").replace(/^api\//,"");
  // Same-origin POSTs only. Behind the LAN HTTPS gateway (scripts/local-https.cjs) the browser's
  // origin is the gateway's, which it reports in x-forwarded-proto / x-forwarded-host.
  const forwardedProto=request.headers.get("x-forwarded-proto"), forwardedHost=request.headers.get("x-forwarded-host");
  const allowedOrigins=[url.protocol+"//"+host, ...(forwardedProto && forwardedHost ? [forwardedProto+"://"+forwardedHost] : [])];
  const origin=request.headers.get("origin");
  if(request.method==="POST" && origin && !allowedOrigins.includes(origin)) return Response.json({error:"Yêu cầu bị chặn vì không cùng nguồn."},{status:403});
  if (resource[0] === "staff") {
    const { staffRequest } = await import("@/lib/pilot-staff");
    return staffRequest(request, resource.slice(1).join("/"));
  }
  const target = Object.hasOwn(routes,key) && routes[key];
  if (!target || (request.method==="POST") !== (key==="action")) return new Response(null,{status:404});
  const cookie=request.headers.get("cookie")?.match(/(?:^|;\s*)qnu_preview=([0-9a-f]{48})(?:;|$)/)?.[1];
  const outgoing=new Headers();
  if(cookie) outgoing.set("cookie","qnu_lab="+cookie);
  if(request.method==="POST") outgoing.set("content-type",request.headers.get("content-type")||"");
  try {
    const remote=await fetch("http://127.0.0.1:3211"+target+url.search,{method:request.method,headers:outgoing,body:request.method==="POST"?await request.text():undefined,cache:"no-store",signal:AbortSignal.timeout(10000)});
    const headers=new Headers({"Content-Type":remote.headers.get("content-type")||"application/json","Cache-Control":"no-store"});
    const session=remote.headers.get("set-cookie");
    if(session) headers.set("set-cookie",session.replace(/^qnu_lab=/,"qnu_preview=").replace("Path=/","Path=/api/nghiep-vu-thu"));
    return new Response(remote.body,{status:remote.status,headers});
  } catch {
    return Response.json({error:"Dịch vụ dữ liệu mẫu chưa sẵn sàng."},{status:503});
  }
}
export { forward as GET, forward as POST };
