export const dynamic = "force-dynamic";

function originFrom(request: Request) {
  return new URL(request.url).origin;
}

export async function GET(request: Request) {
  const origin = originFrom(request);
  return Response.json({
    resource: origin,
    authorization_servers: [origin],
    bearer_methods_supported: ["header"],
  });
}
