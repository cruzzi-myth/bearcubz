const response = await fetch(process.env.SCANNER_HEALTH_URL ?? 'http://127.0.0.1:8080/health', {
  headers: { Authorization: `Bearer ${process.env.PORTAL_SCANNER_WORKER_TOKEN ?? ''}` }, signal: AbortSignal.timeout(3000),
});
const data = await response.json();
if (!response.ok || data.healthy !== true) process.exitCode = 1;
