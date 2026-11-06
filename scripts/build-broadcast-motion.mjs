// Repack original generated material-ID renders; no semantic image synthesis here.
// node scripts/build-broadcast-motion.mjs SET_PNG CLOSED_LIFT_STRIDE_PNG REAR_RELEASE_FOLLOW_ATLAS_PNG BATTER_ATLAS_PNG
import {spawnSync} from 'node:child_process';
import {mkdtempSync,rmSync,copyFileSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
const [set,liftStride,rear,batter]=process.argv.slice(2);
if(!batter)throw Error('Four original generated PNG paths are required; see script header.');
const out=fileURLToPath(new URL('../assets/broadcast/motion/',import.meta.url)),temp=mkdtempSync(join(tmpdir(),'be-motion-'));
const run=(...args)=>{const r=spawnSync('magick',args,{stdio:'inherit'});if(r.status!==0)throw Error('Motion atlas conversion failed.');};
mkdirSync(out,{recursive:true});
try{
 run(set,'-channel','A','-threshold','95%','+channel','-resize','384x384','-background','none','-gravity','center','-extent','384x384','-flop',join(temp,'set.png'));
 for(const [name,x] of [['lift',0],['stride',887]])run(liftStride,'-crop',`887x887+${x}+0`,'+repage','-channel','A','-threshold','95%','+channel','-resize','384x384',join(temp,name+'.png'));
 const frames=[];
 for(let row=0;row<4;row++)for(let col=0;col<5;col++){
  const target=join(temp,`${row}-${col}.png`);frames.push(target);
  if(col<3)copyFileSync(join(temp,['set','lift','stride'][col]+'.png'),target);
  else run(rear,'-crop',`362x362+${(col-2)*362}+${row*362}`,'+repage','-resize','384x384',target);
 }
 run('montage',...frames,'-tile','5x4','-geometry','384x384+0+0','-background','none','-quality','88',join(out,'pitcher-rear.webp'));
 run(batter,'-resize','768x768','-quality','88',join(out,'batter-swing.webp'));
}finally{rmSync(temp,{recursive:true,force:true});}
