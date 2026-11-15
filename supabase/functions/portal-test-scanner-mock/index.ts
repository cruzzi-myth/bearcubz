// DEV/TEST ONLY — never approved for production deployment (it is absent from
// approved-functions.manifest and the production deploy guard refuses it).
// A deterministic stand-in for Cloudmersive's file-scan API so ordinary test
// runs consume no provider credits. It only ever receives traffic when the
// scanner runs with PORTAL_SCANNER_TEST_MODE=mock on a non-production
// project (see _shared/scannerTestMode.ts). It returns verdicts only.
//
// Behavior mirrors what the portal's security tests rely on:
//   * content containing MOCK-INFECTED-FIXTURE (or the EICAR string) -> infected
//   * ZIP with an encrypted entry                -> ContainsPasswordProtectedFile
//   * ZIP entry named *.exe|*.dll                -> ContainsExecutable
//   * ZIP entry named *.js|*.sh|*.bat|*.ps1      -> ContainsScript
//   * filename containing mock-fail-401/429/500  -> that HTTP error (scanner-failure paths)
//   * anything else                              -> clean
const corsHeaders = { 'Content-Type': 'application/json' };
const te = new TextDecoder('latin1');

function zipFindings(bytes: Uint8Array) {
  const f = { encrypted: false, executable: false, script: false };
  let i = 0;
  while (i + 30 <= bytes.length) {
    if (!(bytes[i] === 0x50 && bytes[i + 1] === 0x4b && bytes[i + 2] === 0x03 && bytes[i + 3] === 0x04)) { i++; continue; }
    const flags = bytes[i + 6] | (bytes[i + 7] << 8);
    const nameLen = bytes[i + 26] | (bytes[i + 27] << 8);
    const name = te.decode(bytes.slice(i + 30, i + 30 + nameLen)).toLowerCase();
    if (flags & 1) f.encrypted = true;
    if (/\.(exe|dll)$/.test(name)) f.executable = true;
    if (/\.(js|sh|bat|ps1)$/.test(name)) f.script = true;
    i += 30 + nameLen;
  }
  return f;
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return new Response(JSON.stringify({ error: 'METHOD_NOT_ALLOWED' }), { status: 405, headers: corsHeaders });
  if (!request.headers.get('Apikey')) return new Response('', { status: 401 });
  const advanced = new URL(request.url).pathname.endsWith('/advanced');
  let form: FormData;
  try { form = await request.formData(); } catch { return new Response(JSON.stringify({ error: 'BAD_REQUEST' }), { status: 400, headers: corsHeaders }); }
  const file = form.get('inputFile');
  if (!(file instanceof File)) return new Response(JSON.stringify({ error: 'BAD_REQUEST' }), { status: 400, headers: corsHeaders });

  const name = file.name.toLowerCase();
  if (name.includes('mock-fail-401')) return new Response('', { status: 401 });
  if (name.includes('mock-fail-429')) return new Response('', { status: 429 });
  if (name.includes('mock-fail-500')) return new Response('', { status: 500 });

  const bytes = new Uint8Array(await file.arrayBuffer());
  const text = te.decode(bytes);
  const infected = text.includes('MOCK-INFECTED-FIXTURE') || text.includes('EICAR-STANDARD-ANTIVIRUS-TEST-FILE');
  const z = advanced ? zipFindings(bytes) : { encrypted: false, executable: false, script: false };

  const body: Record<string, unknown> = {
    CleanResult: !infected,
    FoundViruses: infected ? [{ FileName: file.name, VirusName: 'Mock.Infected.Fixture' }] : null,
  };
  if (advanced) {
    Object.assign(body, {
      ContainsExecutable: z.executable, ContainsScript: z.script, ContainsPasswordProtectedFile: z.encrypted,
      ContainsInvalidFile: false, ContainsMacros: false, ContainsXmlExternalEntities: false,
      ContainsInsecureDeserialization: false, ContainsOleEmbeddedObject: false, ContainsUnwantedAction: false, ContainsUnsafeArchive: false,
    });
  }
  return new Response(JSON.stringify(body), { status: 200, headers: corsHeaders });
});
