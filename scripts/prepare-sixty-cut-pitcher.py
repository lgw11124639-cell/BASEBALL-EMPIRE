"""Pack native-transparent generated whole poses. No alpha extraction or recoloring."""
from pathlib import Path
import hashlib,json,shutil
from PIL import Image
import numpy as np
from scipy.ndimage import label
root=Path('assets/broadcast/motion/pitcher-sixty');root.mkdir(parents=True,exist_ok=True)
files=['exec-2bb35bcb-7f0f-4ed7-bf55-f8e5172c57a5.png','exec-e2614a7b-4704-45b1-a28e-9d95a6426f9c.png','exec-469764d2-15bb-4e7c-82d0-9e4652025298.png']
frames=[];scales=[];sources=[]
for board,name in enumerate(files):
 path=Path('/workspace/generated_images')/name;image=Image.open(path).convert('RGBA');w,h=image.size;shutil.copyfile(path,root/f'source-{board+1}.png');sources.append({'file':f'source-{board+1}.png','sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'nativeAlpha':True})
 for i in range(20):
  row,col=divmod(i,5);cell=image.crop((round(col*w/5),round(row*h/4),round((col+1)*w/5),round((row+1)*h/4)));a=np.array(cell);yy,xx=np.where(a[:,:,3]>180);top,bottom=int(yy.min()),int(yy.max());left,right=int(xx.min()),int(xx.max())
  if min(left,top,cell.width-1-right,cell.height-1-bottom)<2:raise ValueError(f'Clipped native figure {board}/{i}')
  if i==0:
   mask=(a[:,:,3]>180)&(a[:,:,0]>a[:,:,1]*1.2)&(a[:,:,2]>a[:,:,1]*1.2);mask[:top]=False;mask[top+int((bottom-top+1)*.12):]=False;_,capx=np.where(mask);capwidth=int(capx.max()-capx.min()+1);scales.append(48/capwidth)
  dark=(a[:,:,3]>180)&(a[:,:,:3].max(2)<120);dark[:max(0,bottom-65)]=False;components,n=label(dark);shoes=[]
  for component in range(1,n+1):
   cy,cx=np.where(components==component)
   if len(cx)<100:continue
   low=int(cy.max());sole=cx[cy>=low-2];shoes.append([float(np.median(sole)),low,len(cx)])
  if not shoes:raise ValueError(f'Missing native shoe {board}/{i}')
  floor=max(s[1]for s in shoes);ground=[s for s in shoes if s[1]>=floor-15];ground.sort(key=lambda s:s[0]);f=board*20+i
  # Near right shoe before planting; far left landing shoe throughout follow-through.
  foot=ground[0]if f<32 or f>=54 else ground[-1]
  frames.append({'index':f,'image':cell,'foot':foot[:2],'shoes':shoes,'bounds':[left,top,right,bottom],'board':board})
# Match cap-to-planted-sole height across the two board boundaries.
# Each board still uses one rigid, isotropic scale for every whole pose.
for start in [20,40]:
 previous,current=frames[start-1],frames[start]
 old_height=previous['foot'][1]-previous['bounds'][1]
 new_height=current['foot'][1]-current['bounds'][1]
 scales[start//20]=scales[(start-1)//20]*old_height/new_height
plant=frames[32];rear=min(plant['shoes'],key=lambda s:s[0]);front=max(plant['shoes'],key=lambda s:s[0]);landingOffset=[(front[j]-rear[j])*scales[1]for j in range(2)]
# Preserve one rigid body scale per generated board, plus one shared camera fit.
fit=1.0;anchor=[100,350];tile=384
for frame in frames:
 s=scales[frame['board']];target=anchor if frame['index']<32 else[anchor[j]+landingOffset[j]for j in range(2)];foot=frame['foot'];l,t,r,b=frame['bounds'];offset=[0,0]if frame['index']<32 else landingOffset
 for d,room in [(s*(foot[0]-l)-offset[0],anchor[0]-5),(s*(r-foot[0])+offset[0],tile-6-anchor[0]),(s*(foot[1]-t)-offset[1],anchor[1]-5),(s*(b-foot[1])+offset[1],tile-6-anchor[1])]:
  if d>0:fit=min(fit,room/d)
landing=[round(anchor[j]+landingOffset[j]*fit)for j in range(2)];atlas=Image.new('RGBA',(tile*10,tile*6));records=[]
for frame in frames:
 s=scales[frame['board']]*fit;im=frame['image'];nw,nh=round(im.width*s),round(im.height*s);im=im.resize((nw,nh),Image.Resampling.LANCZOS);target=anchor if frame['index']<32 else landing;foot=frame['foot'];dx=round(target[0]-foot[0]*nw/frame['image'].width);dy=round(target[1]-foot[1]*nh/frame['image'].height);pose=Image.new('RGBA',(tile,tile));pose.paste(im,(dx,dy));x=(frame['index']%10)*tile;y=(frame['index']//10)*tile;atlas.paste(pose,(x,y));records.append({'index':frame['index'],'board':frame['board'],'sourceFoot':foot,'anchor':target,'rigidScale':s})
atlas.save(root/'overhand-purple.webp','WEBP',lossless=True,method=6)
manifest={'version':1,'frames':60,'tile':tile,'columns':10,'rows':6,'durationMs':2000,'fps':30,'path':str(root/'overhand-purple.webp'),'nativeAlpha':True,'backgroundRemoval':False,'crossfade':False,'wholePoses':True,'pivotAnchor':anchor,'landingAnchor':landing,'plantFrame':32,'releaseFrame':39,'sourceScales':scales,'cameraFit':fit,'sources':sources,'poses':records};(root/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n');print('Packed60 native-alpha whole poses',scales,'fit',fit,'landing',landing)
