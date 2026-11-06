"""Render all ten fictional home parks using the unchanged replay ground plane.

blender --background --threads 2 --python scripts/render-club-venues.py -- 8
Omit the ID to render all clubs. Original geometry/materials, no external models.
"""
import bpy, math, random, os, sys, re, json, subprocess, importlib.util
sys.dont_write_bytecode=True
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
spec=importlib.util.spec_from_file_location('venue_base',os.path.join(ROOT,'scripts','render-broadcast-assets.py'))
b=importlib.util.module_from_spec(spec);spec.loader.exec_module(b)
CATALOG=json.loads(re.search(r'const BE_BROADCAST_VENUES=(\[.*?\]);',open(os.path.join(ROOT,'app.js')).read(),re.S).group(1))
OUT=os.path.join(ROOT,'assets','broadcast','venues');os.makedirs(OUT,exist_ok=True)
box,rod,mesh,ground,surface,material=b.box,b.rod,b.mesh,b.ground,b.surface,b.material
def rgb(value):return tuple(int(value[i:i+2],16)/255 for i in (1,3,5))
def blend(a,b,t):return tuple(x*(1-t)+y*t for x,y in zip(a,b))
def clip_band(points,axis,edge,above):
 result=[]
 for i,p in enumerate(points):
  q=points[(i+1)%len(points)];a=p[0]+axis*p[1]-edge;c=q[0]+axis*q[1]-edge
  inside=a>=0 if above else a<=0;other=c>=0 if above else c<=0
  if inside:result.append(p)
  if inside!=other:
   t=a/(a-c);result.append((p[0]+(q[0]-p[0])*t,p[1]+(q[1]-p[1])*t))
 return result
def rail(name,points,r,mat):
 vertices=[]
 for i,p in enumerate(points):
  direction=Vector(points[min(i+1,len(points)-1)])-Vector(points[max(0,i-1)])
  q=direction.to_track_quat('Z','Y')
  vertices.extend(Vector(p)+q@Vector((r*math.cos(j*math.tau/6),r*math.sin(j*math.tau/6),0)) for j in range(6))
 return mesh(name,vertices,[(i*6+j,i*6+(j+1)%6,(i+1)*6+(j+1)%6,(i+1)*6+j) for i in range(len(points)-1) for j in range(6)],mat)
def seat_batch(locations,mat):
 vertices=[];faces=[]
 for x,y,z in locations:
  n=len(vertices);vertices.extend((x+dx*.28,y+dy*.24,z+dz*.17) for dx,dy,dz in [(-1,-1,-1),(-1,-1,1),(-1,1,-1),(-1,1,1),(1,-1,-1),(1,-1,1),(1,1,-1),(1,1,1)])
  faces.extend(tuple(n+i for i in face) for face in [(0,4,6,2),(1,3,7,5),(0,1,5,4),(2,6,7,3),(0,2,3,1),(4,5,7,6)])
 return mesh('Moulded seat rows',vertices,faces,mat)
def crowd_templates(colors,skin):
 templates=[]
 for mat in colors:
  vertices=[];faces=[];indices=[]
  for z,radius in [(0,.13),(.29,.16),(.37,.09)]:
   vertices.extend((radius*math.cos(j*math.tau/8),radius*math.sin(j*math.tau/8),z) for j in range(8))
  faces.extend((i*8+j,i*8+(j+1)%8,(i+1)*8+(j+1)%8,(i+1)*8+j) for i in range(2) for j in range(8));indices.extend([0]*len(faces))
  n=len(vertices)
  for k in range(5):
   theta=math.pi*(k+.2)/4.4;vertices.extend((.10*math.sin(theta)*math.cos(j*math.tau/8),.10*math.sin(theta)*math.sin(j*math.tau/8),.44+.12*math.cos(theta)) for j in range(8))
  for i in range(4):
   for j in range(8):faces.append((n+i*8+j,n+i*8+(j+1)%8,n+(i+1)*8+(j+1)%8,n+(i+1)*8+j));indices.append(1)
  o=mesh('Crowd template',vertices,faces,mat);o.data.materials.append(skin)
  for p,index in zip(o.data.polygons,indices):p.material_index=index;p.use_smooth=True
  data=o.data;templates.append(data);bpy.data.objects.remove(o,do_unlink=True)
 return templates
def spectator(loc,data):
 o=bpy.data.objects.new('Spectator',data);bpy.context.collection.objects.link(o);o.location=loc
