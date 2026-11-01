#!/usr/bin/env bash
# Install authenticated read-only status route with backup and rollback.
set -euo pipefail
API=/opt/baseball-empire-api
cd "$API"
test -f status-reader.mjs
node --check status-reader.mjs
STAMP=$(date +%Y%m%d-%H%M%S)
BACKUP="auth.mjs.before-view-status-$STAMP"
cp -p auth.mjs "$BACKUP"
export BE_AUTH_BACKUP="$BACKUP"
python3 - <<'PY'
from pathlib import Path
p=Path('auth.mjs')
s=p.read_text()
imp="import { createLightweightStatusReader } from './status-reader.mjs';"
init="  const readLightweightStatus=createLightweightStatusReader(db);"
route="""    if(path==='/v2/view/status'&&req.method==='GET'){
      try{
        const status=readLightweightStatus(session.user_id,'main');
        if(!status){response(res,404,{error:'save not found'},origin);return true;}
        response(res,200,status,origin);
      }catch(e){
        console.error('lightweight status failed',e);
        response(res,500,{error:'status unavailable'},origin);
      }
      return true;
    }
"""
if "path==='/v2/view/status'" in s:
    print('Route already installed; no edits needed')
else:
    anchors=[
      ("import { createShardStore } from './shard-store.mjs';", "import"),
      ("  const shards=createShardStore(db);", "init"),
      ("    if(path==='/v2/saves'&&req.method==='GET')", "route"),
    ]
    for anchor,kind in anchors:
      if s.count(anchor)!=1: raise RuntimeError('missing or duplicate '+kind+' anchor; no changes made')
    s=s.replace(anchors[0][0],anchors[0][0]+"\n"+imp,1)
    s=s.replace(anchors[1][0],anchors[1][0]+"\n"+init,1)
    s=s.replace(anchors[2][0],route+anchors[2][0],1)
    p.write_text(s)
    print('Auth route staged')
PY
if ! node --check auth.mjs; then cp -p "$BACKUP" auth.mjs; echo "Syntax check failed; restored"; exit 1; fi
if ! grep -q "path==='/v2/view/status'" auth.mjs; then cp -p "$BACKUP" auth.mjs; exit 1; fi
echo "Syntax OK. Backup: $BACKUP"
pm2 restart baseball-empire-api --update-env
sleep 2
PORT=$(node --env-file="$API/.env" -p "process.env.PORT || 3200")
if ! [[ "$PORT" =~ ^[0-9]+$ ]]; then echo "Invalid API port"; exit 1; fi
HEALTH=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 5 http://127.0.0.1:$PORT/health || true)
UNAUTH=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 5 http://127.0.0.1:$PORT/v2/view/status || true)
echo "api_port=$PORT health=$HEALTH unauthenticated_status=$UNAUTH"
if [[ "$HEALTH" != 200 || "$UNAUTH" != 401 ]]; then
  echo "Health/security check failed; rolling back"
  cp -p "$BACKUP" auth.mjs
  pm2 restart baseball-empire-api --update-env
  exit 1
fi
echo "Status endpoint installed. Existing save routes unchanged."
