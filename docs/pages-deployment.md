# Pages 배포 경로

저장소 Settings → Pages → Build and deployment → Source를 GitHub Actions로 설정한다. 현재 연결 토큰과 Actions 토큰은 Pages 설정을 수정하는 PUT 요청에 HTTP 403을 반환하므로 이 최초 전환은 저장소 소유자 계정에서 해야 한다.

준비된 Deploy BASEBALL EMPIRE to Pages 워크플로는 main의 공개 앱 파일과 vendor만 업로드한다. contents:read, pages:write, id-token:write를 사용하며 pages 동시 실행 그룹으로 배포를 직렬화한다. 저장 자료와 계정 자료에는 접근하지 않는다. 설정 전환 후 workflow_dispatch로 실행하거나 이후 앱 파일 변경 시 자동 실행한다.

배포 완료는 워크플로 성공과 실제 사이트 version.json/app.js/ui.css 바이트가 커밋과 일치하는 것으로 확인한다. Release Gate 성공만으로 배포 완료로 취급하지 않는다.
