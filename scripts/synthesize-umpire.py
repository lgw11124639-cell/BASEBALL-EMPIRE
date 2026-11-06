"""Build-time English male call set; Piper john medium (public-domain dataset).
No model or synthesis runtime is packaged in the game. See audio/CREDITS.md.
Run using an environment with piper-tts, and pass the downloaded model path.
"""
import os,sys,wave,subprocess,hashlib,json
from piper import PiperVoice,SynthesisConfig
root=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
voice=PiperVoice.load(sys.argv[1])
calls={'strike':'Strike!','ball':'Ball!','out':'Out!','strikeout':'Strike out!',
 'walk':'Ball four!','foul':'Foul ball!','sacbunt':'Sacrifice bunt!','hit':'Base hit!',
 'double':'Double!','triple':'Triple!','homer':'Home run!','hbp':'Hit by pitch!'}
os.makedirs('/tmp/be-umpire-wav',exist_ok=True)
for kind,text in calls.items():
 wav='/tmp/be-umpire-wav/'+kind+'.wav'
 with wave.open(wav,'wb') as f:voice.synthesize_wav(text,f,SynthesisConfig(length_scale=.75,noise_scale=.5,noise_w_scale=.65))
 # Same processing on every call: lower register, compact delivery, no stadium echo
 # that could blur short calls. Normalize loudness rather than clipping to shout.
 out=os.path.join(root,'audio','call-'+kind+'.mp3')
 subprocess.run(['ffmpeg','-y','-loglevel','error','-i',wav,'-af','silenceremove=start_periods=1:start_threshold=-42dB,areverse,silenceremove=start_periods=1:start_threshold=-42dB,areverse,asetrate=21400,aresample=24000,highpass=f=90,equalizer=f=180:t=q:w=1:g=2,acompressor=threshold=0.18:ratio=3:attack=5:release=80,loudnorm=I=-17:TP=-2:LRA=5,afade=t=in:d=0.008','-ac','1','-b:a','64k',out],check=True)
manifest=json.load(open(os.path.join(root,'audio','CREDITS.json')))
manifest=[m for m in manifest if not m['file'].startswith('call-')]
for kind,text in calls.items():
 file='call-'+kind+'.mp3'
 manifest.append({'file':file,'author':'Piper john medium / LibriVox public-domain voice dataset','license':'Public-Domain','source':'https://huggingface.co/rhasspy/piper-voices/blob/main/en/en_US/john/medium/MODEL_CARD','modifications':'Synthetic English male call: '+text+' Same voice, rate, EQ, dynamics and loudness on all calls. No actor recording or voice imitation.','sha256':hashlib.sha256(open(os.path.join(root,'audio',file),'rb').read()).hexdigest()})
json.dump(sorted(manifest,key=lambda x:x['file']),open(os.path.join(root,'audio','CREDITS.json'),'w'),indent=2);print('Built',len(calls),'consistent offline calls')
