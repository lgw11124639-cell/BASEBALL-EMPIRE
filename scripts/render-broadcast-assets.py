"""Reproducible original 3D broadcast art. Run with Blender --background --python.

No third party models/textures. Static renders keep mobile playback off the GPU.
Field surface projection matches the replay's 720x520 recorded-motion coordinate system.
"""
import bpy, math, random, os, subprocess
from mathutils import Vector

ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT=os.path.join(ROOT,'assets','broadcast');os.makedirs(OUT,exist_ok=True)
random.seed(48)
def material(name,color,metal=0,rough=.65):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
 bs=m.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=(*color,1);bs.inputs['Metallic'].default_value=metal;bs.inputs['Roughness'].default_value=rough
 return m
def mesh(name,vertices,faces,mat):
 m=bpy.data.meshes.new(name);m.from_pydata(vertices,[],faces);m.update();o=bpy.data.objects.new(name,m);bpy.context.collection.objects.link(o);o.data.materials.append(mat);return o
def box(name,loc,scale,mat,bevel=0):
 v=[(loc[0]+x*scale[0]/2,loc[1]+y*scale[1]/2,loc[2]+z*scale[2]/2) for x,y,z in [(-1,-1,-1),(-1,-1,1),(-1,1,-1),(-1,1,1),(1,-1,-1),(1,-1,1),(1,1,-1),(1,1,1)]]
 return mesh(name,v,[(0,4,6,2),(1,3,7,5),(0,1,5,4),(2,6,7,3),(0,2,3,1),(4,5,7,6)],mat)
def ellipsoid(name,loc,scale,mat):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=24,ring_count=16,location=loc);o=bpy.context.object;o.name=name;o.scale=scale;o.data.materials.append(mat)
 for p in o.data.polygons:p.use_smooth=True
 return o
def rod(name,a,b,r,mat,r2=None):
 a,b=Vector(a),Vector(b);direction=b-a;rotation=direction.to_track_quat('Z','Y');v=[]
 for center,radius in [(a,r),(b,r if r2 is None else r2)]:
  for i in range(12):v.append(center+rotation@Vector((radius*math.cos(i*math.tau/12),radius*math.sin(i*math.tau/12),0)))
 faces=[tuple(range(11,-1,-1)),tuple(range(12,24))]+[(i,(i+1)%12,(i+1)%12+12,i+12) for i in range(12)]
 return mesh(name,v,faces,mat)
def reset():
 bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
 s=bpy.context.scene;s.render.engine='CYCLES';s.cycles.samples=16;s.cycles.use_denoising=False;s.render.resolution_x=960;s.render.resolution_y=694;s.render.resolution_percentage=100
 s.world.use_nodes=True;s.world.node_tree.nodes.get('Background').inputs['Color'].default_value=(.25,.32,.42,1);s.world.node_tree.nodes.get('Background').inputs['Strength'].default_value=.6;s.view_settings.view_transform='AgX';s.render.image_settings.file_format='PNG';s.render.image_settings.color_mode='RGBA';s.render.film_transparent=True
 return s
def camera(loc,target,ortho):
 bpy.ops.object.camera_add(location=loc);o=bpy.context.object;o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler();o.data.type='ORTHO';o.data.ortho_scale=ortho;bpy.context.scene.camera=o
def light(loc,energy,size,color):
 bpy.ops.object.light_add(type='AREA',location=loc);o=bpy.context.object;o.data.energy=energy;o.data.shape='DISK';o.data.size=size;o.data.color=color;o.rotation_euler=(Vector((0,14,0))-o.location).to_track_quat('-Z','Y').to_euler()
