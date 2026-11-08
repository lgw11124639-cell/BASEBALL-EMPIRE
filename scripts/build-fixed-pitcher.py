"""Build an isolated fixed-proportion photographic-material pitcher prototype.
blender --background --python scripts/build-fixed-pitcher.py
"""
import bpy, json, os, math
from mathutils import Vector
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC=os.path.join(ROOT,'scripts','model-source','makehuman');OUT=os.environ.get('PITCHER_FIXED_OUT',os.path.join(ROOT,'assets','broadcast','pitcher-fixed'));os.makedirs(OUT,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
vertices=[];faces=[];group=''
for line in open(os.path.join(SRC,'base.obj')):
 if line.startswith('v '):vertices.append(tuple(map(float,line.split()[1:])))
 elif line.startswith('g '):group=line.strip()[2:]
 elif line.startswith('f ') and group=='body':faces.append([int(t.split('/')[0])-1 for t in line.split()[1:]])
# Official CC0 male Asian macro morph, plus lean athletic muscle targets.
for filename,amount in [('asian-male-young.target',1),('universal-male-young-averagemuscle-minweight.target',.7),('universal-male-young-maxmuscle-minweight.target',.3)]:
 for line in open(os.path.join(SRC,filename)):
  parts=line.split()
  if len(parts)!=4 or parts[0].startswith('#'):continue
  i=int(parts[0]);vertices[i]=tuple(vertices[i][a]+float(parts[a+1])*amount for a in range(3))
used=sorted({i for f in faces for i in f});floor=min(vertices[i][1] for i in used);top=max(vertices[i][1] for i in used);scale=1.88/(top-floor)
def point(v):
 z=(v[1]-floor)*scale
 # 55.5% hip-to-floor proportion, preserving the same crown height and head.
 z=z*1.06 if z<=1 else 1.06+(z-1)*.90625 if z<1.64 else z
 return Vector((v[0]*scale*.99,-v[2]*scale,z))
rig=json.load(open(os.path.join(SRC,'default.mhskel')));weights=json.load(open(os.path.join(SRC,'default_weights.mhw')))['weights']
def joint(name):
 ids=rig['joints'][name];return point(tuple(sum(vertices[i][a] for i in ids)/len(ids) for a in range(3)))
arm=bpy.data.objects.new('PitcherSkeleton',bpy.data.armatures.new('PitcherSkeleton'));bpy.context.collection.objects.link(arm);bpy.context.view_layer.objects.active=arm;arm.select_set(True);bpy.ops.object.mode_set(mode='EDIT')
for name,data in rig['bones'].items():
 bone=arm.data.edit_bones.new(name);bone.head=joint(data['head']);bone.tail=joint(data['tail'])
 if (bone.tail-bone.head).length<.0001:bone.tail=bone.head+Vector((0,0,.001))
for name,data in rig['bones'].items():
 if data['parent']:arm.data.edit_bones[name].parent=arm.data.edit_bones[data['parent']]
bpy.ops.object.mode_set(mode='OBJECT');arm.select_set(False)
remap={v:i for i,v in enumerate(used)};mesh=bpy.data.meshes.new('ContinuousHumanSurface');mesh.from_pydata([point(vertices[i]) for i in used],[],[[remap[i] for i in f] for f in faces]);mesh.update();body=bpy.data.objects.new('PitcherBody',mesh);bpy.context.collection.objects.link(body)
def material(name,color,roughness):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Roughness'].default_value=roughness;return m
for m in [material('Skin',(.57,.34,.22),.82),material('Jersey',(.72,.73,.72),.9),material('Pants',(.72,.73,.72),.92),material('Shoes',(.025,.03,.035),.75)]:mesh.materials.append(m)
byvertex={i:[] for i in used}
for name,items in weights.items():
 if name not in rig['bones']:continue
 for i,w in items:
  if i in byvertex and w>0:byvertex[i].append((name,w))
for i in byvertex:
 byvertex[i]=sorted(byvertex[i],key=lambda item:-item[1])[:4];total=sum(w for _,w in byvertex[i]) or 1;byvertex[i]=[(name,w/total) for name,w in byvertex[i]]
for name in rig['bones']:
 vg=body.vertex_groups.new(name=name)
 for orig in used:
  for bone,w in byvertex[orig]:
   if bone==name:vg.add([remap[orig]],w,'REPLACE')

# Retain one continuous topology across shoulders, elbows, hips and fingers.
# Material boundaries do not split or delete any anatomical faces.
from mathutils.kdtree import KDTree
weighted=[i for i in used if byvertex[i]]
kd=KDTree(len(weighted))
for i,orig in enumerate(weighted):kd.insert(point(vertices[orig]),i)
kd.balance()
for orig in used:
 if not byvertex[orig]:
  _,idx,_=kd.find(point(vertices[orig]));byvertex[orig]=byvertex[weighted[idx]][:]
  for bone,w in byvertex[orig]:body.vertex_groups[bone].add([remap[orig]],w,'REPLACE')
def dominant(i):return max(byvertex[used[i]],key=lambda item:item[1])[0]
def region(v):
 co=v.co;bone=dominant(v.index)
 if bone.startswith(('foot','toe')):return 3
 if bone.startswith(('wrist','finger','metacarpal','lowerarm')):return 0
 if bone.startswith('upperarm'):
  side=bone[-1];a=joint(rig['bones']['upperarm01.'+side]['head']);b=joint(rig['bones']['lowerarm01.'+side]['head']);t=(co-a).dot(b-a)/(b-a).length_squared
  return 1 if t<.69 else 0
 if bone.startswith(('upperleg','lowerleg','pelvis')):return 2
 if co.z<1.085:return 2
 if co.z>1.575:return 0
 return 1
regions=[region(v) for v in mesh.vertices]
# Remove bare chest microgeometry beneath cloth, but keep the original welded
# seam topology: no independent floating sleeves or disconnected hip rings.
for v in mesh.vertices:
 r=regions[v.index];co=v.co;bone=dominant(v.index)
 if r==1 and abs(co.x)<.23 and 1.085<co.z<1.56 and not bone.startswith(('upperarm','shoulder','clavicle')):
  # Fit a smooth tailored cross-section over the torso.
  marks=[(1.085,.15,.105),(1.18,.155,.108),(1.28,.178,.115),(1.43,.205,.117),(1.52,.21,.10),(1.56,.15,.08)]
  j=0
  while j<len(marks)-2 and co.z>marks[j+1][0]:j+=1
  z,rx,ry=marks[j];zz,xx,yy=marks[j+1];t=max(0,min(1,(co.z-z)/(zz-z)));rx+=t*(xx-rx);ry+=t*(yy-ry)
  a=math.atan2(co.y/ry,co.x/rx);co.x=rx*math.cos(a);co.y=ry*math.sin(a)
 elif r in (1,2):
  # Clearance on limbs; never displace fingers, neck or facial geometry.
  co+=v.normal*(.009 if r==1 else .012)
mesh.update()
for poly in mesh.polygons:
 counts={r:sum(regions[i]==r for i in poly.vertices)for r in range(4)}
 poly.material_index=max(counts,key=counts.get);poly.use_smooth=True
modifier=body.modifiers.new('Single fixed anatomical skeleton','ARMATURE');modifier.object=arm;body.parent=arm
sub=body.modifiers.new('Continuous surface subdivision','SUBSURF');sub.levels=1;sub.render_levels=2
for b in arm.pose.bones:b.rotation_mode='QUATERNION'
reference=bpy.data.images.load(os.path.join(ROOT,'assets','broadcast','pitcher-fixed','material-reference.png'));reference.pack()
def imageMaterial(name,uvname):
 m=material(name,(.4,.3,.3),.85);n=m.node_tree.nodes;l=m.node_tree.links;t=n.new('ShaderNodeTexImage');t.image=reference;t.extension='EXTEND';u=n.new('ShaderNodeUVMap');u.uv_map=uvname;l.new(u.outputs['UV'],t.inputs['Vector']);l.new(t.outputs['Color'],n.get('Principled BSDF').inputs['Base Color']);return m
face=imageMaterial('KoreanFacePhotographic','FaceProjection');mesh.materials.append(face)
faceUV=mesh.uv_layers.new(name='FaceProjection');clothUV=mesh.uv_layers.new(name='ClothProjection')
eyeL=joint(rig['bones']['eye.L']['head']);eyeR=joint(rig['bones']['eye.R']['head']);eyeZ=(eyeL.z+eyeR.z)/2;pixelsPerMeter=102/abs(eyeL.x-eyeR.x)
mesh.materials[1]=imageMaterial('Jersey','ClothProjection');mesh.materials[2]=imageMaterial('Pants','ClothProjection')
for poly in mesh.polygons:
 center=sum((mesh.vertices[i].co for i in poly.vertices),Vector())/len(poly.vertices)
 if poly.material_index==0 and center.z>eyeZ-.14 and center.y<-.035 and poly.normal.y<.2:poly.material_index=4
 for loop in poly.loop_indices:
  co=mesh.vertices[mesh.loops[loop].vertex_index].co
  faceUV.data[loop].uv=((944.5+co.x*pixelsPerMeter)/1254,1-(861-(co.z-eyeZ)*pixelsPerMeter*1.08)/1254)
  back=poly.normal.y>0;cx=942 if back else 315;sign=-1 if back else 1
  if poly.material_index==1:
   sx=cx+max(-48,min(48,co.x*210))*sign;sy=max(110,min(220,220-(co.z-1.085)*248))
  else:
   legSign=1 if co.x>0 else -1;legCenter=cx+sign*legSign*33
   # UVs stay inside the photographed trouser leg at all heights.
   sx=legCenter+sign*max(-13,min(13,(abs(co.x)-.106)*180))*legSign;sy=max(250,min(555,565-co.z*307))
  clothUV.data[loop].uv=(sx/1254,1-sy/1254)
hidden=material('EnclosedSkin',(0,0,0),1);hidden.surface_render_method='DITHERED';hidden.node_tree.nodes.get('Principled BSDF').inputs['Alpha'].default_value=0;mesh.materials.append(hidden)
for poly in mesh.polygons:
 bones=[dominant(i) for i in poly.vertices]
 if poly.material_index==3 or all(b.endswith('.L') and b.startswith(('wrist','metacarpal','finger'))for b in bones):poly.material_index=5
mesh.uv_layers.active=mesh.uv_layers['ClothProjection']
mesh.materials[0].node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(.58,.37,.25,1)
# Slight surface smoothing removes isolated garment details without altering
# the skeleton or animation scale.
sm=body.modifiers.new('Cloth smoothing','SMOOTH');sm.factor=.5;sm.iterations=4
vg=body.vertex_groups.new(name='ClothSurface')
for v in mesh.vertices:
 if regions[v.index] in (1,2):vg.add([v.index],1,'REPLACE')
sm.vertex_group=vg.name
bpy.context.view_layer.objects.active=body
bpy.ops.object.modifier_move_up(modifier=sm.name);bpy.ops.object.modifier_move_up(modifier=sm.name)
meta={'height':1.88,'floor':0,'canonicalThrowingHand':'wrist.R','canonicalGloveHand':'wrist.L','canonicalPivotFoot':'foot.R','canonicalStrideFoot':'foot.L','joints':{name:list(joint(data['head'])) for name,data in rig['bones'].items()},'license':'CC0-1.0','weldedSurface':True}
meta['joints']={name:[v[0],v[2],-v[1]]for name,v in meta['joints'].items()}
def attach(obj,bone):
 # Rigid accessory skinning keeps global bind coordinates, avoiding parent jumps.
 vg=obj.vertex_groups.new(name=bone);vg.add(list(range(len(obj.data.vertices))),1,'REPLACE')
 mod=obj.modifiers.new('Fixed bone attachment','ARMATURE');mod.object=arm;obj.parent=arm

def ellipsoid(name,location,radii,mat,bone):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=32,ring_count=20,location=location)
 o=bpy.context.object;o.name=name;o.scale=radii;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 # Armature skin uses coordinates in armature space.
 bpy.ops.object.transform_apply(location=True,rotation=False,scale=False)
 o.data.materials.append(mat)
 for f in o.data.polygons:f.use_smooth=True
 attach(o,bone);return o
