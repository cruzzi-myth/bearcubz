// Synthetic content only. This module never reads an existing collaboration asset.
import {execFileSync} from 'node:child_process';
import {deflateSync} from 'node:zlib';
export const EICAR=Buffer.from('X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*');
export function wav(size=4096){
 const b=Buffer.alloc(size);b.write('RIFF');b.writeUInt32LE(size-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(8000,24);b.writeUInt32LE(16000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(size-44,40);return b;
}
export function mp3(){return execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i','anullsrc=r=44100:cl=stereo','-t','1','-c:a','libmp3lame','-b:a','128k','-f','mp3','pipe:1']);}
export function pdf(){
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >>'];
 let body='%PDF-1.4\n';const offsets=[0];
 objects.forEach((object,i)=>{offsets.push(Buffer.byteLength(body));body+=`${i+1} 0 obj\n${object}\nendobj\n`;});
 const start=Buffer.byteLength(body);body+='xref\n0 4\n0000000000 65535 f \n'+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('');
 return Buffer.from(body+`trailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`);
}
function crc32(b){let crc=0xffffffff;for(const byte of b){crc^=byte;for(let j=0;j<8;j++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;}
export function png(large=false){
 const width=large?1024:2,height=large?1024:2;
 const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(width);ihdr.writeUInt32BE(height,4);ihdr[8]=8;ihdr[9]=2;
 const pixels=Buffer.alloc((width*3+1)*height,128);for(let y=0;y<height;y++)pixels[y*(width*3+1)]=0;
 const chunk=(tag,data)=>{const type=Buffer.from(tag),b=Buffer.alloc(data.length+12);b.writeUInt32BE(data.length);type.copy(b,4);data.copy(b,8);b.writeUInt32BE(crc32(Buffer.concat([type,data])),8+data.length);return b;};
 return Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(pixels,{level:large?0:6})),chunk('IEND',Buffer.alloc(0))]);
}
export function zip(kind='clean'){
 const script=`import io,zipfile,sys,struct,zlib,random\nb=io.BytesIO()\nkind=sys.argv[1]\neicar=b'X5O!P%@AP[4\\\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*'\nwith zipfile.ZipFile(b,'w',zipfile.ZIP_STORED if kind=='crc' else zipfile.ZIP_DEFLATED) as z:\n if kind=='near-boundary':z.writestr('generated.bin',random.Random(1234).randbytes(20*1024*1024)+b'0'*(80*1024*1024))\n elif kind=='expanded-limit':z.writestr('large.txt',b'A'*(130*1024*1024))\n elif kind=='high-ratio':z.writestr('large.txt',b'A'*(2*1024*1024))\n elif kind=='nested':\n  inner=io.BytesIO()\n  with zipfile.ZipFile(inner,'w') as i:i.writestr('clean.txt',b'benign')\n  z.writestr('inner.zip',inner.getvalue())\n else:z.writestr('test.txt',eicar if kind=='eicar' else b'Generated benign fixture')\ndata=bytearray(b.getvalue())\nif kind=='crc':data[30+len('test.txt')]^=1\nif kind=='lying-size':\n central=data.index(b'PK\\x01\\x02');crc=zlib.crc32(b'Genera')\n struct.pack_into('<I',data,14,crc);struct.pack_into('<I',data,22,6);struct.pack_into('<I',data,central+16,crc);struct.pack_into('<I',data,central+24,6)\nsys.stdout.buffer.write(data)`;
 return execFileSync('python3',['-c',script,kind],{maxBuffer:25*1024*1024});
}
