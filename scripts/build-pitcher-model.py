"""Build the continuous CC0 MakeHuman skinned body; no photographic body-part assembly.
blender --background --python scripts/build-pitcher-model.py
"""
import bpy, json, os, math
from mathutils import Vector
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC=os.path.join(ROOT,'scripts','model-source','makehuman');OUT=os.path.join(ROOT,'assets','broadcast','pitcher3d');os.makedirs(OUT,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
vertices=[];faces=[];group=''
for line in open(os.path.join(SRC,'base.obj')):
 if line.startswith('v '):vertices.append(tuple(map(float,line.split()[1:])))
 elif line.startswith('g '):group=line.strip()[2:]
 elif line.startswith('f ') and group=='body':faces.append([int(t.split('/')[0])-1 for t in line.split()[1:]])
used=sorted({i for f in faces for i in f});floor=min(vertices[i][1] for i in used);top=max(vertices[i][1] for i in used);scale=1.88/(top-floor)
def point(v):return Vector((v[0]*scale*1.08,-v[2]*scale,(v[1]-floor)*scale))
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
for poly in mesh.polygons:
 y=sum(mesh.vertices[i].co.z for i in poly.vertices)/len(poly.vertices);scores={}
 for i in poly.vertices:
  for bone,w in byvertex[used[i]]:scores[bone]=scores.get(bone,0)+w
 bone=max(scores,key=scores.get) if scores else 'root';skin=bone.startswith(('head','neck','lowerarm','wrist','finger','metacarpal','jaw','eye','lip','orbicular','levator','temporalis','tongue'))
 poly.material_index=3 if bone.startswith(('foot','toe')) else 2 if y<1.02 else 0 if skin or y>1.64 else 1;poly.use_smooth=True
# Slight clothing clearance while retaining ONE closed, weighted surface.
mesh.update()
for v in mesh.vertices:
 original=used[v.index];bone=max(byvertex[original],key=lambda x:x[1])[0] if byvertex[original] else 'root'
 if .14<v.co.z<1.02:v.co+=v.normal*.018
 elif 1.02<v.co.z<1.60 and not bone.startswith(('lowerarm','wrist','finger','metacarpal','neck')):v.co+=v.normal*.024
# Cylindrical garment UVs allow actual sewn club lettering, not screen filters.
uv=mesh.uv_layers.new(name='Garment')
for poly in mesh.polygons:
 coords=[]
 for loop in poly.loop_indices:
  v=mesh.vertices[mesh.loops[loop].vertex_index].co
  coords.append((loop,(math.atan2(v.y,v.x)+math.pi)/(2*math.pi),v.z/1.88))
 seam=max(p[1] for p in coords)-min(p[1] for p in coords)>.5
 for loop,u,v in coords:uv.data[loop].uv=(u+1 if seam and u<.5 else u,v)
modifier=body.modifiers.new('One anatomical skeleton','ARMATURE');modifier.object=arm;body.parent=arm
for bone in arm.pose.bones:bone.rotation_mode='QUATERNION'
body['source']='MakeHuman hm08 base + default rig/weights, CC0';body['continuous_surface']=True;body['canonical_throwing_hand']='wrist.R';body['canonical_glove_hand']='wrist.L';body['canonical_pivot_foot']='foot.R';body['canonical_stride_foot']='foot.L'
meta={'height':1.88,'floor':0,'canonicalThrowingHand':'wrist.R','canonicalGloveHand':'wrist.L','canonicalPivotFoot':'foot.R','canonicalStrideFoot':'foot.L','joints':{name:list(joint(data['head'])) for name,data in rig['bones'].items()},'license':'CC0-1.0'}
# Store metadata in Three's Y-up convention.
meta['joints']={name:[p[0],p[2],-p[1]] for name,p in meta['joints'].items()};json.dump(meta,open(os.path.join(OUT,'anatomy.json'),'w'),separators=(',',':'))
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT,'pitcher.glb'),export_format='GLB',export_skins=True,export_animations=False,export_yup=True,export_all_influences=False)
print('EXPORTED continuous body',len(used),'vertices',len(faces),'faces',len(rig['bones']),'bones')
