export default {
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(ping(env.API_HEALTH_URL));
  },
};

async function ping(url) {
  const started = Date.now();
  try {
    const res = await fetch(url, {headers: {'user-agent': 'erp-api-keepalive'}});
    console.log(`GET ${url} -> ${res.status} en ${Date.now() - started} ms`);
  } catch (error) {
    console.error(`GET ${url} falló tras ${Date.now() - started} ms: ${error}`);
  }
}
