import {readFile} from 'node:fs/promises';
export function validateDaemonPolicy(text) {
 const values={};
 for(const raw of text.split('\n')){const line=raw.trim();if(!line||line.startsWith('#'))continue;const [name,...rest]=line.split(/\s+/);if(name in values)throw Error('DUPLICATE_CLAMD_SETTING');values[name]=rest.join(' ');}
 const required={ScanArchive:'yes',AlertExceedsMax:'yes',AlertEncrypted:'yes',AlertBrokenExecutables:'yes',AlertBrokenMedia:'yes',MaxFileSize:'100M',StreamMaxLength:'100M',MaxScanSize:'160M',MaxRecursion:'8',MaxFiles:'1000',MaxScanTime:'60000',MaxThreads:'1'};
 for(const[name,value]of Object.entries(required))if(values[name]!==value)throw Error('UNVERIFIED_CLAMD_POLICY');
 return true;
}
export async function daemonPolicy(){return validateDaemonPolicy(await readFile(process.env.CLAMD_CONFIG_PATH??new URL('../clamd.conf',import.meta.url),'utf8'));}
