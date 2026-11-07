from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import json,hashlib,subprocess
from PIL import Image
import numpy as np
from scipy.ndimage import label
root=Path('assets/broadcast/motion/pitcher-game');root.mkdir(exist_ok=True)
m=json.loads(Path('assets/broadcast/motion/pitcher-ten/manifest.json').read_text());specs=m['clubs']+list(m['nations'].values())
sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
def work(spec):
 key=str(spec['id']);flow=root/(key+'.png');out=root/(key+'.json');old=json.loads(out.read_text())if out.exists()else{}
 if not flow.exists()or old.get('sourceSha256')!=spec['sha256']:
  args=['/tmp/be-game-motion-fields',spec['path'],str(flow),'10','4','10','6',*map(str,spec['anchor']),*map(str,[n for p in spec['landing']for n in p])];subprocess.run(args,check=True,stdout=subprocess.DEVNULL)
 image=Image.open(spec['path']);hips=[];scales=[];bounds=[]
 for row in range(4):
  group=[]
  for i in range(10):
   a=np.array(image.crop((i*384,row*384,(i+1)*384,(row+1)*384)));yy,xx=np.where(a[:,:,3]>180);top,bottom=int(yy.min()),int(yy.max());group.append([int(xx.min()),top,int(xx.max()),bottom]);rgb=a[:,:,:3].astype(float);pants=(a[:,:,3]>180)&(rgb[:,:,0]>125)&(rgb[:,:,1]>115)&(rgb[:,:,2]>95)&(abs(rgb[:,:,0]-rgb[:,:,1])<28)&(abs(rgb[:,:,1]-rgb[:,:,2])<38);labs,n=label(pants)
   if n:
    k=max(range(1,n+1),key=lambda k:int((labs==k).sum()));py,px=np.where(labs==k);hip=int(py.min())+4
   else:hip=bottom-(bottom-top)*.55
   hip=max(top+(bottom-top)*.32,min(bottom-(bottom-top)*.30,hip));hips.append(float(hip))
  bounds.append(group);scales.append(267/(group[0][3]-group[0][1]+1)*1.04)
 data={'kit':spec['id'],'source':spec['path'],'sourceSha256':spec['sha256'],'flow':str(flow),'flowSha256':sha(flow),'framesPerDelivery':10,'forms':4,'columns':10,'rows':4,'fieldColumns':10,'fieldRows':8,'grid':96,'anchor':spec['anchor'],'landing':spec['landing'],'plantFrame':6,'releaseFrame':6,'phases':[0,.35,1,1.35,1.85,2.5,3,3.25,3.65,4],'release':spec['release'],'hips':hips,'scales':scales,'bounds':bounds,'legScale':1.18,'displayFrames':120,'interpolation':'single-source motion warp'};out.write_text(json.dumps(data,separators=(',',':'))+'\n');print('Ready',key,flush=True);return data
with ThreadPoolExecutor(max_workers=2)as pool: results=list(pool.map(work,specs))
index={'version':1,'clubs':[None]*10,'nations':{},'background':'assets/broadcast/motion/pitcher-smooth/pitch-deep.webp','displayFrames':120}
for s in results:
 if isinstance(s['kit'],int):index['clubs'][s['kit']]=s
 else:index['nations'][s['kit']]=s
(root/'manifest.json').write_text(json.dumps(index,separators=(',',':'))+'\n');print('PASS38 wardrobes x4 deliveries',flush=True)
