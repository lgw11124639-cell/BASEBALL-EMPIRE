#!/usr/bin/env bash
set -euo pipefail
cd "$HOME/baseball-empire-game"
git fetch origin feature/server-view-only-foundation
git show origin/feature/server-view-only-foundation:server/home-view-reader.mjs > /tmp/home-view-reader.mjs
node --check /tmp/home-view-reader.mjs
cd /opt/baseball-empire-api
cp -p auth.mjs "auth.mjs.before-home-$(date +%Y%m%d%H%M%S)"
install -m 0644 /tmp/home-view-reader.mjs home-view-reader.mjs
python3 - <<'PY'
from pathlib import Path
p=Path('auth.mjs')
s=p.read_text()
if "path==='/v2/view/home'" not in s:
 a="import { createLightweightStatusReader } from './status-reader.mjs';"
 b="  const readLightweightStatus=createLightweightStatusReader(db);"
 c="    if(path==='/v2/saves'&&req.method==='GET')"
 assert s.count(a)==s.count(b)==s.count(c)==1
 s=s.replace(a,a+"\nimport {createHomeViewReader} from './home-view-reader.mjs';")
 s=s.replace(b,b+"\n  const readHomeView=createHomeViewReader(db);")
 s=s.replace(c,"""    if(path==='/v2/view/home'&&req.method==='GET'){
      try{
        const home=readHomeView(session.user_id,'main');
        response(res,home?200:404,home||{error:'save not found'},origin);
      }catch(e){
        console.error('home view failed',e);
        response(res,500,{error:'home unavailable'},origin);
      }
      return true;
    }
"""+c)
 p.write_text(s)
PY
node --check auth.mjs
echo 'Home route staged. Restart and health check still required.'