white=material('EyeWhite',(.68,.65,.59),.35);iris=material('DarkBrownIris',(.04,.019,.009),.28);pupil=material('Pupil',(.003,.003,.003),.2)
for side in ['R','L']:
 eye=joint(rig['bones']['eye.'+side]['head'])
 ellipsoid('Eyeball.'+side,eye,(.0115,.0115,.0115),white,'head')
 ellipsoid('Iris.'+side,eye+Vector((0,-.0103,0)),(.0056,.0019,.0056),iris,'head')
 ellipsoid('Pupil.'+side,eye+Vector((0,-.012,0)),(.0027,.0007,.0027),pupil,'head')
capmat=material('CapFabric',(.15,.035,.19),.92)
# The crown follows the actual fixed head, with an open lower hemisphere.
head=joint(rig['bones']['head']['head'])
bpy.ops.mesh.primitive_uv_sphere_add(segments=48,ring_count=24,location=(0,head.y,1.82))
cap=bpy.context.object;cap.name='TailoredCapCrown';cap.scale=(.105,.114,.079);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
import bmesh
bm=bmesh.new();bm.from_mesh(cap.data);bmesh.ops.delete(bm,geom=[v for v in bm.verts if v.co.z<-.012],context='VERTS');bm.to_mesh(cap.data);bm.free()
bpy.ops.object.transform_apply(location=True,rotation=False,scale=False);cap.data.materials.append(capmat);attach(cap,'head')
ellipsoid('CurvedCapVisor',(0,head.y-.10,1.81),(.088,.078,.006),capmat,'head')

