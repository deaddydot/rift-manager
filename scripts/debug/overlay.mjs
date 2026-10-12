import sharp from 'sharp';
import path from 'node:path';
import os from 'node:os';
const S=1024, MAP=14870;
const pts = {
 blue: [[981,10441],[1512,6699],[1169,4287],[5846,6396],[5048,4812],[3651,3696],[10504,1029],[6919,1483],[4281,1253],[1748,2270],[2177,1807],[1171,3571],[3203,3208],[3452,1236],[1551,1659]],
 red: [[4318,13875],[7943,13411],[10481,13650],[8955,8510],[9767,10113],[11134,11207],[13866,4505],[13327,8226],[13624,10572],[12611,13084],[13052,12612],[11261,13676],[11598,11667],[13604,11316],[13300,13300]],
 camp: [[3821,7901],[2288,8448],[3783,6495],[7061,5325],[7762,4011],[8394,2641],[11032,7002],[12703,6444],[11008,8387],[7868,9524],[7101,10900],[6317,12146],[10500,5170],[4400,9600]],
 obj: [[9866,4414],[5007,10471]],
};
const colors={blue:'#3b82f6',red:'#ef4444',camp:'#facc15',obj:'#e879f9'};
let svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}">`;
for(const [k,arr] of Object.entries(pts)) for(const [x,y] of arr){const px=x/MAP*S, py=S-y/MAP*S; svg+=`<circle cx="${px}" cy="${py}" r="7" fill="${colors[k]}" stroke="white" stroke-width="2"/>`;}
svg+='</svg>';
await sharp(path.resolve(import.meta.dirname, '../../public/img/rift.webp')).composite([{input:Buffer.from(svg)}]).png().toFile(path.join(os.tmpdir(), 'rift-manager-overlay.png'));
