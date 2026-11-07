from pathlib import Path
import hashlib,json
from PIL import Image
import numpy as np
root=Path('assets/broadcast/motion/pitcher-sixty');m=json.loads((root/'manifest.json').read_text());assert m['frames']==60 and not m['backgroundRemoval'] and not m['crossfade'];signatures=set();atlas=Image.open(m['path']);tile=m['tile']
for source in m['sources']:
 data=(root/source['file']).read_bytes();assert hashlib.sha256(data).hexdigest()==source['sha256'];assert Image.open(root/source['file']).mode=='RGBA'
for f,record in enumerate(m['poses']):
 row,col=divmod(f,10);a=np.array(atlas.crop((col*tile,row*tile,(col+1)*tile,(row+1)*tile)));signatures.add(hashlib.sha256(a.tobytes()).hexdigest());alpha=a[:,:,3];assert int((alpha>180).sum())>2500,(f,'missing body');assert not (np.r_[alpha[:3].flatten(),alpha[-3:].flatten(),alpha[:,:3].flatten(),alpha[:,-3:].flatten()]>180).any(),(f,'clipped');x,y=record['anchor'];assert (alpha[y-4:y+5,x-7:x+8]>100).sum()>8,(f,'shoe registration');assert record['anchor']==(m['pivotAnchor']if f<m['plantFrame']else m['landingAnchor']);assert record['rigidScale']==m['sourceScales'][record['board']]*m['cameraFit']
assert len(signatures)==60,'repeated decoded poses';print('PASS60 distinct native-alpha whole poses; original source hashes, constant board scales, shoes and transparent borders')