for side in ['L','R']:
 ankle=joint(rig['bones']['foot.'+side]['head'])
 sole=material('CleatSole.'+side,(.012,.013,.016),.7);upper=material('CleatUpper.'+side,(.025,.028,.033),.6)
 ellipsoid('CleatUpper.'+side,ankle+Vector((0,-.085,-.027)),(.061,.16,.055),upper,'foot.'+side)
 ellipsoid('CleatSole.'+side,ankle+Vector((0,-.085,-.067)),(.063,.162,.015),sole,'foot.'+side)

# Close, smooth collar and waist trim cover material boundaries, and use the
# exact same nearest anatomical weights as the continuous torso surface.
from mathutils.kdtree import KDTree
kd=KDTree(len(used))
for i,orig in enumerate(used):kd.insert(mesh.vertices[remap[orig]].co,i)
kd.balance()
def weightedTrim(name,z0,z1,rx,ry,mat):
 coords=[];n=64
 for z in [z0,z0+.0015,z1-.0015,z1]:
  coords.extend([(rx*math.cos(i/n*math.tau),ry*math.sin(i/n*math.tau),z)for i in range(n)])
 fs=[[j*n+i,j*n+(i+1)%n,(j+1)*n+(i+1)%n,(j+1)*n+i]for j in range(3)for i in range(n)]
 me=bpy.data.meshes.new(name);me.from_pydata(coords,[],fs);me.update();ob=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(ob);me.materials.append(mat)
 for f in me.polygons:f.use_smooth=True
 groups={}
 for vertex in me.vertices:
  _,idx,_=kd.find(vertex.co)
  for bone,w in byvertex[used[idx]]:
   if bone not in groups:groups[bone]=ob.vertex_groups.new(name=bone)
   groups[bone].add([vertex.index],w,'REPLACE')
 mod=ob.modifiers.new('Same anatomical weights','ARMATURE');mod.object=arm;ob.parent=arm
 solid=ob.modifiers.new('Sewn edge','SOLIDIFY');solid.thickness=.002
 return ob