def ring(u,row,z=None):return ((u-.5)*(34+row*.4),ground(18+u*684,270-76.5*math.sin(math.pi*u))[1]+row*.5,.5+row*.32 if z is None else z)
def roof(kind,rows,mat,steel,pitch):
 # Every canopy remains outside fair territory. Front edges share the club's profile.
 count=12 if kind in ['wave','fan','fins'] else 8
 for i in range(count):
  u=i/count;v=(i+1)/count;mid=(u+v)/2
  if kind in ['cantilever','wings','pavilions','copper','terrace'] and .35<mid<.65:continue
  if pitch:
   def p(t,row,z):return ((t-.5)*40,-10-row*.65,z)
  else:p=ring
  z=.5+rows*.32+.8
  a=p(u,rows-2,z);d=p(v,rows-2,z);c=p(v,rows+2,z+.25);back=p(u,rows+2,z+.25)
  if kind=='wave':a=(*a[:2],z+.65*math.sin(u*math.tau*2));d=(*d[:2],z+.65*math.sin(v*math.tau*2))
  if kind=='wings':a=(*a[:2],z+abs(mid-.5)*3);d=(*d[:2],z+abs(mid-.5)*3)
  if kind in ['sails','fan','fins','pavilions','copper']:
   apex=p(mid,rows+.2,z+(1.55 if kind in ['sails','fins'] else .9));mesh('Sculpted '+kind+' canopy',[a,d,c,back,apex],[(0,1,4),(1,2,4),(2,3,4),(3,0,4)],mat)
   for edge in [a,d,back,c]:rod('Canopy ribs',edge,apex,.035,steel)
  else:mesh('Floating '+kind+' canopy',[a,d,c,back],[(0,1,2,3)],mat);rod('Roof leading edge',a,d,.075,steel)
  for t in [u,v]:
   top=p(t,rows+.5,z-.1);bottom=(*top[:2],.3);rod('Roof column',bottom,top,.075,steel)
  if kind=='truss':
   for t in [u,mid,v]:rod('Triangular roof truss',p(t,rows+1,z-.5),p(mid,rows-2,z),.045,steel)
def text_label(text,loc,width,mat,camera):
 bpy.ops.object.text_add(location=loc);o=bpy.context.object;o.name='Club scoreboard lettering';o.data.body=text;o.data.align_x='CENTER';o.data.align_y='CENTER';o.data.size=1;o.data.extrude=.006;o.data.materials.append(mat);o.rotation_euler=camera.rotation_euler
 bpy.context.view_layer.update();scale=width/max(.01,o.dimensions.x);o.scale=(scale,scale,scale)
def scoreboard(x,y,z,width,team,accent,steel,white,pitch=False):
 # The billboard is normal to the actual camera in each view, never painted on turf.
 center=Vector((x,y,z));right=bpy.context.scene.camera.rotation_euler.to_matrix()@Vector((1,0,0));up=bpy.context.scene.camera.rotation_euler.to_matrix()@Vector((0,1,0));front=bpy.context.scene.camera.rotation_euler.to_matrix()@Vector((0,0,1))
 h=width*.36
 points=[center+right*dx*width/2+up*dy*h/2 for dx,dy in [(-1,-1),(1,-1),(1,1),(-1,1)]]
 mesh('Scoreboard panel',points,[(0,1,2,3)],steel);rail('Scoreboard trim',points+[points[0]],.075,accent)
 for offset in [-width*.38,width*.38]:
  top=center+right*offset;rod('Scoreboard support',(top.x,top.y,.1),top,.075,steel)
 text_label(team.upper(),center+front*.025,width*.82,white,bpy.context.scene.camera)
 for i in range(9):box('Scoreboard inning lamp',center+front*.04+right*((i-4)*width*.08)-up*h*.3,(.055,.055,.055),accent)
