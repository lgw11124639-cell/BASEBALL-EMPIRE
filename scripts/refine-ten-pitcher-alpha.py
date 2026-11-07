"""Offline alpha-only refinement. Source RGB, anatomy and wardrobe never change."""
import sys,os,json,hashlib
from pathlib import Path
import numpy as np
from PIL import Image,ImageFilter
source,coarse,destination,model=sys.argv[1:5]
original=Image.open(source).convert('RGB');rgba=np.array(Image.open(coarse).convert('RGBA'));rgb=np.array(original);tile=original.width//10;work=Path(destination).parent;session=None;records=[];grid=json.loads((work/'cells-meta.json').read_text());forced=set(os.getenv('BE_FORCE_MATTE_FRAMES','').split(','))
def bottom(a):
    y=np.where(a>180)[0]
    return int(y.max())if len(y)else 0
def shoe_coverage(source_rgb,alpha):
    ys,xs=np.where(alpha>180)
    if not len(ys):return 0
    floor=int(ys.max());core=np.asarray(Image.fromarray((source_rgb.max(2)<135).astype(np.uint8)*255).filter(ImageFilter.MinFilter(3)))>0;region=np.zeros(alpha.shape,bool);region[max(0,floor-16):min(tile,floor+6),max(0,int(xs.min())-30):min(tile,int(xs.max())+31)]=1;boots=core&region;count=int(boots.sum())
    return float(((alpha>100)&boots).sum()/count)if count>=25 else 1
def largest(mask,source_rgb):
    binary=np.asarray(mask)>100;seen=np.zeros(binary.shape,bool);best=[];h,w=binary.shape
    for y,x in zip(*np.where(binary)):
        if seen[y,x]:continue
        seen[y,x]=True;q=[(int(y),int(x))]
        for yy,xx in q:
            for ny,nx in ((yy-1,xx),(yy+1,xx),(yy,xx-1),(yy,xx+1)):
                if 0<=ny<h and 0<=nx<w and not seen[ny,nx] and binary[ny,nx]:seen[ny,nx]=True;q.append((ny,nx))
        if len(q)>len(best):best=q
    keep=np.zeros(binary.shape,np.uint8)
    for y,x in best:keep[y,x]=255
    clean=Image.fromarray(keep).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(.35))
    result=np.minimum(np.asarray(mask),np.asarray(clean));result[(source_rgb.max(2)<110)&(keep>0)]=255;return result
def predict(image,row,frame,tight=False):
    global session
    if session is None:
        import onnxruntime as ort
        options=ort.SessionOptions();options.intra_op_num_threads=1;options.inter_op_num_threads=1
        session=ort.InferenceSession(model,sess_options=options,providers=['CPUExecutionProvider'])
    a=np.array(image);pw,ph=grid[row][frame][2:4];px=(tile-pw)//2;py=(tile-ph)//2
    corners=[a[py+2:py+5,px+2:px+5].reshape(-1,3),a[py+ph-5:py+ph-2,px+pw-5:px+pw-2].reshape(-1,3),a[py+2:py+5,px+pw-5:px+pw-2].reshape(-1,3),a[py+ph-5:py+ph-2,px+2:px+5].reshape(-1,3)]
    background=np.median(np.concatenate(corners),axis=0).astype(np.uint8);classifier=np.empty_like(a);classifier[:]=background;classifier[py:py+ph,px:px+pw]=a[py:py+ph,px:px+pw];box=(0,0,tile,tile);offset=(0,0);side=tile
    if tight:
        hi=classifier.max(2);lo=classifier.min(2);ys,xs=np.where((hi<155)|(hi-lo>27));box=(max(0,int(xs.min())-9),max(0,int(ys.min())-9),min(tile,int(xs.max())+10),min(tile,int(ys.max())+10));crop=Image.fromarray(classifier).crop(box);side=max(crop.size);offset=((side-crop.width)//2,(side-crop.height)//2);square=Image.new('RGB',(side,side),tuple(map(int,background)));square.paste(crop,offset);input_image=square
    else:input_image=Image.fromarray(classifier)
    tensor=np.asarray(input_image.resize((1024,1024),Image.Resampling.LANCZOS),dtype=np.float32)/255-.5
    prediction=session.run(None,{session.get_inputs()[0].name:tensor.transpose(2,0,1)[None]})[0].squeeze();prediction=(prediction-prediction.min())/(prediction.max()-prediction.min()+1e-7)
    mask=Image.fromarray((prediction*255).astype(np.uint8)).resize((side,side),Image.Resampling.LANCZOS)
    if tight:
        mask=mask.crop((offset[0],offset[1],offset[0]+box[2]-box[0],offset[1]+box[3]-box[1]));full=Image.new('L',(tile,tile));full.paste(mask,box[:2]);mask=full
    return largest(mask,np.array(image))
for row in range(4):
    masks=[rgba[row*tile:(row+1)*tile,f*tile:(f+1)*tile,3].copy()for f in range(10)];areas=[int((a>180).sum())for a in masks];reference=max(areas[0],float(np.percentile(areas,60)));floor=bottom(masks[0])
    for frame in range(10):
        reason='peak-lift'if frame==2 else'incomplete-early-pose'if frame<4 and areas[frame]<reference*.92 else'incomplete-pose'if areas[frame]<reference*.68 else'incomplete-shoe'if shoe_coverage(rgb[row*tile:(row+1)*tile,frame*tile:(frame+1)*tile],masks[frame])<.7 else'missing-support-shoe'if bottom(masks[frame])<floor-(8 if frame<4 else 18) else'forced'if str(row)+'/'+str(frame)in forced else None
        if reason is None:continue
        image=original.crop((frame*tile,row*tile,(frame+1)*tile,(row+1)*tile));key=hashlib.sha256(image.tobytes()).hexdigest();cache=work/('matte-'+key+'.png');alpha=np.array(Image.open(cache).convert('L'))if cache.exists()else None
        if alpha is None or int((alpha>180).sum())>reference*1.5 or bottom(alpha)<floor-18 or shoe_coverage(np.array(image),alpha)<.7:
            alpha=predict(image,row,frame)
            if int((alpha>180).sum())>reference*1.5 or bottom(alpha)<floor-18 or shoe_coverage(np.array(image),alpha)<.7:alpha=predict(image,row,frame,True)
            if int((alpha>180).sum())>reference*1.5:raise RuntimeError('Background retained in refined pose '+str(row)+'/'+str(frame))
            Image.fromarray(alpha).save(cache)
        rgba[row*tile:(row+1)*tile,frame*tile:(frame+1)*tile,3]=alpha;records.append({'row':row,'frame':frame,'reason':reason,'cachedAlpha':cache.name});print('Refined',row,frame,reason,flush=True)
rgba[:,:,:3]=rgb;Image.fromarray(rgba).save(destination);Path(destination+'.json').write_text(json.dumps(records,indent=2)+'\n')