weightedTrim('Collar',1.572,1.615,.086,.079,capmat)
weightedTrim('WaistBelt',1.06,1.105,.173,.133,material('Belt',(.025,.018,.022),.62))
# Stable sewn trouser piping follows the same anatomical weights in every pose.
piping=material('Piping',(.15,.035,.19),.86)
for side in ['R','L']:
 sign=1 if side=='L' else -1
 hip=joint(rig['bones']['upperleg01.'+side]['head']);ankle=joint(rig['bones']['foot.'+side]['head'])
 coords=[];n=45
 for j in range(n):
  z=ankle.z+.035+(hip.z+.04-ankle.z-.035)*j/(n-1)
  nearby=[v.co for v in mesh.vertices if abs(v.co.z-z)<.025 and v.co.x*sign>0 and abs(v.co.y)<.045]
  if nearby:outer=max(v.x*sign for v in nearby)*sign
  else:outer=hip.x+sign*.08
  for y in [-.004,.004]:coords.append((outer+sign*.002,y,z))
 fs=[[j*2,j*2+1,(j+1)*2+1,(j+1)*2]for j in range(n-1)]
 me=bpy.data.meshes.new('Piping.'+side);me.from_pydata(coords,[],fs);me.update();ob=bpy.data.objects.new('Piping.'+side,me);bpy.context.collection.objects.link(ob);me.materials.append(piping)
 groups={}
 for vertex in me.vertices:
  _,idx,_=kd.find(vertex.co)
  for bone,w in byvertex[used[idx]]:
   if bone not in groups:groups[bone]=ob.vertex_groups.new(name=bone)
   groups[bone].add([vertex.index],w,'REPLACE')
 mod=ob.modifiers.new('Fixed trouser seam weights','ARMATURE');mod.object=arm;ob.parent=arm
 for face in me.polygons:face.use_smooth=True
 solid=ob.modifiers.new('Sewn seam thickness','SOLIDIFY');solid.thickness=.001