def accents(venue,pitch,rows,steel,trim,stone):
 kind=venue['backdrop'];r=rows+1
 if kind in ['stone','brick','lowrise']:
  for u in [.08,.26,.74,.92]:
   x,y,z=ring(u,r);y=-14 if pitch else y
   box('Masonry concourse pavilion',(x,y,2.0),(2.4,1.6,4),stone)
   for dz in [1.1,2.1,3.1]:box('Recessed concourse window',(x,y-.83,dz),(1.7,.08,.46),steel)
   if kind=='stone':
    for dx in [-.9,-.3,.3,.9]:box('Stone parapet',(x+dx,y,4.3),(.35,1.7,.65),stone)
 if kind in ['harbor','industry','bridge']:
  for u in [.12,.88]:
   x,y,z=ring(u,r+1);y=-18 if pitch else y
   rod('Harbor landmark mast',(x,y,0),(x,y,6),.09,steel);rod('Harbor crossbeam',(x-2,y,5),(x+2,y,5),.06,steel)
   for dx in [-1.6,-.8,.8,1.6]:rod('Landmark tension cable',(x,y,6),(x+dx,y,3.8),.025,trim)
 if kind in ['skyline','tech']:
  for u,height in [(.05,5),(.18,4),(.82,4),(.95,5.8)]:
   x,y,z=ring(u,r+.6);y=-17 if pitch else y
   box('Glass concourse tower',(x,y,height/2),(1.3,1.3,height),steel)
   for dz in range(1,int(height*2)):box('Architectural light band',(x,y-.67,dz*.5),(1.2,.025,.035),trim)
 if kind in ['forest','hills','lowrise']:
  leaf=material('Park landscaping',(.035,.13,.055));trunk=material('Tree trunks',(.12,.075,.035))
  for u in [.02,.07,.12,.88,.93,.98]:
   x,y,z=ring(u,r+1);y=-18 if pitch else y
   rod('Tree trunk',(x,y,0),(x,y,3),.07,trunk)
   for height,radius in [(2.4,1.1),(3.2,.85),(4,.55)]:
    verts=[(x+radius*math.cos(j*math.tau/8),y+radius*math.sin(j*math.tau/8),height-.7) for j in range(8)]+[(x,y,height+.6)]
    mesh('Landscaped tree crown',verts,[(j,(j+1)%8,8) for j in range(8)],leaf)