def ground(x,y,z=.01):return ((x-360)/20,(466-y)/(20*math.sqrt(.5)),z)
def surface(name,points,mat,z=.01):return mesh(name,[ground(x,y,z) for x,y in points],[tuple(range(len(points)))],mat)
def stadium(pitch=False):
 s=reset();grass=material('Deep emerald turf',(.065,.26,.12));stripe=material('Mown emerald turf',(.095,.34,.16));dirt=material('Clay',(.39,.2,.095));chalk=material('Chalk',(.88,.87,.76));navy=material('Stadium structure',(.025,.055,.08),.3);seats=material('Blue seats',(.045,.12,.19),.1);gold=material('Warm rail',(.5,.4,.22),.5)
 # Fine procedural grain, no photographs or external textures.
 for mat,scale,strength in [(grass,160,.16),(stripe,160,.16),(dirt,110,.25)]:
  n=mat.node_tree.nodes;noise=n.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=scale;bump=n.new('ShaderNodeBump');bump.inputs['Strength'].default_value=strength;bump.inputs['Distance'].default_value=.035;mat.node_tree.links.new(noise.outputs['Fac'],bump.inputs['Height']);mat.node_tree.links.new(bump.outputs['Normal'],n.get('Principled BSDF').inputs['Normal'])
 surface('Foul territory',[(-300,700),(1000,700),(1000,125),(-300,125)],dirt)
 # Align every base to the existing motion plane.
 wedge=[(360,466),(18,270)]+[(18+i*684/48,270-76.5*math.sin(math.pi*i/48)) for i in range(1,49)]
 surface('Playing field',wedge,grass,.015)
 # Mowing lanes clipped within the fair-ground triangle.
 for i in range(11):
  x=18+i*62
  if i%2==0:surface('Mown lane',[(360+(x-360)*.01,464),(x,270-76.5*math.sin(math.pi*i/11)),(x+60,270-76.5*math.sin(math.pi*(i+1)/11))],stripe,.018)
 surface('Infield clay',[(360,466),(195,365),(360,275),(525,365)],dirt,.025)
 surface('Infield grass',[(360,443),(236,365),(360,299),(484,365)],stripe,.03)
 for a,b in [((360,466),(18,270)),((360,466),(702,270))]:rod('Foul line',ground(*a,.055),ground(*b,.055),.035,chalk)
 for x,y in [(525,365),(360,275),(195,365)]:box('Base',ground(x,y,.09),(.6,.6,.13),chalk,.045)
 surface('Home plate',[(353,463),(367,463),(367,471),(360,476),(353,471)],chalk,.06)
 bpy.ops.mesh.primitive_cylinder_add(vertices=64,radius=1.45,depth=.15,location=ground(360,366,.075));bpy.context.object.data.materials.append(dirt)
 box('Pitching rubber',ground(360,366,.17),(1,.15,.04),chalk,.01)
 for x in [329,391]:
  for a,b in [((x-8,456),(x+8,456)),((x-8,478),(x+8,478)),((x-8,456),(x-8,478)),((x+8,456),(x+8,478))]:rod('Batter box',ground(*a,.07),ground(*b,.07),.025,chalk)
 # Three-dimensional stands rising behind the wall, with individual seat blocks.
 people=[material('Spectators '+str(i),c) for i,c in enumerate([(.65,.55,.36),(.15,.3,.42),(.65,.68,.64),(.4,.19,.13)])]
 for row in range(12):
  z=.5+row*.32
  for j in range(66):
   u=j/65;x=(u-.5)*(34+row*.4);y=ground(18+u*684,270-76.5*math.sin(math.pi*u))[1]+row*.5
   box('Seat',(x,y,z),(.52,.48,.34),seats)
   if random.random()<.75:box('Crowd',(x,y,z+.38),(.24,.23,.42),random.choice(people),.04)
  for j in range(90):
   u=j/90;v=(j+1)/90
   a=((u-.5)*(34+row*.4),ground(18+u*684,270-76.5*math.sin(math.pi*u))[1]+row*.5,z-.2)
   b=((v-.5)*(34+row*.4),ground(18+v*684,270-76.5*math.sin(math.pi*v))[1]+row*.5,z-.2)
   rod('Tier rim',a,b,.055,gold if row%4==0 else navy)
 for j in range(100):
  u=j/100;v=(j+1)/100
  rod('Outfield wall',ground(18+u*684,270-76.5*math.sin(math.pi*u),.6),ground(18+v*684,270-76.5*math.sin(math.pi*v),.6),.6,navy)
 for x,fy in ([(-16,20),(16,20)] if not pitch else [(-12,-12),(12,-12)]):
  rod('Floodlight tower',(x,fy,0),(x,fy,8),.13,navy)
  box('Floodlight frame',(x,fy,8),(3,.4,1.7),navy,.07)
  lamp=material('Lamp '+str(x),(.9,.86,.65));bs=lamp.node_tree.nodes.get('Principled BSDF');bs.inputs['Emission Color'].default_value=(1,.86,.6,1);bs.inputs['Emission Strength'].default_value=4
  for dx in range(6):
   for dz in range(3):box('Bulb',(x-1.15+dx*.45,fy-.25 if not pitch else fy+.25,7.5+dz*.5),(.3,.08,.3),lamp,.03)
 light((-12,-5,18),2600,12,(.72,.84,1));light((16,26,19),4000,10,(1,.86,.65));light((-17,25,18),3500,10,(.84,.9,1))
 if not pitch:
  t=Vector((0,(466-260)/(20*math.sqrt(.5)),0));camera(t+Vector((0,-40,40)),t,36)
 else:
  # From the mound towards home, batter is a separate responsive overlay.
  camera((0,18,4),(0,-3,4),29);s.camera.data.type='PERSP';s.camera.data.lens=35
  # Backstop replaces outfield as the visible backdrop in the pitching view.
  for row in range(10):
   for j in range(50):
    x=-20+j*.8;y=-10-row*.65;z=.5+row*.48
    box('Backstop seat',(x,y,z),(.65,.6,.35),seats)
    if random.random()<.8:box('Backstop crowd',(x,y,z+.4),(.28,.25,.5),random.choice(people),.05)
  box('Backstop padding',(0,-9,.65),(45,.7,1.3),navy,.1)
 s.render.filepath=os.path.join(OUT,'stadium-pitch.png' if pitch else 'stadium-field.png');bpy.ops.render.render(write_still=True)
stadium(False);stadium(True)
# Batter v2 is an original generated sprite, not the old procedural pose.
for name in ['stadium-field','stadium-pitch']:
 src=os.path.join(OUT,name+'.png');dst=os.path.join(OUT,name+'.webp')
 subprocess.run(['ffmpeg','-y','-loglevel','error','-i',src,'-c:v','libwebp','-quality','86',dst],check=True);os.unlink(src)