# Short hair conforms to the actual fixed skull rather than an approximate cap.
hairmat=material('ShortBlackHair',(.012,.009,.008),.95)
polys=[]
for poly in mesh.polygons:
 c=sum((mesh.vertices[i].co for i in poly.vertices),Vector())/len(poly.vertices)
 if c.z>1.715 and (c.y>-.025 or abs(c.x)>.075):polys.append(list(poly.vertices))
hairIds=sorted({i for f in polys for i in f});hairMap={v:i for i,v in enumerate(hairIds)}
hm=bpy.data.meshes.new('ConformingShortHair');hm.from_pydata([mesh.vertices[i].co+mesh.vertices[i].normal*.0025 for i in hairIds],[],[[hairMap[i]for i in f]for f in polys]);hm.update();hair=bpy.data.objects.new('ShortHair',hm);bpy.context.collection.objects.link(hair);hm.materials.append(hairmat)
for f in hm.polygons:f.use_smooth=True
groups={}
for i,idx in enumerate(hairIds):
 for bone,w in byvertex[used[idx]]:
  if bone not in groups:groups[bone]=hair.vertex_groups.new(name=bone)
  groups[bone].add([i],w,'REPLACE')
mod=hair.modifiers.new('Same skull skinning','ARMATURE');mod.object=arm;hair.parent=arm
sub=hair.modifiers.new('Short hair surface','SUBSURF');sub.levels=1
# Prototype stage only. Review assets are separate from the game actor.
meta.update({'prototype':True,'identity':'single-fixed-korean-male','animatedScale':False,'targetHeightM':1.88,'morphs':['asian-male-young','lean-athletic'],'photographicReference':'material-reference.png'})
json.dump(meta,open(os.path.join(OUT,'anatomy.json'),'w'),indent=2)
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT,'pitcher.glb'),export_format='GLB',export_skins=True,export_animations=False,export_yup=True,export_all_influences=False)
# Save a transparent, high-resolution material/identity inspection render.
world=bpy.context.scene.world or bpy.data.worlds.new('Studio');bpy.context.scene.world=world;world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.6,.66,.75,1);world.node_tree.nodes['Background'].inputs[1].default_value=.45
for name,location,power,size in [('Key',(-2,-4,4),450,4),('Fill',(3,-1,2),170,3),('Rim',(0,3,3),300,3)]:
 data=bpy.data.lights.new(name,'AREA');data.energy=power;data.shape='DISK';data.size=size;o=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(o);o.location=location;o.rotation_euler=(Vector((0,0,1))-o.location).to_track_quat('-Z','Y').to_euler()
data=bpy.data.cameras.new('InspectionCamera');cam=bpy.data.objects.new('InspectionCamera',data);bpy.context.collection.objects.link(cam);cam.location=(2.6,-5.5,2.0);cam.rotation_euler=(Vector((0,0,.96))-cam.location).to_track_quat('-Z','Y').to_euler();data.type='ORTHO';data.ortho_scale=2.14;bpy.context.scene.camera=cam
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=24;scene.cycles.use_denoising=False;scene.render.resolution_x=900;scene.render.resolution_y=1200;scene.render.resolution_percentage=100;scene.render.film_transparent=True;scene.render.image_settings.file_format='PNG';scene.render.filepath=os.path.join(OUT,'identity-inspection.png')
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT,'fixed-pitcher.blend'))
bpy.ops.render.render(write_still=True)
print('FIXED_MODEL_PROTOTYPE_COMPLETE',OUT)