def render(venue,pitch):
 random.seed(5200+venue['id']);s=b.reset();bpy.data.orphans_purge(do_local_ids=True,do_linked_ids=True,do_recursive=True)
 s.cycles.samples=12;s.cycles.max_bounces=3;s.cycles.diffuse_bounces=2;s.cycles.glossy_bounces=1
 s.world.node_tree.nodes.get('Background').inputs['Strength'].default_value=.8
 accent=rgb(venue['color']);green=(.045,.23,.085);light_green=(.075,.31,.125)
 grass=material('Turf',green);stripe=material('Mowing stripe',light_green);dirt=material('Clay',(.37,.19,.085));chalk=material('Chalk',(.85,.85,.77));steel=material('Deep navy structure',(.018,.045,.065),.35);trim=material('Club color trim',accent,.15);seat=material('Club seats',blend(accent,(.06,.09,.12),.35));stone=material('Facade',(.30,.19,.14) if venue['backdrop']=='brick' else (.38,.38,.34));white=material('Warm lettering',(.95,.91,.75))
 roof_color=(.78,.8,.72) if venue['roof']=='sails' else blend(accent,(.16,.18,.2),.5);roofmat=material('Club canopy',roof_color,.35)
 skin=material('Spectator faces',(.43,.30,.21));people=[material('Crowd jersey '+str(i),c) for i,c in enumerate([blend(accent,(.72,.72,.65),.4),(.6,.61,.56),(.1,.2,.28),accent])];templates=crowd_templates(people,skin)
 surface('Foul territory',[(-300,700),(1000,700),(1000,125),(-300,125)],dirt)
 wedge=[(360,466),(18,270)]+[(18+i*684/48,270-76.5*math.sin(math.pi*i/48)) for i in range(1,49)];surface('Fair ground',wedge,grass,.015)
 # Parallel mowing lanes are clipped to the fair-ground outline, not rays from home.
 axis=[.4,-.45,.65,0][venue['id']%4]
 for edge in range(-400,1300,60):
  lane=clip_band(clip_band(wedge,axis,edge,True),axis,edge+30,False)
  if len(lane)>=3:surface('Mowing lane',lane,stripe,.018)
 surface('Infield clay',[(360,466),(195,365),(360,275),(525,365)],dirt,.025);surface('Infield turf',[(360,443),(236,365),(360,299),(484,365)],stripe,.03)
 for a,c in [((360,466),(18,270)),((360,466),(702,270))]:rod('Foul chalk',ground(*a,.055),ground(*c,.055),.035,chalk)
 for x,y in [(525,365),(360,275),(195,365)]:box('Base',ground(x,y,.09),(.6,.6,.13),chalk)
 surface('Plate',[(353,463),(367,463),(367,471),(360,476),(353,471)],chalk,.06)
 bpy.ops.mesh.primitive_cylinder_add(vertices=48,radius=1.45,depth=.15,location=ground(360,366,.075));bpy.context.object.data.materials.append(dirt);box('Rubber',ground(360,366,.17),(1,.15,.04),chalk)
 for x in [329,391]:
  rail('Batting box',[ground(x-8,456,.07),ground(x+8,456,.07),ground(x+8,478,.07),ground(x-8,478,.07),ground(x-8,456,.07)],.025,chalk)
 rows=venue['rows'] if not pitch else max(8,venue['rows']-2)
 for row in range(rows):
  seats=[];count=64
  for j in range(count):
   u=j/(count-1);x,y,z=ring(u,row)
   if pitch:x=(u-.5)*40;y=-10-row*.65
   seats.append((x,y,z))
   if random.random()<.77:spectator((x,y,z+.2),random.choice(templates))
  seat_batch(seats,seat)
  points=[ring(j/60,row,z-.2) for j in range(61)] if not pitch else [(-20+j*40/60,-10-row*.65,z-.2) for j in range(61)]
  rail('Tier edge',points,.055,trim if row%4==0 else steel)
  if row%5==4:
   # A genuine separated deck, with deep fascia and glass safety rail.
   rail('Deck fascia',[(*p[:2],p[2]+.05) for p in points],.17,steel)
   rail('Deck safety rail',[(*p[:2],p[2]+.8) for p in points],.025,trim)
 if pitch:box('Backstop padding',(0,-9,.6),(45,.7,1.2),steel)
 else:rail('Outfield wall',[ground(18+j*684/100,270-76.5*math.sin(math.pi*j/100),.6) for j in range(101)],.6,steel)
 roof(venue['roof'],rows,roofmat,trim,pitch);accents(venue,pitch,rows,steel,trim,stone)
 for x,fy in ([(-16,20),(16,20)] if not pitch else [(-12,-12),(12,-12)]):
  rod('Light tower',(x,fy,0),(x,fy,7.5),.10,steel);box('Light bank',(x,fy,7.5),(2.8,.35,1.4),steel)
  lamp=material('Floodlight '+str(x),(.95,.9,.65));node=lamp.node_tree.nodes.get('Principled BSDF');node.inputs['Emission Color'].default_value=(1,.9,.65,1);node.inputs['Emission Strength'].default_value=3
  for dx in range(6):
   for dz in range(3):box('Lamp',(x-1.1+dx*.44,fy-.2 if not pitch else fy+.2,7+dz*.44),(.28,.05,.26),lamp)
 b.light((-12,-5,18),2400,12,(.76,.87,1));b.light((16,26,19),3500,10,(1,.87,.67));b.light((-17,25,18),2900,10,(.87,.93,1))
 if pitch:b.camera((0,18,4),(0,-3,4),29);s.camera.data.type='PERSP';s.camera.data.lens=35
 else:
  t=Vector((0,(466-260)/(20*math.sqrt(.5)),0));b.camera(t+Vector((0,-40,40)),t,36)
 board=venue['board'];xs={'center':[0],'left':[-10],'right':[10],'wide':[0],'twin':[-10,10]}[board]
 title=venue['slug'].split('-',1)[1].upper()
 for x in xs:scoreboard(x,-15 if pitch else 20,5.7 if pitch else 5.2,7.5 if board=='wide' else 5.2,title,trim,steel,white,pitch)
 # Ground anchors are invariant even as stands, roofs and cladding change.
 if not pitch:
  for name,x,y in [('home',360,466),('first',525,365),('second',360,275),('third',195,365)]:
   p=world_to_camera_view(s,s.camera,Vector(ground(x,y,0)));assert abs(p.x*720-x)<.2 and abs((1-p.y)*520-y)<.6,(venue['slug'],name,p)
 stem=venue['slug']+('-pitch' if pitch else '-field');tmp='/tmp/'+stem+'.png';s.render.filepath=tmp;bpy.ops.render.render(write_still=True)
 subprocess.run(['ffmpeg','-y','-loglevel','error','-i',tmp,'-c:v','libwebp','-quality','87',os.path.join(OUT,stem+'.webp')],check=True);os.unlink(tmp)
 print('VENUE_DONE '+stem,flush=True)
args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
ids={int(x) for x in args} if args else set(range(10))
for venue in CATALOG:
 if venue['id'] in ids:render(venue,False);render(venue,True)
