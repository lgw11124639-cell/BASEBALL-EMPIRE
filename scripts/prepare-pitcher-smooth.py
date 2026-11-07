"""Metadata for live image animation: native art stays unchanged, displacement is data."""
from pathlib import Path
import hashlib,json,shutil
from PIL import Image
import numpy as np
from scipy.ndimage import label
root=Path('assets/broadcast/motion/pitcher-smooth');source=Path('assets/broadcast/motion/pitcher-sixty/manifest.json');m=json.loads(source.read_text());atlas=Image.open(m['path']);hips=[]
for i in range(60):
 r,c=divmod(i,10);a=np.array(atlas.crop((c*384,r*384,(c+1)*384,(r+1)*384)));rgb=a[:,:,:3].astype(float);pants=(a[:,:,3]>180)&(rgb[:,:,0]>125)&(rgb[:,:,1]>115)&(rgb[:,:,2]>95)&(np.abs(rgb[:,:,0]-rgb[:,:,1])<28)&(np.abs(rgb[:,:,1]-rgb[:,:,2])<38);labels,n=label(pants);best=max(range(1,n+1),key=lambda k:int((labels==k).sum()));yy,xx=np.where(labels==best);hip=float(yy.min())+4;hips.append(hip)
# Ease measurement noise without changing any underlying source image.
hips=[float(np.median(hips[max(0,i-1):min(60,i+2)]))for i in range(60)]
bg=Path('/workspace/generated_images/exec-d5b3d222-b115-4a29-846e-2952098259e3.png');Image.open(bg).convert('RGB').save(root/'pitch-deep.webp','WEBP',quality=95,method=6)
meta={'version':1,'sourceManifest':str(source),'sourceManifestSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'sourceAtlas':m['path'],'sourceAtlasSha256':hashlib.sha256(Path(m['path']).read_bytes()).hexdigest(),'sourceFrames':60,'frames':120,'fps':60,'durationMs':2000,'interpolation':'bidirectional optical-flow guided single-source texture warp','crossfade':False,'flow':str(root/'flow.png'),'flowSha256':hashlib.sha256((root/'flow.png').read_bytes()).hexdigest(),'flowGrid':96,'flowColumns':10,'flowRows':12,'flowFields':118,'releaseSource':[333.54545454545456,137.8181818181818],'hipY':hips,'rightPivotX':96,'leftCanonicalPivotX':127,'rubberEdgeStart':True,'bodyScale':1.04,'legScale':1.18,'batter':{'kit':0,'box':{'min':608,'max':644,'feet':260,'height':80}},'heightTargetCm':188,'heightTargetIsVisual':True,'finalStepCompression':.32,'background':str(root/'pitch-deep.webp'),'backgroundSource':bg.name,'backgroundSourceSha256':hashlib.sha256(bg.read_bytes()).hexdigest(),'backgroundPitchDistanceMeters':18.44,'nativeAlpha':True,'backgroundRemoval':False};(root/'manifest.json').write_text(json.dumps(meta,indent=2)+'\n');print('Prepared120-frame live warp, long-leg visual188cm proportions, deep background; native60source cuts unchanged');print('hip range',min(hips),max(hips))
